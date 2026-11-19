import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { sql } from 'kysely';
import type { Banco, DimensaoPublico } from './banco.js';

/* Conexão com a API de Marketing da Meta (Graph API).
   - O token fica no banco cifrado com AES-256-GCM; a chave vem de META_CHAVE (nunca do código).
   - A sincronização é feita em partes, para caber no limite de 30 s: estrutura, últimos dias e o histórico de 90 dias em blocos.
   - `buscar` pode ser trocado nos testes (respostas no formato da Graph API, sem acessar a internet). */

export const VERSAO_PADRAO = 'v26.0';
const BASE = 'https://graph.facebook.com';
const DIAS_HISTORICO = 90;
const BLOCO_HISTORICO = 15;

// ---- Cifra do token
const chaveDe = (segredo: string) => createHash('sha256').update(segredo).digest();
export function cifrar(texto: string, segredo: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', chaveDe(segredo), iv);
  const dados = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), dados].map((b) => b.toString('base64')).join('.');
}
export function decifrar(guardado: string, segredo: string): string {
  const [iv, tag, dados] = guardado.split('.').map((p) => Buffer.from(p, 'base64'));
  const d = createDecipheriv('aes-256-gcm', chaveDe(segredo), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(dados), d.final()]).toString('utf8');
}
/** Só os 4 últimos caracteres, para mostrar na tela. */
export const mascararToken = (token: string) => `••••${token.slice(-4)}`;

// ---- Cliente HTTP
export type Buscar = (url: string) => Promise<{ status: number; json: () => Promise<unknown> }>;
export class ErroMeta extends Error {
  constructor(public codigo: number | null, mensagem: string, public subcodigo?: number) { super(mensagem); }
}
interface Pagina<T> { data?: T[]; paging?: { next?: string }; error?: { code?: number; error_subcode?: number; message?: string } }

export class ClienteMeta {
  constructor(private token: string, private versao = VERSAO_PADRAO, private buscar: Buscar = fetch as unknown as Buscar) {}

  private url(caminho: string, params: Record<string, string> = {}) {
    const q = new URLSearchParams({ ...params, access_token: this.token });
    return `${BASE}/${this.versao}/${caminho.replace(/^\//, '')}?${q}`;
  }
  private async pedir<T>(url: string): Promise<T> {
    let r;
    try { r = await this.buscar(url); } catch { throw new ErroMeta(null, 'Não foi possível falar com a Meta. Confira a internet do servidor e tente de novo.'); }
    const corpo = (await r.json()) as T & { error?: { code?: number; error_subcode?: number; message?: string } };
    if (r.status >= 400 || corpo?.error) {
      const e = corpo?.error ?? {};
      throw new ErroMeta(e.code ?? r.status, traduzirErro(e.code, e.message), e.error_subcode);
    }
    return corpo;
  }
  get<T>(caminho: string, params: Record<string, string> = {}) { return this.pedir<T>(this.url(caminho, params)); }
  /** Segue a paginação até o fim. */
  async todos<T>(caminho: string, params: Record<string, string> = {}): Promise<T[]> {
    const itens: T[] = [];
    let url: string | undefined = this.url(caminho, { limit: '500', ...params });
    for (let voltas = 0; url && voltas < 200; voltas += 1) {
      const pagina: Pagina<T> = await this.pedir<Pagina<T>>(url);
      itens.push(...(pagina.data ?? []));
      url = pagina.paging?.next;
    }
    return itens;
  }
}

function traduzirErro(codigo: number | undefined, mensagem = ''): string {
  if (codigo === 190) return 'O token não vale mais (expirou ou foi revogado). Gere um novo token e cole de novo.';
  if (codigo === 200 || codigo === 10) return 'O token não tem permissão para ler esta conta de anúncios (precisa de ads_read).';
  if (codigo === 100) return `A Meta recusou o pedido: ${mensagem || 'parâmetro inválido'}.`;
  if (codigo === 17 || codigo === 4 || codigo === 613 || codigo === 80004) return 'A Meta pediu para esperar (limite de chamadas). A sincronização tenta de novo na próxima vez.';
  return `A Meta respondeu com erro${codigo ? ` ${codigo}` : ''}: ${mensagem || 'sem detalhes'}.`;
}

// ---- Diagnóstico: token, permissões e conta
export interface ItemDiagnostico { item: string; ok: boolean; detalhe: string }
const STATUS_CONTA: Record<number, string> = { 1: 'ativa', 2: 'desativada', 3: 'com pagamento pendente', 7: 'em análise de risco', 8: 'com acerto pendente', 9: 'em período de carência', 100: 'para fechar', 101: 'fechada' };

