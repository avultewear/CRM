import type { Express } from 'express';
import { z } from 'zod';
import { calcularFunil, ETAPAS } from './atendimento.js';
import type { Banco } from './banco.js';
import { intervaloAnterior, mediana, projecaoFechamento, variacaoPct } from './calculo.js';
import { lerLimites, resumoDeCompras, segmentar } from './clientes.js';
import { hojeEmBrasilia, parametroNumero } from './ganhos.js';
import { ErroHttp, type Ferramentas, type Usuario } from './http.js';
import { METRICAS } from './metricas.js';
import { pode } from './papeis.js';
import { validarDailyConfig, validarMetasPorEtapa } from './parametros.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DIA = 86_400_000;
const centavos = (v: number) => Math.round(v * 100) / 100;
const pct = (parte: number, todo: number) => (todo ? Math.round((parte / todo) * 1000) / 10 : null);

// ---- Datas no horário de Brasília (sem horário de verão desde 2019)
const meiaNoite = (dia: string) => new Date(`${dia}T00:00:00-03:00`);
const diaDe = (d: Date) => new Date(d.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);
const somarDias = (dia: string, n: number) => diaDe(new Date(meiaNoite(dia).getTime() + n * DIA + 12 * 3_600_000));
const diasNoMes = (mes: string) => { const [a, m] = mes.split('-').map(Number); return new Date(Date.UTC(a, m, 0)).getUTCDate(); };
const mesSeguinte = (mes: string) => { const [a, m] = mes.split('-').map(Number); return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`; };

export interface Periodo { inicio: Date; fim: Date; anterior: { inicio: Date; fim: Date }; emAndamento: boolean; diasCorridos: number; diasDoMes: number; mes: string }

/** Mês escolhido: em andamento vai até hoje e compara com os mesmos dias do mês anterior (regra 2). */
export function periodoDoMes(mes: string, agora = new Date()): Periodo {
  const hoje = diaDe(agora);
  const emAndamento = hoje.startsWith(mes);
  const primeiro = `${mes}-01`;
  const ultimo = emAndamento ? hoje : `${mes}-${String(diasNoMes(mes)).padStart(2, '0')}`;
  const ant = intervaloAnterior(primeiro, ultimo);
  return {
    mes, emAndamento, inicio: meiaNoite(primeiro), fim: meiaNoite(somarDias(ultimo, 1)),
    anterior: { inicio: meiaNoite(ant.inicio), fim: meiaNoite(somarDias(ant.fim, 1)) },
    diasCorridos: Number(ultimo.slice(8)), diasDoMes: diasNoMes(mes),
  };
}

const BLOCOS_PADRAO = [
  { id: 'RESULTADO', nome: 'Resultado', minutos: 3 },
  { id: 'ATENDIMENTO', nome: 'Atendimento', minutos: 5 },
  { id: 'VENDEDORES', nome: 'Vendedores', minutos: 7 },
  { id: 'TRAFEGO', nome: 'Tráfego', minutos: 5 },
  { id: 'SOCIAL', nome: 'Social media', minutos: 4 },
  { id: 'CLIENTES', nome: 'Clientes e recuperação', minutos: 3 },
  { id: 'GESTAO', nome: 'Gestão', minutos: 3 },
] as const;
type IdBloco = (typeof BLOCOS_PADRAO)[number]['id'];
const ID_BLOCOS = BLOCOS_PADRAO.map((b) => b.id) as [IdBloco, ...IdBloco[]];

export const CATEGORIAS_CUSTO = [
  { id: 'PRODUCAO', nome: 'Produção e peças' }, { id: 'EMBALAGEM', nome: 'Embalagem' }, { id: 'FRETE', nome: 'Frete' },
  { id: 'MARKETING', nome: 'Marketing (fora os anúncios)' }, { id: 'FERRAMENTAS', nome: 'Sistemas e ferramentas' },
  { id: 'PESSOAL', nome: 'Pessoal' }, { id: 'IMPOSTOS', nome: 'Impostos e taxas' }, { id: 'OUTROS', nome: 'Outros' },
] as const;

/** Indicadores que dependem de etapas que ainda não existem: aparecem com "—" e o aviso. */
const PENDENTES: Record<string, string> = {
  gasto_anuncios: 'entra com o Tráfego (etapa 7)', roas: 'entra com o Tráfego (etapa 7)', custo_por_lead: 'entra com o Tráfego (etapa 7)',
  custo_por_lead_qualificado: 'entra com o Tráfego (etapa 7)', cac: 'entra com o Tráfego (etapa 7)',
};
const ORDEM_INDICADORES = ['receita', 'pro_labore', 'lucro', 'comissao_mes', 'ticket_medio', 'comissoes_pagas', 'gasto_anuncios', 'roas', 'custo_por_lead',
  'custo_por_lead_qualificado', 'conversao_lead_venda', 'conversao_qualificado_venda', 'taxa_recompra', 'ltv', 'cac', 'taxa_troca'];
/** Somas de dinheiro projetam o fechamento; taxas e médias não. */
const PROJETA = new Set(['receita', 'pro_labore', 'lucro', 'comissao_mes', 'comissoes_pagas']);

export function registrarPainel(app: Express, { db, rota, autenticar, exigir, auditar }: Ferramentas): void {
  const painel = [autenticar, exigir('painel.ver')] as const;
  const socio = (u: Usuario) => pode(u.papel, 'cifras.ver');
  const veMetrica = (u: Usuario, id: string) => METRICAS.find((m) => m.id === id)?.quemVe.includes(u.papel) ?? false;

  const vendasValidas = (inicio: Date, fim: Date, vendedorId?: string) => {
    let q = db.selectFrom('vendaDireta as v').innerJoin('oportunidade as o', 'o.id', 'v.oportunidadeId')
      .select(['v.id', 'v.valor', 'v.clienteId', 'v.vendedorId', 'v.decididaEm', 'v.itens', 'v.cupomId', 'o.origem'])
      .where('v.situacao', '=', 'CONFIRMADA').where('v.devolvidaEm', 'is', null).where('v.decididaEm', '>=', inicio).where('v.decididaEm', '<', fim);
    if (vendedorId) q = q.where('v.vendedorId', '=', vendedorId);
    return q.execute();
  };
  const ganhosEntre = async (campo: 'criadoEm' | 'pagaEm', inicio: Date, fim: Date, vendedorId?: string) => {
    let q = db.selectFrom('ganho as g').innerJoin('vendaDireta as v', 'v.id', 'g.vendaDiretaId')
      .select(['g.tipo', 'g.valor', 'g.situacao', 'g.criadoEm', 'g.pagaEm']).where('g.situacao', '!=', 'CANCELADA')
      .where(`g.${campo}`, '>=', inicio).where(`g.${campo}`, '<', fim);
    if (campo === 'pagaEm') q = q.where('g.situacao', '=', 'PAGA');
    if (vendedorId) q = q.where('v.vendedorId', '=', vendedorId);
    return (await q.execute()).map((g) => ({ ...g, valor: Number(g.valor) }));
  };
  const custosDoMes = async (mes: string) => {
    const r = await db.selectFrom('custoMes').select((eb) => eb.fn.sum<string>('valor').as('total')).where('competencia', '=', mes).where('anuladoEm', 'is', null).executeTakeFirst();
    return centavos(Number(r?.total ?? 0));
  };

  /** Conversões a partir do histórico: das oportunidades que entraram na etapa de partida no período, quantas chegaram a Venda. */
  async function conversao(inicio: Date, fim: Date, partida: 'LEAD' | 'LEVANTAMENTO', vendedorId?: string) {
    let q = db.selectFrom('historicoEtapa as h').innerJoin('oportunidade as o', 'o.id', 'h.oportunidadeId').select('h.oportunidadeId')
      .where('h.etapaNova', '=', partida).where('h.entrouEm', '>=', inicio).where('h.entrouEm', '<', fim)
      .where('o.situacao', '!=', 'DESCARTADA').where((eb) => eb.or([eb('o.destinoPerda', 'is', null), eb('o.destinoPerda', '!=', 'NAO_CONTA')]));
    if (vendedorId) q = q.where('o.vendedorId', '=', vendedorId);
    const ids = [...new Set((await q.execute()).map((l) => l.oportunidadeId))];
    if (!ids.length) return null;
    const venderam = await db.selectFrom('historicoEtapa').select('oportunidadeId').distinct().where('etapaNova', '=', 'VENDA').where('oportunidadeId', 'in', ids).execute();
    return pct(venderam.length, ids.length);
  }

  async function taxaTroca(inicio: Date, fim: Date) {
    const [vendas, trocas] = await Promise.all([
      db.selectFrom('vendaDireta').select('itens').where('situacao', '=', 'CONFIRMADA').where('decididaEm', '>=', inicio).where('decididaEm', '<', fim).execute(),
      db.selectFrom('troca as t').innerJoin('vendaDireta as v', 'v.id', 't.vendaDiretaId').select('t.quantidade').where('v.decididaEm', '>=', inicio).where('v.decididaEm', '<', fim).execute(),
    ]);
    const vendidas = vendas.reduce((s, v) => s + (v.itens as Array<{ quantidade: number }>).reduce((q, i) => q + i.quantidade, 0), 0);
    return vendidas ? pct(trocas.reduce((s, t) => s + t.quantidade, 0), vendidas) : null;
  }

  async function numeros(inicio: Date, fim: Date, mes: string, vendedorId?: string) {
    const [vendas, gerados, pagos, custos, convLead, convQualif, troca] = await Promise.all([
      vendasValidas(inicio, fim, vendedorId), ganhosEntre('criadoEm', inicio, fim, vendedorId), ganhosEntre('pagaEm', inicio, fim, vendedorId),
      custosDoMes(mes), conversao(inicio, fim, 'LEAD', vendedorId), conversao(inicio, fim, 'LEVANTAMENTO', vendedorId), taxaTroca(inicio, fim),
    ]);
    const receita = centavos(vendas.reduce((s, v) => s + Number(v.valor), 0));
    const soma = (l: Array<{ valor: number }>) => centavos(l.reduce((s, g) => s + g.valor, 0));
    const comissoes = soma(gerados.filter((g) => g.tipo !== 'PRO_LABORE'));
    return {
      receita: vendas.length ? receita : null,
      vendas: vendas.length,
      ticket_medio: vendas.length ? centavos(receita / vendas.length) : null,
      pro_labore: soma(gerados.filter((g) => g.tipo === 'PRO_LABORE')),
      comissao_mes: comissoes,
      comissoes_pagas: soma(pagos.filter((g) => g.tipo !== 'PRO_LABORE')),
      // Lucro sem o custo das peças por venda (etapa 2) e sem os anúncios (etapa 7): lance a produção como custo do mês.
      lucro: vendas.length || custos ? centavos(receita - comissoes - custos) : null,
      custos,
      conversao_lead_venda: convLead,
      conversao_qualificado_venda: convQualif,
      taxa_troca: troca,
    };
  }

  const lerMes = (texto: unknown) => {
    const mes = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional().parse(texto) ?? hojeEmBrasilia().slice(0, 7);
    if (mes > hojeEmBrasilia().slice(0, 7)) throw new ErroHttp(400, 'Escolha um mês que já começou.');
    return mes;
  };
  const lerVendedor = (texto: unknown) => z.string().regex(UUID).optional().parse(texto || undefined);

  // ---- Sub-aba Painel: os cartões de indicador
  app.get('/painel/indicadores', ...painel, rota(async (req, res) => {
    const mes = lerMes(req.query.mes);
    const vendedorId = lerVendedor(req.query.vendedorId);
    const p = periodoDoMes(mes);
    const mesAnterior = diaDe(p.anterior.inicio).slice(0, 7);
    const [atual, anterior, compras] = await Promise.all([
      numeros(p.inicio, p.fim, mes, vendedorId), numeros(p.anterior.inicio, p.anterior.fim, mesAnterior, vendedorId), resumoDeCompras(db),
    ]);
    const recorrentes = compras.filter((c) => c.compras >= 2).length;
    const valorDe = (id: string, n: typeof atual): number | null => (id in n ? (n as Record<string, number | null>)[id] : null);
    const indicadores = ORDEM_INDICADORES.filter((id) => veMetrica(req.usuario, id)).map((id) => {
      const ficha = METRICAS.find((m) => m.id === id)!;
      if (PENDENTES[id]) return { id, nome: ficha.nome, unidade: ficha.unidade, melhorQuando: ficha.melhorQuando, valor: null, anterior: null, variacaoPct: null, projecao: null, pendente: PENDENTES[id] };
      // Recompra e LTV olham a base inteira de clientes, não o mês: não têm comparação.
      if (id === 'taxa_recompra' || id === 'ltv') {
        const valor = !compras.length ? null : id === 'taxa_recompra' ? pct(recorrentes, compras.length)
          : centavos(compras.reduce((s, c) => s + c.total, 0) / compras.length);
        return { id, nome: ficha.nome, unidade: ficha.unidade, melhorQuando: ficha.melhorQuando, valor, anterior: null, variacaoPct: null, projecao: null, janela: 'desde a primeira venda' };
      }
      const valor = valorDe(id, atual);
      const ant = valorDe(id, anterior);
      return {
        id, nome: ficha.nome, unidade: ficha.unidade, melhorQuando: ficha.melhorQuando, valor, anterior: ant,
        variacaoPct: variacaoPct(valor, ant) === null ? null : Math.round(variacaoPct(valor, ant)! * 10) / 10,
        projecao: p.emAndamento && PROJETA.has(id) && valor !== null ? centavos(projecaoFechamento(valor, p.diasCorridos, p.diasDoMes)!) : null,
        ...(id === 'lucro' ? { observacao: 'Sem o custo das peças por venda (entra com o estoque, etapa 2) e sem os anúncios (etapa 7).' } : {}),
      };
    });
    res.json({ mes, emAndamento: p.emAndamento, comparadoCom: { inicio: diaDe(p.anterior.inicio), fim: somarDias(diaDe(p.anterior.fim), -1) }, indicadores });
  }));

  // ---- Séries do ano: receita, pró-labore, comissões, clientes novos × recorrentes, visão anual
  app.get('/painel/series', ...painel, rota(async (req, res) => {
    const ano = z.coerce.number().int().min(2020).max(2100).optional().parse(req.query.ano) ?? Number(hojeEmBrasilia().slice(0, 4));
    const vendedorId = lerVendedor(req.query.vendedorId);
    const inicio = meiaNoite(`${ano}-01-01`);
    const fim = meiaNoite(`${ano + 1}-01-01`);
    const cifras = socio(req.usuario);
    let qGanhos = db.selectFrom('ganho as g').innerJoin('vendaDireta as v', 'v.id', 'g.vendaDiretaId')
      .select(['g.tipo', 'g.valor', 'g.situacao', 'g.criadoEm', 'g.pagaEm']).where('g.situacao', '!=', 'CANCELADA')
      .where((eb) => eb.or([eb.and([eb('g.criadoEm', '>=', inicio), eb('g.criadoEm', '<', fim)]), eb.and([eb('g.pagaEm', '>=', inicio), eb('g.pagaEm', '<', fim)])]));
    if (vendedorId) qGanhos = qGanhos.where('v.vendedorId', '=', vendedorId);
    const [vendas, ganhos, todasAntes, metaAnual] = await Promise.all([
      vendasValidas(inicio, fim, vendedorId), qGanhos.execute(),
      // Primeira compra de cada cliente, para separar novos de recorrentes.
      db.selectFrom('vendaDireta').select(['clienteId']).select((eb) => eb.fn.min('decididaEm').as('primeira'))
        .where('situacao', '=', 'CONFIRMADA').where('devolvidaEm', 'is', null).groupBy('clienteId').execute(),
      parametroNumero(db, 'meta_faturamento_anual'),
    ]);
    const primeira = new Map(todasAntes.map((t) => [t.clienteId, diaDe(t.primeira as Date).slice(0, 7)]));
    const meses = Array.from({ length: 12 }, (_, i) => `${ano}-${String(i + 1).padStart(2, '0')}`);
    const mesAtual = hojeEmBrasilia().slice(0, 7);
    const series = meses.map((mes) => {
      const doMes = vendas.filter((v) => diaDe(v.decididaEm!).startsWith(mes));
      const receita = centavos(doMes.reduce((s, v) => s + Number(v.valor), 0));
      const gerados = ganhos.filter((g) => diaDe(g.criadoEm).startsWith(mes));
      const pagos = ganhos.filter((g) => g.situacao === 'PAGA' && g.pagaEm && diaDe(g.pagaEm).startsWith(mes));
      const soma = (l: typeof ganhos) => centavos(l.reduce((s, g) => s + Number(g.valor), 0));
      const clientes = [...new Set(doMes.map((v) => v.clienteId))];
      const futuro = mes > mesAtual;
      return {
        mes, futuro, receita: futuro ? null : receita, vendas: futuro ? null : doMes.length, ticket: doMes.length ? centavos(receita / doMes.length) : null,
        clientesNovos: futuro ? null : clientes.filter((c) => primeira.get(c) === mes).length,
        clientesRecorrentes: futuro ? null : clientes.filter((c) => primeira.get(c) !== mes).length,
        ...(cifras ? {
          proLabore: futuro ? null : soma(gerados.filter((g) => g.tipo === 'PRO_LABORE')),
          proLaboreMedioPorVenda: doMes.length ? centavos(soma(gerados.filter((g) => g.tipo === 'PRO_LABORE')) / doMes.length) : null,
          comissoesGeradas: futuro ? null : soma(gerados.filter((g) => g.tipo !== 'PRO_LABORE')),
          comissoesPagasVendedores: futuro ? null : soma(pagos.filter((g) => g.tipo === 'COMISSAO_VENDEDOR')),
          comissoesPagasInfluenciadores: futuro ? null : soma(pagos.filter((g) => g.tipo === 'COMISSAO_INFLUENCIADOR')),
        } : {}),
      };
    });
    const acumulado = centavos(series.reduce((s, m) => s + (m.receita ?? 0), 0));
    res.json({
      ano, series,
      anual: { acumulado, meta: metaAnual, faltam: metaAnual === null ? null : centavos(Math.max(0, metaAnual - acumulado)), progressoPct: metaAnual ? pct(acumulado, metaAnual) : null },
    });
  }));

  // ---- Ranking de vendedores no mês
  app.get('/painel/ranking', ...painel, rota(async (req, res) => {
    const mes = lerMes(req.query.mes);
    const p = periodoDoMes(mes);
    const [vendas, pessoas] = await Promise.all([
      vendasValidas(p.inicio, p.fim),
      db.selectFrom('usuario').select(['id', 'nome']).where('vende', '=', true).execute(),
    ]);
    const comissaoPorVendedor = new Map<string, number>();
    if (socio(req.usuario)) {
      const linhas = await db.selectFrom('ganho').select(['usuarioId', 'valor']).where('tipo', '=', 'COMISSAO_VENDEDOR').where('situacao', '!=', 'CANCELADA')
        .where('criadoEm', '>=', p.inicio).where('criadoEm', '<', p.fim).execute();
      for (const l of linhas) if (l.usuarioId) comissaoPorVendedor.set(l.usuarioId, (comissaoPorVendedor.get(l.usuarioId) ?? 0) + Number(l.valor));
    }
    const ranking = pessoas.map((u) => {
      const dele = vendas.filter((v) => v.vendedorId === u.id);
      return { vendedorId: u.id, nome: u.nome, vendas: dele.length, receita: centavos(dele.reduce((s, v) => s + Number(v.valor), 0)),
        ...(socio(req.usuario) ? { comissao: centavos(comissaoPorVendedor.get(u.id) ?? 0) } : {}) };
    }).filter((r) => r.vendas > 0).sort((a, b) => b.receita - a.receita);
    // Ranking de influenciadores por vendas com cupom (Painel detalhado).
    const cupons = await db.selectFrom('cupom as c').innerJoin('influenciador as i', 'i.id', 'c.influenciadorId').select(['c.id', 'i.id as influenciadorId', 'i.nome']).execute();
    const porInfluenciador = new Map<string, { nome: string; vendas: number; receita: number }>();
    for (const v of vendas) {
      const c = cupons.find((k) => k.id === v.cupomId);
      if (!c) continue;
      const atual = porInfluenciador.get(c.influenciadorId) ?? { nome: c.nome, vendas: 0, receita: 0 };
      atual.vendas += 1; atual.receita = centavos(atual.receita + Number(v.valor));
      porInfluenciador.set(c.influenciadorId, atual);
    }
    // Faturamento por origem do atendimento.
    const porOrigem = new Map<string, number>();
    for (const v of vendas) porOrigem.set(v.origem, centavos((porOrigem.get(v.origem) ?? 0) + Number(v.valor)));
    res.json({
      mes, vendedores: ranking,
      influenciadores: [...porInfluenciador.values()].sort((a, b) => b.receita - a.receita),
      porOrigem: [...porOrigem].map(([origem, receita]) => ({ origem, receita })).sort((a, b) => b.receita - a.receita),
    });
  }));

  // ---- Jornada de atendimento: o funil com R$ por etapa (Sócios), metas, tempos e gargalo
  app.get('/painel/jornada', ...painel, rota(async (req, res) => {
    const filtro = z.object({ inicio: z.coerce.date(), fim: z.coerce.date(), vendedorId: z.string().regex(UUID).optional(), canal: z.enum(['WHATSAPP', 'INSTAGRAM', 'SITE', 'MANUAL']).optional() })
      .parse({ ...req.query, vendedorId: req.query.vendedorId || undefined, canal: req.query.canal || undefined });
    const [funil, metasBrutas, tempoMaximo, prolaborePct, comissaoPct, abertas, perdidas] = await Promise.all([
      calcularFunil(db, filtro.inicio, filtro.fim, filtro.vendedorId, filtro.canal),
      db.selectFrom('parametro').select('valor').where('chave', '=', 'metas_por_etapa').executeTakeFirst(),
      parametroNumero(db, 'tempo_maximo_etapa_horas'), parametroNumero(db, 'prolabore_pct'), parametroNumero(db, 'comissao_vendedor_pct'),
      (() => {
        let q = db.selectFrom('oportunidade').select(['etapa', 'valor']).where('situacao', '=', 'ABERTA');
        if (filtro.vendedorId) q = q.where('vendedorId', '=', filtro.vendedorId);
        if (filtro.canal) q = q.where('canal', '=', filtro.canal);
        return q.execute();
      })(),
      (() => {
        let q = db.selectFrom('oportunidade').select(['etapaDaPerda', 'valor']).where('perdidaEm', '>=', filtro.inicio).where('perdidaEm', '<', filtro.fim)
          .where('destinoPerda', '!=', 'NAO_CONTA');
        if (filtro.vendedorId) q = q.where('vendedorId', '=', filtro.vendedorId);
        if (filtro.canal) q = q.where('canal', '=', filtro.canal);
        return q.execute();
      })(),
    ]);
    const metas = metasBrutas ? (validarMetasPorEtapa(metasBrutas.valor).data ?? {}) : {};
    const cifras = socio(req.usuario);
    const etapas = funil.map((e) => {
      const meta = (metas as Record<string, number>)[e.etapa] ?? null;
      const foraDoTempo = tempoMaximo !== null && e.tempoMedianoHoras !== null && e.tempoMedianoHoras > tempoMaximo;
      // Verde: bate a meta; âmbar: a 80% da meta ou acima do tempo máximo; vermelho: abaixo de 80% da meta. Sem meta e no tempo: neutro.
      let situacao: 'bom' | 'atencao' | 'critico' | 'neutro' = 'neutro';
      if (meta !== null && e.conversaoPct !== null) situacao = e.conversaoPct >= meta ? 'bom' : e.conversaoPct >= meta * 0.8 ? 'atencao' : 'critico';
      if (foraDoTempo && situacao !== 'critico') situacao = 'atencao';
      const valorAberto = centavos(abertas.filter((o) => o.etapa === e.etapa).reduce((s, o) => s + Number(o.valor ?? 0), 0));
      const valorPerdido = centavos(perdidas.filter((o) => o.etapaDaPerda === e.etapa).reduce((s, o) => s + Number(o.valor ?? 0), 0));
      return {
        ...e, abertas: abertas.filter((o) => o.etapa === e.etapa).length, meta, metaOk: meta === null || e.conversaoPct === null ? null : e.conversaoPct >= meta,
        foraDoTempo, situacao, distanciaDaMeta: meta !== null && e.conversaoPct !== null ? meta - e.conversaoPct : null,
        perdaPct: e.entraram ? pct(e.perdas.total, e.entraram) : null,
        custo: null as number | null,
        ...(cifras ? { reais: {
          oportunidade: valorAberto,
          proLaborePrevisto: prolaborePct === null ? null : centavos((valorAberto * prolaborePct) / 100),
          comissaoPrevista: comissaoPct === null ? null : centavos((valorAberto * comissaoPct) / 100),
          comissaoPerdida: comissaoPct === null ? null : centavos((valorPerdido * comissaoPct) / 100),
        } } : {}),
      };
    });
    const candidatos = etapas.filter((e) => e.distanciaDaMeta !== null && e.distanciaDaMeta > 0);
    const gargalo = candidatos.sort((a, b) => b.distanciaDaMeta! - a.distanciaDaMeta!)[0]?.etapa ?? null;
    const fases = ['Pré-venda', 'Venda', 'Fechamento', 'Recuperação'].map((fase) => ({
      fase, entraram: etapas.filter((e) => e.fase === fase).reduce((s, e) => s + e.entraram, 0),
      ...(cifras ? { oportunidade: centavos(etapas.filter((e) => e.fase === fase).reduce((s, e) => s + (e.reais?.oportunidade ?? 0), 0)) } : {}),
    }));
    res.json({
      inicio: filtro.inicio, fim: filtro.fim, etapas, fases, gargalo, tempoMaximoHoras: tempoMaximo, metasDefinidas: Object.keys(metas).length > 0,
      exclusoes: 'Pedidos feitos direto no site, sem atendimento, ficam fora deste funil. Eles entram no funil do site (carrinho → pedido → pago) com a loja (etapa 2).',
    });
  }));

  // ---- Sub-aba Hoje
  app.get('/painel/hoje', ...painel, rota(async (req, res) => {
    const cifras = socio(req.usuario);
    const p = periodoDoMes(hojeEmBrasilia().slice(0, 7));
    const agora = new Date();
    const [frase, meta, vendas, proLabore, aConfirmar, comissoes, trocas, abertas, compras, limites, cuponsMes, custos] = await Promise.all([
      db.selectFrom('parametro').select('valor').where('chave', '=', 'frase_motivacional').executeTakeFirst(),
      parametroNumero(db, 'meta_faturamento_mensal'),
      vendasValidas(p.inicio, p.fim),
      ganhosEntre('criadoEm', p.inicio, p.fim),
      db.selectFrom('vendaDireta as v').innerJoin('cliente as c', 'c.id', 'v.clienteId').select(['v.id', 'v.valor', 'c.nome', 'v.criadoEm']).where('v.situacao', '=', 'AGUARDANDO').orderBy('v.criadoEm').execute(),
      db.selectFrom('ganho').select(['id', 'situacao', 'valor', 'liberarEm']).where('tipo', '!=', 'PRO_LABORE').where('situacao', 'in', ['AGUARDANDO', 'LIBERADA']).execute(),
      db.selectFrom('troca as t').innerJoin('cliente as c', 'c.id', 't.clienteId').select(['t.id', 't.situacao', 't.item', 'c.nome']).where('t.situacao', '!=', 'RESOLVIDA').orderBy('t.criadoEm').execute(),
      db.selectFrom('oportunidade').select(['etapa', 'primeiraRespostaEm']).where('situacao', '=', 'ABERTA').execute(),
      resumoDeCompras(db), lerLimites(db),
      db.selectFrom('vendaDireta').select((eb) => eb.fn.countAll<string>().as('n')).where('situacao', '=', 'CONFIRMADA').where('cupomId', 'is not', null)
        .where('decididaEm', '>=', p.inicio).where('decididaEm', '<', p.fim).executeTakeFirstOrThrow(),
      custosDoMes(p.mes),
    ]);
    const receita = centavos(vendas.reduce((s, v) => s + Number(v.valor), 0));
    const previsao = vendas.length ? centavos(projecaoFechamento(receita, p.diasCorridos, p.diasDoMes)!) : null;
    const somaPL = centavos(proLabore.filter((g) => g.tipo === 'PRO_LABORE').reduce((s, g) => s + g.valor, 0));
    const aLiberar = comissoes.filter((g) => g.situacao === 'AGUARDANDO' && (g.liberarEm === null || g.liberarEm <= agora));
    const aPagar = comissoes.filter((g) => g.situacao === 'LIBERADA');

    // Fila de decisões, na ordem do prompt. Cada papel vê o que pode decidir.
    const fila: Array<{ tipo: string; titulo: string; detalhe: string; acao: string; rota: string; id?: string }> = [];
    if (cifras) {
      for (const v of aConfirmar) fila.push({ tipo: 'VENDA_DIRETA', id: v.id, titulo: `Confirmar a venda direta de ${v.nome}`, detalhe: `R$ ${Number(v.valor).toFixed(2).replace('.', ',')}`, acao: 'Confirmar', rota: '/financeiro' });
      if (aLiberar.length) fila.push({ tipo: 'COMISSOES_LIBERAR', titulo: `${aLiberar.length} ${aLiberar.length === 1 ? 'comissão pode ser liberada' : 'comissões podem ser liberadas'}`, detalhe: 'O prazo de troca já passou ou não foi definido.', acao: 'Abrir', rota: '/financeiro' });
      if (aPagar.length) fila.push({ tipo: 'COMISSOES_PAGAR', titulo: `${aPagar.length} ${aPagar.length === 1 ? 'comissão a pagar' : 'comissões a pagar'}`, detalhe: `Total R$ ${centavos(aPagar.reduce((s, g) => s + Number(g.valor), 0)).toFixed(2).replace('.', ',')}`, acao: 'Pagar', rota: '/financeiro' });
    }
    for (const t of trocas) fila.push({ tipo: 'TROCA', id: t.id, titulo: `${t.situacao === 'SOLICITADA' ? 'Receber a peça' : 'Resolver a troca'} de ${t.nome}`, detalhe: t.item, acao: 'Abrir', rota: '/clientes' });

    const comercial = {
      leadsAbertos: abertas.filter((o) => o.etapa !== 'VENDA').length,
      semResposta: abertas.filter((o) => o.etapa === 'LEAD' && !o.primeiraRespostaEm).length,
      vendasDoMes: vendas.length,
    };
    const segmentos = segmentar(compras, limites, agora);
    res.json({
      frase: typeof frase?.valor === 'string' ? frase.valor : null,
      agora: {
        previsao_fechamento: { valor: previsao, meta, faltaParaMeta: meta === null ? null : centavos(Math.max(0, meta - receita)), receitaAteHoje: vendas.length ? receita : null },
        ...(cifras ? { pro_labore: somaPL } : {}),
        decisoes: fila.length,
      },
      fila,
      areas: {
        comercial,
        clientes: {
          ativos: compras.filter((c) => segmentos.get(c.clienteId) !== 'INATIVO').length,
          taxaRecompra: compras.length ? pct(compras.filter((c) => c.compras >= 2).length, compras.length) : null,
          emRisco: limites.emRiscoDias === null ? null : compras.filter((c) => segmentos.get(c.clienteId) === 'EM_RISCO').length,
        },
        marketing: { vendasComCupom: Number(cuponsMes.n), trafego: 'entra na etapa 7', social: 'entra na etapa 8' },
        ...(cifras ? { financeiro: {
          aPagar: centavos(aPagar.reduce((s, g) => s + Number(g.valor), 0)), custosDoMes: custos,
          lucro: vendas.length || custos ? centavos(receita - centavos(proLabore.filter((g) => g.tipo !== 'PRO_LABORE').reduce((s, g) => s + g.valor, 0)) - custos) : null,
        } } : {}),
        porOrigem: [...vendas.reduce((m, v) => m.set(v.origem, centavos((m.get(v.origem) ?? 0) + Number(v.valor))), new Map<string, number>())]
          .map(([origem, valor]) => ({ origem, receita: valor })).sort((a, b) => b.receita - a.receita),
      },
    });
  }));

  // ---- Daily: roteiro de 7 blocos com os números do momento
  async function blocosDoDaily() {
    const linha = await db.selectFrom('parametro').select('valor').where('chave', '=', 'daily_config').executeTakeFirst();
    const config = linha ? validarDailyConfig(linha.valor) : null;
    if (config?.success) return config.data.map((c) => ({ ...BLOCOS_PADRAO.find((b) => b.id === c.id)!, minutos: c.minutos }));
    return BLOCOS_PADRAO.map((b) => ({ ...b }));
  }

  app.get('/daily', ...painel, rota(async (req, res) => {
    const modo = z.enum(['GESTAO', 'EQUIPE']).default('GESTAO').parse(req.query.modo || undefined);
    const cifras = socio(req.usuario);
    const hoje = hojeEmBrasilia();
    const ontem = { inicio: meiaNoite(somarDias(hoje, -1)), fim: meiaNoite(hoje) };
    const fimDeHoje = meiaNoite(somarDias(hoje, 1));
    const p = periodoDoMes(hoje.slice(0, 7));
    const [blocos, meta, vendasMes, vendasOntem, leadsOntem, abertas, atividades, pessoas, aConfirmar, trocas, comissoes, recuperadosOntem, compras, limites, reuniaoAberta] = await Promise.all([
      blocosDoDaily(), parametroNumero(db, 'meta_faturamento_mensal'), vendasValidas(p.inicio, p.fim), vendasValidas(ontem.inicio, ontem.fim),
      db.selectFrom('oportunidade').select(['id', 'vendedorId', 'criadoEm', 'primeiraRespostaEm']).where('criadoEm', '>=', ontem.inicio).where('criadoEm', '<', ontem.fim).execute(),
      db.selectFrom('oportunidade').select(['id', 'etapa', 'vendedorId', 'primeiraRespostaEm', 'linkEnviadoEm']).where('situacao', '=', 'ABERTA').execute(),
      db.selectFrom('atividade').select(['id', 'tipo', 'titulo', 'prazo', 'responsavelId', 'oportunidadeId', 'sequencia', 'bloco']).where('status', '=', 'ABERTA').execute(),
      db.selectFrom('usuario').select(['id', 'nome', 'vende']).where('ativo', '=', true).execute(),
      db.selectFrom('vendaDireta').select('id').where('situacao', '=', 'AGUARDANDO').execute(),
      db.selectFrom('troca').select('id').where('situacao', '!=', 'RESOLVIDA').execute(),
      db.selectFrom('ganho').select(['situacao', 'liberarEm']).where('tipo', '!=', 'PRO_LABORE').where('situacao', 'in', ['AGUARDANDO', 'LIBERADA']).execute(),
      db.selectFrom('historicoEtapa').select('oportunidadeId').where('etapaAnterior', '=', 'RECUPERACAO').where('entrouEm', '>=', ontem.inicio).where('entrouEm', '<', ontem.fim).execute(),
      resumoDeCompras(db), lerLimites(db),
      db.selectFrom('reuniao').select(['id', 'modo', 'iniciadaEm', 'tratados']).where('encerradaEm', 'is', null).executeTakeFirst(),
    ]);
    const nome = (id: string | null) => pessoas.find((u) => u.id === id)?.nome ?? '—';
    const receitaMes = centavos(vendasMes.reduce((s, v) => s + Number(v.valor), 0));
    const ticket = vendasMes.length ? receitaMes / vendasMes.length : null;
    const diasRestantes = p.diasDoMes - p.diasCorridos + 1;
    const comAberta = new Set(atividades.filter((a) => a.oportunidadeId).map((a) => a.oportunidadeId));
    const vencendo = atividades.filter((a) => a.prazo < fimDeHoje);
    const porPessoa = (lista: Array<{ vendedorId: string | null }>) => modo === 'EQUIPE' ? undefined
      : pessoas.filter((u) => u.vende).map((u) => ({ nome: u.nome, quantidade: lista.filter((l) => l.vendedorId === u.id).length })).filter((x) => x.quantidade > 0);
    const tarefas = (filtro: (a: (typeof atividades)[number]) => boolean) => {
      const lista = vencendo.filter(filtro);
      return { total: lista.length, ...(modo === 'GESTAO' ? { itens: lista.map((a) => ({ id: a.id, titulo: a.titulo, prazo: a.prazo, responsavel: nome(a.responsavelId), atrasada: a.prazo < meiaNoite(hoje) })) } : {}) };
    };
    const temposResposta = leadsOntem.filter((l) => l.primeiraRespostaEm).map((l) => (l.primeiraRespostaEm!.getTime() - l.criadoEm.getTime()) / 60_000);
    const linksSemCompra = abertas.filter((o) => o.etapa === 'NEGOCIACAO' && o.linkEnviadoEm);
    const negociacoesSemFollow = abertas.filter((o) => o.etapa === 'NEGOCIACAO' && !comAberta.has(o.id));
    const levantamentosSemContato = abertas.filter((o) => o.etapa === 'LEVANTAMENTO' && !comAberta.has(o.id));
    const segmentos = segmentar(compras, limites, new Date());
    const n = (rotulo: string, valor: number | string | null, extra: Record<string, unknown> = {}) => ({ rotulo, valor, ...extra });
    const pendente = (rotulo: string, etapa: string) => n(rotulo, null, { pendente: etapa });

    const conteudo: Record<IdBloco, { numeros: Array<ReturnType<typeof n>>; tarefas?: ReturnType<typeof tarefas> }> = {
      RESULTADO: { numeros: [
        n('Previsão de fechamento', vendasMes.length ? centavos(projecaoFechamento(receitaMes, p.diasCorridos, p.diasDoMes)!) : null, { unidade: 'R$', meta }),
        n('Vendas de ontem', vendasOntem.length),
        n('Faturamento de ontem', vendasOntem.length ? centavos(vendasOntem.reduce((s, v) => s + Number(v.valor), 0)) : null, { unidade: 'R$' }),
        n('Vendas por dia necessárias', meta === null || ticket === null ? null : Math.max(0, Math.ceil((meta - receitaMes) / ticket / diasRestantes)),
          { ajuda: meta === null ? 'defina a meta do mês em Metas' : ticket === null ? 'aparece depois da primeira venda do mês' : `para bater a meta em ${diasRestantes} dias` }),
      ] },
      ATENDIMENTO: { numeros: [
        n('Leads novos ontem', leadsOntem.length, { porPessoa: porPessoa(leadsOntem) }),
        n('Tempo de 1ª resposta (mediana, leads de ontem)', temposResposta.length ? Math.round(mediana(temposResposta)!) : null, { unidade: 'min' }),
        n('Leads sem resposta agora', abertas.filter((o) => o.etapa === 'LEAD' && !o.primeiraRespostaEm).length, { porPessoa: porPessoa(abertas.filter((o) => o.etapa === 'LEAD' && !o.primeiraRespostaEm)) }),
      ], tarefas: tarefas((a) => ['FOLLOW', 'PRIMEIRO_CONTATO', 'LEMBRETE'].includes(a.tipo)) },
      VENDEDORES: { numeros: [
        n('Links enviados sem compra', linksSemCompra.length, { porPessoa: porPessoa(linksSemCompra) }),
        n('Negociações sem follow', negociacoesSemFollow.length, { porPessoa: porPessoa(negociacoesSemFollow) }),
        n('Levantamentos sem contato', levantamentosSemContato.length, { porPessoa: porPessoa(levantamentosSemContato) }),
      ] },
      TRAFEGO: { numeros: [pendente('Gasto de ontem contra o planejado', 'etapa 7'), pendente('Custo por lead', 'etapa 7'), pendente('ROAS do mês', 'etapa 7')] },
      SOCIAL: { numeros: [pendente('Posts de ontem contra o planejado', 'etapa 8'), pendente('Posts de hoje', 'etapa 8'), pendente('Leads dos posts', 'etapa 8')] },
      CLIENTES: { numeros: [
        pendente('Carrinhos abandonados sem contato', 'etapa 2'),
        n('Recuperados ontem', new Set(recuperadosOntem.map((r) => r.oportunidadeId)).size),
        n('Clientes em risco', limites.emRiscoDias === null ? null : compras.filter((c) => segmentos.get(c.clienteId) === 'EM_RISCO').length,
          limites.emRiscoDias === null ? { ajuda: 'defina o limite em Metas' } : {}),
      ], tarefas: tarefas((a) => a.tipo === 'SEQUENCIA') },
      GESTAO: { numeros: [
        n('Vendas diretas a confirmar', aConfirmar.length),
        n('Trocas aguardando', trocas.length),
        n(cifras ? 'Comissões a liberar ou pagar' : 'Pagamentos aguardando os Sócios', comissoes.filter((g) => g.situacao === 'LIBERADA' || g.liberarEm === null || g.liberarEm <= new Date()).length),
        n('Decisões pendentes', atividades.filter((a) => a.tipo === 'DECISAO').length),
      ], tarefas: tarefas((a) => a.tipo === 'DECISAO') },
    };
    res.json({
      data: hoje, modo, totalMinutos: blocos.reduce((s, b) => s + b.minutos, 0),
      reuniaoAberta: reuniaoAberta ? { id: reuniaoAberta.id, modo: reuniaoAberta.modo, iniciadaEm: reuniaoAberta.iniciadaEm, tratados: reuniaoAberta.tratados } : null,
      responsaveis: pessoas.map((u) => ({ id: u.id, nome: u.nome })),
      blocos: blocos.map((b) => ({ ...b, ...conteudo[b.id] })),
    });
  }));

  // ---- Reuniões: abrir, decidir, tratar, encerrar com ata
  const lerReuniao = async (id: string, aberta = true) => {
    if (!UUID.test(id)) throw new ErroHttp(404, 'Reunião não encontrada.');
    const r = await db.selectFrom('reuniao').selectAll().where('id', '=', id).executeTakeFirst();
    if (!r) throw new ErroHttp(404, 'Reunião não encontrada.');
    if (aberta && r.encerradaEm) throw new ErroHttp(409, 'Esta reunião já foi encerrada.');
    return r;
  };

  app.post('/reunioes', ...painel, rota(async (req, res) => {
    const { modo } = z.object({ modo: z.enum(['GESTAO', 'EQUIPE']) }).strict().parse(req.body);
    const ja = await db.selectFrom('reuniao').select('id').where('encerradaEm', 'is', null).executeTakeFirst();
    if (ja) return void res.json({ id: ja.id, jaAberta: true });
    const r = await db.transaction().execute(async (trx) => {
      const linha = await trx.insertInto('reuniao').values({ modo, abertaPor: req.usuario.id }).returning('id').executeTakeFirstOrThrow();
      await auditar(trx, [{ entidade: 'reuniao', entidadeId: linha.id, acao: 'abrir', para: { modo }, autorId: req.usuario.id }]);
      return linha;
    });
    res.status(201).json({ id: r.id, jaAberta: false });
  }));

  app.post('/reunioes/:id/decisoes', ...painel, rota(async (req, res) => {
    const r = await lerReuniao(req.params.id);
    const dados = z.object({
      bloco: z.enum(ID_BLOCOS),
      texto: z.string().trim().min(3, 'Escreva o que foi decidido.').max(300),
      responsavelId: z.string().regex(UUID, 'Escolha o responsável.'),
      prazo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Escolha o prazo.'),
    }).strict().parse(req.body);
    const responsavel = await db.selectFrom('usuario').select(['id', 'nome']).where('id', '=', dados.responsavelId).where('ativo', '=', true).executeTakeFirst();
    if (!responsavel) throw new ErroHttp(400, 'Escolha um responsável ativo.');
    if (dados.prazo < hojeEmBrasilia()) throw new ErroHttp(400, 'O prazo não pode ser no passado.');
    const nomeBloco = BLOCOS_PADRAO.find((b) => b.id === dados.bloco)!.nome;
    const a = await db.transaction().execute(async (trx) => {
      const linha = await trx.insertInto('atividade').values({
        tipo: 'DECISAO', origem: 'reuniao', reuniaoId: r.id, bloco: dados.bloco, responsavelId: responsavel.id,
        titulo: `Decidido no Daily (${nomeBloco}): ${dados.texto}`, prazo: new Date(`${dados.prazo}T18:00:00-03:00`),
      }).returning('id').executeTakeFirstOrThrow();
      await auditar(trx, [{ entidade: 'atividade', entidadeId: linha.id, acao: 'criar', para: { reuniao: r.id, bloco: dados.bloco, texto: dados.texto, responsavel: responsavel.nome, prazo: dados.prazo }, autorId: req.usuario.id }]);
      return linha;
    });
    res.status(201).json({ id: a.id });
  }));

  app.post('/reunioes/:id/tratados', ...painel, rota(async (req, res) => {
    const r = await lerReuniao(req.params.id);
    const { bloco, item } = z.object({ bloco: z.enum(ID_BLOCOS), item: z.string().trim().min(1).max(200) }).strict().parse(req.body);
    const tratados = [...(r.tratados as Array<{ bloco: string; item: string }>), { bloco, item, em: new Date().toISOString(), por: req.usuario.id }];
    await db.updateTable('reuniao').set({ tratados: JSON.stringify(tratados), atualizadoEm: new Date() }).where('id', '=', r.id).execute();
    res.json({ ok: true });
  }));

  app.post('/reunioes/:id/encerrar', ...painel, rota(async (req, res) => {
    const r = await lerReuniao(req.params.id);
    const dados = z.object({
      pulados: z.array(z.enum(ID_BLOCOS)).max(7),
      numeros: z.array(z.object({ bloco: z.enum(ID_BLOCOS), linhas: z.array(z.object({ rotulo: z.string().max(80), valor: z.string().max(40) }).strict()).max(10) }).strict()).max(7),
    }).strict().parse(req.body);
    const decisoes = await db.selectFrom('atividade as a').innerJoin('usuario as u', 'u.id', 'a.responsavelId').select(['a.id', 'a.bloco', 'a.titulo', 'a.prazo', 'u.nome as responsavel'])
      .where('a.reuniaoId', '=', r.id).orderBy('a.criadoEm').execute();
    const quando = new Date();
    const ata = { data: diaDe(r.iniciadaEm), duracaoMinutos: Math.max(1, Math.round((quando.getTime() - r.iniciadaEm.getTime()) / 60_000)), ...dados,
      tratados: r.tratados, decisoes: decisoes.map((d) => ({ id: d.id, bloco: d.bloco, titulo: d.titulo, prazo: d.prazo, responsavel: d.responsavel })) };
    await db.transaction().execute(async (trx) => {
      await trx.updateTable('reuniao').set({ encerradaEm: quando, ata: JSON.stringify(ata), atualizadoEm: quando }).where('id', '=', r.id).execute();
      await auditar(trx, [{ entidade: 'reuniao', entidadeId: r.id, acao: 'encerrar', para: { decisoes: decisoes.length, pulados: dados.pulados }, autorId: req.usuario.id }]);
    });
    res.json({ ok: true, id: r.id });
  }));

  app.get('/reunioes', autenticar, exigir('reunioes.ver'), rota(async (_req, res) => {
    const reunioes = await db.selectFrom('reuniao as r').innerJoin('usuario as u', 'u.id', 'r.abertaPor')
      .select(['r.id', 'r.modo', 'r.iniciadaEm', 'r.encerradaEm', 'r.ata', 'u.nome as abertaPor']).orderBy('r.iniciadaEm', 'desc').limit(100).execute();
    const ids = reunioes.map((r) => r.id);
    const tarefas = ids.length ? await db.selectFrom('atividade as a').innerJoin('usuario as u', 'u.id', 'a.responsavelId')
      .select(['a.id', 'a.reuniaoId', 'a.bloco', 'a.titulo', 'a.prazo', 'a.status', 'a.concluidaEm', 'u.nome as responsavel']).where('a.reuniaoId', 'in', ids).orderBy('a.criadoEm').execute() : [];
    res.json(reunioes.map((r) => ({ ...r, tarefas: tarefas.filter((t) => t.reuniaoId === r.id) })));
  }));

  // ---- Custos do mês e lucro (Sócios)
  const financeiro = [autenticar, exigir('financeiro.ver')] as const;
  app.get('/custos', ...financeiro, rota(async (req, res) => {
    const mes = lerMes(req.query.mes);
    const p = periodoDoMes(mes);
    const [linhas, numerosMes] = await Promise.all([
      db.selectFrom('custoMes as c').innerJoin('usuario as u', 'u.id', 'c.criadoPor')
        .select(['c.id', 'c.categoria', 'c.descricao', 'c.valor', 'c.criadoEm', 'c.anuladoEm', 'c.motivoAnulacao', 'u.nome as lancadoPor'])
        .where('c.competencia', '=', mes).orderBy('c.criadoEm', 'desc').execute(),
      numeros(p.inicio, p.fim, mes),
    ]);
    res.json({
      mes, categorias: CATEGORIAS_CUSTO,
      custos: linhas.map((l) => ({ ...l, valor: Number(l.valor) })),
      totalPorCategoria: CATEGORIAS_CUSTO.map((c) => ({ categoria: c.id, total: centavos(linhas.filter((l) => l.categoria === c.id && !l.anuladoEm).reduce((s, l) => s + Number(l.valor), 0)) })).filter((c) => c.total > 0),
      conta: { receita: numerosMes.receita ?? 0, comissoes: numerosMes.comissao_mes, custos: numerosMes.custos, lucro: numerosMes.lucro,
        observacao: 'Ainda sem o custo das peças por venda (entra com o estoque, etapa 2) e sem os anúncios (etapa 7). Até lá, lance a produção como custo do mês.' },
    });
  }));

  app.post('/custos', ...financeiro, rota(async (req, res) => {
    const dados = z.object({
      competencia: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Escolha o mês.'),
      categoria: z.enum(['PRODUCAO', 'EMBALAGEM', 'FRETE', 'MARKETING', 'FERRAMENTAS', 'PESSOAL', 'IMPOSTOS', 'OUTROS'], { errorMap: () => ({ message: 'Escolha a categoria.' }) }),
      descricao: z.string().trim().min(2, 'Descreva o custo.').max(160),
      valor: z.number({ invalid_type_error: 'Informe o valor.' }).positive('O valor precisa ser maior que zero.').max(10_000_000),
    }).strict().parse(req.body);
    if (dados.competencia > mesSeguinte(hojeEmBrasilia().slice(0, 7))) throw new ErroHttp(400, 'Lance custos até o mês que vem.');
    const c = await db.transaction().execute(async (trx) => {
      const linha = await trx.insertInto('custoMes').values({ ...dados, criadoPor: req.usuario.id }).returning('id').executeTakeFirstOrThrow();
      await auditar(trx, [{ entidade: 'custo', entidadeId: linha.id, acao: 'criar', para: dados, autorId: req.usuario.id }]);
      return linha;
    });
    res.status(201).json(c);
  }));

  app.post('/custos/:id/anular', ...financeiro, rota(async (req, res) => {
    if (!UUID.test(req.params.id)) throw new ErroHttp(404, 'Custo não encontrado.');
    const { motivo } = z.object({ motivo: z.string().trim().min(3, 'Diga por que o lançamento está sendo anulado.').max(200) }).strict().parse(req.body);
    const c = await db.selectFrom('custoMes').selectAll().where('id', '=', req.params.id).executeTakeFirst();
    if (!c) throw new ErroHttp(404, 'Custo não encontrado.');
    if (c.anuladoEm) throw new ErroHttp(409, 'Este lançamento já foi anulado.');
    await db.transaction().execute(async (trx) => {
      await trx.updateTable('custoMes').set({ anuladoEm: new Date(), anuladoPor: req.usuario.id, motivoAnulacao: motivo, atualizadoEm: new Date() }).where('id', '=', c.id).execute();
      await auditar(trx, [{ entidade: 'custo', entidadeId: c.id, acao: 'anular', de: { valor: Number(c.valor), descricao: c.descricao }, para: { motivo }, autorId: req.usuario.id }]);
    });
    res.json({ ok: true });
  }));
}

export { ETAPAS };
