import { timingSafeEqual } from 'node:crypto';
import type { Express } from 'express';
import { z } from 'zod';
import type { Banco, TipoGanho } from './banco.js';
import { ErroHttp, type Ferramentas, type LinhaAuditoria, type Usuario } from './http.js';
import { gerarSequencias } from './clientes.js';
import { pode } from './papeis.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const numero = (v: string | number | null | undefined) => (v === null || v === undefined ? null : Number(v));
const centavos = (v: number) => Math.round(v * 100) / 100;
const DIA = 24 * 3_600_000;

/** Mês da venda no horário de Brasília (AAAA-MM). É por ele que o teto mensal é contado. */
export function mesDe(quando: Date): string {
  return new Date(quando.getTime() - 3 * 3_600_000).toISOString().slice(0, 7);
}
/** Hoje no horário de Brasília (AAAA-MM-DD). */
export const hojeEmBrasilia = (quando = new Date()) => new Date(quando.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);

/** Aplica o teto mensal: o que já foi gerado no mês desconta do que ainda cabe. */
export function aplicarTeto(bruto: number, teto: number | null, jaGerado: number): number {
  if (teto === null) return centavos(bruto);
  return centavos(Math.max(0, Math.min(bruto, teto - jaGerado)));
}

export async function parametroNumero(banco: Banco, chave: string): Promise<number | null> {
  const linha = await banco.selectFrom('parametro').select('valor').where('chave', '=', chave).executeTakeFirst();
  return typeof linha?.valor === 'number' ? linha.valor : null;
}

/** Cupom que pode ser usado hoje: existe, está ativo e não venceu. */
export async function cupomValido(banco: Banco, codigo: string) {
  const cupom = await banco.selectFrom('cupom as c').innerJoin('influenciador as i', 'i.id', 'c.influenciadorId')
    .select(['c.id', 'c.codigo', 'c.descontoPct', 'c.comissaoPct', 'c.validade', 'c.ativo', 'c.influenciadorId', 'i.nome as influenciadorNome', 'i.ativo as influenciadorAtivo'])
    .where('c.codigo', '=', codigo.trim().toUpperCase()).executeTakeFirst();
  if (!cupom || !cupom.ativo || !cupom.influenciadorAtivo) return null;
  if (cupom.validade && cupom.validade < hojeEmBrasilia()) return null;
  return { ...cupom, descontoPct: Number(cupom.descontoPct) };
}

async function jaGeradoNoMes(trx: Banco, tipo: TipoGanho, competencia: string, quem: { usuarioId?: string; influenciadorId?: string }) {
  let consulta = trx.selectFrom('ganho').select((eb) => eb.fn.sum<string>('valor').as('total'))
    .where('tipo', '=', tipo).where('competencia', '=', competencia).where('situacao', '!=', 'CANCELADA');
  if (quem.usuarioId) consulta = consulta.where('usuarioId', '=', quem.usuarioId);
  if (quem.influenciadorId) consulta = consulta.where('influenciadorId', '=', quem.influenciadorId);
  return Number((await consulta.executeTakeFirst())?.total ?? 0);
}

/**
 * Gera o pró-labore e as comissões de uma venda direta confirmada.
 * Regra 13: sem a porcentagem definida em Metas (ou na pessoa), nada é gerado. Nenhum valor é inventado.
 */
