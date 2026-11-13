import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { criarApp } from '../src/app.js';
import { abrirBanco, comoJson, type Banco } from '../src/banco.js';
import { aplicarTeto, cancelarGanhos, mesDe } from '../src/ganhos.js';
import type { Papel } from '../src/papeis.js';
import prepararBanco, { URL_TESTE } from './preparar-banco.js';

// Dados fictícios: nenhuma pessoa, cliente ou CPF real.
const SENHA = 'senha-de-teste-123';
const SEGREDO = 'segredo-das-rotinas-de-teste-123';
let db: Banco;
let app: ReturnType<typeof criarApp>;
const token: Record<string, string> = {};
const id: Record<string, string> = {};
let fone = 21_90000_0000;
let nCpf = 0;

function cpfFicticio() {
  const base = String(200000000 + ++nCpf * 7919).slice(0, 9).split('').map(Number);
  const digito = (ds: number[]) => { const r = (ds.reduce((s, d, i) => s + d * (ds.length + 1 - i), 0) * 10) % 11; return r === 10 ? 0 : r; };
  const d1 = digito(base);
  return [...base, d1, digito([...base, d1])].join('');
}
const como = (quem: string) => ({ Authorization: `Bearer ${token[quem]}` });
const api = {
  get: (quem: string, rota: string) => request(app).get(rota).set(como(quem)),
  post: (quem: string, rota: string, corpo: object = {}) => request(app).post(rota).set(como(quem)).send(corpo),
  patch: (quem: string, rota: string, corpo: object) => request(app).patch(rota).set(como(quem)).send(corpo),
  put: (quem: string, rota: string, corpo: object) => request(app).put(rota).set(como(quem)).send(corpo),
};
async function definir(chave: string, valor: number | null) {
  await db.deleteFrom('parametro').where('chave', '=', chave).execute();
  if (valor !== null) await db.insertInto('parametro').values({ chave, valor: comoJson(valor) }).execute();
}
/** Lança uma venda direta de um item. Devolve a resposta, para os testes de recusa. */
async function lancar(quem: string, tabela: number, cobrado: number, extra: { cupom?: string; vendedorId?: string } = {}) {
  const corpoLead: Record<string, unknown> = { nome: 'Cliente Ganhos', telefone: String(++fone), canal: 'WHATSAPP', origem: 'INFLUENCIADOR' };
  if (extra.vendedorId) corpoLead.vendedorId = extra.vendedorId;
  const lead = await api.post(extra.vendedorId ? 'gerente' : quem, '/oportunidades', corpoLead);
  expect(lead.status, JSON.stringify(lead.body)).toBe(201);
  return api.post(extra.vendedorId ? 'gerente' : quem, `/oportunidades/${lead.body.oportunidade.id}/venda-direta`, {
    itens: [{ descricao: 'Peça de teste', quantidade: 1, precoTabela: tabela, preco: cobrado }], formaPagamento: 'PIX', cpf: cpfFicticio(),
    ...(extra.cupom ? { cupom: extra.cupom } : {}),
  });
}
/** Lança e confirma. Devolve os ganhos gerados, por tipo. */
async function vender(quem: string, valor: number, extra: { cupom?: string; vendedorId?: string } = {}) {
  const r = await lancar(quem, valor, valor, extra);
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  expect((await api.post('socio', `/vendas-diretas/${r.body.id}/confirmar`)).status).toBe(200);
  const linhas = await db.selectFrom('ganho').selectAll().where('vendaDiretaId', '=', r.body.id).execute();
  const por = Object.fromEntries(linhas.map((l) => [l.tipo, { ...l, valor: Number(l.valor), valorSemTeto: Number(l.valorSemTeto), pct: Number(l.pct) }]));
  return { vendaId: r.body.id as string, linhas, por };
}

