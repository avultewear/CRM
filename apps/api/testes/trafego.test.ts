import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { criarApp } from '../src/app.js';
import { abrirBanco, comoJson, type Banco } from '../src/banco.js';
import { hojeEmBrasilia } from '../src/ganhos.js';
import { cifrar, decifrar, mascararToken, type Buscar } from '../src/meta.js';
import type { Papel } from '../src/papeis.js';
import prepararBanco, { URL_TESTE } from './preparar-banco.js';

// Conta de anúncios fictícia: as respostas imitam o formato da Graph API da Meta. Nenhum dado real.
const SENHA = 'senha-de-teste-123';
const CHAVE = 'chave-de-teste-para-cifrar-o-token-da-meta-123';
const TOKEN = 'EAAtokenFicticioDeTesteQueNaoValeNada1234';
const SEGREDO = 'segredo-das-rotinas-de-teste-123';
const CONTA = 'act_1234567890';
const DIA = 86_400_000;

/** O que o "Gerenciador" fictício mostra para cada anúncio, em todo dia. */
const ANUNCIOS = [
  { id: '9001', conjunto: '8001', nome: 'Regata preta - vídeo', titulo: 'Regata que não marca', formato: 'VIDEO', spend: 50, impressions: 5000, reach: 4000, clicks: 60, conversas: 10, profundas: 6, video: true, qualidade: 'ABOVE_AVERAGE' },
  { id: '9002', conjunto: '8001', nome: 'Short - foto', titulo: 'Short dupla camada', formato: 'PHOTO', spend: 30, impressions: 3000, reach: 2500, clicks: 20, conversas: 3, profundas: 2, video: false, qualidade: 'AVERAGE' },
  { id: '9003', conjunto: '8002', nome: 'Kit corrida - carrossel', titulo: 'Kit corrida', formato: 'CAROUSEL', spend: 10, impressions: 2000, reach: 1800, clicks: 5, conversas: 0, profundas: 0, video: false, qualidade: 'BELOW_AVERAGE_20' },
];
const POR_DIA = { spend: 90, impressions: 10000, clicks: 85, conversas: 13 };
const listaDias = (desde: string, ate: string) => { const l: string[] = []; for (let d = desde; d <= ate; d = new Date(Date.parse(`${d}T12:00:00Z`) + DIA).toISOString().slice(0, 10)) l.push(d); return l; };

