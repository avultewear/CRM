import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { criarApp } from '../src/app.js';
import { abrirBanco, comoJson, type Banco } from '../src/banco.js';
import { hojeEmBrasilia } from '../src/ganhos.js';
import { periodoDoMes } from '../src/painel.js';
import type { Papel } from '../src/papeis.js';
import prepararBanco, { URL_TESTE } from './preparar-banco.js';

// Dados fictícios: nenhuma pessoa, cliente ou CPF real.
const SENHA = 'senha-de-teste-123';
const DIA = 86_400_000;
let db: Banco;
let app: ReturnType<typeof criarApp>;
const token: Record<string, string> = {};
const id: Record<string, string> = {};
let fone = 41_90000_0000;
let nCpf = 0;
function cpfFicticio() {
  const base = String(500000000 + ++nCpf * 7919).slice(0, 9).split('').map(Number);
  const digito = (ds: number[]) => { const r = (ds.reduce((s, d, i) => s + d * (ds.length + 1 - i), 0) * 10) % 11; return r === 10 ? 0 : r; };
  const d1 = digito(base);
  return [...base, d1, digito([...base, d1])].join('');
}
const como = (quem: string) => ({ Authorization: `Bearer ${token[quem]}` });
const api = {
  get: (quem: string, rota: string) => request(app).get(rota).set(como(quem)),
  post: (quem: string, rota: string, corpo: object = {}) => request(app).post(rota).set(como(quem)).send(corpo),
  put: (quem: string, rota: string, corpo: object) => request(app).put(rota).set(como(quem)).send(corpo),
};
async function definir(chave: string, valor: unknown) {
  await db.deleteFrom('parametro').where('chave', '=', chave).execute();
  if (valor !== null) await db.insertInto('parametro').values({ chave, valor: comoJson(valor) }).execute();
}
async function vender(valor: number, vendedor: string, extra: { diasAtras?: number; canal?: string } = {}) {
  const lead = await api.post('gerente', '/oportunidades', { nome: `Cliente ${fone}`, telefone: String(++fone), canal: extra.canal ?? 'WHATSAPP', origem: 'ANUNCIO', vendedorId: id[vendedor] });
  const v = await api.post('gerente', `/oportunidades/${lead.body.oportunidade.id}/venda-direta`, {
    itens: [{ descricao: 'Peça de teste', quantidade: 1, precoTabela: valor, preco: valor }], formaPagamento: 'PIX', cpf: cpfFicticio(),
  });
  expect(v.status, JSON.stringify(v.body)).toBe(201);
  expect((await api.post('socio', `/vendas-diretas/${v.body.id}/confirmar`)).status).toBe(200);
  if (extra.diasAtras) {
    const quando = new Date(Date.now() - extra.diasAtras * DIA);
    await db.updateTable('vendaDireta').set({ decididaEm: quando }).where('id', '=', v.body.id).execute();
    await db.updateTable('ganho').set({ criadoEm: quando }).where('vendaDiretaId', '=', v.body.id).execute();
  }
  return { vendaId: v.body.id as string, oportunidadeId: lead.body.oportunidade.id as string };
}
const indicador = (corpo: { indicadores: Array<{ id: string }> }, metrica: string) => corpo.indicadores.find((i) => i.id === metrica) as Record<string, unknown> | undefined;

beforeAll(async () => {
  await prepararBanco();
  db = abrirBanco(URL_TESTE);
  app = criarApp({ db, jwtSegredo: 'segredo-de-teste-com-32-caracteres!!', origemWeb: 'http://localhost:3000', rotinaSegredo: 'segredo-das-rotinas-de-teste-123' });
  const senhaHash = await bcrypt.hash(SENHA, 4);
  const pessoas: Array<[string, Papel, boolean]> = [['socio', 'SOCIO', false], ['gerente', 'GERENTE', false], ['ana', 'VENDEDOR', true], ['bia', 'VENDEDOR', true], ['trafego', 'GESTOR_TRAFEGO', false]];
  for (const [nome, papel, vende] of pessoas) {
    const email = `p-${nome}@teste.local`;
    const linha = await db.insertInto('usuario').values({ nome: `P ${nome}`, email, senhaHash, papel, vende }).returning('id').executeTakeFirstOrThrow();
    id[nome] = linha.id;
    token[nome] = (await request(app).post('/auth/login').send({ email, senha: SENHA })).body.token;
  }
});
afterAll(async () => { await db.destroy(); });