beforeAll(async () => {
  await prepararBanco();
  db = abrirBanco(URL_TESTE);
  app = criarApp({ db, jwtSegredo: 'segredo-de-teste-com-32-caracteres!!', origemWeb: 'http://localhost:3000', rotinaSegredo: SEGREDO });
  const senhaHash = await bcrypt.hash(SENHA, 4);
  const pessoas: Array<[string, Papel, boolean]> = [
    ['socio', 'SOCIO', false], ['gerente', 'GERENTE', false], ['ana', 'VENDEDOR', true], ['bia', 'VENDEDOR', true],
    ['influ1', 'INFLUENCIADOR', false], ['influ2', 'INFLUENCIADOR', false], ['social', 'SOCIAL_MEDIA', false],
  ];
  for (const [nome, papel, vende] of pessoas) {
    const email = `g-${nome}@teste.local`;
    const linha = await db.insertInto('usuario').values({ nome: `G ${nome}`, email, senhaHash, papel, vende }).returning('id').executeTakeFirstOrThrow();
    id[nome] = linha.id;
    token[nome] = (await request(app).post('/auth/login').send({ email, senha: SENHA })).body.token;
  }
});
afterAll(async () => { await db.destroy(); });

describe('funções dos ganhos', () => {
  test('o mês da venda segue o horário de Brasília', () => {
    expect(mesDe(new Date('2026-11-01T02:00:00Z'))).toBe('2026-10'); // 31/10 às 23h em Brasília
    expect(mesDe(new Date('2026-11-01T03:00:00Z'))).toBe('2026-11');
  });
  test('o teto mensal corta o que passar dele', () => {
    expect(aplicarTeto(15, null, 999)).toBe(15);
    expect(aplicarTeto(15, 20, 0)).toBe(15);
    expect(aplicarTeto(15, 20, 10)).toBe(10);
    expect(aplicarTeto(15, 20, 20)).toBe(0);
    expect(aplicarTeto(15, 20, 35)).toBe(0);
  });
});

describe('sem porcentagem definida, nada é gerado', () => {
  test('venda confirmada sem parâmetros em Metas não gera pró-labore nem comissão', async () => {
    const { linhas } = await vender('ana', 200);
    expect(linhas).toHaveLength(0);
  });
});

describe('pró-labore e comissões na venda confirmada', () => {
  beforeAll(async () => {
    await definir('prolabore_pct', 10);
    await definir('comissao_vendedor_pct', 5);
    await definir('comissao_vendedor_teto', 20);
    await definir('comissao_influenciador_pct', 8);
    const i = await api.post('socio', '/influenciadores', { nome: 'Influenciadora Um', arroba: '@um.teste', usuarioId: id.influ1 });
    expect(i.status, JSON.stringify(i.body)).toBe(201);
    id.influenciador = i.body.id;
    expect((await api.post('socio', `/influenciadores/${i.body.id}/cupons`, { codigo: 'um10', descontoPct: 10 })).status).toBe(201);
  });

  test('uma venda de R$ 200 com cupom gera os três ganhos, aguardando', async () => {
    const { por, linhas } = await vender('ana', 200, { cupom: 'UM10' });
    expect(linhas).toHaveLength(3);
    expect(por.PRO_LABORE).toMatchObject({ valor: 20, pct: 10, usuarioId: null });
    expect(por.COMISSAO_VENDEDOR).toMatchObject({ valor: 10, pct: 5, usuarioId: id.ana });
    expect(por.COMISSAO_INFLUENCIADOR).toMatchObject({ valor: 16, pct: 8, influenciadorId: id.influenciador });
    expect(linhas.every((l) => l.situacao === 'AGUARDANDO' && l.liberarEm === null && l.competencia === mesDe(new Date()))).toBe(true);
  });
  test('a venda só lançada (ainda não confirmada) não gera nada', async () => {
    const r = await lancar('ana', 100, 100);
    expect(await db.selectFrom('ganho').select('id').where('vendaDiretaId', '=', r.body.id).execute()).toHaveLength(0);
  });
  test('a comissão do vendedor para no teto do mês', async () => {
    const segunda = await vender('ana', 300);
    expect(segunda.por.COMISSAO_VENDEDOR).toMatchObject({ valorSemTeto: 15, valor: 10 }); // já tinha R$ 10; o teto é R$ 20
    const terceira = await vender('ana', 100);
    expect(terceira.por.COMISSAO_VENDEDOR).toMatchObject({ valorSemTeto: 5, valor: 0 });
    expect(terceira.por.PRO_LABORE.valor).toBe(10); // o pró-labore não tem teto
  });
  test('a porcentagem e o teto próprios do vendedor valem mais que o padrão', async () => {
    expect((await api.patch('socio', `/equipe/${id.bia}`, { comissaoPct: 10, comissaoTeto: 12 })).status).toBe(200);
    expect((await vender('bia', 100)).por.COMISSAO_VENDEDOR).toMatchObject({ pct: 10, valor: 10 });
    expect((await vender('bia', 100)).por.COMISSAO_VENDEDOR).toMatchObject({ valorSemTeto: 10, valor: 2 });
  });
  test('a porcentagem do cupom vale mais que o padrão, e o teto do influenciador é respeitado', async () => {
    expect((await api.post('socio', `/influenciadores/${id.influenciador}/cupons`, { codigo: 'UM20', descontoPct: 5, comissaoPct: 20 })).status).toBe(201);
    expect((await vender('bia', 100, { cupom: 'UM20' })).por.COMISSAO_INFLUENCIADOR).toMatchObject({ pct: 20, valor: 20 }); // total no mês: 36
    expect((await api.patch('socio', `/influenciadores/${id.influenciador}`, { comissaoTeto: 40 })).status).toBe(200);
    expect((await vender('bia', 100, { cupom: 'UM10' })).por.COMISSAO_INFLUENCIADOR).toMatchObject({ valorSemTeto: 8, valor: 4 });
    expect((await vender('bia', 100, { cupom: 'UM10' })).por.COMISSAO_INFLUENCIADOR).toMatchObject({ valor: 0 });
  });
  test('Sócio que vende não recebe comissão: o ganho dele é o pró-labore', async () => {
    await db.updateTable('usuario').set({ vende: true }).where('id', '=', id.socio).execute();
    const { por } = await vender('gerente', 100, { vendedorId: id.socio });
    await db.updateTable('usuario').set({ vende: false }).where('id', '=', id.socio).execute();
    expect(por.COMISSAO_VENDEDOR).toBeUndefined();
    expect(por.PRO_LABORE.valor).toBe(10);
  });
  test('devolução cancela o que não foi pago; o que já foi pago continua registrado', async () => {
    const { vendaId, linhas } = await vender('bia', 50);
    await db.updateTable('ganho').set({ situacao: 'PAGA' }).where('id', '=', linhas.find((l) => l.tipo === 'PRO_LABORE')!.id).execute();
    await cancelarGanhos(db, vendaId, new Date());
    const depois = await db.selectFrom('ganho').select(['tipo', 'situacao']).where('vendaDiretaId', '=', vendaId).execute();
    expect(Object.fromEntries(depois.map((l) => [l.tipo, l.situacao]))).toEqual({ PRO_LABORE: 'PAGA', COMISSAO_VENDEDOR: 'CANCELADA' });
  });
});

