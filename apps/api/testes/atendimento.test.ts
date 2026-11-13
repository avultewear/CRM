import bcrypt from 'bcryptjs';
import { sql } from 'kysely';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { criarApp } from '../src/app.js';
import { MOTIVOS, cpfValido, mascararCpf, normalizarTelefone, oQueFalta } from '../src/atendimento.js';
import { abrirBanco, comoJson, type Banco } from '../src/banco.js';
import type { Papel } from '../src/papeis.js';
import prepararBanco, { URL_TESTE } from './preparar-banco.js';

// Dados fictícios: nenhum cliente ou pessoa real. Os CPFs são números de teste com dígitos válidos.
const SENHA = 'senha-de-teste-123';
const CPF_1 = '529.982.247-25';
const CPF_2 = '111.444.777-35';
let db: Banco;
let app: ReturnType<typeof criarApp>;
const token: Record<string, string> = {};
const id: Record<string, string> = {};
let fone = 11_90000_0000;
const novoFone = () => String(++fone);

const como = (quem: string) => ({ Authorization: `Bearer ${token[quem]}` });
const api = {
  get: (quem: string, rota: string) => request(app).get(rota).set(como(quem)),
  post: (quem: string, rota: string, corpo: object = {}) => request(app).post(rota).set(como(quem)).send(corpo),
  patch: (quem: string, rota: string, corpo: object) => request(app).patch(rota).set(como(quem)).send(corpo),
};
async function lead(quem: string, extra: object = {}) {
  const r = await api.post(quem, '/oportunidades', { nome: 'Cliente Teste', telefone: novoFone(), canal: 'WHATSAPP', origem: 'ANUNCIO', ...extra });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body.oportunidade as { id: string; etapa: string; vendedorId: string; cliente: { id: string; telefone: string } };
}
const detalhe = async (quem: string, oid: string) => (await api.get(quem, `/oportunidades/${oid}`)).body;
const link = (quem: string, oid: string) => api.post(quem, `/oportunidades/${oid}/link`, { interesse: 'Regata Running', tamanho: 'M', quantidade: 1 });
async function definirParametro(chave: string, valor: number | null) {
  await db.deleteFrom('parametro').where('chave', '=', chave).execute();
  if (valor !== null) await db.insertInto('parametro').values({ chave, valor: comoJson(valor) }).execute();
}
const followAberto = (oid: string) => db.selectFrom('atividade').selectAll()
  .where('oportunidadeId', '=', oid).where('tipo', '=', 'FOLLOW').where('status', '=', 'ABERTA').executeTakeFirst();

beforeAll(async () => {
  await prepararBanco(); // cada arquivo de teste começa com o banco de teste zerado
  db = abrirBanco(URL_TESTE);
  app = criarApp({ db, jwtSegredo: 'segredo-de-teste-com-32-caracteres!!', origemWeb: 'http://localhost:3000' });
  const senhaHash = await bcrypt.hash(SENHA, 4);
  const pessoas: Array<[string, Papel, boolean]> = [
    ['socio', 'SOCIO', false], ['gerente', 'GERENTE', false], ['ana', 'VENDEDOR', true], ['bia', 'VENDEDOR', true],
    ['social', 'SOCIAL_MEDIA', false], ['trafego', 'GESTOR_TRAFEGO', false], ['influ', 'INFLUENCIADOR', false],
  ];
  for (const [nome, papel, vende] of pessoas) {
    const email = `at-${nome}@teste.local`;
    const linha = await db.insertInto('usuario').values({ nome: `AT ${nome}`, email, senhaHash, papel, vende }).returning('id').executeTakeFirstOrThrow();
    id[nome] = linha.id;
    token[nome] = (await request(app).post('/auth/login').send({ email, senha: SENHA })).body.token;
  }
  for (const chave of ['recuperacao_tentativas', 'tempo_maximo_etapa_horas', 'limite_desconto_pct']) await definirParametro(chave, null);
});

afterAll(async () => { await db.destroy(); });