let chamadas: string[] = [];
let falharCom: { codigo: number; mensagem: string } | null = null;
const resposta = (status: number, corpo: unknown) => ({ status, json: async () => corpo });
const buscarMeta: Buscar = async (url) => {
  chamadas.push(url);
  const u = new URL(url);
  const caminho = u.pathname.replace(/^\/v\d+\.\d\//, '');
  const p = Object.fromEntries(u.searchParams);
  if (p.access_token !== TOKEN) return resposta(400, { error: { code: 190, message: 'Invalid OAuth access token.' } });
  if (falharCom) return resposta(400, { error: { code: falharCom.codigo, message: falharCom.mensagem } });
  if (caminho === 'me') return resposta(200, { id: '77', name: 'Usuário do sistema (teste)' });
  if (caminho === 'me/permissions') return resposta(200, { data: [{ permission: 'ads_read', status: 'granted' }, { permission: 'public_profile', status: 'granted' }] });
  if (caminho === 'me/adaccounts') return resposta(200, { data: [{ id: CONTA, name: 'Avulte (teste)', account_status: 1, currency: 'BRL' }] });
  if (caminho === CONTA) return resposta(200, { name: 'Avulte (teste)', account_status: 1, currency: 'BRL', timezone_name: 'America/Sao_Paulo' });
  if (caminho === `${CONTA}/campaigns`) return resposta(200, { data: [{ id: '7001', name: 'Conversas - WhatsApp', objective: 'OUTCOME_ENGAGEMENT', effective_status: 'ACTIVE', daily_budget: '9000' }] });
  if (caminho === `${CONTA}/adsets`) return resposta(200, { data: [
    { id: '8001', name: 'Mulheres 25-34 SP', campaign_id: '7001', effective_status: 'ACTIVE', optimization_goal: 'CONVERSATIONS', learning_stage_info: { status: 'SUCCESS' }, targeting: { age_min: 25, age_max: 34, genders: [2], geo_locations: { regions: [{ name: 'São Paulo' }] } } },
    { id: '8002', name: 'Aberto Brasil', campaign_id: '7001', effective_status: 'ACTIVE', optimization_goal: 'CONVERSATIONS', learning_stage_info: { status: 'FAIL' }, targeting: { geo_locations: { countries: ['BR'] }, targeting_automation: { advantage_audience: 1 } } },
  ] });
  if (caminho === `${CONTA}/ads`) {
    // Duas páginas, para conferir que a paginação é seguida.
    const pagina = (lista: typeof ANUNCIOS) => lista.map((a) => ({ id: a.id, name: a.nome, adset_id: a.conjunto, effective_status: 'ACTIVE', creative: { title: a.titulo, thumbnail_url: `https://exemplo.invalid/${a.id}.jpg`, object_type: a.formato } }));
    if (p.after === 'pg2') return resposta(200, { data: pagina(ANUNCIOS.slice(2)) });
    return resposta(200, { data: pagina(ANUNCIOS.slice(0, 2)), paging: { next: `https://graph.facebook.com/v26.0/${CONTA}/ads?access_token=${TOKEN}&after=pg2` } });
  }
  if (caminho === `${CONTA}/insights`) {
    const { since, until } = JSON.parse(p.time_range);
    const dias = listaDias(since, until);
    if (p.level === 'ad') {
      return resposta(200, { data: dias.flatMap((dia) => ANUNCIOS.map((a) => ({
        ad_id: a.id, date_start: dia, spend: String(a.spend), impressions: String(a.impressions), reach: String(a.reach), inline_link_clicks: String(a.clicks),
        actions: [{ action_type: 'link_click', value: String(a.clicks) }, { action_type: 'onsite_conversion.messaging_conversation_started_7d', value: String(a.conversas) },
          { action_type: 'onsite_conversion.messaging_user_depth_2_message_send', value: String(a.profundas) }],
        ...(a.video ? { video_play_actions: [{ action_type: 'video_view', value: '1000' }], video_p25_watched_actions: [{ action_type: 'video_view', value: '600' }],
          video_p50_watched_actions: [{ action_type: 'video_view', value: '350' }], video_p75_watched_actions: [{ action_type: 'video_view', value: '200' }], video_p100_watched_actions: [{ action_type: 'video_view', value: '100' }] } : {}),
        quality_ranking: a.qualidade, engagement_rate_ranking: 'AVERAGE', conversion_rate_ranking: 'AVERAGE',
      }))) });
    }
    const conversa = (n: number) => [{ action_type: 'onsite_conversion.messaging_conversation_started_7d', value: String(n) }];
    const linhas: Record<string, Array<Record<string, unknown>>> = {
      'age,gender': [{ age: '25-34', gender: 'female', spend: '60', impressions: '6000', inline_link_clicks: '70', actions: conversa(12) }, { age: '35-44', gender: 'male', spend: '30', impressions: '4000', inline_link_clicks: '15', actions: conversa(1) }],
      region: [{ region: 'São Paulo', spend: '70', impressions: '8000', inline_link_clicks: '75', actions: conversa(12) }, { region: 'Bahia', spend: '20', impressions: '2000', inline_link_clicks: '10', actions: conversa(1) }],
      'publisher_platform,platform_position': [{ publisher_platform: 'instagram', platform_position: 'story', spend: '90', impressions: '10000', inline_link_clicks: '85', actions: conversa(13) }],
      device_platform: [{ device_platform: 'mobile_app', spend: '90', impressions: '10000', inline_link_clicks: '85', actions: conversa(13) }],
      hourly_stats_aggregated_by_advertiser_time_zone: [{ hourly_stats_aggregated_by_advertiser_time_zone: '20:00:00 - 20:59:59', spend: '90', impressions: '10000', inline_link_clicks: '85', actions: conversa(13) }],
    };
    return resposta(200, { data: dias.flatMap((dia) => (linhas[p.breakdowns] ?? []).map((l) => ({ ...l, date_start: dia }))) });
  }
  return resposta(404, { error: { code: 100, message: `Rota não simulada: ${caminho}` } });
};

let db: Banco;
let app: ReturnType<typeof criarApp>;
let appSemChave: ReturnType<typeof criarApp>;
const token: Record<string, string> = {};
const id: Record<string, string> = {};
let fone = 51_90000_0000;
let nCpf = 0;
function cpfFicticio() {
  const base = String(700000000 + ++nCpf * 7919).slice(0, 9).split('').map(Number);
  const digito = (ds: number[]) => { const r = (ds.reduce((s, d, i) => s + d * (ds.length + 1 - i), 0) * 10) % 11; return r === 10 ? 0 : r; };
  const d1 = digito(base);
  return [...base, d1, digito([...base, d1])].join('');
}
const como = (quem: string) => ({ Authorization: `Bearer ${token[quem]}` });
const api = {
  get: (quem: string, rota: string) => request(app).get(rota).set(como(quem)),
  post: (quem: string, rota: string, corpo: object = {}) => request(app).post(rota).set(como(quem)).send(corpo),
  put: (quem: string, rota: string, corpo: object) => request(app).put(rota).set(como(quem)).send(corpo),
  patch: (quem: string, rota: string, corpo: object) => request(app).patch(rota).set(como(quem)).send(corpo),
};
async function definir(chave: string, valor: unknown) {
  await db.deleteFrom('parametro').where('chave', '=', chave).execute();
  if (valor !== null) await db.insertInto('parametro').values({ chave, valor: comoJson(valor) }).execute();
}
const hoje = hojeEmBrasilia();
const diaMenos = (n: number) => new Date(Date.parse(`${hoje}T12:00:00Z`) - n * DIA).toISOString().slice(0, 10);
const indicador = (corpo: { indicadores: Array<{ id: string; valor: number | null }> }, metrica: string) => corpo.indicadores.find((i) => i.id === metrica)!;

beforeAll(async () => {
  await prepararBanco();
  db = abrirBanco(URL_TESTE);
  const base = { db, jwtSegredo: 'segredo-de-teste-com-32-caracteres!!', origemWeb: 'http://localhost:3000', rotinaSegredo: SEGREDO, buscarMeta };
  app = criarApp({ ...base, metaChave: CHAVE });
  appSemChave = criarApp(base);
  const senhaHash = await bcrypt.hash(SENHA, 4);
  const pessoas: Array<[string, Papel, boolean]> = [['socio', 'SOCIO', false], ['gerente', 'GERENTE', false], ['ana', 'VENDEDOR', true], ['trafego', 'GESTOR_TRAFEGO', false]];
  for (const [nome, papel, vende] of pessoas) {
    const email = `t-${nome}@teste.local`;
    const linha = await db.insertInto('usuario').values({ nome: `T ${nome}`, email, senhaHash, papel, vende }).returning('id').executeTakeFirstOrThrow();
    id[nome] = linha.id;
    token[nome] = (await request(app).post('/auth/login').send({ email, senha: SENHA })).body.token;
  }
});
afterAll(async () => { await db.destroy(); });

describe('token cifrado', () => {
  test('cifrar e decifrar devolvem o mesmo token; com outra chave não abre', () => {
    const guardado = cifrar(TOKEN, CHAVE);
    expect(guardado).not.toContain(TOKEN);
    expect(decifrar(guardado, CHAVE)).toBe(TOKEN);
    expect(() => decifrar(guardado, 'outra-chave-qualquer-com-muitos-caracteres')).toThrow();
    expect(mascararToken(TOKEN)).toBe('••••1234');
  });
});

describe('conexão', () => {
  test('só o Sócio conecta; o gestor de tráfego vê a aba; Gerente e vendedor não entram', async () => {
    expect((await api.post('trafego', '/trafego/conexao/contas', { token: TOKEN })).status).toBe(403);
    expect((await api.get('trafego', '/trafego')).status).toBe(200);
    expect((await api.get('gerente', '/trafego')).status).toBe(403);
    expect((await api.get('ana', '/trafego')).status).toBe(403);
  });
  test('sem META_CHAVE no servidor, o token não é guardado', async () => {
    const r = await request(appSemChave).post('/trafego/conexao').set(como('socio')).send({ token: TOKEN, contaId: CONTA });
    expect(r.status).toBe(503);
    expect(r.body.erro).toContain('META_CHAVE');
  });
  test('token inválido: a Meta recusa e a mensagem explica o que fazer', async () => {
    const r = await api.post('socio', '/trafego/conexao/contas', { token: 'EAAtokenErradoQueNaoExisteNaMeta000' });
    expect(r.status).toBe(502);
    expect(r.body.erro).toContain('token não vale mais');
    const c = await api.post('socio', '/trafego/conexao', { token: 'EAAtokenErradoQueNaoExisteNaMeta000', contaId: CONTA });
    expect(c.status).toBe(400);
    expect(c.body.diagnostico[0]).toMatchObject({ item: 'Token', ok: false });
  });
  test('com o token certo: lista as contas, diagnostica e guarda o token cifrado (nem no banco nem na auditoria em texto)', async () => {
    const contas = await api.post('socio', '/trafego/conexao/contas', { token: TOKEN });
    expect(contas.body).toEqual([{ id: CONTA, nome: 'Avulte (teste)', ativa: true, moeda: 'BRL' }]);
    const r = await api.post('socio', '/trafego/conexao', { token: TOKEN, contaId: CONTA });
    expect(r.status).toBe(201);
    expect(r.body.diagnostico.map((i: { ok: boolean }) => i.ok)).toEqual([true, true, true]);
    const linha = await db.selectFrom('metaConexao').selectAll().where('ativa', '=', true).executeTakeFirstOrThrow();
    expect(linha.tokenCifrado).not.toContain(TOKEN);
    expect(linha).toMatchObject({ contaId: CONTA, contaNome: 'Avulte (teste)', moeda: 'BRL' });
    const auditoria = await db.selectFrom('auditoria').selectAll().where('entidade', '=', 'meta_conexao').execute();
    expect(JSON.stringify(auditoria)).not.toContain(TOKEN);
    const vista = (await api.get('trafego', '/trafego/conexao')).body;
    expect(vista.conexao.token).toBe('••••1234');
    expect(JSON.stringify(vista)).not.toContain(TOKEN);
    expect(vista.podeConectar).toBe(false);
  });
  test('"Diagnosticar conexão" testa token, permissões e conta', async () => {
    const r = await api.post('trafego', '/trafego/conexao/diagnosticar');
    expect(r.body.itens.map((i: { item: string }) => i.item)).toEqual(['Token', 'Permissões', 'Conta de anúncios']);
    expect(r.body.ok).toBe(true);
  });
});

describe('sincronização em partes', () => {
  test('estrutura: campanhas, conjuntos e anúncios, seguindo a paginação', async () => {
    const r = await api.post('trafego', '/trafego/sincronizar', { parte: 'estrutura' });
    expect(r.body).toEqual({ campanhas: 1, conjuntos: 2, anuncios: 3 });
    expect(chamadas.some((u) => u.includes('after=pg2'))).toBe(true);
    expect(await db.selectFrom('anuncioCampanha').select('orcamentoDiario').executeTakeFirstOrThrow()).toMatchObject({ orcamentoDiario: '90.00' });
    expect((await db.selectFrom('anuncioConjunto').select('faseAprendizado').where('id', '=', '8002').executeTakeFirstOrThrow()).faseAprendizado).toBe('FAIL');
  });
  test('dias: os 3 últimos dias, e investimento e cliques de um dia batem com o "Gerenciador"', async () => {
    const r = await api.post('trafego', '/trafego/sincronizar', { parte: 'dias' });
    expect(r.body.linhas).toBe(9);
    const ontem = diaMenos(1);
    const dia = await db.selectFrom('anuncioDia').select((eb) => [eb.fn.sum<string>('investimento').as('inv'), eb.fn.sum<string>('cliquesLink').as('cliques')])
      .where('dia', '=', ontem).executeTakeFirstOrThrow();
    expect(Number(dia.inv)).toBe(POR_DIA.spend);
    expect(Number(dia.cliques)).toBe(POR_DIA.clicks);
    expect((await db.selectFrom('anuncio').select('rankingQualidade').where('id', '=', '9003').executeTakeFirstOrThrow()).rankingQualidade).toBe('BELOW_AVERAGE_20');
    // Rodar de novo não duplica.
    await api.post('trafego', '/trafego/sincronizar', { parte: 'dias' });
    expect((await db.selectFrom('anuncioDia').select((eb) => eb.fn.countAll<string>().as('n')).executeTakeFirstOrThrow()).n).toBe('9');
  });
  test('histórico: blocos de 15 dias para trás, até completar 90 dias', async () => {
    let r;
    let voltas = 0;
    do { r = await api.post('trafego', '/trafego/sincronizar', { parte: 'historico' }); voltas += 1; } while (!r.body.concluido && voltas < 10);
    expect(voltas).toBe(6);
    const dias = await db.selectFrom('anuncioDia').select('dia').distinct().execute();
    expect(dias.length).toBe(90);
    expect((await api.post('trafego', '/trafego/sincronizar', { parte: 'historico' })).body).toEqual({ concluido: true });
  });
  test('limite de chamadas da Meta: a mensagem explica e o erro fica registrado na conexão', async () => {
    falharCom = { codigo: 17, mensagem: 'User request limit reached' };
    const r = await api.post('trafego', '/trafego/sincronizar', { parte: 'dias' });
    falharCom = null;
    expect(r.status).toBe(502);
    expect(r.body.erro).toContain('limite de chamadas');
    expect((await api.get('socio', '/trafego/conexao')).body.conexao.ultimoErro).toContain('limite de chamadas');
  });
  test('a rotina do dia exige o segredo', async () => {
    expect((await request(app).post('/rotinas/trafego').send({ parte: 'dias' })).status).toBe(401);
    expect((await request(app).post('/rotinas/trafego').set('x-rotina-segredo', SEGREDO).send({ parte: 'dias' })).status).toBe(200);
  });
});

describe('o lead guarda o anúncio de origem', () => {
  test('lead de anúncio com o anúncio escolhido guarda campanha, conjunto e título', async () => {
    const r = await api.post('gerente', '/oportunidades', { nome: 'Lead do Anúncio', telefone: String(++fone), canal: 'WHATSAPP', origem: 'ANUNCIO', anuncioId: '9001', vendedorId: id.ana });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    const o = await db.selectFrom('oportunidade').selectAll().where('id', '=', r.body.oportunidade.id).executeTakeFirstOrThrow();
    expect(o).toMatchObject({ anuncioId: '9001', conjuntoId: '8001', campanhaId: '7001', anuncioTitulo: 'Regata que não marca' });
    expect(r.body.oportunidade.anuncio).toMatchObject({ id: '9001', titulo: 'Regata que não marca' });
  });
  test('anúncio em lead que não é de anúncio, ou anúncio que não existe, é recusado', async () => {
    expect((await api.post('gerente', '/oportunidades', { nome: 'X', telefone: String(++fone), canal: 'WHATSAPP', origem: 'POST', anuncioId: '9001' })).status).toBe(400);
    expect((await api.post('gerente', '/oportunidades', { nome: 'X', telefone: String(++fone), canal: 'WHATSAPP', origem: 'ANUNCIO', anuncioId: '1111' })).status).toBe(400);
  });
  test('a lista de anúncios aparece para quem cadastra leads', async () => {
    expect((await api.get('ana', '/trafego/anuncios')).body.map((a: { id: string }) => a.id).sort()).toEqual(['9001', '9002', '9003']);
  });
});

describe('a aba: indicadores, jornada, criativos e onde melhorar', () => {
  let leadPago2: string;
  beforeAll(async () => {
    // Mais 1 lead de anúncio (sem o anúncio escolhido), 1 descartado e 2 que não vieram de anúncio.
    leadPago2 = (await api.post('gerente', '/oportunidades', { nome: 'Lead Pago 2', telefone: String(++fone), canal: 'WHATSAPP', origem: 'ANUNCIO', vendedorId: id.ana })).body.oportunidade.id;
    const spam = await api.post('gerente', '/oportunidades', { nome: 'Spam', telefone: String(++fone), canal: 'WHATSAPP', origem: 'ANUNCIO', vendedorId: id.ana });
    await db.updateTable('oportunidade').set({ situacao: 'DESCARTADA' }).where('id', '=', spam.body.oportunidade.id).execute();
    for (const origem of ['ORGANICO', 'POST']) await api.post('gerente', '/oportunidades', { nome: `Lead ${origem}`, telefone: String(++fone), canal: 'INSTAGRAM', origem, vendedorId: id.ana });
    // Uma venda de R$ 450 que veio de anúncio.
    const v = await api.post('gerente', `/oportunidades/${leadPago2}/venda-direta`, { itens: [{ descricao: 'Kit', quantidade: 1, precoTabela: 450, preco: 450 }], formaPagamento: 'PIX', cpf: cpfFicticio() });
    expect(v.status, JSON.stringify(v.body)).toBe(201);
    expect((await api.post('socio', `/vendas-diretas/${v.body.id}/confirmar`)).status).toBe(200);
  });
  test('indicadores dos últimos 7 dias batem com a conta à mão; custo por lead usa só os leads de tráfego pago', async () => {
    const r = (await api.get('trafego', '/trafego?dias=7')).body;
    expect(r.periodo.dias).toBe(7);
    // Os dados vão até hoje: 7 dias sincronizados.
    const inv = POR_DIA.spend * 7;
    expect(indicador(r, 'investimento_trafego').valor).toBe(inv);
    expect(indicador(r, 'impressoes').valor).toBe(POR_DIA.impressions * 7);
    expect(indicador(r, 'ctr').valor).toBe(Math.round((85 / 10000) * 1000) / 10);
    expect(indicador(r, 'cpc').valor).toBe(Math.round((inv / (85 * 7)) * 100) / 100);
    expect(indicador(r, 'cpm').valor).toBe(Math.round((inv / 70000) * 1000 * 100) / 100);
    expect(indicador(r, 'connect_rate').valor).toBe(Math.round((8 / 13) * 1000) / 10);
    expect(indicador(r, 'leads_trafego').valor).toBe(2);              // o descartado e os orgânicos não contam
    expect(indicador(r, 'custo_por_lead').valor).toBe(inv / 2);
    expect(indicador(r, 'roas').valor).toBe(Math.round((450 / inv) * 100) / 100);
    expect(r.fonte[hoje.slice(0, 7)]).toBe('META');
  });
  test('jornada até o lead: impressões → cliques → conversas → leads, com custo por etapa', async () => {
    const r = (await api.get('trafego', '/trafego?dias=7')).body;
    expect(r.jornada.map((e: { id: string; volume: number }) => `${e.id}:${e.volume}`)).toEqual(['IMPRESSOES:70000', 'CLIQUES:595', 'CONVERSAS:91', 'LEADS:2']);
    expect(r.jornada[2]).toMatchObject({ conversaoPct: Math.round((91 / 595) * 1000) / 10, perda: 504, custo: Math.round((630 / 91) * 100) / 100 });
  });
  test('criativos: quadrantes pela mediana, rankings e retenção do vídeo', async () => {
    const r = (await api.get('trafego', '/trafego?dias=7')).body;
    const por = Object.fromEntries(r.criativos.map((c: { id: string }) => [c.id, c]));
    expect(por['9001'].quadrante).toBe('Manter e escalar');     // mais verba, conversa mais barata
    expect(por['9003'].quadrante).toBe('Pausar ou testar');     // pouca verba e nenhuma conversa
    expect(por['9001'].retencao).toMatchObject({ plays: 7000, p25: 60, p50: 35, p75: 20, p100: 10 });
    expect(por['9001'].leads).toBe(1);
    expect(por['9003'].rankings.qualidade).toBe('BELOW_AVERAGE_20');
  });
  test('públicos: % do investimento contra % dos resultados', async () => {
    const r = (await api.get('trafego', '/trafego?dias=7')).body;
    const homens = r.publicos.IDADE_GENERO.linhas.find((l: { chave: string }) => l.chave === '35-44|male');
    expect(homens).toMatchObject({ pctInvestimento: Math.round((30 / 90) * 1000) / 10, pctResultados: Math.round((1 / 13) * 1000) / 10 });
    expect(r.ondeMelhorar.some((a: { titulo: string; tipo: string }) => a.tipo === 'ATENCAO' && a.titulo.includes('35-44 · homens'))).toBe(true);
  });
  test('nota da auditoria: sem referência a checagem não entra; com referência, entra; e as simulações aparecem', async () => {
    let r = (await api.get('trafego', '/trafego?dias=7')).body;
    const semRef = r.resumo.checagens.find((c: { id: string }) => c.id === 'ctr');
    expect(semRef.ok).toBeNull();
    // Sem referências: entram o aprendizado limitado (falha), a qualidade (falha) e a origem do lead (falha: 1 lead sem anúncio).
    expect(r.resumo.nota).toBe(0);
    expect((await api.put('socio', '/parametros/referencias_trafego', { valor: { ctrMin: 1.3, foo: 1 }, justificativa: 'teste' })).status).toBe(400);
    expect((await api.put('socio', '/parametros/referencias_trafego', { valor: { ctrMin: 0.5, cpcMax: 2, frequenciaMax: 3, taxaLeadMin: 5 }, justificativa: 'Valores fictícios do teste' })).status).toBe(200);
    r = (await api.get('trafego', '/trafego?dias=7')).body;
    expect(r.resumo.checagens.find((c: { id: string }) => c.id === 'ctr').ok).toBe(true);    // 0,85% ≥ 0,5%
    expect(r.resumo.nota).toBe(Math.round((3 / 6) * 100));                                  // ctr, cpc, frequência ok; 3 falhas
    expect(r.jornada.find((e: { id: string }) => e.id === 'LEADS')).toMatchObject({ meta: 5, ok: false });
    expect(r.simulacoes[0]).toMatchObject({ meta: 'Conversas que viram lead', alvo: '5%' });
    expect(r.simulacoes[0].leadsAMais).toBe(Math.round(91 * 0.05) - 2);
    expect(r.resumo.prioridades.length).toBeGreaterThan(0);
    expect(r.resumo.prioridades[0].tipo).toBe('CRITICO');
  });
  test('resumo do mês: orçamento diário ativo e ritmo contra o orçamento de Metas', async () => {
    await definir('orcamento_anuncios_mensal', 1000);
    const r = (await api.get('socio', '/trafego?dias=7')).body;
    expect(r.resumo.orcamentoDiarioAtivo).toBe(90);
    expect(r.resumo.orcamentoMes).toBe(1000);
    expect(r.resumo.projecaoMes).toBeGreaterThan(1000);
    expect(r.resumo.checagens.find((c: { id: string }) => c.id === 'orcamento').ok).toBe(false);
  });
  test('o lead de anúncio sem o anúncio escolhido pode ser corrigido depois', async () => {
    expect((await api.patch('gerente', `/oportunidades/${leadPago2}`, { anuncioId: '9002' })).status).toBe(200);
    expect((await db.selectFrom('oportunidade').select('anuncioTitulo').where('id', '=', leadPago2).executeTakeFirstOrThrow()).anuncioTitulo).toBe('Short dupla camada');
  });
});

describe('gasto sem conexão', () => {
  test('o Sócio digita o gasto do mês e o sistema distribui pelos dias; um novo valor substitui o anterior', async () => {
    expect((await api.put('trafego', '/trafego/gasto-manual', { competencia: '2026-01', valor: 310 })).status).toBe(403);
    expect((await api.put('socio', '/trafego/gasto-manual', { competencia: '2026-01', valor: 310 })).status).toBe(200);
    expect((await api.put('socio', '/trafego/gasto-manual', { competencia: '2026-01', valor: 620 })).status).toBe(200);
    const r = (await api.get('socio', '/trafego?desde=2026-01-01&ate=2026-01-10')).body;
    expect(r.fonte['2026-01']).toBe('MANUAL');
    expect(indicador(r, 'investimento_trafego').valor).toBe(200);    // 620 ÷ 31 × 10
    expect(r.diaADia[0].investimento).toBe(20);
    const vigentes = await db.selectFrom('gastoManual').select('valor').where('competencia', '=', '2026-01').where('substituidoEm', 'is', null).execute();
    expect(vigentes.map((v) => Number(v.valor))).toEqual([620]);
  });
  test('mês sem conexão e sem gasto digitado: investimento "—", nunca zero inventado', async () => {
    const r = (await api.get('socio', '/trafego?desde=2025-12-01&ate=2025-12-10')).body;
    expect(indicador(r, 'investimento_trafego').valor).toBeNull();
    expect(indicador(r, 'custo_por_lead').valor).toBeNull();
  });
});

describe('Painel e Daily com os números de tráfego', () => {
  test('o Painel mostra gasto, ROAS e custo por lead ao Sócio, e o lucro já desconta os anúncios', async () => {
    const r = (await api.get('socio', '/painel/indicadores')).body;
    const gasto = r.indicadores.find((i: { id: string }) => i.id === 'gasto_anuncios');
    expect(gasto.valor).toBeGreaterThan(0);
    expect(gasto.pendente).toBeUndefined();
    const custos = (await api.get('socio', '/custos')).body;
    expect(custos.conta.anuncios).toBe(gasto.valor);
    expect(custos.conta.lucro).toBe(Math.round((custos.conta.receita - custos.conta.comissoes - custos.conta.custos - gasto.valor) * 100) / 100);
    // Com o filtro de vendedor, os números da conta inteira ficam "—".
    const daAna = (await api.get('socio', `/painel/indicadores?vendedorId=${id.ana}`)).body;
    expect(daAna.indicadores.find((i: { id: string }) => i.id === 'roas').valor).toBeNull();
  });
  test('no Daily, o bloco Tráfego mostra o gasto ao Sócio e esconde do Gerente', async () => {
    const socio = (await api.get('socio', '/daily')).body.blocos.find((b: { id: string }) => b.id === 'TRAFEGO');
    expect(socio.numeros[0]).toMatchObject({ rotulo: 'Gasto de ontem', valor: POR_DIA.spend });
    const gerente = (await api.get('gerente', '/daily')).body.blocos.find((b: { id: string }) => b.id === 'TRAFEGO');
    expect(JSON.stringify(gerente)).not.toContain('"Gasto de ontem"');
    expect(gerente.numeros[0].rotulo).toBe('Leads de anúncio ontem');
  });
});

describe('desconectar', () => {
  test('o Sócio desconecta; os dados já sincronizados ficam', async () => {
    expect((await api.post('trafego', '/trafego/conexao/desconectar')).status).toBe(403);
    expect((await api.post('socio', '/trafego/conexao/desconectar')).status).toBe(200);
    expect((await api.get('socio', '/trafego/conexao')).body.conexao).toBeNull();
    expect(Number((await db.selectFrom('anuncioDia').select((eb) => eb.fn.countAll<string>().as('n')).executeTakeFirstOrThrow()).n)).toBe(270);
  });
});
