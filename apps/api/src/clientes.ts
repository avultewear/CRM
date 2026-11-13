import { randomInt } from 'node:crypto';
import type { Express } from 'express';
import { sql } from 'kysely';
import { z } from 'zod';
import { mascararCpf } from './atendimento.js';
import type { Banco } from './banco.js';
import { mediana } from './calculo.js';
import { cancelarGanhos, parametroNumero } from './ganhos.js';
import { ErroHttp, type Ferramentas, type Usuario } from './http.js';
import { pode } from './papeis.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DIA = 24 * 3_600_000;
const centavos = (v: number) => Math.round(v * 100) / 100;
const numero = (v: string | number | null | undefined) => (v === null || v === undefined ? null : Number(v));

export const ETIQUETAS = [
  { id: 'CORRE', nome: 'Corre' },
  { id: 'TREINA', nome: 'Treina' },
  { id: 'GRUPO', nome: 'Grupo ou assessoria' },
  { id: 'DIVULGADOR', nome: 'Divulgador' },
] as const;
export const MOTIVOS_TROCA = [
  { id: 'TAMANHO', nome: 'Tamanho' },
  { id: 'DEFEITO', nome: 'Defeito' },
  { id: 'NAO_GOSTOU', nome: 'Não gostou' },
  { id: 'ARREPENDIMENTO', nome: 'Arrependimento' },
] as const;
export const SEGMENTOS = ['NOVO', 'RECORRENTE', 'VIP', 'EM_RISCO', 'INATIVO'] as const;
export type Segmento = (typeof SEGMENTOS)[number];

export interface Limites { emRiscoDias: number | null; inativoDias: number | null; vipPct: number | null }
export interface ResumoCompras { clienteId: string; compras: number; total: number; ultimaCompra: Date }

/**
 * Segmento de cada cliente com compra. Sem o limite definido em Metas, o segmento que depende dele
 * não é aplicado. Quem está sumindo (Inativo, Em risco) aparece antes de VIP, Recorrente e Novo.
 * VIP: clientes com 2+ compras que estão entre os que mais compraram em valor, na parte definida pelos Sócios.
 */
export function segmentar(clientes: ResumoCompras[], limites: Limites, agora: Date): Map<string, Segmento> {
  const vips = new Set<string>();
  if (limites.vipPct !== null && limites.vipPct > 0) {
    const ordem = [...clientes].sort((a, b) => b.total - a.total || b.compras - a.compras);
    const vagas = Math.ceil((clientes.length * limites.vipPct) / 100);
    for (const c of ordem.slice(0, vagas)) if (c.compras >= 2) vips.add(c.clienteId);
  }
  const resultado = new Map<string, Segmento>();
  for (const c of clientes) {
    const dias = Math.floor((agora.getTime() - c.ultimaCompra.getTime()) / DIA);
    let segmento: Segmento = c.compras >= 2 ? 'RECORRENTE' : 'NOVO';
    if (vips.has(c.clienteId)) segmento = 'VIP';
    if (limites.emRiscoDias !== null && dias > limites.emRiscoDias) segmento = 'EM_RISCO';
    if (limites.inativoDias !== null && dias > limites.inativoDias) segmento = 'INATIVO';
    resultado.set(c.clienteId, segmento);
  }
  return resultado;
}

const LETRAS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const novoCodigo = () => `AV${Array.from({ length: 5 }, () => LETRAS[randomInt(LETRAS.length)]).join('')}`;

/** Cada cliente tem o seu código de indicação. Nasce na primeira compra confirmada. */
export async function garantirCodigoIndicacao(trx: Banco, clienteId: string): Promise<string> {
  const c = await trx.selectFrom('cliente').select('codigoIndicacao').where('id', '=', clienteId).executeTakeFirstOrThrow();
  if (c.codigoIndicacao) return c.codigoIndicacao;
  for (;;) {
    const codigo = novoCodigo();
    if (await trx.selectFrom('cliente').select('id').where('codigoIndicacao', '=', codigo).executeTakeFirst()) continue;
    await trx.updateTable('cliente').set({ codigoIndicacao: codigo }).where('id', '=', clienteId).execute();
    return codigo;
  }
}