describe('funções da jornada', () => {
  test('o telefone vira só dígitos, com o 55 na frente', () => {
    expect(normalizarTelefone('(11) 98888-0001')).toBe('5511988880001');
    expect(normalizarTelefone('+55 11 98888-0001')).toBe('5511988880001');
    expect(normalizarTelefone('11 3333-0001')).toBe('551133330001');
    expect(normalizarTelefone('1234')).toBeNull();
  });
  test('CPF: confere os dígitos e nunca aparece inteiro', () => {
    expect(cpfValido(CPF_1)).toBe(true);
    expect(cpfValido('529.982.247-26')).toBe(false);
    expect(cpfValido('111.111.111-11')).toBe(false);
    expect(mascararCpf('52998224725')).toBe('***.***.***-25');
    expect(mascararCpf(null)).toBeNull();
  });
  test('a lista do que falta segue o critério de cada etapa', () => {
    const base = { primeiraRespostaEm: null, interesse: null, tamanho: null, linkEnviadoEm: null };
    expect(oQueFalta({ ...base, etapa: 'LEAD' })).toMatchObject({ proxima: 'ABORDADO', falta: [expect.stringContaining('respondeu')] });
    expect(oQueFalta({ ...base, etapa: 'ABORDADO' }).falta).toHaveLength(2);
    expect(oQueFalta({ ...base, etapa: 'ABORDADO', interesse: 'Regata', tamanho: 'M' }).falta).toHaveLength(0);
    expect(oQueFalta({ ...base, etapa: 'NEGOCIACAO' }).falta[0]).toMatch(/pedido pago|venda direta/);
    expect(oQueFalta({ ...base, etapa: 'RECUPERACAO' }).proxima).toBeNull();
  });
  test('são 8 motivos de perda, cada um com um destino fixo', () => {
    expect(MOTIVOS).toHaveLength(8);
    expect(MOTIVOS.filter((m) => m.destino === 'RECUPERACAO')).toHaveLength(4);
    expect(MOTIVOS.filter((m) => m.destino === 'ENCERRADA')).toHaveLength(3);
    expect(MOTIVOS.filter((m) => m.destino === 'NAO_CONTA')).toHaveLength(1);
  });
});

describe('novo lead', () => {
  test('o vendedor cadastra um lead, que entra em Lead e fica com ele', async () => {
    const o = await lead('ana');
    expect(o.etapa).toBe('LEAD');
    expect(o.vendedorId).toBe(id.ana);
    const d = await detalhe('ana', o.id);
    expect(d.historico).toHaveLength(1);
    expect(d.historico[0]).toMatchObject({ etapaAnterior: null, etapaNova: 'LEAD', autor: 'AT ana' });
  });
  test('sem origem, o lead não entra', async () => {
    const r = await api.post('ana', '/oportunidades', { nome: 'Sem Origem', telefone: novoFone(), canal: 'WHATSAPP' });
    expect(r.status).toBe(400);
  });
  test('telefone inválido é recusado', async () => {
    const r = await api.post('ana', '/oportunidades', { nome: 'Fone Ruim', telefone: '12345678', canal: 'WHATSAPP', origem: 'POST' });
    expect(r.status).toBe(400);
  });
  test('o mesmo telefone, escrito de três jeitos, é um cliente só com várias oportunidades', async () => {
    const corpo = { nome: 'Cliente Repetido', canal: 'WHATSAPP', origem: 'POST' };
    const a = await api.post('ana', '/oportunidades', { ...corpo, telefone: '(11) 98888-0001' });
    const b = await api.post('ana', '/oportunidades', { ...corpo, telefone: '11988880001' });
    const c = await api.post('ana', '/oportunidades', { ...corpo, telefone: '+55 11 98888-0001' });
    expect([a.status, b.status, c.status]).toEqual([201, 201, 201]);
    expect(a.body.clienteJaExistia).toBe(false);
    expect(b.body.clienteJaExistia).toBe(true);
    const clientes = await db.selectFrom('cliente').select('id').where('telefone', '=', '5511988880001').execute();
    expect(clientes).toHaveLength(1);
    const ops = await db.selectFrom('oportunidade').select('id').where('clienteId', '=', clientes[0].id).execute();
    expect(ops).toHaveLength(3);
  });
  test('cliente que volta fica com o mesmo vendedor', async () => {
    const r = await api.post('bia', '/oportunidades', { nome: 'Cliente Repetido', telefone: '11988880001', canal: 'INSTAGRAM', origem: 'POST' });
    expect(r.status).toBe(201);
    expect(r.body.oportunidade.vendedorId).toBe(id.ana);
    expect(r.body.comOutraPessoa).toBe(true);
    expect((await api.get('bia', `/oportunidades/${r.body.oportunidade.id}`)).status).toBe(404);
  });
  test('rodízio: leads sem dono alternam entre os vendedores disponíveis', async () => {
    const donos: string[] = [];
    for (let i = 0; i < 4; i++) donos.push((await lead('gerente')).vendedorId);
    expect(new Set(donos)).toEqual(new Set([id.ana, id.bia]));
    for (let i = 1; i < donos.length; i++) expect(donos[i]).not.toBe(donos[i - 1]);
  });
  test('vendedor inativo sai do rodízio', async () => {
    await db.updateTable('usuario').set({ ativo: false }).where('id', '=', id.bia).execute();
    const donos = [(await lead('gerente')).vendedorId, (await lead('gerente')).vendedorId];
    await db.updateTable('usuario').set({ ativo: true }).where('id', '=', id.bia).execute();
    expect(donos).toEqual([id.ana, id.ana]);
  });
  test('a gestão pode escolher o vendedor', async () => {
    expect((await lead('gerente', { vendedorId: id.bia })).vendedorId).toBe(id.bia);
  });
});