export async function diagnosticar(cliente: ClienteMeta, contaId: string) {
  const itens: ItemDiagnostico[] = [];
  let conta: { nome: string | null; moeda: string | null; fuso: string | null } | null = null;
  try {
    const eu = await cliente.get<{ id: string; name?: string }>('me', { fields: 'id,name' });
    itens.push({ item: 'Token', ok: true, detalhe: `Válido, de ${eu.name ?? `usuário ${eu.id}`}.` });
  } catch (e) {
    itens.push({ item: 'Token', ok: false, detalhe: (e as Error).message });
    return { ok: false, itens, conta };
  }
  try {
    const permissoes = await cliente.todos<{ permission: string; status: string }>('me/permissions');
    const tem = (p: string) => permissoes.some((x) => x.permission === p && x.status === 'granted');
    const ok = tem('ads_read') || tem('ads_management');
    itens.push({ item: 'Permissões', ok, detalhe: ok ? 'Pode ler os anúncios (ads_read).' : 'Falta a permissão ads_read no token.' });
  } catch (e) {
    itens.push({ item: 'Permissões', ok: false, detalhe: (e as Error).message });
  }
  try {
    const c = await cliente.get<{ name?: string; account_status?: number; currency?: string; timezone_name?: string }>(contaId, { fields: 'name,account_status,currency,timezone_name' });
    const ativa = c.account_status === 1;
    conta = { nome: c.name ?? null, moeda: c.currency ?? null, fuso: c.timezone_name ?? null };
    itens.push({ item: 'Conta de anúncios', ok: ativa, detalhe: `${c.name ?? contaId}: ${STATUS_CONTA[c.account_status ?? 0] ?? 'situação desconhecida'}${c.currency ? `, em ${c.currency}` : ''}.` });
  } catch (e) {
    itens.push({ item: 'Conta de anúncios', ok: false, detalhe: (e as Error).message });
  }
  return { ok: itens.every((i) => i.ok), itens, conta };
}

/** Lista as contas de anúncios que o token enxerga, para o Sócio escolher. */
export async function contasDoToken(cliente: ClienteMeta) {
  const contas = await cliente.todos<{ id: string; name?: string; account_status?: number; currency?: string }>('me/adaccounts', { fields: 'id,name,account_status,currency' });
  return contas.map((c) => ({ id: c.id, nome: c.name ?? c.id, ativa: c.account_status === 1, moeda: c.currency ?? null }));
}

// ---- Sincronização
const numero = (v: unknown) => (v === undefined || v === null || v === '' ? null : Number(v));
const reais = (centavos: unknown) => (numero(centavos) === null ? null : Number(centavos) / 100);   // orçamentos vêm em centavos
type Acao = { action_type: string; value: string };
const acao = (lista: Acao[] | undefined, tipo: string) => {
  const a = lista?.find((x) => x.action_type === tipo);
  return a ? Number(a.value) : null;
};
const CONVERSA = 'onsite_conversion.messaging_conversation_started_7d';
const CONVERSA_PROFUNDA = 'onsite_conversion.messaging_user_depth_2_message_send';
const somaVideo = (lista: Acao[] | undefined) => (lista?.length ? lista.reduce((s, a) => s + Number(a.value), 0) : null);
const FORMATO: Record<string, string> = { VIDEO: 'VIDEO', PHOTO: 'IMAGEM', SHARE: 'IMAGEM', STATUS: 'IMAGEM', CAROUSEL: 'CARROSSEL' };

