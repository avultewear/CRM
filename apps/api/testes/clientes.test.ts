import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { criarApp } from '../src/app.js';
import { abrirBanco, comoJson, type Banco } from '../src/banco.js';
import { segmentar } from '../src/clientes.js';
import type { Papel } from '../src/papeis.js';
import prepararBanco, { URL_TESTE } from './preparar-banco.js';

// Dados fictícios: nenhuma pessoa, cliente ou CPF real.
const SENHA = 'senha-de-teste-123';
const SEGREDO = 'segredo-das-rotinas-de-teste-123';
const DIA = 86_400_000;
let db: Banco;
let app: ReturnType<typeof criarApp>;
const token: Record<string, string> = {};
const id: Record<string, string> = {};
let fone = 31_90000_0000;
let nCpf = 0;
function cpfFicticio() {
  const base = String(300000000 + ++nCpf * 7919).slice(0, 9).split('').map(Number);
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
const rotina = () => request(app).post('/rotinas/dia').set('x-rotina-segredo', SEGREDO);

interface Cliente { clienteId: string; telefone: string; nome: string }
/** Cria o cliente por um lead do vendedor indicado. */
async function novoCliente(nome: string, vendedor = 'ana', aceite = false): Promise<Cliente> {
  const telefone = String(++fone);
  const lead = await api.post('gerente', '/oportunidades', { nome, telefone, canal: 'WHATSAPP', origem: 'INDICACAO', vendedorId: id[vendedor] });
  expect(lead.status, JSON.stringify(lead.body)).toBe(201);
  const clienteId = lead.body.oportunidade.cliente.id as string;
  if (aceite) expect((await api.patch('gerente', `/clientes/${clienteId}`, { aceiteMensagens: true })).status).toBe(200);
  return { clienteId, telefone, nome };
}
/** Lança e confirma uma compra. `diasAtras` recua a data da compra direto no banco. */
async function comprar(c: Cliente, valor: number, extra: { indicacao?: string; diasAtras?: number; peca?: string; quantidade?: number; vendedor?: string } = {}) {
  const abertas = await db.selectFrom('oportunidade').select('id').where('clienteId', '=', c.clienteId).where('situacao', '=', 'ABERTA').execute();
  let oportunidadeId = abertas[0]?.id;
  if (!oportunidadeId) {
    const lead = await api.post('gerente', '/oportunidades', { nome: c.nome, telefone: c.telefone, canal: 'WHATSAPP', origem: 'INDICACAO', vendedorId: id[extra.vendedor ?? 'ana'] });
    expect(lead.status, JSON.stringify(lead.body)).toBe(201);
    oportunidadeId = lead.body.oportunidade.id;
  }
  const temCpf = (await db.selectFrom('cliente').select('cpf').where('id', '=', c.clienteId).executeTakeFirstOrThrow()).cpf;
  const quantidade = extra.quantidade ?? 1;
  const venda = await api.post('gerente', `/oportunidades/${oportunidadeId}/venda-direta`, {
    itens: [{ descricao: extra.peca ?? 'Peça de teste', quantidade, precoTabela: valor / quantidade, preco: valor / quantidade }], formaPagamento: 'PIX',
    ...(temCpf ? {} : { cpf: cpfFicticio() }), ...(extra.indicacao ? { indicacao: extra.indicacao } : {}),
  });
  if (venda.status !== 201) return venda;
  expect((await api.post('socio', `/vendas-diretas/${venda.body.id}/confirmar`)).status).toBe(200);
  if (extra.diasAtras) {
    const quando = new Date(Date.now() - extra.diasAtras * DIA);
    await db.updateTable('vendaDireta').set({ decididaEm: quando }).where('id', '=', venda.body.id).execute();
  }
  return venda;
}
const naLista = async (quem: string, clienteId: string) =>
  (await api.get(quem, '/clientes')).body.clientes.find((c: { id: string }) => c.id === clienteId);
const tarefasDe = (clienteId: string, sequencia: 'POS_COMPRA' | 'RECOMPRA' | 'EM_RISCO') =>
  db.selectFrom('atividade').selectAll().where('clienteId', '=', clienteId).where('sequencia', '=', sequencia).execute();

beforeAll(async () => {
  await prepararBanco();
  db = abrirBanco(URL_TESTE);
  app = criarApp({ db, jwtSegredo: 'segredo-de-teste-com-32-caracteres!!', origemWeb: 'http://localhost:3000', rotinaSegredo: SEGREDO });
  const senhaHash = await bcrypt.hash(SENHA, 4);
  const pessoas: Array<[string, Papel, boolean]> = [
    ['socio', 'SOCIO', false], ['gerente', 'GERENTE', false], ['ana', 'VENDEDOR', true], ['bia', 'VENDEDOR', true], ['influ', 'INFLUENCIADOR', false], ['social', 'SOCIAL_MEDIA', false],
  ];
  for (const [nome, papel, vende] of pessoas) {
    const email = `c-${nome}@teste.local`;
    const linha = await db.insertInto('usuario').values({ nome: `C ${nome}`, email, senhaHash, papel, vende }).returning('id').executeTakeFirstOrThrow();
    id[nome] = linha.id;
    token[nome] = (await request(app).post('/auth/login').send({ email, senha: SENHA })).body.token;
  }
});
afterAll(async () => { await db.destroy(); });

describe('segmentos (função pura)', () => {
  const agora = new Date('2026-11-13T12:00:00Z');
  const ha = (dias: number) => new Date(agora.getTime() - dias * DIA);
  const base = [
    { clienteId: 'novo', compras: 1, total: 100, ultimaCompra: ha(3) },
    { clienteId: 'recorrente', compras: 2, total: 200, ultimaCompra: ha(10) },
    { clienteId: 'vip', compras: 5, total: 900, ultimaCompra: ha(5) },
    { clienteId: 'risco', compras: 3, total: 400, ultimaCompra: ha(70) },
    { clienteId: 'inativo', compras: 1, total: 80, ultimaCompra: ha(200) },
  ];
  test('sem limites em Metas, só existem Novo e Recorrente', () => {
    const s = segmentar(base, { emRiscoDias: null, inativoDias: null, vipPct: null }, agora);
    expect(Object.fromEntries(s)).toEqual({ novo: 'NOVO', recorrente: 'RECORRENTE', vip: 'RECORRENTE', risco: 'RECORRENTE', inativo: 'NOVO' });
  });
  test('com os limites: VIP, Em risco e Inativo; quem está sumindo aparece primeiro', () => {
    const s = segmentar(base, { emRiscoDias: 60, inativoDias: 120, vipPct: 20 }, agora);
    expect(Object.fromEntries(s)).toEqual({ novo: 'NOVO', recorrente: 'RECORRENTE', vip: 'VIP', risco: 'EM_RISCO', inativo: 'INATIVO' });
  });
  test('quem tem uma compra só não vira VIP, mesmo sendo o que mais gastou', () => {
    const s = segmentar([{ clienteId: 'a', compras: 1, total: 5000, ultimaCompra: ha(1) }, { clienteId: 'b', compras: 2, total: 100, ultimaCompra: ha(1) }], { emRiscoDias: null, inativoDias: null, vipPct: 50 }, agora);
    expect(s.get('a')).toBe('NOVO');
  });
  test('exatamente no limite ainda não é risco; um dia depois é', () => {
    const limites = { emRiscoDias: 60, inativoDias: null, vipPct: null };
    expect(segmentar([{ clienteId: 'a', compras: 1, total: 1, ultimaCompra: ha(60) }], limites, agora).get('a')).toBe('NOVO');
    expect(segmentar([{ clienteId: 'a', compras: 1, total: 1, ultimaCompra: ha(61) }], limites, agora).get('a')).toBe('EM_RISCO');
  });
});

describe('lista e ficha', () => {
  let carla: Cliente;
  let dani: Cliente;
  test('sem nenhuma compra, a lista vem vazia e os números ficam sem valor', async () => {
    const r = await api.get('socio', '/clientes');
    expect(r.status).toBe(200);
    expect(r.body.clientes).toEqual([]);
    expect(r.body.agora).toMatchObject({ clientes_ativos: 0, taxa_recompra: null, clientes_em_risco: null, ltv: null });
  });
  test('lead sem compra não aparece; com a primeira compra confirmada vira Novo', async () => {
    carla = await novoCliente('Carla Cliente', 'ana');
    expect(await naLista('socio', carla.clienteId)).toBeUndefined();
    expect((await comprar(carla, 100)).status).toBe(201);
    expect(await naLista('socio', carla.clienteId)).toMatchObject({ segmento: 'NOVO', compras: 1, total: 100 });
  });
  test('cliente com duas compras vira Recorrente', async () => {
    expect((await comprar(carla, 80)).status).toBe(201);
    expect(await naLista('socio', carla.clienteId)).toMatchObject({ segmento: 'RECORRENTE', compras: 2, total: 180 });
  });
  test('taxa de recompra, LTV e tempo entre compras batem com a conta à mão', async () => {
    dani = await novoCliente('Dani Cliente', 'bia');
    expect((await comprar(dani, 60)).status).toBe(201);
    // Recuo a primeira compra da Carla em 10 dias: o intervalo entre as duas passa a ser de 10 dias.
    const primeira = await db.selectFrom('vendaDireta').select(['id', 'decididaEm']).where('clienteId', '=', carla.clienteId).orderBy('decididaEm').executeTakeFirstOrThrow();
    await db.updateTable('vendaDireta').set({ decididaEm: new Date(primeira.decididaEm!.getTime() - 10 * DIA) }).where('id', '=', primeira.id).execute();
    const { agora } = (await api.get('socio', '/clientes')).body;
    expect(agora.taxa_recompra).toBe(50);             // 1 de 2 clientes comprou de novo
    expect(agora.ltv).toBe(120);                      // (180 + 60) ÷ 2
    expect(agora.tempo_entre_compras).toBeCloseTo(10, 0);
    expect(agora.clientes_ativos).toBe(2);
  });
  test('cada vendedor vê só os próprios clientes; a gestão vê todos; quem não é do comercial é barrado', async () => {
    expect((await api.get('ana', '/clientes')).body.clientes.map((c: { nome: string }) => c.nome)).toEqual(['Carla Cliente']);
    expect((await api.get('bia', '/clientes')).body.clientes.map((c: { nome: string }) => c.nome)).toEqual(['Dani Cliente']);
    expect((await api.get('gerente', '/clientes')).body.clientes).toHaveLength(2);
    expect((await api.get('ana', `/clientes/${dani.clienteId}/ficha`)).status).toBe(404);
    expect((await api.get('influ', '/clientes')).status).toBe(403);
    expect((await api.get('social', '/clientes')).status).toBe(403);
  });
  test('a ficha traz compras, atendimentos, código de indicação e o CPF só mascarado', async () => {
    const f = (await api.get('ana', `/clientes/${carla.clienteId}/ficha`)).body;
    expect(f).toMatchObject({ nome: 'Carla Cliente', compras: 2, total: 180, segmento: 'RECORRENTE' });
    expect(f.vendas).toHaveLength(2);
    expect(f.atendimentos.length).toBeGreaterThanOrEqual(2);
    expect(f.codigoIndicacao).toMatch(/^AV[A-Z2-9]{5}$/);
    expect(f.cpf).toMatch(/^\*\*\*\.\*\*\*\.\*\*\*-\d{2}$/);
    const cpf = (await db.selectFrom('cliente').select('cpf').where('id', '=', carla.clienteId).executeTakeFirstOrThrow()).cpf!;
    expect(JSON.stringify(f)).not.toContain(cpf);
  });
  test('com os limites em Metas, quem está sem comprar há mais dias entra em Em risco e depois em Inativo', async () => {
    await definir('segmento_em_risco_dias', 60);
    await definir('segmento_inativo_dias', 120);
    await db.updateTable('vendaDireta').set({ decididaEm: new Date(Date.now() - 70 * DIA) }).where('clienteId', '=', dani.clienteId).execute();
    expect((await naLista('socio', dani.clienteId)).segmento).toBe('EM_RISCO');
    expect((await api.get('socio', '/clientes')).body.agora.clientes_em_risco).toBe(1);
    await db.updateTable('vendaDireta').set({ decididaEm: new Date(Date.now() - 130 * DIA) }).where('clienteId', '=', dani.clienteId).execute();
    expect((await naLista('socio', dani.clienteId)).segmento).toBe('INATIVO');
    expect((await api.get('socio', '/clientes')).body.agora.clientes_ativos).toBe(1);
    await definir('segmento_em_risco_dias', null);
    await definir('segmento_inativo_dias', null);
  });
  test('etiquetas de comunidade: lista fechada, gravadas na ficha e na auditoria', async () => {
    expect((await api.put('ana', `/clientes/${carla.clienteId}/etiquetas`, { etiquetas: ['CORRE', 'DIVULGADOR'] })).status).toBe(200);
    expect((await api.put('ana', `/clientes/${carla.clienteId}/etiquetas`, { etiquetas: ['QUALQUER'] })).status).toBe(400);
    expect((await api.put('bia', `/clientes/${carla.clienteId}/etiquetas`, { etiquetas: [] })).status).toBe(404);
    expect((await naLista('socio', carla.clienteId)).etiquetas).toEqual(['CORRE', 'DIVULGADOR']);
    expect(await db.selectFrom('auditoria').select('id').where('entidadeId', '=', carla.clienteId).where('campo', '=', 'etiquetas').execute()).toHaveLength(1);
  });
  test('brinde: a gestão registra, só o Sócio informa e vê o custo', async () => {
    const corpo = { descricao: 'Squeeze Avulte', motivo: 'Cliente fiel', entregueEm: '2026-11-10' };
    expect((await api.post('ana', `/clientes/${carla.clienteId}/brindes`, corpo)).status).toBe(403);
    expect((await api.post('gerente', `/clientes/${carla.clienteId}/brindes`, { ...corpo, custo: 12 })).status).toBe(403);
    expect((await api.post('gerente', `/clientes/${carla.clienteId}/brindes`, corpo)).status).toBe(201);
    expect((await api.post('socio', `/clientes/${carla.clienteId}/brindes`, { ...corpo, descricao: 'Boné Avulte', custo: 25 })).status).toBe(201);
    const doGerente = (await api.get('gerente', `/clientes/${carla.clienteId}/ficha`)).body.brindes;
    expect(doGerente).toHaveLength(2);
    expect(JSON.stringify(doGerente)).not.toContain('custo');
    expect((await api.get('socio', `/clientes/${carla.clienteId}/ficha`)).body.brindes.map((b: { custo: number | null }) => b.custo).sort()).toEqual([25, null]);
  });
});

describe('indicação', () => {
  test('venda com código de indicação aparece na ficha de quem indicou', async () => {
    const quemIndica = await novoCliente('Edu Indica');
    await comprar(quemIndica, 50);
    const codigo = (await api.get('socio', `/clientes/${quemIndica.clienteId}/ficha`)).body.codigoIndicacao as string;
    const amigo = await novoCliente('Fabi Amiga');
    expect((await comprar(amigo, 90, { indicacao: codigo.toLowerCase() })).status).toBe(201);
    const ficha = (await api.get('socio', `/clientes/${quemIndica.clienteId}/ficha`)).body;
    expect(ficha.indicacoes).toHaveLength(1);
    expect(ficha.indicacoes[0]).toMatchObject({ nome: 'Fabi', valor: 90 });
    expect((await api.get('socio', `/clientes/${amigo.clienteId}/ficha`)).body.vendas[0].indicadoPor).toBe('Edu Indica');
  });
  test('código que não existe e o próprio código são recusados', async () => {
    const c = await novoCliente('Gil Sozinho');
    expect((await comprar(c, 40, { indicacao: 'AVXXXXX' })).status).toBe(400);
    await comprar(c, 40);
    const codigo = (await api.get('socio', `/clientes/${c.clienteId}/ficha`)).body.codigoIndicacao as string;
    const r = await comprar(c, 40, { indicacao: codigo });
    expect(r.status).toBe(400);
    expect(r.body.erro).toContain('próprio código');
  });
});

describe('sequências como tarefa', () => {
  test('quem não aceitou mensagens não entra em sequência; quem aceitou recebe o pós-compra', async () => {
    const semAceite = await novoCliente('Hugo Sem Aceite');
    await comprar(semAceite, 70);
    expect(await tarefasDe(semAceite.clienteId, 'POS_COMPRA')).toHaveLength(0);
    const comAceite = await novoCliente('Iara Com Aceite', 'ana', true);
    await comprar(comAceite, 70);
    const tarefas = await tarefasDe(comAceite.clienteId, 'POS_COMPRA');
    expect(tarefas).toHaveLength(1);
    expect(tarefas[0]).toMatchObject({ tipo: 'SEQUENCIA', responsavelId: id.ana, status: 'ABERTA' });
    expect(tarefas[0].mensagem).toContain('Iara');
    // A tarefa aparece para o vendedor com o telefone do cliente, e ele a conclui como feita.
    const daAna = (await api.get('ana', '/atividades')).body.find((t: { id: string }) => t.id === tarefas[0].id);
    expect(daAna).toMatchObject({ clienteNome: 'Iara Com Aceite', clienteTelefone: `55${comAceite.telefone}`, sequencia: 'POS_COMPRA' });
    expect((await api.post('ana', `/atividades/${tarefas[0].id}/concluir`, { resultado: 'FEITA' })).status).toBe(200);
  });
  test('cliente bloqueado não recebe nada, mesmo tendo aceitado antes', async () => {
    const c = await novoCliente('Jonas Bloqueado', 'ana', true);
    await db.updateTable('cliente').set({ bloqueado: true }).where('id', '=', c.clienteId).execute();
    await comprar(c, 70);
    expect(await tarefasDe(c.clienteId, 'POS_COMPRA')).toHaveLength(0);
  });
  test('recompra: a rotina cria a tarefa quando passam os dias de Metas, uma vez só por compra', async () => {
    const aceitou = await novoCliente('Kelly Recompra', 'bia', true);
    const naoAceitou = await novoCliente('Lia Recompra', 'bia');
    await comprar(aceitou, 70, { diasAtras: 40, vendedor: 'bia' });
    await comprar(naoAceitou, 70, { diasAtras: 40, vendedor: 'bia' });
    expect((await rotina()).body.tarefasDeRecompra).toBe(0);   // sem o parâmetro, nada é criado
    await definir('recompra_dias', 45);
    expect((await rotina()).body.tarefasDeRecompra).toBe(0);   // 40 dias: ainda não
    await definir('recompra_dias', 30);
    const r = await rotina();
    expect(r.status).toBe(200);
    expect(await tarefasDe(aceitou.clienteId, 'RECOMPRA')).toHaveLength(1);
    expect(await tarefasDe(naoAceitou.clienteId, 'RECOMPRA')).toHaveLength(0);
    await rotina();
    expect(await tarefasDe(aceitou.clienteId, 'RECOMPRA')).toHaveLength(1);
    expect((await tarefasDe(aceitou.clienteId, 'RECOMPRA'))[0].responsavelId).toBe(id.bia);
    // Comprou de novo: a próxima janela de recompra conta a partir da compra nova.
    await comprar(aceitou, 50, { diasAtras: 31, vendedor: 'bia' });
    await rotina();
    expect(await tarefasDe(aceitou.clienteId, 'RECOMPRA')).toHaveLength(2);
    await definir('recompra_dias', null);
  });
  test('em risco: a tarefa nasce quando o cliente entra no segmento', async () => {
    const c = await novoCliente('Mara Risco', 'ana', true);
    await comprar(c, 70, { diasAtras: 65 });
    await definir('segmento_em_risco_dias', 60);
    expect((await rotina()).body.tarefasDeEmRisco).toBeGreaterThanOrEqual(1);
    expect(await tarefasDe(c.clienteId, 'EM_RISCO')).toHaveLength(1);
    await rotina();
    expect(await tarefasDe(c.clienteId, 'EM_RISCO')).toHaveLength(1);
    await definir('segmento_em_risco_dias', null);
  });
  test('a rotina sem o segredo é recusada', async () => {
    expect((await request(app).post('/rotinas/dia')).status).toBe(401);
  });
});

describe('trocas e devoluções', () => {
  let cliente: Cliente;
  let vendaId: string;
  beforeAll(async () => {
    await definir('prolabore_pct', 10);
    await definir('comissao_vendedor_pct', 5);
    cliente = await novoCliente('Nina Troca', 'ana', true);
    const v = await comprar(cliente, 200, { peca: 'Regata Running M', quantidade: 2 });
    vendaId = v.body.id;
  });
  test('motivo fora da lista, peça que não é da venda e quantidade a mais são recusados', async () => {
    expect((await api.post('ana', `/vendas-diretas/${vendaId}/trocas`, { item: 'Regata Running M', quantidade: 1, motivo: 'OUTRO' })).status).toBe(400);
    expect((await api.post('ana', `/vendas-diretas/${vendaId}/trocas`, { item: 'Short que não vendi', quantidade: 1, motivo: 'TAMANHO' })).status).toBe(400);
    expect((await api.post('ana', `/vendas-diretas/${vendaId}/trocas`, { item: 'Regata Running M', quantidade: 3, motivo: 'TAMANHO' })).status).toBe(409);
    expect((await api.post('bia', `/vendas-diretas/${vendaId}/trocas`, { item: 'Regata Running M', quantidade: 1, motivo: 'TAMANHO' })).status).toBe(404);
  });
  test('troca por tamanho: solicitada → peça recebida → nova peça; a venda e os ganhos continuam', async () => {
    const t = await api.post('ana', `/vendas-diretas/${vendaId}/trocas`, { item: 'Regata Running M', quantidade: 1, motivo: 'TAMANHO' });
    expect(t.status).toBe(201);
    expect((await api.get('ana', '/clientes')).body.trocasAbertas.map((x: { id: string }) => x.id)).toContain(t.body.id);
    expect((await api.post('gerente', `/trocas/${t.body.id}/resolver`, { resolucao: 'NOVA_PECA' })).status).toBe(409);   // antes de receber
    expect((await api.post('ana', `/trocas/${t.body.id}/receber`, { estado: 'BOM' })).status).toBe(403);               // o vendedor só solicita
    expect((await api.post('gerente', `/trocas/${t.body.id}/receber`, { estado: 'BOM' })).status).toBe(200);
    expect((await api.post('gerente', `/trocas/${t.body.id}/resolver`, { resolucao: 'NOVA_PECA' })).status).toBe(200);
    expect((await api.post('gerente', `/trocas/${t.body.id}/resolver`, { resolucao: 'NOVA_PECA' })).status).toBe(409);
    const ganhos = await db.selectFrom('ganho').select('situacao').where('vendaDiretaId', '=', vendaId).execute();
    expect(ganhos.length).toBe(2);
    expect(ganhos.every((g) => g.situacao === 'AGUARDANDO')).toBe(true);
    expect((await naLista('socio', cliente.clienteId)).compras).toBe(1);
    expect((await api.get('ana', '/clientes')).body.trocasAbertas.map((x: { id: string }) => x.id)).not.toContain(t.body.id);
  });
  test('a devolução do valor é do Sócio e cancela a comissão e o pró-labore daquela venda', async () => {
    const t = await api.post('ana', `/vendas-diretas/${vendaId}/trocas`, { item: 'Regata Running M', quantidade: 1, motivo: 'ARREPENDIMENTO' });
    expect(t.status).toBe(201);
    expect((await api.post('gerente', `/trocas/${t.body.id}/receber`, { estado: 'BOM' })).status).toBe(200);
    expect((await api.post('gerente', `/trocas/${t.body.id}/resolver`, { resolucao: 'VALOR_DEVOLVIDO' })).status).toBe(403);
    const r = await api.post('socio', `/trocas/${t.body.id}/resolver`, { resolucao: 'VALOR_DEVOLVIDO' });
    expect(r.status).toBe(200);
    expect(r.body.ganhosCancelados).toBe(2);
    const ganhos = await db.selectFrom('ganho').select(['tipo', 'situacao']).where('vendaDiretaId', '=', vendaId).execute();
    expect(ganhos.map((g) => g.situacao)).toEqual(['CANCELADA', 'CANCELADA']);
    expect(ganhos.map((g) => g.tipo).sort()).toEqual(['COMISSAO_VENDEDOR', 'PRO_LABORE']);
    // A venda devolvida deixa de contar como compra do cliente, e o pós-compra em aberto é cancelado.
    expect(await naLista('socio', cliente.clienteId)).toBeUndefined();
    expect((await api.get('socio', `/clientes/${cliente.clienteId}/ficha`)).body.vendas[0].devolvida).toBe(true);
    expect((await tarefasDe(cliente.clienteId, 'POS_COMPRA'))[0].status).toBe('CANCELADA');
    expect((await api.post('ana', `/vendas-diretas/${vendaId}/trocas`, { item: 'Regata Running M', quantidade: 1, motivo: 'DEFEITO' })).status).toBe(409);
    const auditoria = await db.selectFrom('auditoria').select('acao').where('entidadeId', '=', t.body.id).execute();
    expect(auditoria.map((a) => a.acao).sort()).toEqual(['criar', 'receber', 'resolver']);
  });
  test('taxa de troca: peças que voltaram ÷ peças vendidas, só para a gestão', async () => {
    expect((await api.get('ana', '/trocas/taxa')).status).toBe(403);
    const r = (await api.get('gerente', '/trocas/taxa')).body;
    const regata = r.porPeca.find((p: { item: string }) => p.item === 'Regata Running M');
    expect(regata).toMatchObject({ voltaram: 2, vendidas: 2, taxa: 100 });
    expect(r.porMotivo.find((m: { motivo: string }) => m.motivo === 'TAMANHO').quantidade).toBe(1);
    const vendidas = (await db.selectFrom('vendaDireta').select('itens').where('situacao', '=', 'CONFIRMADA').execute())
      .reduce((s, v) => s + (v.itens as Array<{ quantidade: number }>).reduce((q, i) => q + i.quantidade, 0), 0);
    expect(r.taxa_troca).toBeCloseTo((2 / vendidas) * 100, 1);
  });
});