describe('quem vê o quê', () => {
  test('o vendedor só vê os próprios leads; Gerente e Sócio veem todos', async () => {
    const daBia = await lead('bia');
    const listaAna = (await api.get('ana', '/oportunidades')).body as Array<{ id: string; vendedorId: string }>;
    expect(listaAna.every((o) => o.vendedorId === id.ana)).toBe(true);
    expect((await api.get('ana', `/oportunidades/${daBia.id}`)).status).toBe(404);
    expect((await api.post('ana', `/oportunidades/${daBia.id}/resposta`)).status).toBe(404);
    for (const quem of ['gerente', 'socio']) {
      const lista = (await api.get(quem, '/oportunidades')).body as Array<{ id: string }>;
      expect(lista.some((o) => o.id === daBia.id), quem).toBe(true);
    }
  });
  test.each(['social', 'trafego', 'influ'])('%s não entra no Atendimento', async (quem) => {
    expect((await api.get(quem, '/oportunidades')).status).toBe(403);
    expect((await api.post(quem, '/oportunidades', { nome: 'X', telefone: novoFone(), canal: 'MANUAL', origem: 'OUTRO' })).status).toBe(403);
    expect((await api.get(quem, '/atendimento/funil?inicio=2026-01-01&fim=2027-01-01')).status).toBe(403);
  });
  test('o vendedor não passa o lead para outra pessoa', async () => {
    const o = await lead('ana');
    expect((await api.patch('ana', `/oportunidades/${o.id}`, { vendedorId: id.bia })).status).toBe(403);
    expect((await api.patch('gerente', `/oportunidades/${o.id}`, { vendedorId: id.bia })).status).toBe(200);
    expect((await api.get('ana', `/oportunidades/${o.id}`)).status).toBe(404);
  });
});

describe('não se pula etapa', () => {
  let oid: string;
  test('de Lead não avança sem a resposta de uma pessoa', async () => {
    oid = (await lead('ana')).id;
    const r = await api.post('ana', `/oportunidades/${oid}/avancar`);
    expect(r.status).toBe(422);
    expect(r.body.falta).toEqual([expect.stringContaining('respondeu')]);
  });
  test('pedir uma etapa que não é a seguinte é recusado', async () => {
    const r = await api.post('ana', `/oportunidades/${oid}/avancar`, { para: 'NEGOCIACAO' });
    expect(r.status).toBe(422);
    expect(r.body.erro).toMatch(/Não se pula etapa/);
    expect((await detalhe('ana', oid)).etapa).toBe('LEAD');
  });
  test('com a resposta registrada, vai para Abordado', async () => {
    expect((await api.post('ana', `/oportunidades/${oid}/resposta`)).status).toBe(200);
    expect((await api.post('ana', `/oportunidades/${oid}/avancar`)).body.etapa).toBe('ABORDADO');
  });
  test('de Abordado não avança sem produto e tamanho; com eles, vai para Levantamento', async () => {
    const r = await api.post('ana', `/oportunidades/${oid}/avancar`);
    expect(r.status).toBe(422);
    expect(r.body.falta).toHaveLength(2);
    await api.patch('ana', `/oportunidades/${oid}`, { interesse: 'Short Running', tamanho: 'G' });
    expect((await api.post('ana', `/oportunidades/${oid}/avancar`)).body.etapa).toBe('LEVANTAMENTO');
  });
  test('de Levantamento não avança sem o link; com o link, vai para Negociação', async () => {
    expect((await api.post('ana', `/oportunidades/${oid}/avancar`)).status).toBe(422);
    expect((await link('ana', oid)).body.etapa).toBe('NEGOCIACAO');
  });
  test('ninguém arrasta para Venda: ela só entra por pedido pago ou venda direta confirmada', async () => {
    for (const quem of ['ana', 'gerente', 'socio']) {
      const r = await api.post(quem, `/oportunidades/${oid}/avancar`);
      expect(r.status, quem).toBe(422);
    }
    expect((await detalhe('ana', oid)).etapa).toBe('NEGOCIACAO');
  });
  test('o histórico guarda cada passagem, com entrada, saída e autor', async () => {
    const h = (await detalhe('ana', oid)).historico as Array<{ etapaNova: string; saiuEm: string | null; autor: string }>;
    expect(h.map((l) => l.etapaNova)).toEqual(['LEAD', 'ABORDADO', 'LEVANTAMENTO', 'NEGOCIACAO']);
    expect(h.slice(0, 3).every((l) => l.saiuEm !== null)).toBe(true);
    expect(h[3].saiuEm).toBeNull();
    expect(h.every((l) => l.autor === 'AT ana')).toBe(true);
  });
  test('enviar o link direto de Lead passa por todas as etapas do caminho', async () => {
    const o = await lead('ana');
    expect((await link('ana', o.id)).status).toBe(200);
    const h = (await detalhe('ana', o.id)).historico as Array<{ etapaNova: string }>;
    expect(h.map((l) => l.etapaNova)).toEqual(['LEAD', 'ABORDADO', 'LEVANTAMENTO', 'NEGOCIACAO']);
  });
});

