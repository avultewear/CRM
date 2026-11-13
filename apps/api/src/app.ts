import bcrypt from 'bcryptjs';
import cors from 'cors';
import express, { type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import jwt from 'jsonwebtoken';
import { z, ZodError } from 'zod';
import { registrarAtendimento } from './atendimento.js';
import { comoJson, type Banco } from './banco.js';
import { ErroHttp, type LinhaAuditoria, type Pedido, type Usuario } from './http.js';
import { metricasPara } from './metricas.js';
import { PAPEIS, permissoesDe, pode } from './papeis.js';
import { CATALOGO_PARAMETROS, definicaoDe, validarParametro } from './parametros.js';


const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const numero = (v: string | number | null) => (v === null ? null : Number(v));
// Campos que são cifras dos Sócios: o Gerente não vê nem altera.
const CAMPOS_CIFRA = ['comissaoPct', 'comissaoTeto', 'limiteDescontoPct'] as const;
// Regra 7: metas são dos Sócios. O Gerente vê a meta de cada pessoa, mas não altera.
const CAMPOS_SO_SOCIO = [...CAMPOS_CIFRA, 'metaMensal'] as const;
const HASH_FALSO = bcrypt.hashSync('senha-que-nunca-confere', 4);

function publico(u: Usuario, verCifras: boolean) {
  const base = {
    id: u.id, nome: u.nome, email: u.email, papel: u.papel, funcao: u.funcao, vende: u.vende, ativo: u.ativo,
    metaMensal: numero(u.metaMensal), codigoVendedor: u.codigoVendedor, editaEstoque: u.editaEstoque, criadoEm: u.criadoEm,
  };
  if (!verCifras) return base;
  return {
    ...base, comissaoPct: numero(u.comissaoPct), comissaoTeto: numero(u.comissaoTeto),
    limiteDescontoPct: numero(u.limiteDescontoPct),
  };
}

const pct = z.number().min(0).max(100).nullable();
const moeda = z.number().min(0).nullable();
const dadosPessoa = z.object({
  nome: z.string().trim().min(2),
  email: z.string().trim().toLowerCase().email(),
  senha: z.string().min(8, 'A senha precisa de pelo menos 8 caracteres.'),
  papel: z.enum(PAPEIS),
  funcao: z.string().trim().max(80).nullable(),
  vende: z.boolean(),
  ativo: z.boolean(),
  metaMensal: moeda,
  comissaoPct: pct,
  comissaoTeto: moeda,
  limiteDescontoPct: pct,
  editaEstoque: z.boolean(),
  codigoVendedor: z.string().trim().toUpperCase()
    .regex(/^[A-Z0-9]{3,12}$/, 'O código do vendedor tem de 3 a 12 letras ou números.').nullable(),
}).strict();
const novaPessoa = dadosPessoa.partial().required({ nome: true, email: true, senha: true, papel: true }).omit({ ativo: true });
const alteracaoPessoa = dadosPessoa.partial();

export function criarApp({ db, jwtSegredo, origemWeb }: { db: Banco; jwtSegredo: string; origemWeb: string }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: origemWeb }));
  app.use(express.json({ limit: '100kb' }));

  // Express 4 não captura erro de função assíncrona sozinho.
  const rota = (fn: (req: Pedido, res: Response) => Promise<unknown>): RequestHandler =>
    (req, res, next) => { fn(req as Pedido, res).catch(next); };

  const autenticar: RequestHandler = (req, _res, next) => {
    (async () => {
      const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
      if (!token) throw new ErroHttp(401, 'Entre para continuar.');
      let id: string;
      try {
        id = (jwt.verify(token, jwtSegredo) as { sub: string }).sub;
      } catch {
        throw new ErroHttp(401, 'Sessão inválida ou expirada.');
      }
      const usuario = await db.selectFrom('usuario').selectAll().where('id', '=', id).executeTakeFirst();
      if (!usuario || !usuario.ativo) throw new ErroHttp(401, 'Sessão inválida ou expirada.');
      (req as Pedido).usuario = usuario;
    })().then(() => next(), next);
  };

  const exigir = (permissao: string): RequestHandler => (req, _res, next) => {
    next(pode((req as Pedido).usuario.papel, permissao) ? undefined : new ErroHttp(403, 'Seu papel não tem acesso a isto.'));
  };

  const auditar = (
    banco: Banco, linhas: LinhaAuditoria[],
  ) => linhas.length === 0 ? Promise.resolve() : banco.insertInto('auditoria').values(linhas.map((l) => ({
    entidade: l.entidade, entidadeId: l.entidadeId, acao: l.acao, campo: l.campo ?? null, autorId: l.autorId,
    de: l.de === undefined || l.de === null ? null : comoJson(l.de),
    para: l.para === undefined || l.para === null ? null : comoJson(l.para),
  }))).execute().then(() => undefined);

  app.get('/saude', (_req, res) => { res.json({ ok: true }); });

  // Freio contra adivinhação de senha: 8 erros seguidos no mesmo e-mail travam a entrada por 15 minutos.
  const LIMITE_ERROS = 8;
  const JANELA_MS = 15 * 60 * 1000;
  const erros = new Map<string, { quantos: number; ate: number }>();
  const travado = (email: string) => {
    const e = erros.get(email);
    if (e && e.ate <= Date.now()) erros.delete(email);
    return (erros.get(email)?.quantos ?? 0) >= LIMITE_ERROS;
  };
  const contarErro = (email: string) => {
    const e = erros.get(email);
    erros.set(email, { quantos: (e?.quantos ?? 0) + 1, ate: e?.ate ?? Date.now() + JANELA_MS });
    if (erros.size > 5000) erros.clear();
  };

  // ---- Login
  app.post('/auth/login', rota(async (req, res) => {
    const { email, senha } = z.object({ email: z.string().trim().toLowerCase(), senha: z.string() }).parse(req.body);
    if (travado(email)) throw new ErroHttp(429, 'Muitas tentativas. Aguarde 15 minutos e tente de novo.');
    const usuario = await db.selectFrom('usuario').selectAll().where('email', '=', email).executeTakeFirst();
    const confere = await bcrypt.compare(senha, usuario?.senhaHash ?? HASH_FALSO);
    if (!usuario || !usuario.ativo || !confere) {
      contarErro(email);
      throw new ErroHttp(401, 'E-mail ou senha incorretos.');
    }
    erros.delete(email);
    const token = jwt.sign({ sub: usuario.id }, jwtSegredo, { expiresIn: '12h' });
    res.json({ token, usuario: publico(usuario, true), permissoes: permissoesDe(usuario.papel) });
  }));

  app.get('/auth/eu', autenticar, rota(async (req, res) => {
    // Cada pessoa vê a própria comissão.
    res.json({ usuario: publico(req.usuario, true), permissoes: permissoesDe(req.usuario.papel) });
  }));

  // ---- Equipe
  app.get('/equipe', autenticar, exigir('equipe.ver'), rota(async (req, res) => {
    const pessoas = await db.selectFrom('usuario').selectAll().orderBy('nome').execute();
    const verCifras = pode(req.usuario.papel, 'cifras.ver');
    res.json(pessoas.map((u) => publico(u, verCifras)));
  }));

  /** O Gerente cuida da equipe, mas não mexe em Sócios nem nas cifras. */
  function barrarGerente(autor: Usuario, dados: Record<string, unknown>, alvo?: Usuario) {
    if (pode(autor.papel, 'cifras.ver')) return;
    if (alvo?.papel === 'SOCIO' || dados.papel === 'SOCIO') throw new ErroHttp(403, 'Só um Sócio cadastra ou altera Sócios.');
    if (CAMPOS_SO_SOCIO.some((campo) => campo in dados)) throw new ErroHttp(403, 'Meta, comissão, teto e limite de desconto são definidos pelos Sócios.');
  }

  /** O código do vendedor entra nos links de compra: não pode repetir. */
  async function exigirCodigoLivre(codigo: string | null | undefined, menosId?: string) {
    if (!codigo) return;
    const dono = await db.selectFrom('usuario').select('id').where('codigoVendedor', '=', codigo).executeTakeFirst();
    if (dono && dono.id !== menosId) throw new ErroHttp(409, 'Já existe uma pessoa com este código de vendedor.');
  }

  app.post('/equipe', autenticar, exigir('equipe.editar'), rota(async (req, res) => {
    const dados = novaPessoa.parse(req.body);
    barrarGerente(req.usuario, dados);
    if (await db.selectFrom('usuario').select('id').where('email', '=', dados.email).executeTakeFirst()) {
      throw new ErroHttp(409, 'Já existe uma pessoa com este e-mail.');
    }
    await exigirCodigoLivre(dados.codigoVendedor);
    const { senha, ...resto } = dados;
    const senhaHash = await bcrypt.hash(senha, 10);
    const criada = await db.transaction().execute(async (trx) => {
      const u = await trx.insertInto('usuario').values({
        funcao: null, metaMensal: null, comissaoPct: null, comissaoTeto: null, limiteDescontoPct: null,
        codigoVendedor: null, ...resto, senhaHash,
      }).returningAll().executeTakeFirstOrThrow();
      await auditar(trx, [{
        entidade: 'usuario', entidadeId: u.id, acao: 'criar', autorId: req.usuario.id,
        para: { nome: u.nome, email: u.email, papel: u.papel },
      }]);
      return u;
    });
    res.status(201).json(publico(criada, pode(req.usuario.papel, 'cifras.ver')));
  }));

  app.patch('/equipe/:id', autenticar, exigir('equipe.editar'), rota(async (req, res) => {
    if (!UUID.test(req.params.id)) throw new ErroHttp(404, 'Pessoa não encontrada.');
    const alvo = await db.selectFrom('usuario').selectAll().where('id', '=', req.params.id).executeTakeFirst();
    if (!alvo) throw new ErroHttp(404, 'Pessoa não encontrada.');
    const dados = alteracaoPessoa.parse(req.body);
    barrarGerente(req.usuario, dados, alvo);
    if (dados.ativo === false && alvo.id === req.usuario.id) throw new ErroHttp(400, 'Você não pode desativar a si mesmo.');
    if (dados.email && dados.email !== alvo.email
      && await db.selectFrom('usuario').select('id').where('email', '=', dados.email).executeTakeFirst()) {
      throw new ErroHttp(409, 'Já existe uma pessoa com este e-mail.');
    }
    if (dados.codigoVendedor !== alvo.codigoVendedor) await exigirCodigoLivre(dados.codigoVendedor, alvo.id);

    const { senha, ...campos } = dados;
    const mudancas: Record<string, unknown> = {};
    const linhas: Parameters<typeof auditar>[1] = [];
    const registro = { entidade: 'usuario', entidadeId: alvo.id, acao: 'alterar', autorId: req.usuario.id };
    for (const [campo, novo] of Object.entries(campos)) {
      const bruto = alvo[campo as keyof Usuario];
      const atual = typeof novo === 'number' && bruto !== null ? Number(bruto) : bruto;
      if (atual === novo) continue;
      mudancas[campo] = novo;
      linhas.push({ ...registro, campo, de: atual, para: novo });
    }
    if (senha) {
      mudancas.senhaHash = await bcrypt.hash(senha, 10);
      // A auditoria registra que a senha mudou, nunca a senha nem o hash.
      linhas.push({ ...registro, campo: 'senha', para: 'alterada' });
    }
    if (linhas.length === 0) return res.json(publico(alvo, pode(req.usuario.papel, 'cifras.ver')));

    const salvo = await db.transaction().execute(async (trx) => {
      const u = await trx.updateTable('usuario').set({ ...mudancas, atualizadoEm: new Date() })
        .where('id', '=', alvo.id).returningAll().executeTakeFirstOrThrow();
      await auditar(trx, linhas);
      return u;
    });
    res.json(publico(salvo, pode(req.usuario.papel, 'cifras.ver')));
  }));

  // ---- Parâmetros (Metas): só Sócios, sempre com justificativa e histórico
  app.get('/parametros', autenticar, exigir('metas.ver'), rota(async (_req, res) => {
    const atuais = new Map((await db.selectFrom('parametro').selectAll().execute()).map((l) => [l.chave, l]));
    res.json(CATALOGO_PARAMETROS.map((def) => ({
      ...def, valor: atuais.get(def.chave)?.valor ?? null, atualizadoEm: atuais.get(def.chave)?.atualizadoEm ?? null,
    })));
  }));

  app.put('/parametros/:chave', autenticar, exigir('metas.editar'), rota(async (req, res) => {
    const { chave } = req.params;
    if (!definicaoDe(chave)) throw new ErroHttp(404, 'Parâmetro fora do catálogo.');
    const { valor, justificativa } = z.object({
      valor: z.unknown(),
      justificativa: z.string({ required_error: 'Toda mudança precisa de uma justificativa.' }).trim()
        .min(5, 'Escreva uma justificativa com pelo menos 5 caracteres.'),
    }).parse(req.body);
    const validacao = validarParametro(chave, valor);
    if (!validacao.ok) throw new ErroHttp(400, validacao.erro ?? 'Valor inválido.');

    await db.transaction().execute(async (trx) => {
      const atual = await trx.selectFrom('parametro').selectAll().where('chave', '=', chave).forUpdate().executeTakeFirst();
      const anterior = atual?.valor ?? null;
      if (atual) {
        await trx.updateTable('parametro').set({ valor: comoJson(valor), atualizadoEm: new Date() }).where('chave', '=', chave).execute();
      } else {
        await trx.insertInto('parametro').values({ chave, valor: comoJson(valor) }).execute();
      }
      await trx.insertInto('historicoParametro').values({
        chave, valorAnterior: anterior === null ? null : comoJson(anterior), valorNovo: comoJson(valor),
        justificativa, autorId: req.usuario.id,
      }).execute();
      await auditar(trx, [{ entidade: 'parametro', entidadeId: chave, acao: 'alterar', campo: 'valor', de: anterior, para: valor, autorId: req.usuario.id }]);
    });
    res.json({ chave, valor });
  }));

  app.get('/parametros/:chave/historico', autenticar, exigir('metas.ver'), rota(async (req, res) => {
    if (!definicaoDe(req.params.chave)) throw new ErroHttp(404, 'Parâmetro fora do catálogo.');
    const linhas = await db.selectFrom('historicoParametro as h').innerJoin('usuario as u', 'u.id', 'h.autorId')
      .select(['h.valorAnterior', 'h.valorNovo', 'h.justificativa', 'h.criadoEm', 'u.nome as autor'])
      .where('h.chave', '=', req.params.chave).orderBy('h.criadoEm', 'desc').execute();
    res.json(linhas);
  }));

  // ---- Dicionário de métricas: cada papel recebe só as fichas que pode ver
  app.get('/metricas', autenticar, exigir('metricas.ver'), rota(async (req, res) => {
    res.json(metricasPara(req.usuario.papel));
  }));

  // ---- Auditoria (consulta)
  app.get('/auditoria', autenticar, exigir('auditoria.ver'), rota(async (req, res) => {
    const filtro = z.object({
      entidade: z.string().optional(), entidadeId: z.string().optional(),
      limite: z.coerce.number().int().min(1).max(200).default(50),
    }).parse(req.query);
    let consulta = db.selectFrom('auditoria as a').leftJoin('usuario as u', 'u.id', 'a.autorId')
      .select(['a.id', 'a.entidade', 'a.entidadeId', 'a.acao', 'a.campo', 'a.de', 'a.para', 'a.criadoEm'])
      .select((eb) => eb.fn.coalesce('u.nome', eb.val('Sistema')).as('autor'))
      .orderBy('a.criadoEm', 'desc').orderBy('a.id').limit(filtro.limite);
    if (filtro.entidade) consulta = consulta.where('a.entidade', '=', filtro.entidade);
    if (filtro.entidadeId) consulta = consulta.where('a.entidadeId', '=', filtro.entidadeId);
    res.json(await consulta.execute());
  }));

  registrarAtendimento(app, { db, rota, autenticar, exigir, auditar });

  app.use((_req, _res, next) => next(new ErroHttp(404, 'Rota não encontrada.')));

  app.use((erro: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (erro instanceof ErroHttp) return res.status(erro.status).json({ erro: erro.message, ...erro.extra });
    if (erro instanceof ZodError) return res.status(400).json({ erro: erro.issues[0]?.message ?? 'Dados inválidos.', detalhes: erro.issues });
    if (erro instanceof SyntaxError) return res.status(400).json({ erro: 'Corpo da requisição inválido.' });
    console.error(erro);
    res.status(500).json({ erro: 'Erro interno.' });
  });

  return app;
}