/** Código de indicação informado na venda: devolve quem indicou. Ninguém indica a si mesmo. */
export async function quemIndicou(banco: Banco, codigo: string, compradorId: string): Promise<string> {
  const dono = await banco.selectFrom('cliente').select('id').where('codigoIndicacao', '=', codigo.trim().toUpperCase()).executeTakeFirst();
  if (!dono) throw new ErroHttp(400, 'Código de indicação não encontrado.');
  if (dono.id === compradorId) throw new ErroHttp(400, 'O cliente não pode usar o próprio código de indicação.');
  return dono.id;
}

const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0];
const MENSAGENS = {
  POS_COMPRA: (n: string) => `Oi, ${n}! Aqui é da Avulte Wear. Obrigado pela compra! Deu tudo certo com a peça? Se puder, manda uma foto usando e conta o que achou. Posso te mostrar a peça que combina com ela?`,
  RECOMPRA: (n: string) => `Oi, ${n}! Aqui é da Avulte Wear. Como estão os treinos? Passando para avisar das peças que combinam com a que você levou. Quer que eu te mande as opções?`,
  EM_RISCO: (n: string) => `Oi, ${n}! Aqui é da Avulte Wear. Faz um tempo que a gente não se fala. Como estão os treinos? Tem novidade por aqui, posso te mostrar?`,
};
const TITULOS = { POS_COMPRA: 'Pós-compra: agradecer, pedir avaliação e sugerir a peça que combina', RECOMPRA: 'Recompra: oferecer a próxima peça', EM_RISCO: 'Cliente em risco: mensagem de retorno' };
export const POS_COMPRA_HORAS = 24;

async function responsavelPadrao(trx: Banco, preferido: string | null): Promise<string | null> {
  if (preferido) {
    const u = await trx.selectFrom('usuario').select('id').where('id', '=', preferido).where('ativo', '=', true).executeTakeFirst();
    if (u) return u.id;
  }
  const gestor = await trx.selectFrom('usuario').select('id').where('ativo', '=', true).where('papel', 'in', ['GERENTE', 'SOCIO'])
    .orderBy(sql`case papel when 'GERENTE' then 0 else 1 end`).orderBy('criadoEm').executeTakeFirst();
  return gestor?.id ?? null;
}

/** Um passo de sequência vira tarefa com a mensagem pronta. Respeita o aceite e o bloqueio; o mesmo passo não se repete. */
async function criarPasso(trx: Banco, cliente: { id: string; nome: string; vendedorId: string | null; aceiteMensagens: boolean; bloqueado: boolean },
  sequencia: keyof typeof MENSAGENS, referencia: string, prazo: Date, preferido?: string | null): Promise<boolean> {
  if (cliente.bloqueado || !cliente.aceiteMensagens) return false;
  const responsavelId = await responsavelPadrao(trx, preferido ?? cliente.vendedorId);
  if (!responsavelId) return false;
  const r = await trx.insertInto('atividade').values({
    tipo: 'SEQUENCIA', origem: 'sequencia', clienteId: cliente.id, sequencia, referencia, responsavelId,
    titulo: `${TITULOS[sequencia]} (${cliente.nome})`, mensagem: MENSAGENS[sequencia](primeiroNome(cliente.nome)), prazo,
  }).onConflict((c) => c.doNothing()).returning('id').executeTakeFirst();
  return Boolean(r);
}

/** Chamado quando um Sócio confirma a venda: código de indicação e o passo de pós-compra. */
export async function aoConfirmarVenda(trx: Banco, vendaDiretaId: string, quando: Date): Promise<void> {
  const v = await trx.selectFrom('vendaDireta').select(['id', 'clienteId', 'vendedorId']).where('id', '=', vendaDiretaId).executeTakeFirstOrThrow();
  await garantirCodigoIndicacao(trx, v.clienteId);
  const c = await trx.selectFrom('cliente').select(['id', 'nome', 'vendedorId', 'aceiteMensagens', 'bloqueado']).where('id', '=', v.clienteId).executeTakeFirstOrThrow();
  await criarPasso(trx, c, 'POS_COMPRA', v.id, new Date(quando.getTime() + POS_COMPRA_HORAS * 3_600_000), v.vendedorId);
}