describe('perdas: o motivo decide o destino', () => {
  test.each(MOTIVOS.map((m) => [m.nome, m.id, m.destino] as const))('%s → %s', async (_nome, motivo, destino) => {
    const o = await lead('ana');
    const r = await api.post('ana', `/oportunidades/${o.id}/perder`, { motivo });
    expect(r.status).toBe(200);
    expect(r.body.destino).toBe(destino);
    const linha = await db.selectFrom('oportunidade').selectAll().where('id', '=', o.id).executeTakeFirstOrThrow();
    expect(linha.motivoPerda).toBe(motivo);
    expect(linha.etapaDaPerda).toBe('LEAD');
    if (destino === 'RECUPERACAO') expect(linha).toMatchObject({ etapa: 'RECUPERACAO', situacao: 'ABERTA', etapaAntesRecuperacao: 'LEAD' });
    if (destino === 'ENCERRADA') expect(linha.situacao).toBe('ENCERRADA');
    if (destino === 'NAO_CONTA') expect(linha.situacao).toBe('DESCARTADA');
  });
  test('motivo fora da lista é recusado', async () => {
    const o = await lead('ana');
    expect((await api.post('ana', `/oportunidades/${o.id}/perder`, { motivo: 'OUTRO_MOTIVO' })).status).toBe(400);
    expect((await api.post('ana', `/oportunidades/${o.id}/perder`, {})).status).toBe(400);
  });
  test('perda com destino Recuperação cria o follow com a mensagem pronta', async () => {
    const o = await lead('ana', { nome: 'Carla Souza', interesse: 'Jaqueta Training' });
    await api.post('ana', `/oportunidades/${o.id}/perder`, { motivo: 'ACHOU_CARO' });
    const f = await followAberto(o.id);
    expect(f).toMatchObject({ responsavelId: id.ana });
    expect(f!.mensagem).toMatch(/^Oi, Carla!/);
    expect(f!.mensagem).toContain('Jaqueta Training');
    expect(f!.mensagem).not.toMatch(/R\$/);
  });
  test('oportunidade encerrada some do quadro e não pode ser perdida de novo', async () => {
    const o = await lead('ana');
    await api.post('ana', `/oportunidades/${o.id}/perder`, { motivo: 'SEM_INTERESSE' });
    const lista = (await api.get('ana', '/oportunidades')).body as Array<{ id: string }>;
    expect(lista.some((l) => l.id === o.id)).toBe(false);
    expect((await api.post('ana', `/oportunidades/${o.id}/perder`, { motivo: 'SEM_INTERESSE' })).status).toBe(409);
    expect((await api.post('ana', `/oportunidades/${o.id}/avancar`)).status).toBe(409);
  });
  test('"pediu para não ser contatado" bloqueia o cliente para sempre', async () => {
    const o = await lead('ana');
    const outra = (await api.post('ana', '/oportunidades', { nome: 'Cliente Teste', telefone: o.cliente.telefone, canal: 'WHATSAPP', origem: 'POST' })).body.oportunidade;
    await link('ana', outra.id); // cria um follow na outra oportunidade do mesmo cliente
    expect(await followAberto(outra.id)).toBeDefined();
    await api.post('ana', `/oportunidades/${o.id}/perder`, { motivo: 'PEDIU_PARA_NAO_SER_CONTATADO' });
    const c = await db.selectFrom('cliente').selectAll().where('id', '=', o.cliente.id).executeTakeFirstOrThrow();
    expect(c.bloqueado).toBe(true);
    // O follow que existia é cancelado, e nenhuma perda nova cria follow para este cliente.
    expect(await followAberto(outra.id)).toBeUndefined();
    await api.post('ana', `/oportunidades/${outra.id}/perder`, { motivo: 'SEM_RESPOSTA' });
    expect(await followAberto(outra.id)).toBeUndefined();
    // E o aceite de mensagens não pode ser religado.
    expect((await api.patch('ana', `/clientes/${c.id}`, { aceiteMensagens: true })).status).toBe(409);
  });
});