describe('liberação depois do prazo de troca e pagamento', () => {
  let comissao: string;
  let proLabore: string;
  test('com o prazo de troca definido, o ganho nasce com a data de liberação', async () => {
    await definir('prazo_troca_dias', 7);
    await db.updateTable('usuario').set({ comissaoTeto: null }).where('id', '=', id.bia).execute();
    const { linhas } = await vender('bia', 100);
    comissao = linhas.find((l) => l.tipo === 'COMISSAO_VENDEDOR')!.id;
    proLabore = linhas.find((l) => l.tipo === 'PRO_LABORE')!.id;
    const dias = (linhas[0].liberarEm!.getTime() - Date.now()) / 86_400_000;
    expect(dias).toBeGreaterThan(6.9);
    expect(dias).toBeLessThan(7.1);
  });
  test('a rotina do dia exige o segredo', async () => {
    expect((await request(app).post('/rotinas/dia')).status).toBe(401);
    expect((await request(app).post('/rotinas/dia').set('x-rotina-segredo', 'errado')).status).toBe(401);
    expect((await request(app).post('/rotinas/dia').set(como('socio'))).status).toBe(401);
  });
  test('antes do prazo a rotina não libera; depois do prazo, libera', async () => {
    const antes = await request(app).post('/rotinas/dia').set('x-rotina-segredo', SEGREDO);
    expect(antes.body).toEqual({ comissoesLiberadas: 0 });
    expect((await api.post('socio', `/ganhos/${comissao}/pagar`)).status).toBe(409); // ainda aguardando
    await db.updateTable('ganho').set({ liberarEm: new Date(Date.now() - 1000) }).where('id', 'in', [comissao, proLabore]).execute();
    const depois = await request(app).post('/rotinas/dia').set('x-rotina-segredo', SEGREDO);
    expect(depois.body).toEqual({ comissoesLiberadas: 2 });
    const linha = await db.selectFrom('ganho').selectAll().where('id', '=', comissao).executeTakeFirstOrThrow();
    expect(linha.situacao).toBe('LIBERADA');
  });
  test('só um Sócio paga, e só o que está liberado', async () => {
    expect((await api.post('gerente', `/ganhos/${comissao}/pagar`)).status).toBe(403);
    expect((await api.post('bia', `/ganhos/${comissao}/pagar`)).status).toBe(403);
    expect((await api.post('socio', `/ganhos/${proLabore}/pagar`)).status).toBe(404); // pró-labore não é pago por aqui
    expect((await api.post('socio', `/ganhos/${comissao}/pagar`)).status).toBe(200);
    expect((await api.post('socio', `/ganhos/${comissao}/pagar`)).status).toBe(409);
    const linha = await db.selectFrom('ganho').selectAll().where('id', '=', comissao).executeTakeFirstOrThrow();
    expect(linha).toMatchObject({ situacao: 'PAGA', pagaPor: id.socio });
    const aud = await db.selectFrom('auditoria').selectAll().where('entidadeId', '=', comissao).where('acao', '=', 'pagar').execute();
    expect(aud).toHaveLength(1);
  });
  test('liberar antes do prazo é decisão do Sócio e fica na auditoria', async () => {
    const { linhas } = await vender('bia', 100);
    const alvo = linhas.find((l) => l.tipo === 'COMISSAO_VENDEDOR')!.id;
    expect((await api.post('gerente', `/ganhos/${alvo}/liberar`)).status).toBe(403);
    expect((await api.post('socio', `/ganhos/${alvo}/liberar`)).status).toBe(200);
    expect((await api.post('socio', `/ganhos/${alvo}/liberar`)).status).toBe(409);
    expect(await db.selectFrom('auditoria').select('id').where('entidadeId', '=', alvo).where('acao', '=', 'liberar').execute()).toHaveLength(1);
    await definir('prazo_troca_dias', null);
  });
});