const comprasValidas = (banco: Banco) => banco.selectFrom('vendaDireta').where('situacao', '=', 'CONFIRMADA').where('devolvidaEm', 'is', null);

export async function resumoDeCompras(banco: Banco): Promise<ResumoCompras[]> {
  const linhas = await comprasValidas(banco).select(['clienteId'])
    .select((eb) => [eb.fn.countAll<string>().as('compras'), eb.fn.sum<string>('valor').as('total'), eb.fn.max('decididaEm').as('ultima')])
    .groupBy('clienteId').execute();
  return linhas.map((l) => ({ clienteId: l.clienteId, compras: Number(l.compras), total: centavos(Number(l.total)), ultimaCompra: l.ultima as Date }));
}
export async function lerLimites(banco: Banco): Promise<Limites> {
  return {
    emRiscoDias: await parametroNumero(banco, 'segmento_em_risco_dias'),
    inativoDias: await parametroNumero(banco, 'segmento_inativo_dias'),
    vipPct: await parametroNumero(banco, 'segmento_vip_pct'),
  };
}

/** Rotina do dia: recompra (passaram os dias definidos desde a última compra) e em risco (entrou no segmento). */
export async function gerarSequencias(db: Banco, quando = new Date()): Promise<{ recompra: number; emRisco: number }> {
  const recompraDias = await parametroNumero(db, 'recompra_dias');
  const limites = await lerLimites(db);
  const resumo = await resumoDeCompras(db);
  if (!resumo.length || (recompraDias === null && limites.emRiscoDias === null)) return { recompra: 0, emRisco: 0 };
  const clientes = await db.selectFrom('cliente').select(['id', 'nome', 'vendedorId', 'aceiteMensagens', 'bloqueado'])
    .where('id', 'in', resumo.map((r) => r.clienteId)).execute();
  const porId = new Map(clientes.map((c) => [c.id, c]));
  const feito = { recompra: 0, emRisco: 0 };
  for (const r of resumo) {
    const c = porId.get(r.clienteId);
    if (!c) continue;
    const dias = Math.floor((quando.getTime() - r.ultimaCompra.getTime()) / DIA);
    const referencia = r.ultimaCompra.toISOString();
    if (recompraDias !== null && dias >= recompraDias && await criarPasso(db, c, 'RECOMPRA', referencia, quando)) feito.recompra += 1;
    if (limites.emRiscoDias !== null && dias > limites.emRiscoDias && await criarPasso(db, c, 'EM_RISCO', referencia, quando)) feito.emRisco += 1;
  }
  return feito;
}