describe('follow como tarefa', () => {
  test('o link enviado cria o follow; "sem resposta" leva o lead para a Recuperação', async () => {
    const o = await lead('ana', { nome: 'Davi Lima' });
    await link('ana', o.id);
    const f = await followAberto(o.id);
    expect(f!.mensagem).toMatch(/^Oi, Davi!/);
    const tarefas = (await api.get('ana', '/atividades')).body as Array<{ id: string; clienteTelefone: string }>;
    expect(tarefas.find((t) => t.id === f!.id)?.clienteTelefone).toBe(o.cliente.telefone);
    const r = await api.post('ana', `/atividades/${f!.id}/concluir`, { resultado: 'SEM_RESPOSTA' });
    expect(r.status).toBe(200);
    expect(await detalhe('ana', o.id)).toMatchObject({ etapa: 'RECUPERACAO', motivoPerda: 'SEM_RESPOSTA' });
    expect(await followAberto(o.id)).toBeDefined();
  });
  test('na Recuperação, "respondeu" devolve o lead para a etapa em que estava', async () => {
    const o = await lead('ana');
    await api.post('ana', `/oportunidades/${o.id}/resposta`);
    await api.post('ana', `/oportunidades/${o.id}/avancar`);
    await api.post('ana', `/oportunidades/${o.id}/perder`, { motivo: 'SEM_RESPOSTA' });
    const f = await followAberto(o.id);
    await api.post('ana', `/atividades/${f!.id}/concluir`, { resultado: 'RESPONDEU' });
    expect(await detalhe('ana', o.id)).toMatchObject({ etapa: 'ABORDADO', situacao: 'ABERTA', motivoPerda: null });
    expect(await followAberto(o.id)).toBeUndefined();
  });
  test('sem resposta até o número de tentativas de Metas: a oportunidade é encerrada', async () => {
    await definirParametro('recuperacao_tentativas', 2);
    const o = await lead('ana');
    await api.post('ana', `/oportunidades/${o.id}/perder`, { motivo: 'SEM_RESPOSTA' });
    await api.post('ana', `/atividades/${(await followAberto(o.id))!.id}/concluir`, { resultado: 'SEM_RESPOSTA' });
    expect((await detalhe('ana', o.id)).situacao).toBe('ABERTA'); // 1ª tentativa: ainda aberta, com novo follow
    await api.post('ana', `/atividades/${(await followAberto(o.id))!.id}/concluir`, { resultado: 'SEM_RESPOSTA' });
    const linha = await db.selectFrom('oportunidade').selectAll().where('id', '=', o.id).executeTakeFirstOrThrow();
    expect(linha).toMatchObject({ situacao: 'ENCERRADA', tentativasRecuperacao: 2 });
    expect(await followAberto(o.id)).toBeUndefined();
    await definirParametro('recuperacao_tentativas', null);
  });
  test('sem o parâmetro definido, a sequência não encerra sozinha', async () => {
    const o = await lead('ana');
    await api.post('ana', `/oportunidades/${o.id}/perder`, { motivo: 'SEM_RESPOSTA' });
    for (let i = 0; i < 3; i++) await api.post('ana', `/atividades/${(await followAberto(o.id))!.id}/concluir`, { resultado: 'SEM_RESPOSTA' });
    expect((await detalhe('ana', o.id)).situacao).toBe('ABERTA');
  });
  test('um vendedor não mexe na tarefa de outro', async () => {
    const o = await lead('ana');
    await link('ana', o.id);
    const f = await followAberto(o.id);
    expect((await api.post('bia', `/atividades/${f!.id}/concluir`, { resultado: 'RESPONDEU' })).status).toBe(404);
    expect((await api.post('bia', `/atividades/${f!.id}/adiar`, { prazo: new Date(Date.now() + 864e5).toISOString() })).status).toBe(404);
  });
  test('lembrete: cria, adia para o futuro e conclui', async () => {
    const o = await lead('ana');
    const amanha = new Date(Date.now() + 864e5).toISOString();
    expect((await api.post('ana', `/oportunidades/${o.id}/lembretes`, { titulo: 'Ligar depois do treino', prazo: amanha })).status).toBe(201);
    const t = await db.selectFrom('atividade').selectAll().where('oportunidadeId', '=', o.id).where('tipo', '=', 'LEMBRETE').executeTakeFirstOrThrow();
    expect((await api.post('ana', `/atividades/${t.id}/adiar`, { prazo: new Date(Date.now() - 1000).toISOString() })).status).toBe(400);
    expect((await api.post('ana', `/atividades/${t.id}/adiar`, { prazo: new Date(Date.now() + 2 * 864e5).toISOString() })).status).toBe(200);
    expect((await api.post('ana', `/atividades/${t.id}/concluir`, { resultado: 'FEITA' })).status).toBe(200);
    expect((await api.post('ana', `/atividades/${t.id}/concluir`, { resultado: 'FEITA' })).status).toBe(409);
  });
});