describe('período (função pura)', () => {
  test('mês em andamento vai até hoje e compara com os mesmos dias do mês anterior', () => {
    const p = periodoDoMes('2026-11', new Date('2026-11-10T15:00:00Z'));
    expect(p.emAndamento).toBe(true);
    expect(p.inicio.toISOString()).toBe('2026-11-01T03:00:00.000Z');
    expect(p.fim.toISOString()).toBe('2026-11-11T03:00:00.000Z');
    expect(p.anterior.inicio.toISOString()).toBe('2026-10-01T03:00:00.000Z');
    expect(p.anterior.fim.toISOString()).toBe('2026-10-11T03:00:00.000Z');
    expect([p.diasCorridos, p.diasDoMes]).toEqual([10, 30]);
  });
  test('mês fechado compara o mês inteiro; 31 de março compara com 28 de fevereiro', () => {
    const p = periodoDoMes('2026-03', new Date('2026-11-10T15:00:00Z'));
    expect(p.emAndamento).toBe(false);
    expect(p.fim.toISOString()).toBe('2026-04-01T03:00:00.000Z');
    expect(p.anterior.fim.toISOString()).toBe('2026-03-01T03:00:00.000Z');
  });
  test('janeiro compara com dezembro do ano anterior', () => {
    expect(periodoDoMes('2026-01', new Date('2026-11-10T15:00:00Z')).anterior.inicio.toISOString()).toBe('2025-12-01T03:00:00.000Z');
  });
});

describe('quem vê', () => {
  test('só Sócios e Gerente entram no Painel e no Daily; Reuniões idem', async () => {
    for (const rota of ['/painel/hoje', '/painel/indicadores', '/painel/series', '/painel/ranking', '/daily', '/reunioes']) {
      expect((await api.get('ana', rota)).status, rota).toBe(403);
      expect((await api.get('trafego', rota)).status, rota).toBe(403);
      expect((await api.get('gerente', rota)).status, rota).toBe(200);
    }
    expect((await api.get('gerente', '/custos')).status).toBe(403);
  });
});

