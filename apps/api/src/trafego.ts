import type { Express } from 'express';
import { z } from 'zod';
import type { Banco } from './banco.js';
import { mediana, variacaoPct } from './calculo.js';
import { hojeEmBrasilia, parametroNumero } from './ganhos.js';
import { ErroHttp, type Ferramentas } from './http.js';
import { ClienteMeta, contasDoToken, decifrar, diagnosticar, ErroMeta, mascararToken, mesesComDadosDaMeta, sincronizarParte, VERSAO_PADRAO, cifrar, type Buscar } from './meta.js';
import { METRICAS } from './metricas.js';
import { pode } from './papeis.js';
import { validarReferenciasTrafego } from './parametros.js';

/* Aba Tráfego: auditoria do tráfego pago, do anúncio na Meta até o lead no CRM.
   Fonte do investimento, mês a mês: os números da Meta quando o mês tem dados sincronizados;
   senão, o gasto digitado por um Sócio, dividido igualmente pelos dias do mês. */

const centavos = (v: number) => Math.round(v * 100) / 100;
const div = (a: number, b: number) => (b > 0 ? a / b : null);
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
const DIA = 86_400_000;
const somarDias = (dia: string, n: number) => new Date(Date.parse(`${dia}T12:00:00Z`) + n * DIA).toISOString().slice(0, 10);
const diasNoMes = (mes: string) => { const [a, m] = mes.split('-').map(Number); return new Date(Date.UTC(a, m, 0)).getUTCDate(); };
const meiaNoite = (dia: string) => new Date(`${dia}T00:00:00-03:00`);
const listaDias = (desde: string, ate: string) => { const l: string[] = []; for (let d = desde; d <= ate; d = somarDias(d, 1)) l.push(d); return l; };

export interface Referencias { ctrMin?: number; cpcMax?: number; cpmMax?: number; frequenciaMax?: number; connectRateMin?: number; cplMax?: number; taxaConversaMin?: number; taxaLeadMin?: number }

/** Investimento por dia no intervalo (inclusive), com a fonte de cada mês. Usado também pelo Painel. */
export async function investimentoPorDia(db: Banco, desde: string, ate: string) {
  const dias = listaDias(desde, ate);
  const meses = [...new Set(dias.map((d) => d.slice(0, 7)))];
  const [daMeta, manuais, metaMeses] = await Promise.all([
    db.selectFrom('anuncioDia').select('dia').select((eb) => eb.fn.sum<string>('investimento').as('total')).where('dia', '>=', desde).where('dia', '<=', ate).groupBy('dia').execute(),
    db.selectFrom('gastoManual').select(['competencia', 'valor']).where('competencia', 'in', meses).where('substituidoEm', 'is', null).execute(),
    mesesComDadosDaMeta(db),
  ]);
  const porDia = new Map(daMeta.map((l) => [l.dia, Number(l.total)]));
  const fonte: Record<string, 'META' | 'MANUAL' | 'NENHUMA'> = {};
  for (const mes of meses) fonte[mes] = metaMeses.has(mes) ? 'META' : manuais.some((m) => m.competencia === mes) ? 'MANUAL' : 'NENHUMA';
  const valores = dias.map((dia) => {
    const mes = dia.slice(0, 7);
    if (fonte[mes] === 'META') return { dia, valor: porDia.get(dia) ?? 0 };
    const manual = manuais.find((m) => m.competencia === mes);
    return { dia, valor: manual ? Number(manual.valor) / diasNoMes(mes) : 0 };
  });
  const semFonte = meses.every((m) => fonte[m] === 'NENHUMA');
  return { valores, fonte, total: semFonte ? null : centavos(valores.reduce((s, v) => s + v.valor, 0)) };
}

/** Leads novos de tráfego pago: oportunidades com origem Anúncio criadas no intervalo (descartadas não contam). */
async function leadsPagos(db: Banco, desde: string, ate: string) {
  return db.selectFrom('oportunidade').select(['id', 'criadoEm', 'anuncioId', 'campanhaId', 'clienteId'])
    .where('origem', '=', 'ANUNCIO').where('situacao', '!=', 'DESCARTADA')
    .where('criadoEm', '>=', meiaNoite(desde)).where('criadoEm', '<', meiaNoite(somarDias(ate, 1))).execute();
}
/** Faturamento que veio de anúncio: vendas confirmadas (não devolvidas) de oportunidades com origem Anúncio. */
async function faturamentoDeAnuncio(db: Banco, desde: string, ate: string) {
  return db.selectFrom('vendaDireta as v').innerJoin('oportunidade as o', 'o.id', 'v.oportunidadeId').select(['v.valor', 'v.decididaEm', 'o.anuncioId'])
    .where('v.situacao', '=', 'CONFIRMADA').where('v.devolvidaEm', 'is', null).where('o.origem', '=', 'ANUNCIO')
    .where('v.decididaEm', '>=', meiaNoite(desde)).where('v.decididaEm', '<', meiaNoite(somarDias(ate, 1))).execute();
}

/** Números de tráfego do Painel: gasto, ROAS, custo por lead (e qualificado) e CAC. */
export async function numerosDoTrafego(db: Banco, desde: string, ate: string) {
  const [inv, leads, fat] = await Promise.all([investimentoPorDia(db, desde, ate), leadsPagos(db, desde, ate), faturamentoDeAnuncio(db, desde, ate)]);
  const qualificados = leads.length ? await db.selectFrom('historicoEtapa').select('oportunidadeId').distinct()
    .where('etapaNova', '=', 'LEVANTAMENTO').where('oportunidadeId', 'in', leads.map((l) => l.id)).execute() : [];
  const total = inv.total;
  const receita = fat.reduce((s, v) => s + Number(v.valor), 0);
  return {
    gasto_anuncios: total,
    roas: total ? centavos(receita / total) : null,
    custo_por_lead: total !== null && leads.length ? centavos(total / leads.length) : null,
    custo_por_lead_qualificado: total !== null && qualificados.length ? centavos(total / qualificados.length) : null,
  };
}