describe('venda direta', () => {
  const itens = (preco: number) => [{ descricao: 'Camiseta Técnica Running M', quantidade: 2, precoTabela: 100, preco }];
  let oid: string;
  let cid: string;
  let vendaId: string;

  test('sem CPF a venda não é lançada; CPF inválido é recusado', async () => {
    const o = await lead('ana');
    oid = o.id; cid = o.cliente.id;
    expect((await api.post('ana', `/oportunidades/${oid}/venda-direta`, { itens: itens(100), formaPagamento: 'PIX' })).status).toBe(422);
    expect((await api.post('ana', `/oportunidades/${oid}/venda-direta`, { itens: itens(100), formaPagamento: 'PIX', cpf: '123.456.789-00' })).status).toBe(400);
  });
  test('desconto acima do limite é bloqueado para o vendedor', async () => {
    await definirParametro('limite_desconto_pct', 10);
    const r = await api.post('ana', `/oportunidades/${oid}/venda-direta`, { itens: itens(80), formaPagamento: 'PIX', cpf: CPF_1 });
    expect(r.status).toBe(422);
    expect(r.body.erro).toMatch(/Desconto acima do limite/);
    expect(r.body.erro).not.toMatch(/custo|margem/i);
    expect((await detalhe('ana', oid)).etapa).toBe('LEAD');
  });
  test('o limite próprio do vendedor vale mais que o padrão', async () => {
    await db.updateTable('usuario').set({ limiteDescontoPct: 25 }).where('id', '=', id.bia).execute();
    const o = await lead('bia');
    const r = await api.post('bia', `/oportunidades/${o.id}/venda-direta`, { itens: itens(80), formaPagamento: 'DINHEIRO', cpf: CPF_2 });
    expect(r.status).toBe(201);
    expect(r.body.descontoPct).toBe(20);
  });
  test('dentro do limite, a venda é lançada e o card vai para Negociação, aguardando', async () => {
    const r = await api.post('ana', `/oportunidades/${oid}/venda-direta`, { itens: itens(95), formaPagamento: 'PIX', cpf: CPF_1 });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ valor: 190, descontoPct: 5 });
    vendaId = r.body.id;
    const d = await detalhe('ana', oid);
    expect(d).toMatchObject({ etapa: 'NEGOCIACAO', situacao: 'ABERTA' });
    expect(d.vendasDiretas[0]).toMatchObject({ situacao: 'AGUARDANDO', valor: 190 });
    expect((await api.post('ana', `/oportunidades/${oid}/venda-direta`, { itens: itens(95), formaPagamento: 'PIX' })).status).toBe(409);
  });
  test('o CPF só aparece mascarado; o número inteiro não vai para a auditoria', async () => {
    const d = await detalhe('ana', oid);
    expect(d.cliente.cpf).toBe('***.***.***-25');
    expect(JSON.stringify(d)).not.toContain('52998224725');
    const lista = await api.get('gerente', '/oportunidades');
    expect(JSON.stringify(lista.body)).not.toContain('52998224725');
    const aud = await db.selectFrom('auditoria').selectAll().where('entidadeId', '=', cid).execute();
    expect(JSON.stringify(aud)).not.toContain('52998224725');
    expect(aud.some((l) => l.campo === 'cpf' && l.para === 'informado')).toBe(true);
  });
  test('o mesmo CPF não entra em dois cadastros', async () => {
    const o = await lead('ana');
    expect((await api.patch('ana', `/clientes/${o.cliente.id}`, { cpf: CPF_1 })).status).toBe(409);
  });
  test('só o Sócio vê o CPF completo, e cada acesso fica na auditoria', async () => {
    expect((await api.get('gerente', `/clientes/${cid}/cpf`)).status).toBe(403);
    expect((await api.get('ana', `/clientes/${cid}/cpf`)).status).toBe(403);
    const r = await api.get('socio', `/clientes/${cid}/cpf`);
    expect(r.body.cpf).toBe('52998224725');
    const acesso = await db.selectFrom('auditoria').selectAll().where('entidadeId', '=', cid).where('acao', '=', 'ver_cpf').execute();
    expect(acesso).toHaveLength(1);
    expect(acesso[0].autorId).toBe(id.socio);
  });
  test('vendedor e Gerente não confirmam a venda', async () => {
    expect((await api.post('ana', `/vendas-diretas/${vendaId}/confirmar`)).status).toBe(403);
    expect((await api.post('gerente', `/vendas-diretas/${vendaId}/confirmar`)).status).toBe(403);
    expect((await detalhe('ana', oid)).etapa).toBe('NEGOCIACAO');
  });
  test('o Sócio confirma: o card vai para Venda e a oportunidade fica ganha', async () => {
    const fila = (await api.get('socio', '/vendas-diretas')).body as Array<{ id: string }>;
    expect(fila.some((v) => v.id === vendaId)).toBe(true);
    expect((await api.post('socio', `/vendas-diretas/${vendaId}/confirmar`)).status).toBe(200);
    expect(await detalhe('ana', oid)).toMatchObject({ etapa: 'VENDA', situacao: 'GANHA' });
    expect((await api.post('socio', `/vendas-diretas/${vendaId}/confirmar`)).status).toBe(409);
    expect((await api.post('ana', `/oportunidades/${oid}/perder`, { motivo: 'SEM_INTERESSE' })).status).toBe(409);
  });
  test('o Sócio pode lançar acima do limite e pode recusar uma venda, com motivo', async () => {
    const o = await lead('ana');
    await api.patch('ana', `/clientes/${o.cliente.id}`, { cpf: '390.533.447-05' });
    const r = await api.post('socio', `/oportunidades/${o.id}/venda-direta`, { itens: itens(50), formaPagamento: 'PIX' });
    expect(r.status).toBe(201);
    expect((await api.post('socio', `/vendas-diretas/${r.body.id}/recusar`, {})).status).toBe(400);
    expect((await api.post('socio', `/vendas-diretas/${r.body.id}/recusar`, { motivo: 'Pix não caiu na conta' })).status).toBe(200);
    expect(await detalhe('ana', o.id)).toMatchObject({ etapa: 'NEGOCIACAO', situacao: 'ABERTA' });
    await definirParametro('limite_desconto_pct', null);
  });
});