describe('indicadores', () => {
  test('sem nenhuma venda: valores vazios e nenhum "−100%"', async () => {
    const r = await api.get('socio', '/painel/indicadores');
    expect(r.status).toBe(200);
    for (const i of r.body.indicadores) expect(i.variacaoPct, i.id).toBeNull();
    expect(indicador(r.body, 'receita')!.valor).toBeNull();
  });
  test('receita, vendas, ticket, pró-labore e comissões batem com o banco', async () => {
    await definir('prolabore_pct', 10);
    await definir('comissao_vendedor_pct', 5);
    await vender(100, 'ana');
    await vender(300, 'bia');
    const r = (await api.get('socio', '/painel/indicadores')).body;
    expect(indicador(r, 'receita')!.valor).toBe(400);
    expect(indicador(r, 'ticket_medio')!.valor).toBe(200);
    expect(indicador(r, 'pro_labore')!.valor).toBe(40);
    expect(indicador(r, 'comissao_mes')!.valor).toBe(20);
    // A conta direta no banco, para conferir.
    const doMes = await db.selectFrom('vendaDireta').select('valor').where('situacao', '=', 'CONFIRMADA').execute();
    expect(doMes.reduce((s, v) => s + Number(v.valor), 0)).toBe(400);
    // Filtro de vendedor.
    const daAna = (await api.get('socio', `/painel/indicadores?vendedorId=${id.ana}`)).body;
    expect(indicador(daAna, 'receita')!.valor).toBe(100);
  });
  test('comparação com o mesmo intervalo do mês anterior e projeção de fechamento', async () => {
    const hoje = hojeEmBrasilia();
    const dia = Number(hoje.slice(8));
    // Uma venda de R$ 200 no mesmo dia do mês anterior (dentro do intervalo comparado).
    const { vendaId } = await vender(200, 'ana');
    const [a, m] = hoje.slice(0, 7).split('-').map(Number);
    const ant = m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`;
    const diaAnt = Math.min(dia, new Date(Date.UTC(Number(ant.slice(0, 4)), Number(ant.slice(5)), 0)).getUTCDate());
    const quando = new Date(`${ant}-${String(diaAnt).padStart(2, '0')}T12:00:00-03:00`);
    await db.updateTable('vendaDireta').set({ decididaEm: quando }).where('id', '=', vendaId).execute();
    await db.updateTable('ganho').set({ criadoEm: quando }).where('vendaDiretaId', '=', vendaId).execute();
    const r = (await api.get('socio', '/painel/indicadores')).body;
    const receita = indicador(r, 'receita')!;
    expect(receita.anterior).toBe(200);
    expect(receita.variacaoPct).toBe(100);   // 400 contra 200
    expect(receita.projecao).toBeCloseTo((400 / dia) * new Date(Date.UTC(a, m, 0)).getUTCDate(), 1);
    // O mês anterior inteiro, visto como mês fechado.
    expect(indicador((await api.get('socio', `/painel/indicadores?mes=${ant}`)).body, 'receita')!.valor).toBe(200);
  });
  test('o Gerente não vê pró-labore, lucro, comissões somadas nem anúncios', async () => {
    const r = (await api.get('gerente', '/painel/indicadores')).body;
    const ids = r.indicadores.map((i: { id: string }) => i.id);
    for (const cifra of ['pro_labore', 'lucro', 'comissao_mes', 'comissoes_pagas', 'gasto_anuncios', 'cac', 'roas']) expect(ids, cifra).not.toContain(cifra);
    expect(ids).toEqual(expect.arrayContaining(['receita', 'ticket_medio', 'conversao_lead_venda', 'taxa_recompra']));
    const series = (await api.get('gerente', '/painel/series')).body;
    expect(JSON.stringify(series)).not.toMatch(/proLabore|comissoes/);
    const ranking = (await api.get('gerente', '/painel/ranking')).body;
    expect(ranking.vendedores[0]).not.toHaveProperty('comissao');
    const hoje = (await api.get('gerente', '/painel/hoje')).body;
    expect(hoje.agora).not.toHaveProperty('pro_labore');
    expect(hoje.areas).not.toHaveProperty('financeiro');
  });
  test('indicadores de tráfego aparecem com "—" e o aviso da etapa 7', async () => {
    const r = (await api.get('socio', '/painel/indicadores')).body;
    expect(indicador(r, 'roas')).toMatchObject({ valor: null, pendente: expect.stringContaining('etapa 7') });
  });
  test('mês que ainda não começou é recusado', async () => {
    expect((await api.get('socio', '/painel/indicadores?mes=2099-01')).status).toBe(400);
  });
});

describe('custos do mês e lucro', () => {
  test('lucro = receita − comissões − custos do mês; lançamento anulado sai da conta', async () => {
    const mes = hojeEmBrasilia().slice(0, 7);
    expect((await api.post('gerente', '/custos', { competencia: mes, categoria: 'PRODUCAO', descricao: 'Lote de regatas', valor: 50 })).status).toBe(403);
    expect((await api.post('socio', '/custos', { competencia: mes, categoria: 'QUALQUER', descricao: 'x', valor: 1 })).status).toBe(400);
    const c1 = await api.post('socio', '/custos', { competencia: mes, categoria: 'PRODUCAO', descricao: 'Lote de regatas', valor: 50 });
    const c2 = await api.post('socio', '/custos', { competencia: mes, categoria: 'FERRAMENTAS', descricao: 'Sistema de e-mail', valor: 30 });
    expect([c1.status, c2.status]).toEqual([201, 201]);
    let r = (await api.get('socio', '/painel/indicadores')).body;
    expect(indicador(r, 'lucro')!.valor).toBe(400 - 20 - 80);
    expect((await api.post('socio', `/custos/${c2.body.id}/anular`, { motivo: 'Lançado em dobro' })).status).toBe(200);
    expect((await api.post('socio', `/custos/${c2.body.id}/anular`, { motivo: 'De novo' })).status).toBe(409);
    r = (await api.get('socio', '/painel/indicadores')).body;
    expect(indicador(r, 'lucro')!.valor).toBe(400 - 20 - 50);
    const custos = (await api.get('socio', '/custos')).body;
    expect(custos.conta).toMatchObject({ receita: 400, comissoes: 20, custos: 50, lucro: 330 });
    expect(custos.custos).toHaveLength(2);   // o anulado continua na lista
    expect(await db.selectFrom('auditoria').select('acao').where('entidade', '=', 'custo').execute()).toHaveLength(3);
  });
});

describe('séries, ranking e jornada', () => {
  test('séries do ano: receita por mês e visão anual contra a meta', async () => {
    await definir('meta_faturamento_anual', 10000);
    const r = (await api.get('socio', '/painel/series')).body;
    const mes = hojeEmBrasilia().slice(0, 7);
    const atual = r.series.find((s: { mes: string }) => s.mes === mes);
    expect(atual).toMatchObject({ receita: 400, vendas: 2, proLabore: 40 });
    expect(r.anual.meta).toBe(10000);
    expect(r.anual.faltam).toBe(10000 - r.anual.acumulado);
    expect(r.series.filter((s: { futuro: boolean; receita: number | null }) => s.futuro).every((s: { receita: number | null }) => s.receita === null)).toBe(true);
  });
  test('ranking de vendedores por receita, com comissão só para o Sócio', async () => {
    const r = (await api.get('socio', '/painel/ranking')).body;
    expect(r.vendedores.map((v: { nome: string }) => v.nome)).toEqual(['P bia', 'P ana']);
    expect(r.vendedores[0]).toMatchObject({ receita: 300, vendas: 1, comissao: 15 });
    expect(r.porOrigem).toEqual([{ origem: 'ANUNCIO', receita: 400 }]);
  });
  test('jornada: metas por etapa, situação, gargalo e R$ por etapa só para o Sócio', async () => {
    expect((await api.put('socio', '/parametros/metas_por_etapa', { valor: { LEAD: 200 }, justificativa: 'teste' })).status).toBe(400);
    expect((await api.put('socio', '/parametros/metas_por_etapa', { valor: { LEAD: 90, ABORDADO: 50 }, justificativa: 'Valor fictício do teste' })).status).toBe(200);
    // Um lead parado em Lead, com valor, para aparecer em "Oportunidade".
    const lead = await api.post('gerente', '/oportunidades', { nome: 'Lead Parado', telefone: String(++fone), canal: 'INSTAGRAM', origem: 'POST', vendedorId: id.ana });
    await db.updateTable('oportunidade').set({ valor: 150 }).where('id', '=', lead.body.oportunidade.id).execute();
    const inicio = new Date(Date.now() - 40 * DIA).toISOString();
    const fim = new Date(Date.now() + DIA).toISOString();
    const r = (await api.get('socio', `/painel/jornada?inicio=${inicio}&fim=${fim}`)).body;
    const etapaLead = r.etapas.find((e: { etapa: string }) => e.etapa === 'LEAD');
    expect(etapaLead.entraram).toBe(4);
    expect(etapaLead.conversaoPct).toBe(75);       // 3 de 4 avançaram
    expect(etapaLead.situacao).toBe('atencao');      // 75 ≥ 80% de 90
    expect(r.gargalo).toBe('LEAD');
    expect(etapaLead.reais).toMatchObject({ oportunidade: 150, proLaborePrevisto: 15, comissaoPrevista: 7.5 });
    expect(r.fases.map((f: { fase: string }) => f.fase)).toEqual(['Pré-venda', 'Venda', 'Fechamento', 'Recuperação']);
    const doGerente = (await api.get('gerente', `/painel/jornada?inicio=${inicio}&fim=${fim}`)).body;
    expect(JSON.stringify(doGerente)).not.toContain('proLaborePrevisto');
    const soInstagram = (await api.get('socio', `/painel/jornada?inicio=${inicio}&fim=${fim}&canal=INSTAGRAM`)).body;
    expect(soInstagram.etapas.find((e: { etapa: string }) => e.etapa === 'LEAD').entraram).toBe(1);
  });
});

describe('Hoje', () => {
  test('previsão contra a meta, pró-labore e a fila de decisões na ordem', async () => {
    await definir('meta_faturamento_mensal', 5000);
    await definir('frase_motivacional', 'Cada treino conta.');
    // Uma venda direta aguardando e uma troca aberta.
    const lead = await api.post('gerente', '/oportunidades', { nome: 'Cliente Aguardando', telefone: String(++fone), canal: 'WHATSAPP', origem: 'ANUNCIO', vendedorId: id.ana });
    await api.post('gerente', `/oportunidades/${lead.body.oportunidade.id}/venda-direta`, { itens: [{ descricao: 'Peça', quantidade: 1, precoTabela: 80, preco: 80 }], formaPagamento: 'PIX', cpf: cpfFicticio() });
    const { vendaId } = await vender(120, 'ana');
    await api.post('ana', `/vendas-diretas/${vendaId}/trocas`, { item: 'Peça de teste', quantidade: 1, motivo: 'TAMANHO' });
    const r = (await api.get('socio', '/painel/hoje')).body;
    expect(r.frase).toBe('Cada treino conta.');
    expect(r.agora.previsao_fechamento).toMatchObject({ meta: 5000, receitaAteHoje: 520 });
    expect(r.agora.pro_labore).toBe(52);
    const tipos = r.fila.map((f: { tipo: string }) => f.tipo);
    expect(tipos[0]).toBe('VENDA_DIRETA');
    expect(tipos).toContain('COMISSOES_LIBERAR');     // sem prazo de troca: liberação manual
    expect(tipos.indexOf('TROCA')).toBeGreaterThan(tipos.indexOf('COMISSOES_LIBERAR'));
    expect(r.agora.decisoes).toBe(r.fila.length);
    // O Gerente só vê o que ele pode decidir: a troca.
    const doGerente = (await api.get('gerente', '/painel/hoje')).body;
    expect(doGerente.fila.map((f: { tipo: string }) => f.tipo)).toEqual(['TROCA']);
  });
});

describe('Daily e Reuniões', () => {
  test('o Daily traz os 7 blocos na ordem padrão; a ordem e o tempo vêm de Metas', async () => {
    let r = (await api.get('gerente', '/daily')).body;
    expect(r.blocos.map((b: { id: string }) => b.id)).toEqual(['RESULTADO', 'ATENDIMENTO', 'VENDEDORES', 'TRAFEGO', 'SOCIAL', 'CLIENTES', 'GESTAO']);
    expect(r.totalMinutos).toBe(30);
    expect(r.blocos.find((b: { id: string }) => b.id === 'TRAFEGO').numeros[0].pendente).toBe('etapa 7');
    expect((await api.put('socio', '/parametros/daily_config', { valor: [{ id: 'X', minutos: 3 }], justificativa: 'teste' })).status).toBe(400);
    expect((await api.put('socio', '/parametros/daily_config', { valor: [{ id: 'GESTAO', minutos: 5 }, { id: 'RESULTADO', minutos: 2 }], justificativa: 'Valor fictício do teste' })).status).toBe(200);
    r = (await api.get('gerente', '/daily')).body;
    expect(r.blocos.map((b: { id: string; minutos: number }) => `${b.id}:${b.minutos}`)).toEqual(['GESTAO:5', 'RESULTADO:2']);
    await definir('daily_config', null);
  });
  test('modo Equipe mostra só totais, sem nomes', async () => {
    const gestao = (await api.get('gerente', '/daily?modo=GESTAO')).body;
    const equipe = (await api.get('gerente', '/daily?modo=EQUIPE')).body;
    expect(JSON.stringify(gestao)).toContain('porPessoa');
    const blocosEquipe = JSON.stringify(equipe.blocos);
    expect(blocosEquipe).not.toContain('porPessoa');
    expect(blocosEquipe).not.toContain('"itens"');
    expect(blocosEquipe).not.toContain('P ana');
  });
  test('"Decidido" cria uma tarefa com responsável e prazo, e a ata aparece em Reuniões', async () => {
    const aberta = await api.post('gerente', '/reunioes', { modo: 'GESTAO' });
    expect(aberta.status).toBe(201);
    expect((await api.post('socio', '/reunioes', { modo: 'GESTAO' })).body).toMatchObject({ id: aberta.body.id, jaAberta: true });
    const rid = aberta.body.id;
    const hoje = hojeEmBrasilia();
    expect((await api.post('gerente', `/reunioes/${rid}/decisoes`, { bloco: 'VENDEDORES', texto: 'Ligar para os links sem compra', responsavelId: id.ana, prazo: '2020-01-01' })).status).toBe(400);
    const d = await api.post('gerente', `/reunioes/${rid}/decisoes`, { bloco: 'VENDEDORES', texto: 'Ligar para os links sem compra', responsavelId: id.ana, prazo: hoje });
    expect(d.status).toBe(201);
    const tarefa = await db.selectFrom('atividade').selectAll().where('id', '=', d.body.id).executeTakeFirstOrThrow();
    expect(tarefa).toMatchObject({ tipo: 'DECISAO', responsavelId: id.ana, reuniaoId: rid, status: 'ABERTA' });
    // A tarefa aparece para a vendedora, que a conclui.
    expect((await api.get('ana', '/atividades')).body.map((a: { id: string }) => a.id)).toContain(d.body.id);
    expect((await api.post('gerente', `/reunioes/${rid}/tratados`, { bloco: 'GESTAO', item: 'Vendas diretas a confirmar' })).status).toBe(200);
    expect((await api.get('gerente', '/daily')).body.reuniaoAberta.id).toBe(rid);
    const fim = await api.post('gerente', `/reunioes/${rid}/encerrar`, { pulados: ['SOCIAL'], numeros: [{ bloco: 'RESULTADO', linhas: [{ rotulo: 'Vendas de ontem', valor: '0' }] }] });
    expect(fim.status).toBe(200);
    expect((await api.post('gerente', `/reunioes/${rid}/decisoes`, { bloco: 'GESTAO', texto: 'Tarde demais', responsavelId: id.ana, prazo: hoje })).status).toBe(409);
    const reunioes = (await api.get('socio', '/reunioes')).body;
    expect(reunioes[0].ata).toMatchObject({ pulados: ['SOCIAL'], tratados: [{ bloco: 'GESTAO', item: 'Vendas diretas a confirmar' }] });
    expect(reunioes[0].ata.decisoes[0]).toMatchObject({ bloco: 'VENDEDORES', responsavel: 'P ana' });
    expect(reunioes[0].tarefas[0]).toMatchObject({ status: 'ABERTA', responsavel: 'P ana' });
    expect((await api.post('ana', `/atividades/${d.body.id}/concluir`, { resultado: 'FEITA' })).status).toBe(200);
    expect((await api.get('socio', '/reunioes')).body[0].tarefas[0].status).toBe('FEITA');
    expect((await api.get('gerente', '/daily')).body.reuniaoAberta).toBeNull();
  });
});