const RANKING_RUIM = /^BELOW_AVERAGE/;
const QUADRANTES = { ESCALAR: 'Manter e escalar', VERBA: 'Dar mais verba', REVISAR: 'Revisar já', PAUSAR: 'Pausar ou testar' } as const;
const NOMES_DIMENSAO = { IDADE_GENERO: 'Idade e gênero', REGIAO: 'Região', POSICIONAMENTO: 'Posicionamento', DISPOSITIVO: 'Dispositivo', HORARIO: 'Horário' } as const;

interface Totais { investimento: number; impressoes: number; alcance: number | null; cliques: number; conversas: number; profundas: number | null; leads: number; receita: number }
function indicadoresDe(t: Totais, investimentoTotal: number | null) {
  const inv = investimentoTotal;
  return {
    investimento_trafego: inv,
    impressoes: t.impressoes || null,
    alcance_anuncios: t.alcance,
    frequencia: t.alcance ? Math.round((t.impressoes / t.alcance) * 100) / 100 : null,
    cliques_link: t.cliques || null,
    ctr: pct(t.cliques, t.impressoes),
    cpc: inv !== null && t.cliques ? centavos(inv / t.cliques) : null,
    cpm: inv !== null && t.impressoes ? centavos((inv / t.impressoes) * 1000) : null,
    conversas: t.conversas || null,
    connect_rate: t.profundas !== null ? pct(t.profundas, t.conversas) : null,
    leads_trafego: t.leads,
    custo_por_lead: inv !== null && t.leads ? centavos(inv / t.leads) : null,
    roas: inv ? centavos(t.receita / inv) : null,
  };
}
const ORDEM_INDICADORES = ['investimento_trafego', 'impressoes', 'alcance_anuncios', 'frequencia', 'cliques_link', 'ctr', 'cpc', 'cpm', 'conversas', 'connect_rate', 'leads_trafego', 'custo_por_lead', 'roas'];