describe('funil: a conversão por etapa bate com a contagem manual no histórico', () => {
  test('5 leads, 4 abordados, 3 em levantamento, 2 em negociação, 1 venda, 1 que não conta', async () => {
    const senhaHash = await bcrypt.hash(SENHA, 4);
    const caio = await db.insertInto('usuario').values({ nome: 'AT caio', email: 'at-caio@teste.local', senhaHash, papel: 'VENDEDOR', vende: false }).returning('id').executeTakeFirstOrThrow();
    token.caio = (await request(app).post('/auth/login').send({ email: 'at-caio@teste.local', senha: SENHA })).body.token;
    const leads: string[] = [];
    for (let i = 0; i < 6; i++) leads.push((await lead('gerente', { vendedorId: undefined, nome: `Funil ${i}` })).id);
    // Passa os 6 leads para o Caio, para o funil dele conter só estes dados.
    await db.updateTable('oportunidade').set({ vendedorId: caio.id }).where('id', 'in', leads).execute();
    await api.post('caio', `/oportunidades/${leads[5]}/perder`, { motivo: 'NAO_ERA_CLIENTE' }); // não conta
    for (const l of leads.slice(0, 4)) { await api.post('caio', `/oportunidades/${l}/resposta`); await api.post('caio', `/oportunidades/${l}/avancar`); }
    for (const l of leads.slice(0, 3)) { await api.patch('caio', `/oportunidades/${l}`, { interesse: 'Regata', tamanho: 'M' }); await api.post('caio', `/oportunidades/${l}/avancar`); }
    for (const l of leads.slice(0, 2)) await link('caio', l);
    await api.patch('caio', `/clientes/${(await detalhe('caio', leads[0])).cliente.id}`, { cpf: '168.995.350-09' });
    const v = await api.post('caio', `/oportunidades/${leads[0]}/venda-direta`, { itens: [{ descricao: 'Regata M', quantidade: 1, precoTabela: 90, preco: 90 }], formaPagamento: 'PIX' });
    expect(v.status, JSON.stringify(v.body)).toBe(201);
    await api.post('socio', `/vendas-diretas/${v.body.id}/confirmar`);
    await api.post('caio', `/oportunidades/${leads[4]}/perder`, { motivo: 'SEM_INTERESSE' });   // perdido em Lead
    await api.post('caio', `/oportunidades/${leads[3]}/perder`, { motivo: 'ACHOU_CARO' });      // perdido em Abordado

    const r = await api.get('caio', '/atendimento/funil?inicio=2020-01-01&fim=2100-01-01');
    expect(r.status).toBe(200);
    const porEtapa = Object.fromEntries((r.body.etapas as Array<{ etapa: string }>).map((e) => [e.etapa, e])) as Record<string, any>;

    // Contagem manual, direto no histórico, sem passar pela API.
    const manual = await sql<{ etapa: string; n: string }>`
      SELECT h.etapa_nova AS etapa, count(DISTINCT h.oportunidade_id) AS n
      FROM historico_etapa h JOIN oportunidade o ON o.id = h.oportunidade_id
      WHERE o.vendedor_id = ${caio.id} AND o.situacao <> 'DESCARTADA'
      GROUP BY h.etapa_nova`.execute(db);
    const contagem = Object.fromEntries(manual.rows.map((l) => [l.etapa, Number(l.n)]));
    expect(contagem).toEqual({ LEAD: 5, ABORDADO: 4, LEVANTAMENTO: 3, NEGOCIACAO: 2, VENDA: 1, RECUPERACAO: 1 });
    for (const etapa of Object.keys(contagem)) expect(porEtapa[etapa].entraram, etapa).toBe(contagem[etapa]);

    expect(porEtapa.LEAD).toMatchObject({ avancaram: 4, conversaoPct: 80 });
    expect(porEtapa.ABORDADO).toMatchObject({ avancaram: 3, conversaoPct: 75 });
    expect(porEtapa.LEVANTAMENTO).toMatchObject({ avancaram: 2, conversaoPct: 66.7 });
    expect(porEtapa.NEGOCIACAO).toMatchObject({ avancaram: 1, conversaoPct: 50 });
    expect(porEtapa.VENDA.conversaoPct).toBeNull();
    expect(porEtapa.LEAD.perdas).toMatchObject({ total: 1, motivos: [{ motivo: 'SEM_INTERESSE', quantidade: 1 }] });
    expect(porEtapa.ABORDADO.perdas).toMatchObject({ total: 1, motivos: [{ motivo: 'ACHOU_CARO', quantidade: 1 }] });
  });
  test('período sem dados devolve conversão nula, não zero', async () => {
    const r = await api.get('caio', '/atendimento/funil?inicio=2001-01-01&fim=2001-02-01');
    for (const e of r.body.etapas) expect(e).toMatchObject({ entraram: 0, conversaoPct: null, tempoMedianoHoras: null });
  });
  test('o vendedor só vê o próprio funil, mesmo pedindo o de outro', async () => {
    const r = await api.get('ana', `/atendimento/funil?inicio=2020-01-01&fim=2100-01-01&vendedorId=${id.bia}`);
    const meu = await api.get('ana', '/atendimento/funil?inicio=2020-01-01&fim=2100-01-01');
    expect(r.body.etapas).toEqual(meu.body.etapas);
  });
});

describe('números do Agora', () => {
  test('leads sem resposta e parados seguem o parâmetro de Metas', async () => {
    const antes = (await api.get('bia', '/atendimento/agora')).body;
    expect(antes.leads_parados).toBeNull(); // sem tempo máximo definido: "—"
    await lead('bia');
    const depois = (await api.get('bia', '/atendimento/agora')).body;
    expect(depois.leads_sem_resposta).toBe(antes.leads_sem_resposta + 1);
    await definirParametro('tempo_maximo_etapa_horas', 0);
    const abertas = (await api.get('bia', '/oportunidades')).body as Array<{ situacao: string; etapa: string; parado: boolean }>;
    const esperado = abertas.filter((o) => o.situacao === 'ABERTA' && o.etapa !== 'VENDA');
    expect(esperado.every((o) => o.parado)).toBe(true);
    expect((await api.get('bia', '/atendimento/agora')).body.leads_parados).toBe(esperado.length);
    await definirParametro('tempo_maximo_etapa_horas', null);
  });
});