describe('cupons', () => {
  test('só o Sócio cria cupom; o código é único e sem espaços', async () => {
    expect((await api.post('gerente', `/influenciadores/${id.influenciador}/cupons`, { codigo: 'GER10', descontoPct: 10 })).status).toBe(403);
    expect((await api.post('socio', `/influenciadores/${id.influenciador}/cupons`, { codigo: 'UM10', descontoPct: 10 })).status).toBe(409);
    expect((await api.post('socio', `/influenciadores/${id.influenciador}/cupons`, { codigo: 'com espaço', descontoPct: 10 })).status).toBe(400);
  });
  test('cupom inexistente, inativo ou vencido não entra na venda', async () => {
    expect((await lancar('ana', 100, 100, { cupom: 'NAOEXISTE' })).status).toBe(400);
    const ontem = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
    await api.post('socio', `/influenciadores/${id.influenciador}/cupons`, { codigo: 'VENCIDO', descontoPct: 10, validade: ontem });
    expect((await lancar('ana', 100, 100, { cupom: 'VENCIDO' })).status).toBe(400);
    const c = await api.post('socio', `/influenciadores/${id.influenciador}/cupons`, { codigo: 'PARADO', descontoPct: 10 });
    expect((await api.patch('socio', `/cupons/${c.body.id}`, { ativo: false })).status).toBe(200);
    expect((await lancar('ana', 100, 100, { cupom: 'PARADO' })).status).toBe(400);
  });
  test('o cupom autoriza o próprio desconto, mesmo acima do limite do vendedor', async () => {
    await definir('limite_desconto_pct', 5);
    expect((await lancar('ana', 100, 90)).status).toBe(422);                   // 10% sem cupom: acima do limite de 5%
    expect((await lancar('ana', 100, 90, { cupom: 'UM10' })).status).toBe(201); // 10% com cupom de 10%
    expect((await lancar('ana', 100, 85, { cupom: 'UM10' })).status).toBe(422); // 15% com cupom de 10%
    await definir('limite_desconto_pct', null);
  });
  test('o vendedor confere o cupom sem ver a comissão', async () => {
    const r = await api.get('ana', '/cupons/validar?codigo=um10');
    expect(r.body).toEqual({ valido: true, codigo: 'UM10', descontoPct: 10, influenciador: 'Influenciadora Um' });
    expect((await api.get('ana', '/cupons/validar?codigo=NADA')).body).toEqual({ valido: false });
    expect((await api.get('social', '/cupons/validar?codigo=UM10')).status).toBe(403);
  });
});