export function registrarTrafego(app: Express, { db, rota, autenticar, exigir, auditar }: Ferramentas, opcoes: { metaChave?: string; metaVersao?: string; buscarMeta?: Buscar; rotinaSegredo?: string }) {
  const ver = [autenticar, exigir('trafego.ver')] as const;
  const socio = [autenticar, exigir('trafego.conectar')] as const;

  const conexaoAtiva = () => db.selectFrom('metaConexao').selectAll().where('ativa', '=', true).executeTakeFirst();
  const cliente = (token: string) => new ClienteMeta(token, opcoes.metaVersao ?? VERSAO_PADRAO, opcoes.buscarMeta);
  const exigirChave = () => {
    if (!opcoes.metaChave) throw new ErroHttp(503, 'Falta configurar META_CHAVE no servidor (a chave que cifra o token). Sem ela, o token não é guardado.');
    return opcoes.metaChave;
  };
  const traduzir = (e: unknown) => (e instanceof ErroMeta ? new ErroHttp(502, e.message) : e);

  // ---- Conexão
  app.get('/trafego/conexao', ...ver, rota(async (req, res) => {
    const c = await conexaoAtiva();
    const manuais = await db.selectFrom('gastoManual as g').innerJoin('usuario as u', 'u.id', 'g.criadoPor').select(['g.competencia', 'g.valor', 'g.criadoEm', 'u.nome as por'])
      .where('g.substituidoEm', 'is', null).orderBy('g.competencia', 'desc').limit(12).execute();
    res.json({
      chaveConfigurada: Boolean(opcoes.metaChave), versaoApi: opcoes.metaVersao ?? VERSAO_PADRAO,
      podeConectar: pode(req.usuario.papel, 'trafego.conectar'),
      conexao: c ? {
        contaId: c.contaId, contaNome: c.contaNome, moeda: c.moeda, fuso: c.fuso, token: opcoes.metaChave ? mascararToken(decifrar(c.tokenCifrado, opcoes.metaChave)) : '••••',
        diagnostico: c.ultimoDiagnostico, diagnosticadaEm: c.diagnosticadaEm, sincronizadaEm: c.sincronizadaEm, historicoAte: c.historicoAte, ultimoErro: c.ultimoErro,
      } : null,
      gastoManual: manuais.map((m) => ({ ...m, valor: Number(m.valor) })),
    });
  }));

  /** Passo 1: o Sócio cola o token e vê as contas de anúncios que ele enxerga. */
  app.post('/trafego/conexao/contas', ...socio, rota(async (req, res) => {
    const { token } = z.object({ token: z.string().trim().min(20, 'Cole o token inteiro.').max(1000) }).strict().parse(req.body);
    try { res.json(await contasDoToken(cliente(token))); } catch (e) { throw traduzir(e); }
  }));

  /** Passo 2: escolhe a conta. O sistema diagnostica, guarda o token cifrado e começa pela estrutura. */
  app.post('/trafego/conexao', ...socio, rota(async (req, res) => {
    const chave = exigirChave();
    const { token, contaId } = z.object({ token: z.string().trim().min(20).max(1000), contaId: z.string().regex(/^act_\d+$/, 'Escolha a conta de anúncios.') }).strict().parse(req.body);
    const diag = await diagnosticar(cliente(token), contaId);
    if (!diag.ok) return void res.status(400).json({ erro: 'A conexão não passou no diagnóstico. Veja o que falta abaixo.', diagnostico: diag.itens });
    const agora = new Date();
    await db.transaction().execute(async (trx) => {
      await trx.updateTable('metaConexao').set({ ativa: false, atualizadoEm: agora }).where('ativa', '=', true).execute();
      const linha = await trx.insertInto('metaConexao').values({
        contaId, contaNome: diag.conta?.nome ?? null, moeda: diag.conta?.moeda ?? null, fuso: diag.conta?.fuso ?? null, tokenCifrado: cifrar(token, chave),
        conectadaPor: req.usuario.id, ultimoDiagnostico: JSON.stringify(diag.itens), diagnosticadaEm: agora,
      }).returning('id').executeTakeFirstOrThrow();
      // O token nunca vai para a auditoria: só a conta.
      await auditar(trx, [{ entidade: 'meta_conexao', entidadeId: linha.id, acao: 'conectar', para: { contaId, conta: diag.conta?.nome }, autorId: req.usuario.id }]);
    });
    res.status(201).json({ ok: true, diagnostico: diag.itens });
  }));

  app.post('/trafego/conexao/diagnosticar', ...ver, rota(async (_req, res) => {
    const c = await conexaoAtiva();
    if (!c) throw new ErroHttp(404, 'Nenhuma conta de anúncios conectada.');
    const diag = await diagnosticar(cliente(decifrar(c.tokenCifrado, exigirChave())), c.contaId);
    await db.updateTable('metaConexao').set({ ultimoDiagnostico: JSON.stringify(diag.itens), diagnosticadaEm: new Date(), atualizadoEm: new Date() }).where('id', '=', c.id).execute();
    res.json(diag);
  }));

  app.post('/trafego/conexao/desconectar', ...socio, rota(async (req, res) => {
    const c = await conexaoAtiva();
    if (!c) throw new ErroHttp(404, 'Nenhuma conta de anúncios conectada.');
    await db.transaction().execute(async (trx) => {
      await trx.updateTable('metaConexao').set({ ativa: false, atualizadoEm: new Date() }).where('id', '=', c.id).execute();
      await auditar(trx, [{ entidade: 'meta_conexao', entidadeId: c.id, acao: 'desconectar', de: { contaId: c.contaId }, autorId: req.usuario.id }]);
    });
    res.json({ ok: true });
  }));

  async function sincronizar(parte: 'estrutura' | 'dias' | 'historico') {
    const c = await conexaoAtiva();
    if (!c) throw new ErroHttp(404, 'Nenhuma conta de anúncios conectada.');
    try {
      return await sincronizarParte(db, cliente(decifrar(c.tokenCifrado, exigirChave())), c, parte, hojeEmBrasilia());
    } catch (e) {
      if (e instanceof ErroMeta) await db.updateTable('metaConexao').set({ ultimoErro: e.message, atualizadoEm: new Date() }).where('id', '=', c.id).execute();
      throw traduzir(e);
    }
  }
  app.post('/trafego/sincronizar', ...ver, rota(async (req, res) => {
    const { parte } = z.object({ parte: z.enum(['estrutura', 'dias', 'historico']) }).strict().parse(req.body);
    res.json(await sincronizar(parte));
  }));
  /** Rotina do dia (agendador): uma parte por chamada, para caber em 30 s. */
  app.post('/rotinas/trafego', rota(async (req, res) => {
    if (!opcoes.rotinaSegredo || req.get('x-rotina-segredo') !== opcoes.rotinaSegredo) throw new ErroHttp(401, 'Rotina não autorizada.');
    const { parte } = z.object({ parte: z.enum(['estrutura', 'dias', 'historico']) }).strict().parse(req.body);
    if (!(await conexaoAtiva())) return void res.json({ semConexao: true });
    res.json(await sincronizar(parte));
  }));

  // ---- Gasto sem conexão
  app.put('/trafego/gasto-manual', ...socio, rota(async (req, res) => {
    const { competencia, valor } = z.object({ competencia: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Escolha o mês.'), valor: z.number().min(0).max(10_000_000) }).strict().parse(req.body);
    const agora = new Date();
    await db.transaction().execute(async (trx) => {
      const antes = await trx.selectFrom('gastoManual').select(['id', 'valor']).where('competencia', '=', competencia).where('substituidoEm', 'is', null).executeTakeFirst();
      if (antes) await trx.updateTable('gastoManual').set({ substituidoEm: agora }).where('id', '=', antes.id).execute();
      const linha = await trx.insertInto('gastoManual').values({ competencia, valor, criadoPor: req.usuario.id }).returning('id').executeTakeFirstOrThrow();
      await auditar(trx, [{ entidade: 'gasto_manual', entidadeId: linha.id, acao: antes ? 'alterar' : 'criar', campo: competencia, de: antes ? Number(antes.valor) : null, para: valor, autorId: req.usuario.id }]);
    });
    res.json({ ok: true });
  }));

  // ---- Anúncios para o cadastro do lead
  app.get('/trafego/anuncios', autenticar, exigir('atendimento.ver'), rota(async (_req, res) => {
    const anuncios = await db.selectFrom('anuncio as a').innerJoin('anuncioConjunto as s', 's.id', 'a.conjuntoId').innerJoin('anuncioCampanha as c', 'c.id', 's.campanhaId')
      .select(['a.id', 'a.nome', 'a.titulo', 'a.status', 'c.nome as campanha', 's.nome as conjunto']).orderBy('c.nome').orderBy('a.nome').execute();
    res.json(anuncios);
  }));

  // ---- A aba inteira: as seções da auditoria, num período
  app.get('/trafego', ...ver, rota(async (req, res) => {
    const hoje = hojeEmBrasilia();
    const q = z.object({ dias: z.coerce.number().int().refine((n) => [7, 30, 90].includes(n)).optional(), desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), ate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).parse(req.query);
    const ate = q.ate && q.ate <= hoje ? q.ate : hoje;
    const desde = q.desde && q.desde <= ate ? q.desde : somarDias(ate, -((q.dias ?? 30) - 1));
    const tamanho = listaDias(desde, ate).length;
    if (tamanho > 400) throw new ErroHttp(400, 'Escolha um período de até 400 dias.');
    const antAte = somarDias(desde, -1);
    const antDesde = somarDias(antAte, -(tamanho - 1));

    const refLinha = await db.selectFrom('parametro').select('valor').where('chave', '=', 'referencias_trafego').executeTakeFirst();
    const ref: Referencias = refLinha ? (validarReferenciasTrafego(refLinha.valor).data ?? {}) : {};
    const [c, inv, invAnt, leads, leadsAnt, fat, fatAnt, linhasDia, linhasDiaAnt, estrutura, publicos, orcamentoMes] = await Promise.all([
      conexaoAtiva(), investimentoPorDia(db, desde, ate), investimentoPorDia(db, antDesde, antAte),
      leadsPagos(db, desde, ate), leadsPagos(db, antDesde, antAte), faturamentoDeAnuncio(db, desde, ate), faturamentoDeAnuncio(db, antDesde, antAte),
      db.selectFrom('anuncioDia').selectAll().where('dia', '>=', desde).where('dia', '<=', ate).execute(),
      db.selectFrom('anuncioDia').select(['impressoes', 'alcance', 'cliquesLink', 'conversas', 'conversasProfundas']).where('dia', '>=', antDesde).where('dia', '<=', antAte).execute(),
      db.selectFrom('anuncio as a').innerJoin('anuncioConjunto as s', 's.id', 'a.conjuntoId').innerJoin('anuncioCampanha as k', 'k.id', 's.campanhaId')
        .select(['a.id', 'a.nome', 'a.titulo', 'a.status', 'a.formato', 'a.miniaturaUrl', 'a.rankingQualidade', 'a.rankingEngajamento', 'a.rankingConversao',
          's.id as conjuntoId', 's.nome as conjunto', 's.status as conjuntoStatus', 's.otimizacao', 's.orcamentoDiario as orcamentoConjunto', 's.faseAprendizado', 's.publico',
          'k.id as campanhaId', 'k.nome as campanha', 'k.status as campanhaStatus', 'k.objetivo', 'k.orcamentoDiario as orcamentoCampanha']).execute(),
      db.selectFrom('anuncioPublicoDia').select(['dimensao', 'chave']).select((eb) => [eb.fn.sum<string>('investimento').as('investimento'), eb.fn.sum<string>('conversas').as('conversas'), eb.fn.sum<string>('cliquesLink').as('cliques')])
        .where('dia', '>=', desde).where('dia', '<=', ate).groupBy(['dimensao', 'chave']).execute(),
      parametroNumero(db, 'orcamento_anuncios_mensal'),
    ]);

    const soma = (l: Array<Record<string, unknown>>, campo: string) => l.reduce((s, x) => s + Number(x[campo] ?? 0), 0);
    const somaNula = (l: Array<Record<string, unknown>>, campo: string) => (l.some((x) => x[campo] !== null && x[campo] !== undefined) ? soma(l, campo) : null);
    const totais = (linhas: Array<Record<string, unknown>>, nLeads: number, receita: number): Totais => ({
      investimento: soma(linhas, 'investimento'), impressoes: soma(linhas, 'impressoes'), alcance: somaNula(linhas, 'alcance'), cliques: soma(linhas, 'cliquesLink'),
      conversas: soma(linhas, 'conversas'), profundas: somaNula(linhas, 'conversasProfundas'), leads: nLeads, receita,
    });
    // O alcance somado por dia superestima o alcance único do período; a Meta não soma alcance. Mostramos o somado e avisamos.
    const t = totais(linhasDia as unknown as Array<Record<string, unknown>>, leads.length, fat.reduce((s, v) => s + Number(v.valor), 0));
    const tAnt = totais(linhasDiaAnt as unknown as Array<Record<string, unknown>>, leadsAnt.length, fatAnt.reduce((s, v) => s + Number(v.valor), 0));
    const atual = indicadoresDe(t, inv.total);
    const anterior = indicadoresDe(tAnt, invAnt.total);
    const indicadores = ORDEM_INDICADORES.map((id) => {
      const ficha = METRICAS.find((m) => m.id === id)!;
      const valor = (atual as Record<string, number | null>)[id];
      const ant = (anterior as Record<string, number | null>)[id];
      const v = variacaoPct(valor, ant);
      return { id, nome: ficha.nome, unidade: ficha.unidade, melhorQuando: ficha.melhorQuando, valor, anterior: ant, variacaoPct: v === null ? null : Math.round(v * 10) / 10 };
    });

    // ---- Resumo: mês corrente, ritmo contra o orçamento, orçamento diário ativo
    const mes = hoje.slice(0, 7);
    const doMes = await investimentoPorDia(db, `${mes}-01`, hoje);
    const diasCorridos = Number(hoje.slice(8));
    const leadsMes = await leadsPagos(db, `${mes}-01`, hoje);
    const projecaoMes = doMes.total === null ? null : centavos((doMes.total / diasCorridos) * diasNoMes(mes));
    const ativo = (s: string | null) => s === 'ACTIVE';
    const conjuntosAtivos = [...new Map(estrutura.filter((e) => ativo(e.conjuntoStatus) && ativo(e.campanhaStatus)).map((e) => [e.conjuntoId, e])).values()];
    const campanhasCbo = [...new Map(estrutura.filter((e) => ativo(e.campanhaStatus) && e.orcamentoCampanha !== null).map((e) => [e.campanhaId, e])).values()];
    const orcamentoDiarioAtivo = estrutura.length
      ? centavos(campanhasCbo.reduce((s, e) => s + Number(e.orcamentoCampanha), 0) + conjuntosAtivos.filter((e) => e.orcamentoCampanha === null).reduce((s, e) => s + Number(e.orcamentoConjunto ?? 0), 0))
      : null;

    // ---- Checagens objetivas para a nota (só as que têm dado e referência)
    type Checagem = { id: string; nome: string; ok: boolean | null; valor: string; referencia: string; porque: string; fazer: string };
    const fmtPct = (v: number | null) => (v === null ? '—' : `${v.toLocaleString('pt-BR')}%`);
    const fmtR = (v: number | null) => (v === null ? '—' : `R$ ${v.toFixed(2).replace('.', ',')}`);
    const contraRef = (id: string, nome: string, valor: number | null, refValor: number | undefined, tipo: 'min' | 'max', fmt: (v: number | null) => string, porque: string, fazer: string): Checagem => ({
      id, nome, valor: fmt(valor), referencia: refValor === undefined ? 'sem referência em Metas' : `${tipo === 'min' ? 'mínimo' : 'máximo'} ${fmt(refValor)}`,
      ok: valor === null || refValor === undefined ? null : tipo === 'min' ? valor >= refValor : valor <= refValor, porque, fazer,
    });
    const anunciosAtivos = [...new Map(estrutura.filter((e) => ativo(e.status)).map((e) => [e.id, e])).values()];
    const leadsSemAnuncio = leads.filter((l) => !l.anuncioId).length;
    const checagens: Checagem[] = [
      contraRef('ctr', 'CTR do link', atual.ctr, ref.ctrMin, 'min', fmtPct, 'Pouca gente clica: o criativo ou a oferta não estão chamando atenção.', 'Teste novos ganchos nos primeiros 3 segundos e troque os criativos com CTR mais baixo.'),
      contraRef('cpc', 'Custo por clique', atual.cpc, ref.cpcMax, 'max', fmtR, 'Cada clique está caro: CPM alto, CTR baixo, ou os dois.', 'Veja primeiro o CTR; se estiver bom, revise o público e o posicionamento.'),
      contraRef('cpm', 'CPM', atual.cpm, ref.cpmMax, 'max', fmtR, 'As impressões estão caras: público pequeno ou muito disputado.', 'Amplie o público (Advantage+) e confira a frequência.'),
      contraRef('frequencia', 'Frequência', atual.frequencia, ref.frequenciaMax, 'max', (v) => (v === null ? '—' : v.toLocaleString('pt-BR')), 'As mesmas pessoas estão vendo o anúncio muitas vezes: cansaço do criativo.', 'Renove os criativos ou amplie o público.'),
      contraRef('connect_rate', 'Connect rate', atual.connect_rate, ref.connectRateMin, 'min', fmtPct, 'Muitas conversas param na mensagem pronta: a pessoa clica, mas não conversa.', 'Revise a mensagem de boas-vindas e a velocidade da primeira resposta.'),
      contraRef('cpl', 'Custo por lead', atual.custo_por_lead, ref.cplMax, 'max', fmtR, 'Cada lead do anúncio está custando mais que a meta.', 'Corte os anúncios do quadrante "Revisar já" e dê verba aos de "Manter e escalar".'),
      {
        id: 'orcamento', nome: 'Ritmo do gasto no mês', valor: fmtR(projecaoMes), referencia: orcamentoMes === null ? 'sem orçamento em Metas' : `orçamento ${fmtR(orcamentoMes)}`,
        ok: projecaoMes === null || orcamentoMes === null ? null : projecaoMes <= orcamentoMes * 1.05,
        porque: 'No ritmo atual, o mês fecha acima do orçamento definido pelos Sócios.', fazer: 'Reduza o orçamento diário ou peça aos Sócios para rever o orçamento do mês.',
      },
      {
        id: 'aprendizado', nome: 'Conjuntos em aprendizado limitado', valor: String(conjuntosAtivos.filter((e) => e.faseAprendizado === 'FAIL').length), referencia: 'o ideal é nenhum',
        ok: conjuntosAtivos.length ? conjuntosAtivos.every((e) => e.faseAprendizado !== 'FAIL') : null,
        porque: 'Conjunto em "aprendizado limitado" não recebe resultados suficientes para a Meta otimizar.', fazer: 'Junte conjuntos parecidos ou aumente o orçamento do conjunto.',
      },
      {
        id: 'qualidade', nome: 'Anúncios com qualidade abaixo da média', valor: String(anunciosAtivos.filter((a) => RANKING_RUIM.test(a.rankingQualidade ?? '')).length), referencia: 'o ideal é nenhum',
        ok: anunciosAtivos.some((a) => a.rankingQualidade && a.rankingQualidade !== 'UNKNOWN') ? anunciosAtivos.every((a) => !RANKING_RUIM.test(a.rankingQualidade ?? '')) : null,
        porque: 'A Meta acha o anúncio pior que os concorrentes: ele paga mais caro para aparecer.', fazer: 'Troque o criativo dos anúncios com qualidade abaixo da média.',
      },
      {
        id: 'origem', nome: 'Leads de anúncio sem o anúncio de origem', valor: leads.length ? `${leadsSemAnuncio} de ${leads.length}` : '—', referencia: 'o ideal é nenhum',
        ok: leads.length ? leadsSemAnuncio === 0 : null,
        porque: 'Sem o anúncio de origem no lead, o custo por anúncio e o ROAS real ficam incompletos.', fazer: 'No cadastro do lead, escolha o anúncio de origem (ou use o link rastreado do site).',
      },
    ];
    const avaliadas = checagens.filter((x) => x.ok !== null);
    const nota = avaliadas.length ? Math.round((avaliadas.filter((x) => x.ok).length / avaliadas.length) * 100) : null;

    // ---- Jornada até o lead
    const etapasJornada = [
      { id: 'IMPRESSOES', nome: 'Impressões', volume: t.impressoes },
      { id: 'CLIQUES', nome: 'Cliques no link', volume: t.cliques },
      { id: 'CONVERSAS', nome: 'Conversas iniciadas', volume: t.conversas },
      { id: 'LEADS', nome: 'Leads no CRM', volume: t.leads },
    ];
    const metasJornada: Record<string, number | undefined> = { CLIQUES: ref.ctrMin, CONVERSAS: ref.taxaConversaMin, LEADS: ref.taxaLeadMin };
    const jornada = etapasJornada.map((e, i) => {
      const antes = i ? etapasJornada[i - 1].volume : null;
      const conversao = antes === null ? null : pct(e.volume, antes);
      const meta = metasJornada[e.id] ?? null;
      return {
        ...e, conversaoPct: conversao, perda: antes === null ? null : Math.max(0, antes - e.volume),
        custo: inv.total !== null && e.volume ? centavos(e.id === 'IMPRESSOES' ? (inv.total / e.volume) * 1000 : inv.total / e.volume) : null,
        custoRotulo: e.id === 'IMPRESSOES' ? 'por mil' : 'cada', meta, ok: meta === null || conversao === null ? null : conversao >= meta,
      };
    });

    // ---- Criativos: entregas, quadrantes e retenção
    const porAnuncio = new Map<string, Record<string, number>>();
    for (const l of linhasDia) {
      const a = porAnuncio.get(l.anuncioId) ?? { investimento: 0, impressoes: 0, cliques: 0, conversas: 0, plays: 0, p25: 0, p50: 0, p75: 0, p100: 0, temVideo: 0 };
      a.investimento += Number(l.investimento); a.impressoes += l.impressoes; a.cliques += l.cliquesLink; a.conversas += l.conversas;
      if (l.videoPlays !== null) { a.temVideo = 1; a.plays += l.videoPlays ?? 0; a.p25 += l.videoP25 ?? 0; a.p50 += l.videoP50 ?? 0; a.p75 += l.videoP75 ?? 0; a.p100 += l.videoP100 ?? 0; }
      porAnuncio.set(l.anuncioId, a);
    }
    const leadsPorAnuncio = (id: string) => leads.filter((l) => l.anuncioId === id).length;
    const comGasto = [...porAnuncio].filter(([, a]) => a.investimento > 0);
    const custoResultado = (a: Record<string, number>) => (a.conversas ? a.investimento / a.conversas : Number.POSITIVE_INFINITY);
    const medInv = mediana(comGasto.map(([, a]) => a.investimento));
    const finitos = comGasto.map(([, a]) => custoResultado(a)).filter(Number.isFinite);
    const medCusto = finitos.length ? mediana(finitos) : null;
    const quadranteDe = (a: Record<string, number>) => {
      if (medInv === null || a.investimento <= 0) return null;
      const barato = medCusto !== null && custoResultado(a) <= medCusto;
      const muito = a.investimento >= medInv;
      return barato ? (muito ? QUADRANTES.ESCALAR : QUADRANTES.VERBA) : (muito ? QUADRANTES.REVISAR : QUADRANTES.PAUSAR);
    };
    const criativos = [...new Map(estrutura.map((e) => [e.id, e])).values()].map((e) => {
      const a = porAnuncio.get(e.id);
      return {
        id: e.id, nome: e.nome, titulo: e.titulo, status: e.status, formato: e.formato, miniatura: e.miniaturaUrl, campanha: e.campanha, conjunto: e.conjunto,
        rankings: { qualidade: e.rankingQualidade, engajamento: e.rankingEngajamento, conversao: e.rankingConversao },
        investimento: a ? centavos(a.investimento) : 0, impressoes: a?.impressoes ?? 0, cliques: a?.cliques ?? 0, conversas: a?.conversas ?? 0, leads: leadsPorAnuncio(e.id),
        ctr: a ? pct(a.cliques, a.impressoes) : null, custoResultado: a && a.conversas ? centavos(a.investimento / a.conversas) : null,
        quadrante: a ? quadranteDe(a) : null,
        retencao: a?.temVideo ? { plays: a.plays, p25: pct(a.p25, a.plays), p50: pct(a.p50, a.plays), p75: pct(a.p75, a.plays), p100: pct(a.p100, a.plays) } : null,
      };
    }).sort((x, y) => y.investimento - x.investimento);

    // ---- Campanhas e conjuntos
    const totalInvMeta = t.investimento;
    const campanhas = [...new Map(estrutura.map((e) => [e.campanhaId, e])).values()].map((k) => {
      const anuncios = criativos.filter((a) => a.campanha === k.campanha);
      const investimento = centavos(anuncios.reduce((s, a) => s + a.investimento, 0));
      const conversas = anuncios.reduce((s, a) => s + a.conversas, 0);
      const leadsCampanha = leads.filter((l) => l.campanhaId === k.campanhaId).length;
      const conjuntos = [...new Map(estrutura.filter((e) => e.campanhaId === k.campanhaId).map((e) => [e.conjuntoId, e])).values()].map((s) => {
        const deles = criativos.filter((a) => a.conjunto === s.conjunto && a.campanha === k.campanha);
        return {
          id: s.conjuntoId, nome: s.conjunto, status: s.conjuntoStatus, otimizacao: s.otimizacao, orcamentoDiario: s.orcamentoConjunto === null ? null : Number(s.orcamentoConjunto),
          faseAprendizado: s.faseAprendizado, publico: s.publico, investimento: centavos(deles.reduce((x, a) => x + a.investimento, 0)), conversas: deles.reduce((x, a) => x + a.conversas, 0),
        };
      });
      return {
        id: k.campanhaId, nome: k.campanha, status: k.campanhaStatus, objetivo: k.objetivo, orcamentoDiario: k.orcamentoCampanha === null ? null : Number(k.orcamentoCampanha),
        investimento, pctInvestimento: pct(investimento, totalInvMeta), conversas, pctResultados: pct(conversas, t.conversas), leads: leadsCampanha,
        cpl: leadsCampanha ? centavos(investimento / leadsCampanha) : null, conjuntos,
      };
    }).sort((a, b) => b.investimento - a.investimento);

    // ---- Públicos: % do investimento × % dos resultados
    const publicosPorDimensao = Object.fromEntries((Object.keys(NOMES_DIMENSAO) as Array<keyof typeof NOMES_DIMENSAO>).map((d) => {
      const linhas = publicos.filter((p) => p.dimensao === d);
      const invTotal = linhas.reduce((s, l) => s + Number(l.investimento), 0);
      const resTotal = linhas.reduce((s, l) => s + Number(l.conversas), 0);
      return [d, {
        nome: NOMES_DIMENSAO[d],
        linhas: linhas.map((l) => ({ chave: l.chave, rotulo: nomeDoRecorte(d, l.chave), investimento: centavos(Number(l.investimento)), conversas: Number(l.conversas), pctInvestimento: pct(Number(l.investimento), invTotal), pctResultados: pct(Number(l.conversas), resTotal) }))
          .sort((a, b) => (d === 'HORARIO' ? a.chave.localeCompare(b.chave) : b.investimento - a.investimento)),
      }];
    }));

    // ---- Dia a dia
    const leadsPorDia = new Map<string, number>();
    for (const l of leads) { const d = new Date(l.criadoEm.getTime() - 3 * 3_600_000).toISOString().slice(0, 10); leadsPorDia.set(d, (leadsPorDia.get(d) ?? 0) + 1); }
    const invPorDia = new Map(inv.valores.map((v) => [v.dia, v.valor]));
    const diaADia = listaDias(desde, ate).map((dia) => {
      const l = linhasDia.filter((x) => x.dia === dia);
      const tt = totais(l as unknown as Array<Record<string, unknown>>, leadsPorDia.get(dia) ?? 0, 0);
      const i = inv.total === null ? null : centavos(invPorDia.get(dia) ?? 0);
      return { dia, investimento: i, impressoes: tt.impressoes, cliques: tt.cliques, conversas: tt.conversas, leads: tt.leads,
        ctr: pct(tt.cliques, tt.impressoes), cpc: i !== null && tt.cliques ? centavos(i / tt.cliques) : null, cpm: i !== null && tt.impressoes ? centavos((i / tt.impressoes) * 1000) : null,
        cpl: i !== null && tt.leads ? centavos(i / tt.leads) : null };
    });

    // ---- Qualidade das conversas
    const qualidade = t.profundas !== null
      ? { fonte: 'META' as const, conversas: t.conversas, passaram: t.profundas, pct: pct(t.profundas, t.conversas), viraramLead: t.leads, pctLead: pct(t.leads, t.conversas) }
      : { fonte: 'CRM' as const, conversas: t.conversas, passaram: null, pct: null, viraramLead: t.leads, pctLead: pct(t.leads, t.conversas) };

    // ---- Onde melhorar (com o porquê e o que fazer) e quanto cada meta batida renderia
    type Achado = { tipo: 'BOM' | 'ATENCAO' | 'CRITICO' | 'INFO'; titulo: string; porque: string; fazer: string };
    const achados: Achado[] = [];
    for (const x of checagens) {
      if (x.ok === false) achados.push({ tipo: 'CRITICO', titulo: `${x.nome}: ${x.valor} (${x.referencia})`, porque: x.porque, fazer: x.fazer });
      if (x.ok === true && ['ctr', 'cpl', 'connect_rate'].includes(x.id)) achados.push({ tipo: 'BOM', titulo: `${x.nome} dentro da meta: ${x.valor}`, porque: `Referência: ${x.referencia}.`, fazer: 'Mantenha o que está funcionando e escale com cuidado.' });
    }
    for (const a of criativos.filter((a) => a.quadrante === QUADRANTES.REVISAR)) {
      achados.push({ tipo: 'ATENCAO', titulo: `"${a.nome}" gasta muito e cada conversa sai cara`, porque: `Investiu R$ ${a.investimento.toFixed(2).replace('.', ',')} com custo por conversa acima da mediana dos anúncios.`, fazer: 'Revise o criativo ou mova a verba para os anúncios de "Manter e escalar".' });
    }
    for (const a of criativos.filter((a) => a.quadrante === QUADRANTES.ESCALAR)) {
      achados.push({ tipo: 'BOM', titulo: `"${a.nome}" entrega barato com bastante verba`, porque: 'Custo por conversa abaixo da mediana, com investimento acima da mediana.', fazer: 'Aumente o orçamento aos poucos (até 20% por vez).' });
    }
    for (const k of campanhas.filter((k) => k.pctInvestimento !== null && k.pctResultados !== null && k.pctInvestimento - k.pctResultados >= 15)) {
      achados.push({ tipo: 'ATENCAO', titulo: `A campanha "${k.nome}" consome mais do que devolve`, porque: `Leva ${fmtPct(k.pctInvestimento)} da verba e traz ${fmtPct(k.pctResultados)} das conversas.`, fazer: 'Redistribua o orçamento para as campanhas que devolvem mais.' });
    }
    for (const d of Object.values(publicosPorDimensao)) {
      for (const l of d.linhas.filter((l) => l.pctInvestimento !== null && l.pctResultados !== null && l.pctInvestimento >= 5 && l.pctInvestimento - l.pctResultados >= 10)) {
        achados.push({ tipo: 'ATENCAO', titulo: `${d.nome}: "${l.rotulo}" consome mais do que devolve`, porque: `${fmtPct(l.pctInvestimento)} do investimento para ${fmtPct(l.pctResultados)} das conversas.`, fazer: 'Considere excluir ou reduzir esse recorte no conjunto.' });
      }
    }
    const usaManual = Object.values(inv.fonte).includes('MANUAL');
    if (!c && (inv.total === null || usaManual)) achados.push({ tipo: 'INFO', titulo: inv.total === null ? 'Sem dados de anúncio no período' : 'Usando o gasto digitado pelos Sócios', porque: 'A conta de anúncios da Meta não está conectada.', fazer: 'Conecte a conta para ver públicos, criativos, campanhas e o funil completo.' });
    if (c && t.conversas && t.profundas === null) achados.push({ tipo: 'INFO', titulo: 'A Meta não informou a profundidade das conversas', porque: 'É o caso comum do WhatsApp.', fazer: 'A qualidade das conversas usa quantas viraram lead no CRM.' });
    const ordemTipo = { CRITICO: 0, ATENCAO: 1, BOM: 2, INFO: 3 };
    achados.sort((a, b) => ordemTipo[a.tipo] - ordemTipo[b.tipo]);

    const simulacoes: Array<{ meta: string; atual: string; alvo: string; leadsAMais: number; cplNovo: number | null }> = [];
    const taxaConversa = t.cliques ? t.conversas / t.cliques : null;
    const taxaLead = t.conversas ? t.leads / t.conversas : null;
    const simular = (meta: string, atual: number | null, alvo: number | undefined, novoLeads: (alvoFracao: number) => number) => {
      if (atual === null || alvo === undefined || atual >= alvo || inv.total === null) return;
      const leadsNovos = Math.round(novoLeads(alvo / 100));
      simulacoes.push({ meta, atual: fmtPct(atual), alvo: fmtPct(alvo), leadsAMais: Math.max(0, leadsNovos - t.leads), cplNovo: leadsNovos ? centavos(inv.total / leadsNovos) : null });
    };
    simular('CTR do link', atual.ctr, ref.ctrMin, (f) => t.impressoes * f * (taxaConversa ?? 0) * (taxaLead ?? 0));
    simular('Cliques que viram conversa', pct(t.conversas, t.cliques), ref.taxaConversaMin, (f) => t.cliques * f * (taxaLead ?? 0));
    simular('Conversas que viram lead', pct(t.leads, t.conversas), ref.taxaLeadMin, (f) => t.conversas * f);

    const prioridades = achados.filter((a) => a.tipo === 'CRITICO' || a.tipo === 'ATENCAO').slice(0, 3);
    res.json({
      periodo: { desde, ate, dias: tamanho }, anterior: { desde: antDesde, ate: antAte },
      fonte: inv.fonte, conectada: Boolean(c), sincronizadaEm: c?.sincronizadaEm ?? null,
      referencias: ref,
      resumo: {
        nota, checagens, prioridades, investidoMes: doMes.total, projecaoMes, orcamentoMes, ritmoPct: projecaoMes !== null && orcamentoMes ? pct(projecaoMes, orcamentoMes) : null,
        orcamentoDiarioAtivo, cplMes: doMes.total !== null && leadsMes.length ? centavos(doMes.total / leadsMes.length) : null,
      },
      jornada, connectRate: atual.connect_rate, indicadores, ondeMelhorar: achados, simulacoes,
      publicos: publicosPorDimensao, criativos, limiares: { investimento: medInv, custoResultado: medCusto }, campanhas, diaADia, qualidade,
      avisoAlcance: 'O alcance do período é a soma dos dias; a mesma pessoa pode contar mais de uma vez.',
    });
  }));
}

/** Nome legível de um recorte de público (a chave vem da Meta: "25-34|female", "instagram|story", "mobile_app"). */
export function nomeDoRecorte(dimensao: string, chave: string): string {
  if (dimensao === 'IDADE_GENERO') { const [idade, g] = chave.split('|'); return `${idade} · ${g === 'female' ? 'mulheres' : g === 'male' ? 'homens' : 'não informado'}`; }
  if (dimensao === 'POSICIONAMENTO') {
    const [p, pos = ''] = chave.split('|');
    const lugar: Record<string, string> = { feed: 'feed', story: 'stories', instagram_stories: 'stories', reels: 'reels', instagram_reels: 'reels', explore: 'explorar', facebook_reels: 'reels', marketplace: 'marketplace', right_hand_column: 'coluna direita', video_feeds: 'vídeos' };
    return `${p === 'instagram' ? 'Instagram' : p === 'facebook' ? 'Facebook' : p === 'messenger' ? 'Messenger' : p === 'audience_network' ? 'Audience Network' : p} · ${lugar[pos] ?? pos.replace(/_/g, ' ')}`;
  }
  if (dimensao === 'DISPOSITIVO') return ({ mobile_app: 'Celular (app)', mobile_web: 'Celular (navegador)', desktop: 'Computador' } as Record<string, string>)[chave] ?? chave;
  if (dimensao === 'HORARIO') return `${chave}h`;
  return chave;
}