export async function sincronizarEstrutura(db: Banco, cliente: ClienteMeta, contaId: string) {
  const [campanhas, conjuntos, anuncios] = await Promise.all([
    cliente.todos<Record<string, unknown>>(`${contaId}/campaigns`, { fields: 'id,name,objective,effective_status,daily_budget' }),
    cliente.todos<Record<string, unknown>>(`${contaId}/adsets`, { fields: 'id,name,campaign_id,effective_status,optimization_goal,daily_budget,learning_stage_info,targeting' }),
    cliente.todos<Record<string, unknown>>(`${contaId}/ads`, { fields: 'id,name,adset_id,effective_status,creative{title,thumbnail_url,object_type}' }),
  ]);
  const agora = new Date();
  await db.transaction().execute(async (trx) => {
    for (const c of campanhas) {
      const v = { nome: String(c.name), objetivo: (c.objective as string) ?? null, status: (c.effective_status as string) ?? null, orcamentoDiario: reais(c.daily_budget), atualizadoEm: agora };
      await trx.insertInto('anuncioCampanha').values({ id: String(c.id), ...v }).onConflict((o) => o.column('id').doUpdateSet(v)).execute();
    }
    for (const s of conjuntos) {
      const alvo = (s.targeting ?? {}) as Record<string, unknown>;
      const publico = {
        idadeMin: alvo.age_min ?? null, idadeMax: alvo.age_max ?? null, generos: alvo.genders ?? null,
        locais: ((alvo.geo_locations as Record<string, unknown> | undefined)?.cities as Array<{ name: string }> | undefined)?.map((c) => c.name)
          ?? ((alvo.geo_locations as Record<string, unknown> | undefined)?.regions as Array<{ name: string }> | undefined)?.map((r) => r.name)
          ?? ((alvo.geo_locations as Record<string, unknown> | undefined)?.countries as string[] | undefined) ?? null,
        interesses: ((alvo.flexible_spec as Array<{ interests?: Array<{ name: string }> }> | undefined) ?? []).flatMap((f) => f.interests?.map((i) => i.name) ?? []),
        advantage: Boolean((alvo.targeting_automation as Record<string, unknown> | undefined)?.advantage_audience),
      };
      const v = {
        campanhaId: String(s.campaign_id), nome: String(s.name), status: (s.effective_status as string) ?? null, otimizacao: (s.optimization_goal as string) ?? null,
        orcamentoDiario: reais(s.daily_budget), faseAprendizado: ((s.learning_stage_info as Record<string, unknown> | undefined)?.status as string) ?? null,
        publico: JSON.stringify(publico), atualizadoEm: agora,
      };
      await trx.insertInto('anuncioConjunto').values({ id: String(s.id), ...v }).onConflict((o) => o.column('id').doUpdateSet(v)).execute();
    }
    for (const a of anuncios) {
      const criativo = (a.creative ?? {}) as Record<string, unknown>;
      const v = {
        conjuntoId: String(a.adset_id), nome: String(a.name), titulo: (criativo.title as string) ?? null, status: (a.effective_status as string) ?? null,
        formato: FORMATO[String(criativo.object_type ?? '')] ?? null, miniaturaUrl: (criativo.thumbnail_url as string) ?? null, atualizadoEm: agora,
      };
      await trx.insertInto('anuncio').values({ id: String(a.id), ...v }).onConflict((o) => o.column('id').doUpdateSet(v)).execute();
    }
  });
  return { campanhas: campanhas.length, conjuntos: conjuntos.length, anuncios: anuncios.length };
}

const QUEBRAS: Array<{ dimensao: DimensaoPublico; breakdowns: string; chave: (l: Record<string, string>) => string }> = [
  { dimensao: 'IDADE_GENERO', breakdowns: 'age,gender', chave: (l) => `${l.age}|${l.gender}` },
  { dimensao: 'REGIAO', breakdowns: 'region', chave: (l) => l.region },
  { dimensao: 'POSICIONAMENTO', breakdowns: 'publisher_platform,platform_position', chave: (l) => `${l.publisher_platform}|${l.platform_position}` },
  { dimensao: 'DISPOSITIVO', breakdowns: 'device_platform', chave: (l) => l.device_platform },
  { dimensao: 'HORARIO', breakdowns: 'hourly_stats_aggregated_by_advertiser_time_zone', chave: (l) => String(l.hourly_stats_aggregated_by_advertiser_time_zone ?? '').slice(0, 2) },
];