export async function gerarGanhos(trx: Banco, vendaDiretaId: string, quando: Date): Promise<void> {
  const venda = await trx.selectFrom('vendaDireta').selectAll().where('id', '=', vendaDiretaId).executeTakeFirstOrThrow();
  const base = Number(venda.valor);
  if (!(base > 0)) return;
  const competencia = mesDe(quando);
  const prazoTroca = await parametroNumero(trx, 'prazo_troca_dias');
  // A comissão só é liberada depois do prazo de troca. Sem o prazo definido, espera a liberação dos Sócios.
  const liberarEm = prazoTroca === null ? null : new Date(quando.getTime() + prazoTroca * DIA);
  const comum = { vendaDiretaId, base, competencia, liberarEm, criadoEm: quando };

  const proLabore = await parametroNumero(trx, 'prolabore_pct');
  if (proLabore !== null && proLabore > 0) {
    const valor = centavos((base * proLabore) / 100);
    await trx.insertInto('ganho').values({ ...comum, tipo: 'PRO_LABORE', pct: proLabore, valorSemTeto: valor, valor }).execute();
  }

  if (venda.vendedorId) {
    const vendedor = await trx.selectFrom('usuario').select(['id', 'papel', 'comissaoPct', 'comissaoTeto']).where('id', '=', venda.vendedorId).executeTakeFirst();
    // Sócio não recebe comissão: o ganho dele é o pró-labore.
    if (vendedor && vendedor.papel !== 'SOCIO') {
      const pct = numero(vendedor.comissaoPct) ?? await parametroNumero(trx, 'comissao_vendedor_pct');
      if (pct !== null && pct > 0) {
        const teto = numero(vendedor.comissaoTeto) ?? await parametroNumero(trx, 'comissao_vendedor_teto');
        const bruto = centavos((base * pct) / 100);
        const valor = aplicarTeto(bruto, teto, await jaGeradoNoMes(trx, 'COMISSAO_VENDEDOR', competencia, { usuarioId: vendedor.id }));
        await trx.insertInto('ganho').values({ ...comum, tipo: 'COMISSAO_VENDEDOR', usuarioId: vendedor.id, pct, valorSemTeto: bruto, valor }).execute();
      }
    }
  }

  if (venda.cupomId) {
    const cupom = await trx.selectFrom('cupom as c').innerJoin('influenciador as i', 'i.id', 'c.influenciadorId')
      .select(['c.comissaoPct', 'i.id as influenciadorId', 'i.comissaoTeto']).where('c.id', '=', venda.cupomId).executeTakeFirst();
    if (cupom) {
      const pct = numero(cupom.comissaoPct) ?? await parametroNumero(trx, 'comissao_influenciador_pct');
      if (pct !== null && pct > 0) {
        const teto = numero(cupom.comissaoTeto) ?? await parametroNumero(trx, 'comissao_influenciador_teto');
        const bruto = centavos((base * pct) / 100);
        const valor = aplicarTeto(bruto, teto, await jaGeradoNoMes(trx, 'COMISSAO_INFLUENCIADOR', competencia, { influenciadorId: cupom.influenciadorId }));
        await trx.insertInto('ganho').values({ ...comum, tipo: 'COMISSAO_INFLUENCIADOR', influenciadorId: cupom.influenciadorId, pct, valorSemTeto: bruto, valor }).execute();
      }
    }
  }
}

/** Devolução ou cancelamento: o pró-labore e as comissões da venda são cancelados. O que já foi pago fica registrado como pago. */
export async function cancelarGanhos(trx: Banco, vendaDiretaId: string, quando: Date): Promise<number> {
  const r = await trx.updateTable('ganho').set({ situacao: 'CANCELADA', atualizadoEm: quando })
    .where('vendaDiretaId', '=', vendaDiretaId).where('situacao', 'in', ['AGUARDANDO', 'LIBERADA']).executeTakeFirst();
  return Number(r.numUpdatedRows);
}

/** Rotina do dia: libera o que já passou do prazo de troca. */
export async function liberarGanhosVencidos(db: Banco, quando = new Date()): Promise<number> {
  const r = await db.updateTable('ganho').set({ situacao: 'LIBERADA', liberadaEm: quando, atualizadoEm: quando })
    .where('situacao', '=', 'AGUARDANDO').where('liberarEm', 'is not', null).where('liberarEm', '<=', quando).executeTakeFirst();
  return Number(r.numUpdatedRows);
}