describe('quem vê o quê', () => {
  test('o Gerente gere os influenciadores sem ver comissão, custo nem retorno', async () => {
    expect((await api.post('gerente', `/influenciadores/${id.influenciador}/pecas`, { descricao: 'Regata Running M', quantidade: 1, enviadaEm: '2026-11-10', custo: 30 })).status).toBe(403);
    expect((await api.post('gerente', `/influenciadores/${id.influenciador}/pecas`, { descricao: 'Regata Running M', quantidade: 1, enviadaEm: '2026-11-10' })).status).toBe(201);
    expect((await api.post('socio', `/influenciadores/${id.influenciador}/pecas`, { descricao: 'Jaqueta Training M', quantidade: 1, enviadaEm: '2026-11-11', custo: 60 })).status).toBe(201);
    expect((await api.put('gerente', `/influenciadores/${id.influenciador}/posts`, { mes: mesDe(new Date()), combinados: 4, feitos: 1 })).status).toBe(200);
    expect((await api.put('gerente', `/influenciadores/${id.influenciador}/posts`, { mes: mesDe(new Date()), combinados: 4, feitos: 3 })).status).toBe(200);

    const doGerente = (await api.get('gerente', '/influenciadores')).body[0];
    expect(doGerente.posts).toMatchObject({ combinados: 4, feitos: 3 });
    expect(doGerente.vendas).toBeGreaterThan(0);
    for (const campo of ['comissao', 'custoPecas', 'retorno', 'comissaoTeto']) expect(doGerente).not.toHaveProperty(campo);
    expect(doGerente.cupons[0]).not.toHaveProperty('comissaoPct');
    expect(doGerente.pecas[0]).not.toHaveProperty('custo');
    expect(JSON.stringify(doGerente)).not.toMatch(/comiss|custo|retorno/i);

    const doSocio = (await api.get('socio', '/influenciadores')).body[0];
    expect(doSocio.custoPecas).toBe(60);
    expect(doSocio.retorno).toBeCloseTo(doSocio.valorVendas - doSocio.comissao - 60, 2);
    expect((await api.get('ana', '/influenciadores')).status).toBe(403);
    expect((await api.get('influ1', '/influenciadores')).status).toBe(403);
  });
  test('cliente novo é de quem trouxe a primeira compra; quem compra de novo conta como "voltou"', async () => {
    const antes = (await api.get('socio', '/influenciadores')).body.find((i: { id: string }) => i.id === id.influenciador);
    const telefone = String(++fone);
    const comprar = async (extra: object) => {
      const lead = await api.post('gerente', '/oportunidades', { nome: 'Cliente Que Volta', telefone, canal: 'WHATSAPP', origem: 'INFLUENCIADOR', vendedorId: id.ana });
      expect(lead.status, JSON.stringify(lead.body)).toBe(201);
      const venda = await api.post('gerente', `/oportunidades/${lead.body.oportunidade.id}/venda-direta`, {
        itens: [{ descricao: 'Peça de teste', quantidade: 1, precoTabela: 50, preco: 50 }], formaPagamento: 'PIX', ...extra,
      });
      expect(venda.status, JSON.stringify(venda.body)).toBe(201);
      expect((await api.post('socio', `/vendas-diretas/${venda.body.id}/confirmar`)).status).toBe(200);
    };
    await comprar({ cpf: cpfFicticio(), cupom: 'UM10' });
    const comUma = (await api.get('socio', '/influenciadores')).body.find((i: { id: string }) => i.id === id.influenciador);
    expect(comUma.clientes).toBe(antes.clientes + 1);
    expect(comUma.clientesQueVoltaram).toBe(antes.clientesQueVoltaram);
    await comprar({}); // segunda compra, sem cupom
    const comDuas = (await api.get('socio', '/influenciadores')).body.find((i: { id: string }) => i.id === id.influenciador);
    expect(comDuas.clientes).toBe(antes.clientes + 1);
    expect(comDuas.clientesQueVoltaram).toBe(antes.clientesQueVoltaram + 1);
    expect(comDuas.vendas).toBe(antes.vendas + 1);
  });
  test('o influenciador vê só as próprias vendas e comissão, sem nenhum dado de cliente', async () => {
    const r = await api.get('influ1', '/meu-espaco');
    expect(r.status).toBe(200);
    expect(r.body.vendas.quantidade).toBeGreaterThanOrEqual(4);
    expect(r.body.cupons.map((c: { codigo: string }) => c.codigo)).toEqual(expect.arrayContaining(['UM10', 'UM20']));
    expect(r.body.comissao).toMatchObject({ mes: 40, teto: 40, faltaParaOTeto: 0 }); // parou no teto
    expect(r.body.porDia[0]).toEqual({ dia: expect.any(String), cupom: expect.any(String), quantidade: expect.any(Number), valor: expect.any(Number) });
    const texto = JSON.stringify(r.body);
    expect(texto).not.toMatch(/Cliente Ganhos|telefone|cpf|clienteId|vendedor/i);
    expect(r.body.cupons[0]).not.toHaveProperty('comissaoPct');
  });
  test('influenciador sem cadastro vê o aviso; os outros papéis não entram', async () => {
    expect((await api.get('influ2', '/meu-espaco')).body).toEqual({ semCadastro: true });
    for (const quem of ['ana', 'gerente', 'socio', 'social']) expect((await api.get(quem, '/meu-espaco')).status, quem).toBe(403);
  });
  test('o mesmo acesso não serve a dois influenciadores, e precisa ter o papel certo', async () => {
    expect((await api.post('socio', '/influenciadores', { nome: 'Outra', usuarioId: id.influ1 })).status).toBe(409);
    expect((await api.post('socio', '/influenciadores', { nome: 'Outra', usuarioId: id.ana })).status).toBe(400);
    expect((await api.post('gerente', '/influenciadores', { nome: 'Outra', comissaoTeto: 100 })).status).toBe(403);
  });
  test('o vendedor vê só a própria comissão', async () => {
    const ana = (await api.get('ana', '/ganhos/meus')).body;
    const noBanco = await db.selectFrom('ganho').select('valor').where('usuarioId', '=', id.ana).where('situacao', '!=', 'CANCELADA').execute();
    expect(ana.comissaoDoMes).toBeCloseTo(noBanco.reduce((s, l) => s + Number(l.valor), 0), 2);
    expect(ana).toMatchObject({ teto: 20, faltaParaOTeto: 0 });
    expect(ana.linhas.length).toBe(noBanco.length);
    expect((await api.get('influ1', '/ganhos/meus')).status).toBe(403);
    expect((await api.get('social', '/ganhos/meus')).status).toBe(403);
  });
  test('o resumo do Financeiro é só dos Sócios e bate com o banco', async () => {
    expect((await api.get('gerente', '/financeiro/resumo')).status).toBe(403);
    expect((await api.get('ana', '/financeiro/resumo')).status).toBe(403);
    const r = (await api.get('socio', '/financeiro/resumo')).body;
    const mes = mesDe(new Date());
    const linhas = await db.selectFrom('ganho').select(['tipo', 'valor', 'situacao']).where('competencia', '=', mes).where('situacao', '!=', 'CANCELADA').execute();
    const soma = (f: (l: (typeof linhas)[number]) => boolean) => Math.round(linhas.filter(f).reduce((s, l) => s + Number(l.valor), 0) * 100) / 100;
    expect(r.pro_labore).toBe(soma((l) => l.tipo === 'PRO_LABORE'));
    expect(r.comissao_mes).toBe(soma((l) => l.tipo !== 'PRO_LABORE'));
    expect(r.totalAPagar).toBe(soma((l) => l.tipo !== 'PRO_LABORE' && l.situacao === 'LIBERADA'));
    expect(r.proLaboreDivisao).toBeNull(); // divisão ainda não definida em Metas
    await definir('prolabore_divisao_fundador_pct', 60);
    const comDivisao = (await api.get('socio', '/financeiro/resumo')).body;
    expect(comDivisao.proLaboreDivisao.fundador + comDivisao.proLaboreDivisao.cofundador).toBeCloseTo(comDivisao.pro_labore, 2);
    expect(comDivisao.proLaboreDivisao.fundador).toBeCloseTo(comDivisao.pro_labore * 0.6, 2);
  });
});