/** Números por anúncio e por dia, e os recortes de público da conta, num intervalo de dias. */
export async function sincronizarDias(db: Banco, cliente: ClienteMeta, contaId: string, desde: string, ate: string) {
  const intervalo = JSON.stringify({ since: desde, until: ate });
  const linhas = await cliente.todos<Record<string, unknown>>(`${contaId}/insights`, {
    level: 'ad', time_increment: '1', time_range: intervalo,
    fields: 'ad_id,date_start,spend,impressions,reach,inline_link_clicks,actions,video_play_actions,video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p100_watched_actions,quality_ranking,engagement_rate_ranking,conversion_rate_ranking',
  });
  const conhecidos = new Set((await db.selectFrom('anuncio').select('id').execute()).map((a) => a.id));
  const rankings = new Map<string, { q: string | null; e: string | null; c: string | null; dia: string }>();
  let gravadas = 0;
  await db.transaction().execute(async (trx) => {
    for (const l of linhas) {
      const anuncioId = String(l.ad_id);
      if (!conhecidos.has(anuncioId)) continue;   // anúncio fora da estrutura: entra na próxima sincronização da estrutura
      const acoes = l.actions as Acao[] | undefined;
      const v = {
        investimento: Number(l.spend ?? 0), impressoes: Number(l.impressions ?? 0), alcance: numero(l.reach), cliquesLink: Number(l.inline_link_clicks ?? 0),
        conversas: acao(acoes, CONVERSA) ?? 0, conversasProfundas: acao(acoes, CONVERSA_PROFUNDA),
        videoPlays: somaVideo(l.video_play_actions as Acao[]), videoP25: somaVideo(l.video_p25_watched_actions as Acao[]), videoP50: somaVideo(l.video_p50_watched_actions as Acao[]),
        videoP75: somaVideo(l.video_p75_watched_actions as Acao[]), videoP100: somaVideo(l.video_p100_watched_actions as Acao[]), atualizadoEm: new Date(),
      };
      await trx.insertInto('anuncioDia').values({ anuncioId, dia: String(l.date_start), ...v })
        .onConflict((o) => o.columns(['anuncioId', 'dia']).doUpdateSet(v)).execute();
      gravadas += 1;
      const atual = rankings.get(anuncioId);
      if (!atual || String(l.date_start) > atual.dia) {
        rankings.set(anuncioId, { q: (l.quality_ranking as string) ?? null, e: (l.engagement_rate_ranking as string) ?? null, c: (l.conversion_rate_ranking as string) ?? null, dia: String(l.date_start) });
      }
    }
    for (const [id, r] of rankings) {
      await trx.updateTable('anuncio').set({ rankingQualidade: r.q, rankingEngajamento: r.e, rankingConversao: r.c }).where('id', '=', id).execute();
    }
  });
  let recortes = 0;
  for (const q of QUEBRAS) {
    const dados = await cliente.todos<Record<string, string> & { actions?: Acao[] }>(`${contaId}/insights`, {
      level: 'account', time_increment: '1', time_range: intervalo, breakdowns: q.breakdowns, fields: 'date_start,spend,impressions,inline_link_clicks,actions',
    });
    await db.transaction().execute(async (trx) => {
      for (const l of dados) {
        const v = { investimento: Number(l.spend ?? 0), impressoes: Number(l.impressions ?? 0), cliquesLink: Number(l.inline_link_clicks ?? 0), conversas: acao(l.actions, CONVERSA) ?? 0 };
        await trx.insertInto('anuncioPublicoDia').values({ dia: l.date_start, dimensao: q.dimensao, chave: q.chave(l), ...v })
          .onConflict((o) => o.columns(['dia', 'dimensao', 'chave']).doUpdateSet(v)).execute();
        recortes += 1;
      }
    });
  }
  return { linhas: gravadas, recortes };
}

const diaMenos = (dia: string, n: number) => new Date(Date.parse(`${dia}T12:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

/** Uma parte da sincronização. 'dias' = os últimos 3 dias (a Meta ainda ajusta os números recentes); 'historico' = o próximo bloco de 15 dias para trás, até 90 dias. */
export async function sincronizarParte(db: Banco, cliente: ClienteMeta, conexao: { id: string; contaId: string; historicoAte: string | null }, parte: 'estrutura' | 'dias' | 'historico', hoje: string) {
  if (parte === 'estrutura') return sincronizarEstrutura(db, cliente, conexao.contaId);
  if (parte === 'dias') {
    const r = await sincronizarDias(db, cliente, conexao.contaId, diaMenos(hoje, 2), hoje);
    await db.updateTable('metaConexao').set({ sincronizadaEm: new Date(), ultimoErro: null, atualizadoEm: new Date() }).where('id', '=', conexao.id).execute();
    return r;
  }
  const limite = diaMenos(hoje, DIAS_HISTORICO - 1);
  const ate = conexao.historicoAte ? diaMenos(conexao.historicoAte, 1) : diaMenos(hoje, 3);
  if (ate < limite) return { concluido: true };
  const desde = [diaMenos(ate, BLOCO_HISTORICO - 1), limite].sort().at(-1)!;
  const r = await sincronizarDias(db, cliente, conexao.contaId, desde, ate);
  await db.updateTable('metaConexao').set({ historicoAte: desde, atualizadoEm: new Date() }).where('id', '=', conexao.id).execute();
  return { ...r, desde, ate, concluido: desde <= limite };
}

/** Apaga nada: só confirma que existe dado da Meta num mês (para decidir entre Meta e gasto digitado). */
export async function mesesComDadosDaMeta(db: Banco): Promise<Set<string>> {
  const linhas = await db.selectFrom('anuncioDia').select(sql<string>`to_char(dia, 'YYYY-MM')`.as('mes')).distinct().execute();
  return new Set(linhas.map((l) => l.mes));
}