export function registrarGanhos(app: Express, { db, rota, autenticar, exigir, auditar }: Ferramentas, rotinaSegredo?: string) {
  const gestao = [autenticar, exigir('influenciadores.gestao')];
  const socio = [autenticar, exigir('cifras.ver')];
  const veCifras = (u: Usuario) => pode(u.papel, 'cifras.ver');

  // ---------------------------------------------------------------- Influenciadores (gestão)
  async function carregarInfluenciador(id: string) {
    if (!UUID.test(id)) throw new ErroHttp(404, 'Influenciador não encontrado.');
    const i = await db.selectFrom('influenciador').selectAll().where('id', '=', id).executeTakeFirst();
    if (!i) throw new ErroHttp(404, 'Influenciador não encontrado.');
    return i;
  }

  app.get('/influenciadores', ...gestao, rota(async (req, res) => {
    const cifras = veCifras(req.usuario);
    const mes = mesDe(new Date());
    const [lista, cupons, vendas, comissoes, pecas, posts] = await Promise.all([
      db.selectFrom('influenciador as i').leftJoin('usuario as u', 'u.id', 'i.usuarioId')
        .select(['i.id', 'i.nome', 'i.arroba', 'i.ativo', 'i.comissaoTeto', 'i.usuarioId', 'u.email as login']).orderBy('i.nome').execute(),
      db.selectFrom('cupom').select(['id', 'codigo', 'influenciadorId', 'descontoPct', 'comissaoPct', 'validade', 'ativo']).orderBy('codigo').execute(),
      // Todas as vendas confirmadas, em ordem: a primeira compra de cada cliente diz quem o trouxe.
      db.selectFrom('vendaDireta as v').leftJoin('cupom as c', 'c.id', 'v.cupomId')
        .select(['c.influenciadorId', 'v.clienteId', 'v.valor']).where('v.situacao', '=', 'CONFIRMADA').where('v.devolvidaEm', 'is', null).orderBy('v.decididaEm').orderBy('v.criadoEm').execute(),
      db.selectFrom('ganho').select(['influenciadorId', 'valor', 'situacao']).where('tipo', '=', 'COMISSAO_INFLUENCIADOR').where('situacao', '!=', 'CANCELADA').execute(),
      db.selectFrom('pecaEnviada').select(['id', 'influenciadorId', 'descricao', 'quantidade', 'custo', 'enviadaEm']).orderBy('enviadaEm', 'desc').execute(),
      db.selectFrom('combinadoPosts').select(['influenciadorId', 'mes', 'combinados', 'feitos']).where('mes', '=', mes).execute(),
    ]);
    const comprasPorCliente = new Map<string, number>();
    const trazidoPor = new Map<string, string | null>();
    for (const v of vendas) {
      if (!trazidoPor.has(v.clienteId)) trazidoPor.set(v.clienteId, v.influenciadorId);
      comprasPorCliente.set(v.clienteId, (comprasPorCliente.get(v.clienteId) ?? 0) + 1);
    }
    res.json(lista.map((i) => {
      const dele = vendas.filter((v) => v.influenciadorId === i.id);
      const novos = [...trazidoPor].filter(([, quem]) => quem === i.id).map(([cliente]) => cliente);
      const valorVendas = centavos(dele.reduce((s, v) => s + Number(v.valor), 0));
      const comissao = centavos(comissoes.filter((c) => c.influenciadorId === i.id).reduce((s, c) => s + Number(c.valor), 0));
      const pecasDele = pecas.filter((p) => p.influenciadorId === i.id);
      const custoPecas = centavos(pecasDele.reduce((s, p) => s + Number(p.custo ?? 0), 0));
      const combinado = posts.find((p) => p.influenciadorId === i.id);
      return {
        id: i.id, nome: i.nome, arroba: i.arroba, ativo: i.ativo, login: i.login, usuarioId: i.usuarioId,
        cupons: cupons.filter((c) => c.influenciadorId === i.id).map((c) => ({
          id: c.id, codigo: c.codigo, descontoPct: Number(c.descontoPct), validade: c.validade, ativo: c.ativo,
          // A % de comissão de cada cupom é cifra dos Sócios.
          ...(cifras ? { comissaoPct: numero(c.comissaoPct) } : {}),
        })),
        vendas: dele.length, valorVendas,
        // Clientes novos: a primeira compra foi com um cupom dele. Voltaram: compraram de novo, com ou sem cupom.
        clientes: novos.length, clientesQueVoltaram: novos.filter((c) => (comprasPorCliente.get(c) ?? 0) > 1).length,
        pecas: pecasDele.map((p) => ({ id: p.id, descricao: p.descricao, quantidade: p.quantidade, enviadaEm: p.enviadaEm, ...(cifras ? { custo: numero(p.custo) } : {}) })),
        posts: { mes, combinados: combinado?.combinados ?? null, feitos: combinado?.feitos ?? null },
        // Comissão, custo das peças e retorno: só para os Sócios.
        ...(cifras ? { comissaoTeto: numero(i.comissaoTeto), comissao, custoPecas, retorno: centavos(valorVendas - comissao - custoPecas) } : {}),
      };
    }));
  }));

  const dadosInfluenciador = z.object({
    nome: z.string().trim().min(2, 'Informe o nome.').max(120),
    arroba: z.string().trim().max(60).nullable(),
    usuarioId: z.string().regex(UUID).nullable(),
    comissaoTeto: z.number().min(0).max(1_000_000).nullable(),
    ativo: z.boolean(),
  }).strict();

  async function conferirLogin(usuarioId: string | null | undefined, menosId?: string) {
    if (!usuarioId) return;
    const u = await db.selectFrom('usuario').select(['id', 'papel']).where('id', '=', usuarioId).executeTakeFirst();
    if (!u || u.papel !== 'INFLUENCIADOR') throw new ErroHttp(400, 'O acesso escolhido precisa ser de uma pessoa com o papel Influenciador.');
    const dono = await db.selectFrom('influenciador').select('id').where('usuarioId', '=', usuarioId).executeTakeFirst();
    if (dono && dono.id !== menosId) throw new ErroHttp(409, 'Este acesso já está ligado a outro influenciador.');
  }

  app.post('/influenciadores', ...gestao, rota(async (req, res) => {
    const dados = dadosInfluenciador.partial().required({ nome: true }).omit({ ativo: true }).parse(req.body);
    if (dados.comissaoTeto !== undefined && !veCifras(req.usuario)) throw new ErroHttp(403, 'O teto de comissão é definido pelos Sócios.');
    await conferirLogin(dados.usuarioId);
    const criado = await db.transaction().execute(async (trx) => {
      const i = await trx.insertInto('influenciador').values({ nome: dados.nome, arroba: dados.arroba ?? null, usuarioId: dados.usuarioId ?? null, comissaoTeto: dados.comissaoTeto ?? null })
        .returning(['id', 'nome']).executeTakeFirstOrThrow();
      await auditar(trx, [{ entidade: 'influenciador', entidadeId: i.id, acao: 'criar', para: { nome: i.nome }, autorId: req.usuario.id }]);
      return i;
    });
    res.status(201).json(criado);
  }));

  app.patch('/influenciadores/:id', ...gestao, rota(async (req, res) => {
    const i = await carregarInfluenciador(req.params.id);
    const dados = dadosInfluenciador.partial().parse(req.body);
    if (dados.comissaoTeto !== undefined && !veCifras(req.usuario)) throw new ErroHttp(403, 'O teto de comissão é definido pelos Sócios.');
    if (dados.usuarioId !== undefined) await conferirLogin(dados.usuarioId, i.id);
    const mudancas: Record<string, unknown> = {};
    const linhas: LinhaAuditoria[] = [];
    for (const [campo, novo] of Object.entries(dados)) {
      const bruto = i[campo as keyof typeof i];
      const atual = campo === 'comissaoTeto' ? numero(bruto as string | number | null) : bruto;
      if (atual === novo) continue;
      mudancas[campo] = novo;
      linhas.push({ entidade: 'influenciador', entidadeId: i.id, acao: 'alterar', campo, de: atual, para: novo, autorId: req.usuario.id });
    }
    if (linhas.length) {
      await db.transaction().execute(async (trx) => {
        await trx.updateTable('influenciador').set({ ...mudancas, atualizadoEm: new Date() }).where('id', '=', i.id).execute();
        await auditar(trx, linhas);
      });
    }
    res.json({ ok: true });
  }));

  // ---- Cupons: criados pelos Sócios (a % de comissão é parâmetro deles)
  const dadosCupom = z.object({
    codigo: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{3,20}$/, 'O código tem de 3 a 20 letras ou números, sem espaço.'),
    descontoPct: z.number().min(0).max(100),
    comissaoPct: z.number().min(0).max(100).nullable(),
    validade: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.').nullable(),
    ativo: z.boolean(),
  }).strict();

  app.post('/influenciadores/:id/cupons', ...socio, rota(async (req, res) => {
    const i = await carregarInfluenciador(req.params.id);
    const dados = dadosCupom.partial().required({ codigo: true, descontoPct: true }).omit({ ativo: true }).parse(req.body);
    if (await db.selectFrom('cupom').select('id').where('codigo', '=', dados.codigo).executeTakeFirst()) throw new ErroHttp(409, 'Já existe um cupom com este código.');
    const criado = await db.transaction().execute(async (trx) => {
      const c = await trx.insertInto('cupom').values({
        codigo: dados.codigo, influenciadorId: i.id, descontoPct: dados.descontoPct, comissaoPct: dados.comissaoPct ?? null, validade: dados.validade ?? null,
      }).returning(['id', 'codigo']).executeTakeFirstOrThrow();
      await auditar(trx, [{ entidade: 'cupom', entidadeId: c.id, acao: 'criar', para: { codigo: c.codigo, influenciador: i.nome, descontoPct: dados.descontoPct, comissaoPct: dados.comissaoPct ?? null }, autorId: req.usuario.id }]);
      return c;
    });
    res.status(201).json(criado);
  }));

  app.patch('/cupons/:id', ...socio, rota(async (req, res) => {
    if (!UUID.test(req.params.id)) throw new ErroHttp(404, 'Cupom não encontrado.');
    const c = await db.selectFrom('cupom').selectAll().where('id', '=', req.params.id).executeTakeFirst();
    if (!c) throw new ErroHttp(404, 'Cupom não encontrado.');
    const dados = dadosCupom.partial().parse(req.body);
    if (dados.codigo && dados.codigo !== c.codigo
      && await db.selectFrom('cupom').select('id').where('codigo', '=', dados.codigo).executeTakeFirst()) throw new ErroHttp(409, 'Já existe um cupom com este código.');
    const mudancas: Record<string, unknown> = {};
    const linhas: LinhaAuditoria[] = [];
    for (const [campo, novo] of Object.entries(dados)) {
      const bruto = c[campo as keyof typeof c];
      const atual = campo.endsWith('Pct') ? numero(bruto as string | number | null) : bruto;
      if (atual === novo) continue;
      mudancas[campo] = novo;
      linhas.push({ entidade: 'cupom', entidadeId: c.id, acao: 'alterar', campo, de: atual, para: novo, autorId: req.usuario.id });
    }
    if (linhas.length) {
      await db.transaction().execute(async (trx) => {
        await trx.updateTable('cupom').set({ ...mudancas, atualizadoEm: new Date() }).where('id', '=', c.id).execute();
        await auditar(trx, linhas);
      });
    }
    res.json({ ok: true });
  }));

  /** Para o formulário da venda: diz se o cupom vale hoje, sem expor a comissão. */
  app.get('/cupons/validar', autenticar, exigir('atendimento.ver'), rota(async (req, res) => {
    const { codigo } = z.object({ codigo: z.string().trim().min(1).max(20) }).parse(req.query);
    const cupom = await cupomValido(db, codigo);
    res.json(cupom ? { valido: true, codigo: cupom.codigo, descontoPct: cupom.descontoPct, influenciador: cupom.influenciadorNome } : { valido: false });
  }));

  // ---- Peças enviadas e posts combinados
  app.post('/influenciadores/:id/pecas', ...gestao, rota(async (req, res) => {
    const i = await carregarInfluenciador(req.params.id);
    const dados = z.object({
      descricao: z.string().trim().min(2, 'Descreva a peça.').max(160),
      quantidade: z.number().int().min(1).max(999),
      enviadaEm: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data do envio.'),
      custo: z.number().min(0).max(1_000_000).nullable().optional(),
    }).strict().parse(req.body);
    if (dados.custo !== undefined && dados.custo !== null && !veCifras(req.usuario)) throw new ErroHttp(403, 'O custo das peças é informado pelos Sócios.');
    await db.transaction().execute(async (trx) => {
      const p = await trx.insertInto('pecaEnviada').values({
        influenciadorId: i.id, descricao: dados.descricao, quantidade: dados.quantidade, enviadaEm: dados.enviadaEm, custo: dados.custo ?? null, registradaPor: req.usuario.id,
      }).returning('id').executeTakeFirstOrThrow();
      await auditar(trx, [{ entidade: 'pecaEnviada', entidadeId: p.id, acao: 'criar', para: { influenciador: i.nome, descricao: dados.descricao, quantidade: dados.quantidade }, autorId: req.usuario.id }]);
    });
    res.status(201).json({ ok: true });
  }));

  app.put('/influenciadores/:id/posts', ...gestao, rota(async (req, res) => {
    const i = await carregarInfluenciador(req.params.id);
    const dados = z.object({
      mes: z.string().regex(/^\d{4}-\d{2}$/), combinados: z.number().int().min(0).max(999), feitos: z.number().int().min(0).max(999),
    }).strict().parse(req.body);
    await db.insertInto('combinadoPosts').values({ influenciadorId: i.id, ...dados })
      .onConflict((oc) => oc.columns(['influenciadorId', 'mes']).doUpdateSet({ combinados: dados.combinados, feitos: dados.feitos, atualizadoEm: new Date() })).execute();
    res.json({ ok: true });
  }));

  // ---------------------------------------------------------------- Espaço do influenciador
  // Ele vê só as próprias vendas e a própria comissão. Nenhum dado de cliente sai daqui.
  app.get('/meu-espaco', autenticar, exigir('influenciador.espaco'), rota(async (req, res) => {
    const hoje = hojeEmBrasilia();
    const filtro = z.object({
      inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default(`${hoje.slice(0, 7)}-01`),
      fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default(hoje),
    }).parse(req.query);
    const i = await db.selectFrom('influenciador').selectAll().where('usuarioId', '=', req.usuario.id).executeTakeFirst();
    if (!i) return res.json({ semCadastro: true });

    const inicio = new Date(`${filtro.inicio}T00:00:00-03:00`);
    const fim = new Date(new Date(`${filtro.fim}T00:00:00-03:00`).getTime() + DIA);
    const mes = mesDe(new Date());
    const [cupons, vendas, ganhos, teto] = await Promise.all([
      db.selectFrom('cupom').select(['codigo', 'descontoPct', 'validade', 'ativo']).where('influenciadorId', '=', i.id).orderBy('codigo').execute(),
      db.selectFrom('vendaDireta as v').innerJoin('cupom as c', 'c.id', 'v.cupomId')
        .select(['c.codigo', 'v.valor', 'v.decididaEm'])
        .where('c.influenciadorId', '=', i.id).where('v.situacao', '=', 'CONFIRMADA').where('v.devolvidaEm', 'is', null)
        .where('v.decididaEm', '>=', inicio).where('v.decididaEm', '<', fim).execute(),
      db.selectFrom('ganho').select(['valor', 'valorSemTeto', 'situacao', 'competencia', 'criadoEm'])
        .where('influenciadorId', '=', i.id).where('tipo', '=', 'COMISSAO_INFLUENCIADOR').where('situacao', '!=', 'CANCELADA').execute(),
      (async () => numero(i.comissaoTeto) ?? await parametroNumero(db, 'comissao_influenciador_teto'))(),
    ]);

    const porDia = new Map<string, { dia: string; cupom: string; quantidade: number; valor: number }>();
    for (const v of vendas) {
      const dia = hojeEmBrasilia(new Date(v.decididaEm!));
      const chave = `${dia}|${v.codigo}`;
      const linha = porDia.get(chave) ?? { dia, cupom: v.codigo, quantidade: 0, valor: 0 };
      linha.quantidade += 1; linha.valor = centavos(linha.valor + Number(v.valor));
      porDia.set(chave, linha);
    }
    const soma = (lista: typeof ganhos) => centavos(lista.reduce((s, g) => s + Number(g.valor), 0));
    const doPeriodo = ganhos.filter((g) => g.criadoEm >= inicio && g.criadoEm < fim);
    const doMes = soma(ganhos.filter((g) => g.competencia === mes));
    // Projeção: o ritmo do período até hoje, levado até o fim do período pedido (ou do mês, por padrão).
    const dias = Math.max(1, Math.round((fim.getTime() - inicio.getTime()) / DIA));
    const diasCorridos = Math.max(1, Math.min(dias, Math.ceil((Date.now() - inicio.getTime()) / DIA)));
    const diasDoMes = new Date(Number(filtro.inicio.slice(0, 4)), Number(filtro.inicio.slice(5, 7)), 0).getDate();
    const alvo = filtro.inicio.endsWith('-01') && filtro.fim === hoje ? diasDoMes : dias;
    const comissaoPeriodo = soma(doPeriodo);
    const projecaoBruta = centavos((comissaoPeriodo / diasCorridos) * alvo);

    res.json({
      nome: i.nome, periodo: filtro,
      cupons: cupons.map((c) => ({ codigo: c.codigo, descontoPct: Number(c.descontoPct), validade: c.validade, ativo: c.ativo })),
      vendas: { quantidade: vendas.length, valor: centavos(vendas.reduce((s, v) => s + Number(v.valor), 0)) },
      comissao: { periodo: comissaoPeriodo, mes: doMes, teto, faltaParaOTeto: teto === null ? null : centavos(Math.max(0, teto - doMes)) },
      projecao: vendas.length ? (teto === null ? projecaoBruta : Math.min(projecaoBruta, teto)) : null,
      porDia: [...porDia.values()].sort((a, b) => b.dia.localeCompare(a.dia) || a.cupom.localeCompare(b.cupom)),
      pagamentos: {
        aguardando: soma(ganhos.filter((g) => g.situacao === 'AGUARDANDO')),
        liberadas: soma(ganhos.filter((g) => g.situacao === 'LIBERADA')),
        pagas: soma(ganhos.filter((g) => g.situacao === 'PAGA')),
      },
    });
  }));

  // ---------------------------------------------------------------- Comissão de quem vende (só a própria)
  app.get('/ganhos/meus', autenticar, exigir('ganhos.meus'), rota(async (req, res) => {
    const mes = mesDe(new Date());
    const linhas = await db.selectFrom('ganho').select(['id', 'base', 'pct', 'valor', 'valorSemTeto', 'situacao', 'competencia', 'criadoEm', 'liberarEm'])
      .where('usuarioId', '=', req.usuario.id).where('tipo', '=', 'COMISSAO_VENDEDOR').where('situacao', '!=', 'CANCELADA')
      .orderBy('criadoEm', 'desc').limit(200).execute();
    const teto = numero(req.usuario.comissaoTeto) ?? await parametroNumero(db, 'comissao_vendedor_teto');
    const doMes = centavos(linhas.filter((l) => l.competencia === mes).reduce((s, l) => s + Number(l.valor), 0));
    res.json({
      mes, comissaoDoMes: doMes, teto, faltaParaOTeto: teto === null ? null : centavos(Math.max(0, teto - doMes)),
      linhas: linhas.map((l) => ({ ...l, base: Number(l.base), pct: Number(l.pct), valor: Number(l.valor), valorSemTeto: Number(l.valorSemTeto) })),
    });
  }));

  // ---------------------------------------------------------------- Financeiro (Sócios)
  app.get('/financeiro/resumo', autenticar, exigir('financeiro.ver'), rota(async (_req, res) => {
    const mes = mesDe(new Date());
    const [ganhos, divisao, prazoTroca] = await Promise.all([
      db.selectFrom('ganho as g').leftJoin('usuario as u', 'u.id', 'g.usuarioId').leftJoin('influenciador as i', 'i.id', 'g.influenciadorId')
        .leftJoin('vendaDireta as v', 'v.id', 'g.vendaDiretaId').leftJoin('cliente as c', 'c.id', 'v.clienteId')
        .select(['g.id', 'g.tipo', 'g.base', 'g.pct', 'g.valor', 'g.valorSemTeto', 'g.situacao', 'g.competencia', 'g.liberarEm', 'g.criadoEm', 'g.pagaEm',
          'u.nome as vendedor', 'i.nome as influenciador', 'c.nome as cliente'])
        .where('g.situacao', '!=', 'CANCELADA').orderBy('g.criadoEm', 'desc').limit(500).execute(),
      parametroNumero(db, 'prolabore_divisao_fundador_pct'),
      parametroNumero(db, 'prazo_troca_dias'),
    ]);
    const n = (g: (typeof ganhos)[number]) => ({
      id: g.id, tipo: g.tipo, base: Number(g.base), pct: Number(g.pct), valor: Number(g.valor), valorSemTeto: Number(g.valorSemTeto), situacao: g.situacao,
      competencia: g.competencia, liberarEm: g.liberarEm, criadoEm: g.criadoEm, pagaEm: g.pagaEm, cliente: g.cliente,
      quem: g.tipo === 'COMISSAO_VENDEDOR' ? g.vendedor : g.influenciador,
    });
    const soma = (lista: typeof ganhos) => centavos(lista.reduce((s, g) => s + Number(g.valor), 0));
    const comissoes = ganhos.filter((g) => g.tipo !== 'PRO_LABORE');
    const proLabore = soma(ganhos.filter((g) => g.tipo === 'PRO_LABORE' && g.competencia === mes));
    res.json({
      mes, prazoTrocaDefinido: prazoTroca !== null,
      // As chaves abaixo são ids de fichas do dicionário de métricas.
      pro_labore: proLabore,
      comissao_mes: soma(comissoes.filter((g) => g.competencia === mes)),
      comissoes_pagas: soma(comissoes.filter((g) => g.situacao === 'PAGA' && g.pagaEm !== null && mesDe(new Date(g.pagaEm)) === mes)),
      proLaboreDivisao: divisao === null ? null : { fundador: centavos((proLabore * divisao) / 100), cofundador: centavos(proLabore - (proLabore * divisao) / 100) },
      aPagar: comissoes.filter((g) => g.situacao === 'LIBERADA').map(n),
      aguardando: comissoes.filter((g) => g.situacao === 'AGUARDANDO').map(n),
      totalAPagar: soma(comissoes.filter((g) => g.situacao === 'LIBERADA')),
      totalAguardando: soma(comissoes.filter((g) => g.situacao === 'AGUARDANDO')),
    });
  }));

  async function carregarComissao(id: string, situacao: 'AGUARDANDO' | 'LIBERADA') {
    if (!UUID.test(id)) throw new ErroHttp(404, 'Comissão não encontrada.');
    const g = await db.selectFrom('ganho').selectAll().where('id', '=', id).executeTakeFirst();
    if (!g || g.tipo === 'PRO_LABORE') throw new ErroHttp(404, 'Comissão não encontrada.');
    if (g.situacao !== situacao) throw new ErroHttp(409, situacao === 'LIBERADA' ? 'Só dá para pagar uma comissão liberada.' : 'Esta comissão não está aguardando.');
    return g;
  }

  /** Liberar antes do prazo (ou sem prazo definido) é decisão dos Sócios, e fica na auditoria. */
  app.post('/ganhos/:id/liberar', autenticar, exigir('financeiro.ver'), rota(async (req, res) => {
    const g = await carregarComissao(req.params.id, 'AGUARDANDO');
    const quando = new Date();
    await db.transaction().execute(async (trx) => {
      await trx.updateTable('ganho').set({ situacao: 'LIBERADA', liberadaEm: quando, atualizadoEm: quando }).where('id', '=', g.id).execute();
      await auditar(trx, [{ entidade: 'ganho', entidadeId: g.id, acao: 'liberar', campo: 'situacao', de: 'AGUARDANDO', para: 'LIBERADA', autorId: req.usuario.id }]);
    });
    res.json({ ok: true });
  }));

  app.post('/ganhos/:id/pagar', autenticar, exigir('financeiro.ver'), rota(async (req, res) => {
    const g = await carregarComissao(req.params.id, 'LIBERADA');
    const quando = new Date();
    await db.transaction().execute(async (trx) => {
      await trx.updateTable('ganho').set({ situacao: 'PAGA', pagaEm: quando, pagaPor: req.usuario.id, atualizadoEm: quando }).where('id', '=', g.id).execute();
      await auditar(trx, [{ entidade: 'ganho', entidadeId: g.id, acao: 'pagar', campo: 'situacao', de: 'LIBERADA', para: { situacao: 'PAGA', valor: Number(g.valor) }, autorId: req.usuario.id }]);
    });
    res.json({ ok: true });
  }));

  // ---------------------------------------------------------------- Rotina do dia (cron externo)
  app.post('/rotinas/dia', rota(async (req, res) => {
    const enviado = Buffer.from(String(req.headers['x-rotina-segredo'] ?? ''));
    const esperado = Buffer.from(rotinaSegredo ?? '');
    if (!rotinaSegredo || enviado.length !== esperado.length || !timingSafeEqual(enviado, esperado)) throw new ErroHttp(401, 'Rotina não autorizada.');
    const liberadas = await liberarGanhosVencidos(db);
    const sequencias = await gerarSequencias(db);
    const feito = { comissoesLiberadas: liberadas, tarefasDeRecompra: sequencias.recompra, tarefasDeEmRisco: sequencias.emRisco };
    await auditar(db, [{ entidade: 'rotina', entidadeId: 'dia', acao: 'executar', para: feito, autorId: null }]);
    res.json(feito);
  }));
}