export function registrarClientes(app: Express, { db, rota, autenticar, exigir, auditar }: Ferramentas): void {
  const ver = [autenticar, exigir('clientes.ver')] as const;
  const veTodos = (u: Usuario) => pode(u.papel, 'atendimento.todos');
  const veCifras = (u: Usuario) => pode(u.papel, 'cifras.ver');

  async function carregarCliente(id: string, usuario: Usuario) {
    if (!UUID.test(id)) throw new ErroHttp(404, 'Cliente não encontrado.');
    const c = await db.selectFrom('cliente').selectAll().where('id', '=', id).executeTakeFirst();
    if (!c || (!veTodos(usuario) && c.vendedorId !== usuario.id)) throw new ErroHttp(404, 'Cliente não encontrado.');
    return c;
  }

  app.get('/clientes/config', ...ver, rota(async (_req, res) => { res.json({ etiquetas: ETIQUETAS, motivosTroca: MOTIVOS_TROCA, segmentos: SEGMENTOS }); }));

  // ---- Lista e os três números do "Agora". Cada vendedor vê os próprios clientes.
  app.get('/clientes', ...ver, rota(async (req, res) => {
    const agora = new Date();
    const [todos, limites] = await Promise.all([resumoDeCompras(db), lerLimites(db)]);
    // O segmento VIP compara o cliente com a base inteira, mesmo quando quem olha é um vendedor.
    const segmentos = segmentar(todos, limites, agora);
    const base = todos.length ? await db.selectFrom('cliente as c').leftJoin('usuario as u', 'u.id', 'c.vendedorId')
      .select(['c.id', 'c.nome', 'c.telefone', 'c.etiquetas', 'c.aceiteMensagens', 'c.bloqueado', 'c.vendedorId', 'u.nome as vendedor'])
      .where('c.id', 'in', todos.map((t) => t.clienteId)).execute() : [];
    const visiveis = base.filter((c) => veTodos(req.usuario) || c.vendedorId === req.usuario.id);
    const porId = new Map(todos.map((t) => [t.clienteId, t]));
    const clientes = visiveis.map((c) => {
      const r = porId.get(c.id)!;
      return { id: c.id, nome: c.nome, telefone: c.telefone, segmento: segmentos.get(c.id)!, compras: r.compras, total: r.total, ultimaCompra: r.ultimaCompra,
        etiquetas: c.etiquetas, vendedor: c.vendedor, aceiteMensagens: c.aceiteMensagens, bloqueado: c.bloqueado };
    }).sort((a, b) => b.ultimaCompra.getTime() - a.ultimaCompra.getTime());

    const comCompra = clientes.length;
    const recorrentes = clientes.filter((c) => c.compras >= 2).length;
    const datas = visiveis.length ? await comprasValidas(db).select(['clienteId', 'decididaEm']).where('clienteId', 'in', visiveis.map((c) => c.id)).orderBy('decididaEm').execute() : [];
    const intervalos: number[] = [];
    const anterior = new Map<string, Date>();
    for (const d of datas) {
      const antes = anterior.get(d.clienteId);
      if (antes && d.decididaEm) intervalos.push((d.decididaEm.getTime() - antes.getTime()) / DIA);
      if (d.decididaEm) anterior.set(d.clienteId, d.decididaEm);
    }
    const trocasAbertas = await db.selectFrom('troca as t').innerJoin('cliente as c', 'c.id', 't.clienteId')
      .select(['t.id', 't.clienteId', 'c.nome as clienteNome', 't.item', 't.quantidade', 't.motivo', 't.situacao', 't.estadoDaPeca', 't.criadoEm', 'c.vendedorId'])
      .where('t.situacao', '!=', 'RESOLVIDA').orderBy('t.criadoEm').execute();
    res.json({
      limites: { emRisco: limites.emRiscoDias !== null, inativo: limites.inativoDias !== null, vip: limites.vipPct !== null },
      agora: {
        clientes_ativos: clientes.filter((c) => c.segmento !== 'INATIVO').length,
        taxa_recompra: comCompra ? Math.round((recorrentes / comCompra) * 1000) / 10 : null,
        clientes_em_risco: limites.emRiscoDias === null ? null : clientes.filter((c) => c.segmento === 'EM_RISCO').length,
        tempo_entre_compras: intervalos.length ? Math.round(mediana(intervalos)! * 10) / 10 : null,
        ltv: comCompra ? centavos(clientes.reduce((s, c) => s + c.total, 0) / comCompra) : null,
      },
      clientes,
      trocasAbertas: trocasAbertas.filter((t) => veTodos(req.usuario) || t.vendedorId === req.usuario.id).map(({ vendedorId: _v, ...t }) => t),
    });
  }));

  // ---- Ficha do cliente
  app.get('/clientes/:id/ficha', ...ver, rota(async (req, res) => {
    const c = await carregarCliente(req.params.id, req.usuario);
    const cifras = veCifras(req.usuario);
    const [vendas, trocas, atendimentos, brindes, indicacoes, todos, limites] = await Promise.all([
      db.selectFrom('vendaDireta as v').leftJoin('cupom as k', 'k.id', 'v.cupomId').leftJoin('cliente as i', 'i.id', 'v.indicadoPorId')
        .select(['v.id', 'v.itens', 'v.valor', 'v.formaPagamento', 'v.decididaEm', 'v.devolvidaEm', 'k.codigo as cupom', 'i.nome as indicadoPor'])
        .where('v.clienteId', '=', c.id).where('v.situacao', '=', 'CONFIRMADA').orderBy('v.decididaEm', 'desc').execute(),
      db.selectFrom('troca').select(['id', 'vendaDiretaId', 'item', 'quantidade', 'motivo', 'situacao', 'estadoDaPeca', 'resolucao', 'observacao', 'criadoEm', 'resolvidaEm'])
        .where('clienteId', '=', c.id).orderBy('criadoEm', 'desc').execute(),
      db.selectFrom('oportunidade').select(['id', 'etapa', 'situacao', 'canal', 'origem', 'interesse', 'criadoEm']).where('clienteId', '=', c.id).orderBy('criadoEm', 'desc').execute(),
      db.selectFrom('brinde').select(['id', 'descricao', 'motivo', 'custo', 'entregueEm']).where('clienteId', '=', c.id).orderBy('entregueEm', 'desc').execute(),
      db.selectFrom('vendaDireta as v').innerJoin('cliente as n', 'n.id', 'v.clienteId').select(['n.nome', 'v.valor', 'v.decididaEm'])
        .where('v.indicadoPorId', '=', c.id).where('v.situacao', '=', 'CONFIRMADA').where('v.devolvidaEm', 'is', null).orderBy('v.decididaEm', 'desc').execute(),
      resumoDeCompras(db), lerLimites(db),
    ]);
    const meu = todos.find((t) => t.clienteId === c.id);
    const codigoIndicacao = c.codigoIndicacao ?? (meu ? await garantirCodigoIndicacao(db, c.id) : null);
    res.json({
      id: c.id, nome: c.nome, telefone: c.telefone, email: c.email, cpf: mascararCpf(c.cpf), temCpf: Boolean(c.cpf),
      bloqueado: c.bloqueado, aceiteMensagens: c.aceiteMensagens, aceiteEm: c.aceiteEm, etiquetas: c.etiquetas, codigoIndicacao,
      segmento: meu ? segmentar(todos, limites, new Date()).get(c.id) : null,
      compras: meu?.compras ?? 0, total: meu?.total ?? 0, ultimaCompra: meu?.ultimaCompra ?? null,
      vendas: vendas.map((v) => ({ id: v.id, itens: v.itens, valor: Number(v.valor), formaPagamento: v.formaPagamento, data: v.decididaEm, devolvida: Boolean(v.devolvidaEm), cupom: v.cupom, indicadoPor: v.indicadoPor })),
      trocas, atendimentos,
      // Quem comprou com o código deste cliente: o primeiro nome basta para agradecer a indicação.
      indicacoes: indicacoes.map((i) => ({ nome: primeiroNome(i.nome), valor: Number(i.valor), data: i.decididaEm })),
      brindes: brindes.map((b) => ({ id: b.id, descricao: b.descricao, motivo: b.motivo, entregueEm: b.entregueEm, ...(cifras ? { custo: numero(b.custo) } : {}) })),
    });
  }));

  app.put('/clientes/:id/etiquetas', ...ver, rota(async (req, res) => {
    const c = await carregarCliente(req.params.id, req.usuario);
    const { etiquetas } = z.object({ etiquetas: z.array(z.enum(['CORRE', 'TREINA', 'GRUPO', 'DIVULGADOR'])).max(4) }).strict().parse(req.body);
    const novas = [...new Set(etiquetas)].sort();
    if (JSON.stringify(novas) !== JSON.stringify([...c.etiquetas].sort())) {
      await db.transaction().execute(async (trx) => {
        await trx.updateTable('cliente').set({ etiquetas: novas, atualizadoEm: new Date() }).where('id', '=', c.id).execute();
        await auditar(trx, [{ entidade: 'cliente', entidadeId: c.id, acao: 'alterar', campo: 'etiquetas', de: c.etiquetas, para: novas, autorId: req.usuario.id }]);
      });
    }
    res.json({ ok: true });
  }));

  // ---- Brindes: registrados pela gestão; o custo é cifra dos Sócios.
  app.post('/clientes/:id/brindes', autenticar, exigir('atendimento.todos'), rota(async (req, res) => {
    const c = await carregarCliente(req.params.id, req.usuario);
    const dados = z.object({
      descricao: z.string().trim().min(2, 'Descreva o brinde.').max(160),
      motivo: z.string().trim().min(2, 'Diga o porquê do brinde.').max(200),
      entregueEm: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.'),
      custo: z.number().min(0).max(1_000_000).optional(),
    }).strict().parse(req.body);
    if (dados.custo !== undefined && !veCifras(req.usuario)) throw new ErroHttp(403, 'O custo do brinde é informado pelos Sócios.');
    const b = await db.transaction().execute(async (trx) => {
      const linha = await trx.insertInto('brinde').values({ clienteId: c.id, descricao: dados.descricao, motivo: dados.motivo, entregueEm: dados.entregueEm, custo: dados.custo ?? null, criadoPor: req.usuario.id })
        .returning('id').executeTakeFirstOrThrow();
      await auditar(trx, [{ entidade: 'brinde', entidadeId: linha.id, acao: 'criar', para: { cliente: c.nome, descricao: dados.descricao, motivo: dados.motivo }, autorId: req.usuario.id }]);
      return linha;
    });
    res.status(201).json(b);
  }));

  // ---- Trocas e devoluções: solicitada → peça recebida → resolvida
  app.post('/vendas-diretas/:id/trocas', ...ver, rota(async (req, res) => {
    if (!UUID.test(req.params.id)) throw new ErroHttp(404, 'Venda não encontrada.');
    const v = await db.selectFrom('vendaDireta').selectAll().where('id', '=', req.params.id).executeTakeFirst();
    if (!v || v.situacao !== 'CONFIRMADA') throw new ErroHttp(404, 'Venda não encontrada.');
    const c = await carregarCliente(v.clienteId, req.usuario);
    if (v.devolvidaEm) throw new ErroHttp(409, 'O valor desta venda já foi devolvido.');
    const dados = z.object({
      item: z.string().trim().min(2, 'Escolha a peça.').max(160),
      quantidade: z.number().int().min(1).max(999),
      motivo: z.enum(['TAMANHO', 'DEFEITO', 'NAO_GOSTOU', 'ARREPENDIMENTO'], { errorMap: () => ({ message: 'Escolha o motivo.' }) }),
      observacao: z.string().trim().max(500).optional(),
    }).strict().parse(req.body);
    const itens = v.itens as Array<{ descricao: string; quantidade: number }>;
    const daVenda = itens.find((i) => i.descricao === dados.item);
    if (!daVenda) throw new ErroHttp(400, 'Esta peça não faz parte da venda.');
    const jaPedidas = await db.selectFrom('troca').select((eb) => eb.fn.sum<string>('quantidade').as('q')).where('vendaDiretaId', '=', v.id).where('item', '=', dados.item).executeTakeFirst();
    if (Number(jaPedidas?.q ?? 0) + dados.quantidade > daVenda.quantidade) throw new ErroHttp(409, 'Já existe troca para todas as unidades desta peça.');
    const t = await db.transaction().execute(async (trx) => {
      const linha = await trx.insertInto('troca').values({ vendaDiretaId: v.id, clienteId: c.id, item: dados.item, quantidade: dados.quantidade, motivo: dados.motivo, observacao: dados.observacao || null, abertaPor: req.usuario.id })
        .returning('id').executeTakeFirstOrThrow();
      await auditar(trx, [{ entidade: 'troca', entidadeId: linha.id, acao: 'criar', para: { cliente: c.nome, item: dados.item, motivo: dados.motivo }, autorId: req.usuario.id }]);
      return linha;
    });
    res.status(201).json(t);
  }));

  async function carregarTroca(id: string, usuario: Usuario) {
    if (!UUID.test(id)) throw new ErroHttp(404, 'Troca não encontrada.');
    const t = await db.selectFrom('troca').selectAll().where('id', '=', id).executeTakeFirst();
    if (!t) throw new ErroHttp(404, 'Troca não encontrada.');
    await carregarCliente(t.clienteId, usuario);
    return t;
  }

  app.post('/trocas/:id/receber', autenticar, exigir('atendimento.todos'), rota(async (req, res) => {
    const t = await carregarTroca(req.params.id, req.usuario);
    if (t.situacao !== 'SOLICITADA') throw new ErroHttp(409, 'A peça desta troca já foi recebida.');
    const { estado } = z.object({ estado: z.enum(['BOM', 'DEFEITO'], { errorMap: () => ({ message: 'Diga em que estado a peça chegou.' }) }) }).strict().parse(req.body);
    const quando = new Date();
    await db.transaction().execute(async (trx) => {
      await trx.updateTable('troca').set({ situacao: 'PECA_RECEBIDA', estadoDaPeca: estado, recebidaEm: quando, atualizadoEm: quando }).where('id', '=', t.id).execute();
      await auditar(trx, [{ entidade: 'troca', entidadeId: t.id, acao: 'receber', para: { estado }, autorId: req.usuario.id }]);
    });
    res.json({ ok: true });
  }));

  app.post('/trocas/:id/resolver', autenticar, exigir('atendimento.todos'), rota(async (req, res) => {
    const t = await carregarTroca(req.params.id, req.usuario);
    if (t.situacao !== 'PECA_RECEBIDA') throw new ErroHttp(409, t.situacao === 'RESOLVIDA' ? 'Esta troca já foi resolvida.' : 'Registre primeiro o recebimento da peça.');
    const { resolucao } = z.object({ resolucao: z.enum(['NOVA_PECA', 'VALOR_DEVOLVIDO'], { errorMap: () => ({ message: 'Escolha como a troca foi resolvida.' }) }) }).strict().parse(req.body);
    // Devolver o valor mexe no pró-labore e nas comissões: é decisão dos Sócios.
    if (resolucao === 'VALOR_DEVOLVIDO' && !pode(req.usuario.papel, 'vendas.confirmar')) throw new ErroHttp(403, 'A devolução do valor é confirmada por um Sócio.');
    const quando = new Date();
    const cancelados = await db.transaction().execute(async (trx) => {
      await trx.updateTable('troca').set({ situacao: 'RESOLVIDA', resolucao, resolvidaPor: req.usuario.id, resolvidaEm: quando, atualizadoEm: quando }).where('id', '=', t.id).execute();
      let ganhos = 0;
      if (resolucao === 'VALOR_DEVOLVIDO') {
        await trx.updateTable('vendaDireta').set({ devolvidaEm: quando, atualizadoEm: quando }).where('id', '=', t.vendaDiretaId).execute();
        ganhos = await cancelarGanhos(trx, t.vendaDiretaId, quando);
        await trx.updateTable('atividade').set({ status: 'CANCELADA', concluidaEm: quando, atualizadoEm: quando })
          .where('sequencia', '=', 'POS_COMPRA').where('referencia', '=', t.vendaDiretaId).where('status', '=', 'ABERTA').execute();
      }
      await auditar(trx, [{ entidade: 'troca', entidadeId: t.id, acao: 'resolver', para: { resolucao, ganhosCancelados: ganhos }, autorId: req.usuario.id }]);
      return ganhos;
    });
    res.json({ ok: true, ganhosCancelados: cancelados });
  }));

  // ---- Taxa de troca: peças que voltaram ÷ peças vendidas, por peça (o modelo e o tamanho vêm do estoque, na etapa 2).
  app.get('/trocas/taxa', autenticar, exigir('atendimento.todos'), rota(async (_req, res) => {
    const [vendas, trocas] = await Promise.all([
      db.selectFrom('vendaDireta').select('itens').where('situacao', '=', 'CONFIRMADA').execute(),
      db.selectFrom('troca').select(['item', 'quantidade', 'motivo']).execute(),
    ]);
    const vendidas = new Map<string, number>();
    for (const v of vendas) for (const i of v.itens as Array<{ descricao: string; quantidade: number }>) vendidas.set(i.descricao, (vendidas.get(i.descricao) ?? 0) + i.quantidade);
    const voltaram = new Map<string, number>();
    for (const t of trocas) voltaram.set(t.item, (voltaram.get(t.item) ?? 0) + t.quantidade);
    const totalVendidas = [...vendidas.values()].reduce((s, q) => s + q, 0);
    const totalVoltaram = [...voltaram.values()].reduce((s, q) => s + q, 0);
    res.json({
      taxa_troca: totalVendidas ? Math.round((totalVoltaram / totalVendidas) * 1000) / 10 : null,
      porPeca: [...voltaram].map(([item, q]) => ({ item, voltaram: q, vendidas: vendidas.get(item) ?? 0, taxa: vendidas.get(item) ? Math.round((q / vendidas.get(item)!) * 1000) / 10 : null }))
        .sort((a, b) => b.voltaram - a.voltaram),
      porMotivo: MOTIVOS_TROCA.map((m) => ({ motivo: m.id, quantidade: trocas.filter((t) => t.motivo === m.id).reduce((s, t) => s + t.quantidade, 0) })),
    });
  }));
}
