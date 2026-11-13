import { sql } from 'kysely';
import type { Express } from 'express';
import type { Selectable } from 'kysely';
import { z } from 'zod';
import { comoJson, type Banco, type Etapa, type TabelaCliente, type TabelaOportunidade } from './banco.js';
import { mediana } from './calculo.js';
import { cupomValido, gerarGanhos } from './ganhos.js';
import { aoConfirmarVenda, quemIndicou } from './clientes.js';
import { ErroHttp, type Ferramentas, type LinhaAuditoria, type Usuario } from './http.js';
import { pode } from './papeis.js';

type Oportunidade = Selectable<TabelaOportunidade>;
type Cliente = Selectable<TabelaCliente>;

// ---------------------------------------------------------------- Regras fixas da jornada

export const ETAPAS: Array<{ id: Etapa; nome: string; fase: string; criterio: string }> = [
  { id: 'LEAD', nome: 'Lead', fase: 'Pré-venda', criterio: 'Oportunidade criada, com origem registrada' },
  { id: 'ABORDADO', nome: 'Abordado', fase: 'Pré-venda', criterio: 'Uma pessoa da loja respondeu (resposta de robô não conta)' },
  { id: 'LEVANTAMENTO', nome: 'Levantamento', fase: 'Pré-venda', criterio: 'Produto de interesse e tamanho registrados' },
  { id: 'NEGOCIACAO', nome: 'Negociação', fase: 'Venda', criterio: 'Link de compra enviado ou venda direta lançada' },
  { id: 'VENDA', nome: 'Venda', fase: 'Fechamento', criterio: 'Pedido pago no site, ou venda direta confirmada pelos Sócios' },
  { id: 'RECUPERACAO', nome: 'Recuperação de carrinho', fase: 'Recuperação', criterio: 'Carrinho abandonado no site ou perda com destino Recuperação' },
];
/** Ordem em que a jornada avança. A Recuperação fica fora: entra-se nela por uma perda. */
const ORDEM: Etapa[] = ['LEAD', 'ABORDADO', 'LEVANTAMENTO', 'NEGOCIACAO', 'VENDA'];
const nomeEtapa = (id: string) => ETAPAS.find((e) => e.id === id)?.nome ?? id;

export type Destino = 'RECUPERACAO' | 'ENCERRADA' | 'NAO_CONTA';
/** Cada motivo tem um destino fixo: quem marca a perda não escolhe o destino. */
export const MOTIVOS: Array<{ id: string; nome: string; destino: Destino; efeito: string; bloqueia?: boolean }> = [
  { id: 'SEM_RESPOSTA', nome: 'Sem resposta', destino: 'RECUPERACAO', efeito: 'Entra na sequência de follow' },
  { id: 'ACHOU_CARO', nome: 'Achou caro', destino: 'RECUPERACAO', efeito: 'Recebe promoção ou cupom' },
  { id: 'SEM_TAMANHO_OU_MODELO', nome: 'Sem tamanho ou modelo', destino: 'RECUPERACAO', efeito: 'É avisado quando voltar ao estoque' },
  { id: 'PAGAMENTO_NAO_CONCLUIDO', nome: 'Pagamento não concluído', destino: 'RECUPERACAO', efeito: 'Recebe o lembrete para concluir' },
  { id: 'COMPROU_EM_OUTRO_LUGAR', nome: 'Comprou em outro lugar', destino: 'ENCERRADA', efeito: 'Fecha a oportunidade' },
  { id: 'SEM_INTERESSE', nome: 'Sem interesse', destino: 'ENCERRADA', efeito: 'Fecha a oportunidade' },
  { id: 'NAO_ERA_CLIENTE', nome: 'Não era cliente (engano, número errado, cadastro errado)', destino: 'NAO_CONTA', efeito: 'Sai das conversões' },
  { id: 'PEDIU_PARA_NAO_SER_CONTATADO', nome: 'Pediu para não ser contatado', destino: 'ENCERRADA', efeito: 'Bloqueia o cliente para sempre', bloqueia: true },
];
const motivoPorId = (id: string) => MOTIVOS.find((m) => m.id === id);

export const CANAIS = [
  { id: 'WHATSAPP', nome: 'WhatsApp' }, { id: 'INSTAGRAM', nome: 'Instagram' },
  { id: 'SITE', nome: 'Site' }, { id: 'MANUAL', nome: 'Outro (cadastro à mão)' },
] as const;
export const ORIGENS = [
  { id: 'ANUNCIO', nome: 'Anúncio' }, { id: 'POST', nome: 'Post orgânico' }, { id: 'INFLUENCIADOR', nome: 'Influenciador' },
  { id: 'INDICACAO', nome: 'Indicação' }, { id: 'ORGANICO', nome: 'Chegou sozinho' }, { id: 'OUTRO', nome: 'Outro' },
] as const;

/** Mensagens prontas do follow. O sistema preenche os espaços; a IA não entra aqui e nenhum valor em R$ aparece. */
const MENSAGENS: Record<string, string> = {
  LINK_SEM_COMPRA: 'Oi, {nome}! Conseguiu ver o link que te mandei? Se ficou alguma dúvida de tamanho ou de pagamento, é só me falar.',
  SEM_RESPOSTA: 'Oi, {nome}! Passando para saber se ainda posso te ajudar com {interesse}.',
  ACHOU_CARO: 'Oi, {nome}! Lembrei de você: posso te avisar quando {interesse} entrar em promoção?',
  SEM_TAMANHO_OU_MODELO: 'Oi, {nome}! Assim que {interesse} voltar ao estoque no seu tamanho eu te aviso por aqui, combinado?',
  PAGAMENTO_NAO_CONCLUIDO: 'Oi, {nome}! Vi que o pagamento não foi concluído. Quer que eu te mande o link de novo?',
};
/** Prazos do follow, em horas. Não vieram do prompt: ficam aqui, num lugar só, para os Sócios confirmarem. */
export const FOLLOW_PRIMEIRO_HORAS = 24;
export const FOLLOW_SEGUINTE_HORAS = 48;

// ---------------------------------------------------------------- Funções puras (testadas à parte)

/** Só dígitos, com o código do país. Número brasileiro sem o 55 ganha o 55. */
export function normalizarTelefone(texto: string): string | null {
  let d = texto.replace(/\D/g, '');
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  return /^\d{12,15}$/.test(d) ? d : null;
}

export function cpfValido(texto: string): boolean {
  const d = texto.replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const digito = (ate: number) => {
    let soma = 0;
    for (let i = 0; i < ate; i++) soma += Number(d[i]) * (ate + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return digito(9) === Number(d[9]) && digito(10) === Number(d[10]);
}

/** Regra 5: o CPF aparece mascarado em todas as telas. */
export const mascararCpf = (cpf: string | null) => (cpf ? `***.***.***-${cpf.slice(-2)}` : null);

/** O que falta para a oportunidade entrar na etapa seguinte. Lista vazia = pode avançar. */
export function oQueFalta(o: Pick<Oportunidade, 'etapa' | 'primeiraRespostaEm' | 'interesse' | 'tamanho' | 'linkEnviadoEm'>): { proxima: Etapa | null; falta: string[] } {
  const i = ORDEM.indexOf(o.etapa);
  const proxima = i >= 0 && i < ORDEM.length - 1 ? ORDEM[i + 1] : null;
  if (!proxima) return { proxima: null, falta: [] };
  const falta: string[] = [];
  if (proxima === 'ABORDADO' && !o.primeiraRespostaEm) falta.push('Registrar que uma pessoa da loja respondeu');
  if (proxima === 'LEVANTAMENTO') {
    if (!o.interesse) falta.push('Informar o produto de interesse');
    if (!o.tamanho) falta.push('Informar o tamanho');
  }
  if (proxima === 'NEGOCIACAO' && !o.linkEnviadoEm) falta.push('Enviar o link de compra ou lançar a venda direta');
  if (proxima === 'VENDA') falta.push('A venda entra pelo pedido pago no site ou pela venda direta confirmada pelos Sócios');
  return { proxima, falta };
}

const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] ?? nome;
const preencher = (modelo: string, c: { nome: string }, o: { interesse: string | null }) =>
  modelo.replace('{nome}', primeiroNome(c.nome)).replace('{interesse}', o.interesse ?? 'a peça que você viu');
const numero = (v: string | number | null) => (v === null ? null : Number(v));
const emHoras = (ms: number) => ms / 3_600_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------- Rotas

export function registrarAtendimento(app: Express, { db, rota, autenticar, exigir, auditar }: Ferramentas) {
  const ver = [autenticar, exigir('atendimento.ver')];
  const veTodos = (u: Usuario) => pode(u.papel, 'atendimento.todos');

  async function parametroNumero(chave: string, banco: Banco = db): Promise<number | null> {
    const linha = await banco.selectFrom('parametro').select('valor').where('chave', '=', chave).executeTakeFirst();
    return typeof linha?.valor === 'number' ? linha.valor : null;
  }

  /** Carrega a oportunidade se a pessoa pode vê-la: o vendedor só enxerga as próprias. */
  async function carregar(id: string, usuario: Usuario, banco: Banco = db) {
    if (!UUID.test(id)) throw new ErroHttp(404, 'Oportunidade não encontrada.');
    const o = await banco.selectFrom('oportunidade').selectAll().where('id', '=', id).executeTakeFirst();
    if (!o || (!veTodos(usuario) && o.vendedorId !== usuario.id)) throw new ErroHttp(404, 'Oportunidade não encontrada.');
    const c = await banco.selectFrom('cliente').selectAll().where('id', '=', o.clienteId).executeTakeFirstOrThrow();
    return { o, c };
  }

  function vista(o: Oportunidade, c: Cliente, vendedorNome: string | null, limiteHoras: number | null) {
    const horasNaEtapa = emHoras(Date.now() - new Date(o.entrouNaEtapaEm).getTime());
    const { proxima, falta } = oQueFalta(o);
    return {
      id: o.id, etapa: o.etapa, situacao: o.situacao, tipo: o.tipo, canal: o.canal, origem: o.origem, origemDetalhe: o.origemDetalhe,
      interesse: o.interesse, tamanho: o.tamanho, quantidade: o.quantidade, valor: numero(o.valor), cupom: o.cupom,
      linkEnviadoEm: o.linkEnviadoEm, temperatura: o.temperatura, etiquetas: o.etiquetas, primeiraRespostaEm: o.primeiraRespostaEm,
      motivoPerda: o.motivoPerda, destinoPerda: o.destinoPerda, tentativasRecuperacao: o.tentativasRecuperacao,
      vendedorId: o.vendedorId, vendedorNome, entrouNaEtapaEm: o.entrouNaEtapaEm, criadoEm: o.criadoEm,
      horasNaEtapa: Math.round(horasNaEtapa * 10) / 10,
      parado: o.situacao === 'ABERTA' && o.etapa !== 'VENDA' && limiteHoras !== null && horasNaEtapa > limiteHoras,
      proximaEtapa: proxima, falta,
      cliente: {
        id: c.id, nome: c.nome, telefone: c.telefone, email: c.email, cpf: mascararCpf(c.cpf), temCpf: c.cpf !== null,
        bloqueado: c.bloqueado, aceiteMensagens: c.aceiteMensagens,
      },
    };
  }

  /** Muda de etapa gravando o histórico: fecha a passagem atual e abre a nova. */
  async function mover(trx: Banco, o: Oportunidade, para: Etapa, autorId: string, quando: Date) {
    await trx.updateTable('historicoEtapa').set({ saiuEm: quando, atualizadoEm: quando })
      .where('oportunidadeId', '=', o.id).where('saiuEm', 'is', null).execute();
    await trx.insertInto('historicoEtapa').values({ oportunidadeId: o.id, etapaAnterior: o.etapa, etapaNova: para, entrouEm: quando, autorId }).execute();
    await trx.updateTable('oportunidade').set({ etapa: para, entrouNaEtapaEm: quando, atualizadoEm: quando }).where('id', '=', o.id).execute();
    o.etapa = para;
  }

  /** Leva até a etapa-alvo passando por todas as do caminho, para as conversões fecharem. */
  async function avancarAte(trx: Banco, o: Oportunidade, alvo: Etapa, autorId: string, quando: Date) {
    if (o.etapa === 'RECUPERACAO') return mover(trx, o, alvo, autorId, quando);
    for (let i = ORDEM.indexOf(o.etapa) + 1; i <= ORDEM.indexOf(alvo); i++) await mover(trx, o, ORDEM[i], autorId, quando);
  }

  const cancelarFollows = (trx: Banco, oportunidadeId: string, quando: Date) =>
    trx.updateTable('atividade').set({ status: 'CANCELADA', concluidaEm: quando, atualizadoEm: quando })
      .where('oportunidadeId', '=', oportunidadeId).where('tipo', '=', 'FOLLOW').where('status', '=', 'ABERTA').execute();

  /** Follow como tarefa: mensagem pronta para o vendedor enviar. Cliente bloqueado nunca gera follow (regra 8). */
  async function criarFollow(trx: Banco, o: Oportunidade, c: Cliente, situacao: string, horas: number, autorId: string, quando: Date) {
    if (c.bloqueado) return;
    const responsavelId = o.vendedorId ?? autorId;
    await trx.insertInto('atividade').values({
      tipo: 'FOLLOW', oportunidadeId: o.id, responsavelId,
      titulo: situacao === 'LINK_SEM_COMPRA' ? `Follow do link: ${c.nome}` : `Recuperação: ${c.nome}`,
      mensagem: preencher(MENSAGENS[situacao] ?? MENSAGENS.SEM_RESPOSTA, c, o),
      prazo: new Date(quando.getTime() + horas * 3_600_000),
    }).execute();
  }

  /** Rodízio: o lead novo vai para o vendedor disponível que está há mais tempo sem receber um. */
  async function proximoDoRodizio(trx: Banco): Promise<string | null> {
    const vendedores = await trx.selectFrom('usuario as u')
      .leftJoin('oportunidade as o', 'o.vendedorId', 'u.id')
      .select(['u.id', 'u.nome'])
      .select((eb) => eb.fn.max('o.criadoEm').as('ultimo'))
      .where('u.vende', '=', true).where('u.ativo', '=', true)
      .groupBy(['u.id', 'u.nome']).execute();
    vendedores.sort((a, b) => {
      const ta = a.ultimo ? new Date(a.ultimo).getTime() : 0;
      const tb = b.ultimo ? new Date(b.ultimo).getTime() : 0;
      return ta - tb || a.nome.localeCompare(b.nome, 'pt-BR');
    });
    return vendedores[0]?.id ?? null;
  }

  /** Aplica a perda conforme o destino fixo do motivo. */
  async function perder(trx: Banco, o: Oportunidade, c: Cliente, motivoId: string, autorId: string, quando: Date) {
    const motivo = motivoPorId(motivoId);
    if (!motivo) throw new ErroHttp(400, 'Motivo de perda fora da lista.');
    if (o.situacao !== 'ABERTA' || o.etapa === 'VENDA') throw new ErroHttp(409, 'Esta oportunidade já foi fechada.');
    if (motivo.destino === 'RECUPERACAO' && o.etapa === 'RECUPERACAO') throw new ErroHttp(409, 'Esta oportunidade já está em Recuperação.');
    const etapaDaPerda = o.etapa === 'RECUPERACAO' ? (o.etapaAntesRecuperacao ?? o.etapa) : o.etapa;
    const linhas: LinhaAuditoria[] = [{
      entidade: 'oportunidade', entidadeId: o.id, acao: 'perder', campo: 'motivoPerda', autorId,
      de: o.motivoPerda, para: { motivo: motivo.id, destino: motivo.destino, etapa: etapaDaPerda },
    }];
    await cancelarFollows(trx, o.id, quando);
    const comum = { motivoPerda: motivo.id, destinoPerda: motivo.destino, perdidaEm: quando, etapaDaPerda, atualizadoEm: quando };

    if (motivo.destino === 'RECUPERACAO') {
      await trx.updateTable('oportunidade').set({ ...comum, etapaAntesRecuperacao: o.etapa, tentativasRecuperacao: 0 }).where('id', '=', o.id).execute();
      await mover(trx, o, 'RECUPERACAO', autorId, quando);
      await criarFollow(trx, o, c, motivo.id, FOLLOW_PRIMEIRO_HORAS, autorId, quando);
    } else {
      await trx.updateTable('oportunidade')
        .set({ ...comum, situacao: motivo.destino === 'NAO_CONTA' ? 'DESCARTADA' : 'ENCERRADA' }).where('id', '=', o.id).execute();
      await trx.updateTable('historicoEtapa').set({ saiuEm: quando, atualizadoEm: quando })
        .where('oportunidadeId', '=', o.id).where('saiuEm', 'is', null).execute();
      await trx.updateTable('atividade').set({ status: 'CANCELADA', concluidaEm: quando, atualizadoEm: quando })
        .where('oportunidadeId', '=', o.id).where('status', '=', 'ABERTA').execute();
    }
    if (motivo.bloqueia && !c.bloqueado) {
      await trx.updateTable('cliente').set({ bloqueado: true, aceiteMensagens: false, atualizadoEm: quando }).where('id', '=', c.id).execute();
      // Bloqueio vale para sempre e para tudo: cancela os follows de qualquer outra oportunidade do cliente.
      await trx.updateTable('atividade').set({ status: 'CANCELADA', concluidaEm: quando, atualizadoEm: quando })
        .where('tipo', '=', 'FOLLOW').where('status', '=', 'ABERTA')
        .where('oportunidadeId', 'in', trx.selectFrom('oportunidade').select('id').where('clienteId', '=', c.id)).execute();
      linhas.push({ entidade: 'cliente', entidadeId: c.id, acao: 'bloquear', campo: 'bloqueado', de: false, para: true, autorId });
    }
    await auditar(trx, linhas);
  }

  // ---- Configuração da jornada: as telas não repetem estas listas
  app.get('/atendimento/config', ...ver, rota(async (_req, res) => {
    res.json({ etapas: ETAPAS, motivos: MOTIVOS, canais: CANAIS, origens: ORIGENS });
  }));

  // ---- Quadro: oportunidades abertas e as ganhas nos últimos 30 dias
  app.get('/oportunidades', ...ver, rota(async (req, res) => {
    const filtro = z.object({ vendedorId: z.string().regex(UUID).optional(), busca: z.string().trim().max(80).optional() }).parse(req.query);
    const trintaDias = new Date(Date.now() - 30 * 24 * 3_600_000);
    let consulta = db.selectFrom('oportunidade as o').innerJoin('cliente as c', 'c.id', 'o.clienteId')
      .leftJoin('usuario as u', 'u.id', 'o.vendedorId')
      .selectAll('o')
      .select(['c.nome as cNome', 'c.telefone as cTelefone', 'c.email as cEmail', 'c.cpf as cCpf', 'c.bloqueado as cBloqueado',
        'c.aceiteMensagens as cAceite', 'u.nome as vendedorNome'])
      .where((eb) => eb.or([
        eb('o.situacao', '=', 'ABERTA'),
        eb.and([eb('o.situacao', '=', 'GANHA'), eb('o.entrouNaEtapaEm', '>=', trintaDias)]),
      ]))
      .orderBy('o.entrouNaEtapaEm', 'asc');
    if (!veTodos(req.usuario)) consulta = consulta.where('o.vendedorId', '=', req.usuario.id);
    else if (filtro.vendedorId) consulta = consulta.where('o.vendedorId', '=', filtro.vendedorId);
    if (filtro.busca) {
      const termo = `%${filtro.busca}%`;
      const digitos = filtro.busca.replace(/\D/g, '');
      consulta = consulta.where((eb) => eb.or([
        eb('c.nome', 'ilike', termo),
        ...(digitos.length >= 3 ? [eb('c.telefone', 'like', `%${digitos}%`)] : []),
      ]));
    }
    const limite = await parametroNumero('tempo_maximo_etapa_horas');
    const linhas = await consulta.execute();
    res.json(linhas.map((l) => vista(l, {
      id: l.clienteId, nome: l.cNome, telefone: l.cTelefone, email: l.cEmail, cpf: l.cCpf, bloqueado: l.cBloqueado,
      aceiteMensagens: l.cAceite,
    } as Cliente, l.vendedorNome, limite)));
  }));

  // ---- Novo lead (cadastro à mão): o mesmo telefone nunca vira cadastro duplicado
  const novoLead = z.object({
    nome: z.string().trim().min(2, 'Informe o nome.').max(120),
    telefone: z.string().trim().min(8, 'Informe o telefone.').max(30),
    canal: z.enum(['WHATSAPP', 'INSTAGRAM', 'SITE', 'MANUAL']),
    origem: z.enum(['ANUNCIO', 'POST', 'INFLUENCIADOR', 'INDICACAO', 'ORGANICO', 'OUTRO'], { required_error: 'Informe a origem do lead.' }),
    origemDetalhe: z.string().trim().max(160).nullable().optional(),
    interesse: z.string().trim().max(160).nullable().optional(),
    tamanho: z.string().trim().max(20).nullable().optional(),
    vendedorId: z.string().regex(UUID).nullable().optional(),
  }).strict();

  app.post('/oportunidades', ...ver, rota(async (req, res) => {
    const dados = novoLead.parse(req.body);
    const telefone = normalizarTelefone(dados.telefone);
    if (!telefone) throw new ErroHttp(400, 'Telefone inválido. Informe o DDD e o número.');
    const quando = new Date();

    const resultado = await db.transaction().execute(async (trx) => {
      const inserido = await trx.insertInto('cliente').values({ nome: dados.nome, telefone })
        .onConflict((oc) => oc.column('telefone').doNothing()).returning('id').executeTakeFirst();
      const c = await trx.selectFrom('cliente').selectAll().where('telefone', '=', telefone).executeTakeFirstOrThrow();
      const clienteJaExistia = !inserido;

      // Quem fica com o lead: escolha da gestão > vendedor que já atende o cliente > quem cadastrou (se vende) > rodízio.
      let vendedorId: string | null = null;
      const ativoQueVende = async (id: string) =>
        (await trx.selectFrom('usuario').select('id').where('id', '=', id).where('ativo', '=', true).where('vende', '=', true).executeTakeFirst())?.id ?? null;
      if (dados.vendedorId && veTodos(req.usuario)) {
        vendedorId = await ativoQueVende(dados.vendedorId);
        if (!vendedorId) throw new ErroHttp(400, 'A pessoa escolhida não está ativa ou não vende.');
      }
      if (!vendedorId && c.vendedorId) vendedorId = await ativoQueVende(c.vendedorId);
      if (!vendedorId && req.usuario.vende) vendedorId = req.usuario.id;
      if (!vendedorId) vendedorId = await proximoDoRodizio(trx);
      if (vendedorId && c.vendedorId !== vendedorId) {
        await trx.updateTable('cliente').set({ vendedorId, atualizadoEm: quando }).where('id', '=', c.id).execute();
      }

      const o = await trx.insertInto('oportunidade').values({
        clienteId: c.id, vendedorId, canal: dados.canal, origem: dados.origem, origemDetalhe: dados.origemDetalhe ?? null,
        interesse: dados.interesse || null, tamanho: dados.tamanho || null, entrouNaEtapaEm: quando, criadoEm: quando,
      }).returningAll().executeTakeFirstOrThrow();
      await trx.insertInto('historicoEtapa').values({ oportunidadeId: o.id, etapaAnterior: null, etapaNova: 'LEAD', entrouEm: quando, autorId: req.usuario.id }).execute();
      const linhas: LinhaAuditoria[] = [{
        entidade: 'oportunidade', entidadeId: o.id, acao: 'criar', autorId: req.usuario.id,
        para: { cliente: c.nome, canal: o.canal, origem: o.origem, vendedorId },
      }];
      if (!clienteJaExistia) linhas.push({ entidade: 'cliente', entidadeId: c.id, acao: 'criar', autorId: req.usuario.id, para: { nome: c.nome } });
      await auditar(trx, linhas);
      const vendedorNome = vendedorId
        ? (await trx.selectFrom('usuario').select('nome').where('id', '=', vendedorId).executeTakeFirst())?.nome ?? null : null;
      return { o, c, clienteJaExistia, vendedorNome };
    });

    res.status(201).json({
      oportunidade: vista(resultado.o, resultado.c, resultado.vendedorNome, null),
      clienteJaExistia: resultado.clienteJaExistia,
      // O lead pode ter ido para outra pessoa (cliente que já tem vendedor, ou rodízio).
      comOutraPessoa: resultado.o.vendedorId !== req.usuario.id && !veTodos(req.usuario),
    });
  }));

  // ---- Detalhe do lead (painel lateral)
  app.get('/oportunidades/:id', ...ver, rota(async (req, res) => {
    const { o, c } = await carregar(req.params.id, req.usuario);
    const [vendedor, historico, notas, atividades, vendas, limite] = await Promise.all([
      o.vendedorId ? db.selectFrom('usuario').select('nome').where('id', '=', o.vendedorId).executeTakeFirst() : undefined,
      db.selectFrom('historicoEtapa as h').leftJoin('usuario as u', 'u.id', 'h.autorId')
        .select(['h.etapaAnterior', 'h.etapaNova', 'h.entrouEm', 'h.saiuEm', 'u.nome as autor'])
        .where('h.oportunidadeId', '=', o.id).orderBy('h.entrouEm').orderBy('h.criadoEm').execute(),
      db.selectFrom('nota as n').innerJoin('usuario as u', 'u.id', 'n.autorId')
        .select(['n.id', 'n.texto', 'n.criadoEm', 'u.nome as autor']).where('n.oportunidadeId', '=', o.id).orderBy('n.criadoEm', 'desc').execute(),
      db.selectFrom('atividade').select(['id', 'tipo', 'titulo', 'mensagem', 'prazo', 'status', 'resultado'])
        .where('oportunidadeId', '=', o.id).orderBy('prazo', 'desc').execute(),
      db.selectFrom('vendaDireta').select(['id', 'itens', 'valorTabela', 'valor', 'formaPagamento', 'situacao', 'criadoEm', 'motivoRecusa'])
        .where('oportunidadeId', '=', o.id).orderBy('criadoEm', 'desc').execute(),
      parametroNumero('tempo_maximo_etapa_horas'),
    ]);
    res.json({
      ...vista(o, c, vendedor?.nome ?? null, limite),
      // Passagens feitas no mesmo instante (link direto, venda direta) saem na ordem da jornada.
      historico: historico
        .sort((x, y) => new Date(x.entrouEm).getTime() - new Date(y.entrouEm).getTime()
          || ORDEM.indexOf(x.etapaNova as Etapa) - ORDEM.indexOf(y.etapaNova as Etapa))
        .map((h) => ({ ...h, etapaNovaNome: nomeEtapa(h.etapaNova), etapaAnteriorNome: h.etapaAnterior ? nomeEtapa(h.etapaAnterior) : null })),
      notas, atividades,
      vendasDiretas: vendas.map((v) => ({ ...v, valorTabela: Number(v.valorTabela), valor: Number(v.valor) })),
    });
  }));

  // ---- Editar os dados do levantamento
  const edicao = z.object({
    interesse: z.string().trim().max(160).nullable(),
    tamanho: z.string().trim().max(20).nullable(),
    quantidade: z.number().int().min(1).max(999).nullable(),
    valor: z.number().min(0).max(1_000_000).nullable(),
    temperatura: z.enum(['FRIA', 'MORNA', 'QUENTE']).nullable(),
    etiquetas: z.array(z.string().trim().min(1).max(30)).max(10),
    origemDetalhe: z.string().trim().max(160).nullable(),
    vendedorId: z.string().regex(UUID),
  }).partial().strict();

  app.patch('/oportunidades/:id', ...ver, rota(async (req, res) => {
    const { o, c } = await carregar(req.params.id, req.usuario);
    const dados = edicao.parse(req.body);
    if (dados.vendedorId !== undefined && !veTodos(req.usuario)) throw new ErroHttp(403, 'Só a gestão passa um lead para outra pessoa.');
    const mudancas: Record<string, unknown> = {};
    const linhas: LinhaAuditoria[] = [];
    for (const [campo, novoBruto] of Object.entries(dados)) {
      const novo = novoBruto === '' ? null : novoBruto;
      const bruto = o[campo as keyof Oportunidade];
      const atual = campo === 'valor' ? numero(bruto as string | number | null) : bruto;
      if (JSON.stringify(atual) === JSON.stringify(novo)) continue;
      mudancas[campo] = novo;
      linhas.push({ entidade: 'oportunidade', entidadeId: o.id, acao: 'alterar', campo, de: atual, para: novo, autorId: req.usuario.id });
    }
    if (linhas.length) {
      await db.transaction().execute(async (trx) => {
        await trx.updateTable('oportunidade').set({ ...mudancas, atualizadoEm: new Date() }).where('id', '=', o.id).execute();
        if (dados.vendedorId) {
          await trx.updateTable('cliente').set({ vendedorId: dados.vendedorId, atualizadoEm: new Date() }).where('id', '=', c.id).execute();
          await trx.updateTable('atividade').set({ responsavelId: dados.vendedorId }).where('oportunidadeId', '=', o.id).where('status', '=', 'ABERTA').execute();
        }
        await auditar(trx, linhas);
      });
    }
    res.json({ ok: true });
  }));

  // ---- Uma pessoa da loja respondeu (critério da etapa Abordado)
  app.post('/oportunidades/:id/resposta', ...ver, rota(async (req, res) => {
    const { o } = await carregar(req.params.id, req.usuario);
    if (o.situacao !== 'ABERTA') throw new ErroHttp(409, 'Esta oportunidade já foi fechada.');
    if (!o.primeiraRespostaEm) {
      const quando = new Date();
      await db.transaction().execute(async (trx) => {
        await trx.updateTable('oportunidade').set({ primeiraRespostaEm: quando, atualizadoEm: quando }).where('id', '=', o.id).execute();
        await auditar(trx, [{ entidade: 'oportunidade', entidadeId: o.id, acao: 'alterar', campo: 'primeiraRespostaEm', de: null, para: quando.toISOString(), autorId: req.usuario.id }]);
      });
    }
    res.json({ ok: true });
  }));

  // ---- Avançar: só para a etapa seguinte, e só com o critério cumprido
  app.post('/oportunidades/:id/avancar', ...ver, rota(async (req, res) => {
    const { o } = await carregar(req.params.id, req.usuario);
    if (o.situacao !== 'ABERTA') throw new ErroHttp(409, 'Esta oportunidade já foi fechada.');
    const pedida = z.object({ para: z.string().optional() }).parse(req.body ?? {}).para;
    const { proxima, falta } = oQueFalta(o);
    if (!proxima) throw new ErroHttp(422, o.etapa === 'RECUPERACAO' ? 'Na Recuperação, registre a resposta do cliente no follow.' : 'Esta oportunidade já está na última etapa.');
    if (pedida && pedida !== proxima) throw new ErroHttp(422, `Não se pula etapa: a próxima é ${nomeEtapa(proxima)}.`, { proxima });
    if (falta.length) throw new ErroHttp(422, `Falta para entrar em ${nomeEtapa(proxima)}: ${falta.join('; ')}.`, { proxima, falta });
    const quando = new Date();
    await db.transaction().execute(async (trx) => {
      const de = o.etapa;
      await mover(trx, o, proxima, req.usuario.id, quando);
      await auditar(trx, [{ entidade: 'oportunidade', entidadeId: o.id, acao: 'avancar', campo: 'etapa', de, para: proxima, autorId: req.usuario.id }]);
    });
    res.json({ etapa: proxima });
  }));

  // ---- Enviar link de compra: preenche Levantamento e Negociação de uma vez
  const envioLink = z.object({
    interesse: z.string().trim().min(2, 'Informe o produto.').max(160),
    tamanho: z.string().trim().min(1, 'Informe o tamanho.').max(20),
    quantidade: z.number().int().min(1).max(999),
    valor: z.number().min(0).max(1_000_000).nullable().optional(),
    cupom: z.string().trim().max(40).nullable().optional(),
  }).strict();

  app.post('/oportunidades/:id/link', ...ver, rota(async (req, res) => {
    const { o, c } = await carregar(req.params.id, req.usuario);
    if (o.situacao !== 'ABERTA' || o.etapa === 'VENDA') throw new ErroHttp(409, 'Esta oportunidade já foi fechada.');
    const dados = envioLink.parse(req.body);
    const quando = new Date();
    await db.transaction().execute(async (trx) => {
      const de = o.etapa;
      const campos = {
        interesse: dados.interesse, tamanho: dados.tamanho, quantidade: dados.quantidade, valor: dados.valor ?? null,
        cupom: dados.cupom || null, linkEnviadoEm: quando, primeiraRespostaEm: o.primeiraRespostaEm ?? quando,
        motivoPerda: null, destinoPerda: null, atualizadoEm: quando,
      };
      await trx.updateTable('oportunidade').set(campos).where('id', '=', o.id).execute();
      Object.assign(o, campos);
      await avancarAte(trx, o, 'NEGOCIACAO', req.usuario.id, quando);
      await cancelarFollows(trx, o.id, quando);
      await criarFollow(trx, o, c, 'LINK_SEM_COMPRA', FOLLOW_PRIMEIRO_HORAS, req.usuario.id, quando);
      await auditar(trx, [{
        entidade: 'oportunidade', entidadeId: o.id, acao: 'enviar_link', campo: 'etapa', de, para: 'NEGOCIACAO', autorId: req.usuario.id,
      }]);
    });
    res.json({ etapa: 'NEGOCIACAO' });
  }));

  // ---- Perdido: o motivo decide o destino
  app.post('/oportunidades/:id/perder', ...ver, rota(async (req, res) => {
    const { o, c } = await carregar(req.params.id, req.usuario);
    const { motivo } = z.object({ motivo: z.string({ required_error: 'Escolha o motivo da perda.' }) }).parse(req.body);
    await db.transaction().execute((trx) => perder(trx, o, c, motivo, req.usuario.id, new Date()));
    res.json({ destino: motivoPorId(motivo)!.destino });
  }));

  // ---- Notas da negociação (só da equipe)
  app.post('/oportunidades/:id/notas', ...ver, rota(async (req, res) => {
    const { o } = await carregar(req.params.id, req.usuario);
    const { texto } = z.object({ texto: z.string().trim().min(1, 'Escreva a nota.').max(2000) }).parse(req.body);
    await db.insertInto('nota').values({ oportunidadeId: o.id, autorId: req.usuario.id, texto }).execute();
    res.status(201).json({ ok: true });
  }));

  // ---- Cliente: dados cadastrais, aceite de mensagens e CPF
  const edicaoCliente = z.object({
    nome: z.string().trim().min(2).max(120),
    email: z.string().trim().toLowerCase().email('E-mail inválido.').nullable(),
    cpf: z.string().trim(),
    aceiteMensagens: z.boolean(),
  }).partial().strict();

  async function carregarCliente(id: string, usuario: Usuario) {
    if (!UUID.test(id)) throw new ErroHttp(404, 'Cliente não encontrado.');
    const c = await db.selectFrom('cliente').selectAll().where('id', '=', id).executeTakeFirst();
    if (!c) throw new ErroHttp(404, 'Cliente não encontrado.');
    if (!veTodos(usuario)) {
      const meu = await db.selectFrom('oportunidade').select('id').where('clienteId', '=', id).where('vendedorId', '=', usuario.id).executeTakeFirst();
      if (!meu) throw new ErroHttp(404, 'Cliente não encontrado.');
    }
    return c;
  }

  async function gravarCpf(trx: Banco, c: Cliente, texto: string, autorId: string) {
    if (!cpfValido(texto)) throw new ErroHttp(400, 'CPF inválido.');
    const cpf = texto.replace(/\D/g, '');
    if (c.cpf === cpf) return;
    const dono = await trx.selectFrom('cliente').select('id').where('cpf', '=', cpf).executeTakeFirst();
    if (dono && dono.id !== c.id) throw new ErroHttp(409, 'Este CPF já está em outro cadastro.');
    await trx.updateTable('cliente').set({ cpf, atualizadoEm: new Date() }).where('id', '=', c.id).execute();
    // A auditoria registra que o CPF foi informado, nunca o número.
    await auditar(trx, [{ entidade: 'cliente', entidadeId: c.id, acao: 'alterar', campo: 'cpf', de: c.cpf ? 'informado' : null, para: 'informado', autorId }]);
    c.cpf = cpf;
  }

  app.patch('/clientes/:id', ...ver, rota(async (req, res) => {
    const c = await carregarCliente(req.params.id, req.usuario);
    const dados = edicaoCliente.parse(req.body);
    const quando = new Date();
    await db.transaction().execute(async (trx) => {
      const mudancas: Record<string, unknown> = {};
      const linhas: LinhaAuditoria[] = [];
      const registro = { entidade: 'cliente', entidadeId: c.id, acao: 'alterar', autorId: req.usuario.id };
      if (dados.nome !== undefined && dados.nome !== c.nome) { mudancas.nome = dados.nome; linhas.push({ ...registro, campo: 'nome', de: c.nome, para: dados.nome }); }
      if (dados.email !== undefined && dados.email !== c.email) { mudancas.email = dados.email; linhas.push({ ...registro, campo: 'email', de: c.email, para: dados.email }); }
      if (dados.aceiteMensagens !== undefined && dados.aceiteMensagens !== c.aceiteMensagens) {
        if (dados.aceiteMensagens && c.bloqueado) throw new ErroHttp(409, 'Este cliente pediu para não ser contatado. O bloqueio vale para sempre.');
        mudancas.aceiteMensagens = dados.aceiteMensagens;
        mudancas.aceiteEm = dados.aceiteMensagens ? quando : null;
        mudancas.aceiteCanal = dados.aceiteMensagens ? 'atendimento' : null;
        linhas.push({ ...registro, campo: 'aceiteMensagens', de: c.aceiteMensagens, para: dados.aceiteMensagens });
      }
      if (Object.keys(mudancas).length) await trx.updateTable('cliente').set({ ...mudancas, atualizadoEm: quando }).where('id', '=', c.id).execute();
      await auditar(trx, linhas);
      if (dados.cpf !== undefined) await gravarCpf(trx, c, dados.cpf, req.usuario.id);
    });
    res.json({ ok: true });
  }));

  /** CPF completo: só Sócios, e cada acesso fica na auditoria (regra 5). */
  app.get('/clientes/:id/cpf', autenticar, exigir('cpf.ver'), rota(async (req, res) => {
    const c = await carregarCliente(req.params.id, req.usuario);
    await auditar(db, [{ entidade: 'cliente', entidadeId: c.id, acao: 'ver_cpf', campo: 'cpf', autorId: req.usuario.id }]);
    res.json({ cpf: c.cpf });
  }));

  // ---- Atividades (tarefas): follow e lembretes
  app.get('/atividades', ...ver, rota(async (req, res) => {
    // A tarefa de sequência é do cliente; as outras chegam a ele pela oportunidade.
    let consulta = db.selectFrom('atividade as a').leftJoin('oportunidade as o', 'o.id', 'a.oportunidadeId')
      .leftJoin('cliente as c', (j) => j.on(sql<boolean>`c.id = coalesce(o.cliente_id, a.cliente_id)`)).innerJoin('usuario as u', 'u.id', 'a.responsavelId')
      .select(['a.id', 'a.tipo', 'a.titulo', 'a.mensagem', 'a.prazo', 'a.status', 'a.oportunidadeId', 'a.responsavelId', 'a.sequencia', 'a.clienteId',
        'u.nome as responsavel', 'c.nome as clienteNome', 'c.telefone as clienteTelefone'])
      .where('a.status', '=', 'ABERTA').orderBy('a.prazo').limit(200);
    if (!veTodos(req.usuario)) consulta = consulta.where('a.responsavelId', '=', req.usuario.id);
    res.json(await consulta.execute());
  }));

  app.post('/oportunidades/:id/lembretes', ...ver, rota(async (req, res) => {
    const { o, c } = await carregar(req.params.id, req.usuario);
    const dados = z.object({
      titulo: z.string().trim().min(2, 'Descreva o lembrete.').max(160),
      prazo: z.coerce.date({ errorMap: () => ({ message: 'Informe a data do lembrete.' }) }),
    }).parse(req.body);
    await db.insertInto('atividade').values({
      tipo: 'LEMBRETE', oportunidadeId: o.id, responsavelId: o.vendedorId ?? req.usuario.id,
      titulo: `${dados.titulo} (${c.nome})`, prazo: dados.prazo,
    }).execute();
    res.status(201).json({ ok: true });
  }));

  async function carregarAtividade(id: string, usuario: Usuario) {
    if (!UUID.test(id)) throw new ErroHttp(404, 'Tarefa não encontrada.');
    const a = await db.selectFrom('atividade').selectAll().where('id', '=', id).executeTakeFirst();
    if (!a || (!veTodos(usuario) && a.responsavelId !== usuario.id)) throw new ErroHttp(404, 'Tarefa não encontrada.');
    if (a.status !== 'ABERTA') throw new ErroHttp(409, 'Esta tarefa já foi concluída.');
    return a;
  }

  app.post('/atividades/:id/adiar', ...ver, rota(async (req, res) => {
    const a = await carregarAtividade(req.params.id, req.usuario);
    const { prazo } = z.object({ prazo: z.coerce.date() }).parse(req.body);
    if (prazo.getTime() <= Date.now()) throw new ErroHttp(400, 'O novo prazo precisa ser no futuro.');
    await db.transaction().execute(async (trx) => {
      await trx.updateTable('atividade').set({ prazo, atualizadoEm: new Date() }).where('id', '=', a.id).execute();
      await auditar(trx, [{ entidade: 'atividade', entidadeId: a.id, acao: 'adiar', campo: 'prazo', de: a.prazo, para: prazo, autorId: req.usuario.id }]);
    });
    res.json({ ok: true });
  }));

  /**
   * Concluir uma tarefa. No follow, o resultado conduz a jornada:
   * respondeu → a sequência para e, na Recuperação, o lead volta para a etapa em que estava;
   * sem resposta → nova tentativa, até o número de tentativas definido em Metas; depois, encerra.
   */
  app.post('/atividades/:id/concluir', ...ver, rota(async (req, res) => {
    const a = await carregarAtividade(req.params.id, req.usuario);
    const { resultado } = z.object({ resultado: z.enum(['FEITA', 'RESPONDEU', 'SEM_RESPOSTA']) }).parse(req.body);
    if (a.tipo !== 'FOLLOW' && resultado !== 'FEITA') throw new ErroHttp(400, 'Lembrete só pode ser marcado como feito.');
    if (a.tipo === 'FOLLOW' && resultado === 'FEITA') throw new ErroHttp(400, 'No follow, diga se o cliente respondeu ou não.');
    const quando = new Date();
    let efeito = 'Tarefa concluída.';
    await db.transaction().execute(async (trx) => {
      await trx.updateTable('atividade').set({ status: 'FEITA', resultado, concluidaEm: quando, atualizadoEm: quando }).where('id', '=', a.id).execute();
      const linhas: LinhaAuditoria[] = [{ entidade: 'atividade', entidadeId: a.id, acao: 'concluir', campo: 'resultado', para: resultado, autorId: req.usuario.id }];
      if (a.tipo === 'FOLLOW' && a.oportunidadeId) {
        const o = await trx.selectFrom('oportunidade').selectAll().where('id', '=', a.oportunidadeId).executeTakeFirstOrThrow();
        const c = await trx.selectFrom('cliente').selectAll().where('id', '=', o.clienteId).executeTakeFirstOrThrow();
        if (o.situacao === 'ABERTA' && resultado === 'RESPONDEU') {
          if (o.etapa === 'RECUPERACAO') {
            const volta = (o.etapaAntesRecuperacao ?? 'NEGOCIACAO') as Etapa;
            await trx.updateTable('oportunidade').set({ motivoPerda: null, destinoPerda: null, etapaAntesRecuperacao: null, atualizadoEm: quando }).where('id', '=', o.id).execute();
            await mover(trx, o, volta, req.usuario.id, quando);
            linhas.push({ entidade: 'oportunidade', entidadeId: o.id, acao: 'recuperar', campo: 'etapa', de: 'RECUPERACAO', para: volta, autorId: req.usuario.id });
            efeito = `O cliente respondeu: o lead voltou para ${nomeEtapa(volta)}.`;
          } else {
            efeito = 'O cliente respondeu: a sequência de follow parou.';
          }
        }
        if (o.situacao === 'ABERTA' && resultado === 'SEM_RESPOSTA') {
          if (o.etapa !== 'RECUPERACAO') {
            await perder(trx, o, c, 'SEM_RESPOSTA', req.usuario.id, quando);
            efeito = 'Sem resposta: o lead foi para a Recuperação.';
          } else {
            const tentativas = o.tentativasRecuperacao + 1;
            const limite = await parametroNumero('recuperacao_tentativas', trx);
            await trx.updateTable('oportunidade').set({ tentativasRecuperacao: tentativas, atualizadoEm: quando }).where('id', '=', o.id).execute();
            if (limite !== null && tentativas >= limite) {
              await trx.updateTable('oportunidade').set({ situacao: 'ENCERRADA', atualizadoEm: quando }).where('id', '=', o.id).execute();
              await trx.updateTable('historicoEtapa').set({ saiuEm: quando, atualizadoEm: quando }).where('oportunidadeId', '=', o.id).where('saiuEm', 'is', null).execute();
              linhas.push({ entidade: 'oportunidade', entidadeId: o.id, acao: 'encerrar', campo: 'situacao', de: 'ABERTA', para: 'ENCERRADA', autorId: req.usuario.id });
              efeito = `Sem resposta depois de ${tentativas} tentativas: a oportunidade foi encerrada.`;
            } else {
              await criarFollow(trx, o, c, o.motivoPerda ?? 'SEM_RESPOSTA', FOLLOW_SEGUINTE_HORAS, req.usuario.id, quando);
              efeito = `Sem resposta: nova tentativa criada (tentativa ${tentativas + 1}).`;
            }
          }
        }
      }
      await auditar(trx, linhas);
    });
    res.json({ efeito });
  }));

  // ---- Venda direta (Pix ou dinheiro): o vendedor lança, os Sócios confirmam
  const lancamento = z.object({
    itens: z.array(z.object({
      descricao: z.string().trim().min(2, 'Descreva a peça.').max(160),
      quantidade: z.number().int().min(1).max(999),
      precoTabela: z.number().min(0).max(1_000_000),
      preco: z.number().min(0).max(1_000_000),
    }).strict()).min(1, 'Informe pelo menos uma peça.').max(30),
    formaPagamento: z.enum(['PIX', 'DINHEIRO']),
    cpf: z.string().trim().optional(),
    cupom: z.string().trim().max(20).nullable().optional(),
    indicacao: z.string().trim().max(20).nullable().optional(),
  }).strict();

  app.post('/oportunidades/:id/venda-direta', ...ver, rota(async (req, res) => {
    const { o, c } = await carregar(req.params.id, req.usuario);
    if (o.situacao !== 'ABERTA' || o.etapa === 'VENDA') throw new ErroHttp(409, 'Esta oportunidade já foi fechada.');
    const dados = lancamento.parse(req.body);
    const centavos = (v: number) => Math.round(v * 100);
    const valorTabela = dados.itens.reduce((s, i) => s + centavos(i.precoTabela) * i.quantidade, 0) / 100;
    const valor = dados.itens.reduce((s, i) => s + centavos(i.preco) * i.quantidade, 0) / 100;
    const descontoPct = valorTabela > 0 ? (1 - valor / valorTabela) * 100 : 0;

    // Cupom de influenciador: liga a venda a ele e autoriza o desconto do próprio cupom.
    const cupom = dados.cupom ? await cupomValido(db, dados.cupom) : null;
    if (dados.cupom && !cupom) throw new ErroHttp(400, 'Cupom inválido, inativo ou vencido.');

    // Limite de desconto: o do vendedor ou, na falta, o padrão de Metas. Um Sócio pode lançar acima do limite.
    if (!pode(req.usuario.papel, 'cifras.ver')) {
      const vendedor = o.vendedorId ? await db.selectFrom('usuario').select('limiteDescontoPct').where('id', '=', o.vendedorId).executeTakeFirst() : undefined;
      const limite = numero(vendedor?.limiteDescontoPct ?? null) ?? await parametroNumero('limite_desconto_pct');
      const permitido = limite === null ? null : Math.max(limite, cupom?.descontoPct ?? 0);
      if (permitido !== null && descontoPct > permitido + 1e-9) throw new ErroHttp(422, 'Desconto acima do limite. Um Sócio pode liberar.');
    }
    if (!dados.cpf && !c.cpf) throw new ErroHttp(422, 'Informe o CPF do cliente: ele é obrigatório na venda.');
    const indicadoPorId = dados.indicacao ? await quemIndicou(db, dados.indicacao, c.id) : null;
    const quando = new Date();
    const venda = await db.transaction().execute(async (trx) => {
      if (dados.cpf) await gravarCpf(trx, c, dados.cpf, req.usuario.id);
      const aguardando = await trx.selectFrom('vendaDireta').select('id').where('oportunidadeId', '=', o.id).where('situacao', '=', 'AGUARDANDO').executeTakeFirst();
      if (aguardando) throw new ErroHttp(409, 'Já existe uma venda direta desta oportunidade aguardando confirmação.');
      const v = await trx.insertInto('vendaDireta').values({
        oportunidadeId: o.id, clienteId: c.id, vendedorId: o.vendedorId, itens: comoJson(dados.itens), valorTabela, valor,
        formaPagamento: dados.formaPagamento, lancadaPor: req.usuario.id, cupomId: cupom?.id ?? null, indicadoPorId,
      }).returning('id').executeTakeFirstOrThrow();
      const de = o.etapa;
      const campos = {
        interesse: o.interesse ?? dados.itens.map((i) => i.descricao).join(', ').slice(0, 160),
        tamanho: o.tamanho, quantidade: dados.itens.reduce((s, i) => s + i.quantidade, 0), valor,
        linkEnviadoEm: o.linkEnviadoEm ?? quando, primeiraRespostaEm: o.primeiraRespostaEm ?? quando,
        motivoPerda: null, destinoPerda: null, atualizadoEm: quando,
      };
      await trx.updateTable('oportunidade').set(campos).where('id', '=', o.id).execute();
      Object.assign(o, campos);
      if (o.etapa !== 'NEGOCIACAO') await avancarAte(trx, o, 'NEGOCIACAO', req.usuario.id, quando);
      await cancelarFollows(trx, o.id, quando);
      await auditar(trx, [{
        entidade: 'vendaDireta', entidadeId: v.id, acao: 'lancar', autorId: req.usuario.id,
        para: { oportunidadeId: o.id, valor, formaPagamento: dados.formaPagamento, etapaAnterior: de },
      }]);
      return v;
    });
    res.status(201).json({ id: venda.id, valor, descontoPct: Math.round(descontoPct * 10) / 10 });
  }));

  app.get('/vendas-diretas', ...ver, rota(async (req, res) => {
    const { situacao } = z.object({ situacao: z.enum(['AGUARDANDO', 'CONFIRMADA', 'CANCELADA']).default('AGUARDANDO') }).parse(req.query);
    let consulta = db.selectFrom('vendaDireta as v').innerJoin('cliente as c', 'c.id', 'v.clienteId')
      .leftJoin('usuario as u', 'u.id', 'v.vendedorId').innerJoin('usuario as l', 'l.id', 'v.lancadaPor').leftJoin('cupom as k', 'k.id', 'v.cupomId')
      .select(['v.id', 'v.oportunidadeId', 'v.itens', 'v.valorTabela', 'v.valor', 'v.formaPagamento', 'v.situacao', 'v.criadoEm',
        'c.nome as clienteNome', 'u.nome as vendedorNome', 'l.nome as lancadaPorNome', 'k.codigo as cupom'])
      .where('v.situacao', '=', situacao).orderBy('v.criadoEm').limit(200);
    if (!veTodos(req.usuario)) consulta = consulta.where('v.vendedorId', '=', req.usuario.id);
    res.json((await consulta.execute()).map((v) => ({ ...v, valorTabela: Number(v.valorTabela), valor: Number(v.valor) })));
  }));

  async function vendaAguardando(id: string) {
    if (!UUID.test(id)) throw new ErroHttp(404, 'Venda não encontrada.');
    const v = await db.selectFrom('vendaDireta').selectAll().where('id', '=', id).executeTakeFirst();
    if (!v) throw new ErroHttp(404, 'Venda não encontrada.');
    if (v.situacao !== 'AGUARDANDO') throw new ErroHttp(409, 'Esta venda já foi decidida.');
    return v;
  }

  /** Regra 11: a venda direta só vira venda com a confirmação de um Sócio. */
  app.post('/vendas-diretas/:id/confirmar', autenticar, exigir('vendas.confirmar'), rota(async (req, res) => {
    const v = await vendaAguardando(req.params.id);
    const quando = new Date();
    await db.transaction().execute(async (trx) => {
      await trx.updateTable('vendaDireta').set({ situacao: 'CONFIRMADA', decididaPor: req.usuario.id, decididaEm: quando, atualizadoEm: quando }).where('id', '=', v.id).execute();
      const o = await trx.selectFrom('oportunidade').selectAll().where('id', '=', v.oportunidadeId).executeTakeFirstOrThrow();
      if (o.situacao === 'ABERTA') {
        await avancarAte(trx, o, 'VENDA', req.usuario.id, quando);
        await trx.updateTable('oportunidade').set({ situacao: 'GANHA', atualizadoEm: quando }).where('id', '=', o.id).execute();
        await trx.updateTable('atividade').set({ status: 'CANCELADA', concluidaEm: quando, atualizadoEm: quando })
          .where('oportunidadeId', '=', o.id).where('tipo', '=', 'FOLLOW').where('status', '=', 'ABERTA').execute();
      }
      // Venda confirmada gera o pró-labore e as comissões (cada um até o seu teto).
      await gerarGanhos(trx, v.id, quando);
      await aoConfirmarVenda(trx, v.id, quando);
      await auditar(trx, [
        { entidade: 'vendaDireta', entidadeId: v.id, acao: 'confirmar', campo: 'situacao', de: 'AGUARDANDO', para: 'CONFIRMADA', autorId: req.usuario.id },
        { entidade: 'oportunidade', entidadeId: o.id, acao: 'ganhar', campo: 'etapa', de: 'NEGOCIACAO', para: 'VENDA', autorId: req.usuario.id },
      ]);
    });
    res.json({ ok: true });
  }));

  app.post('/vendas-diretas/:id/recusar', autenticar, exigir('vendas.confirmar'), rota(async (req, res) => {
    const v = await vendaAguardando(req.params.id);
    const { motivo } = z.object({ motivo: z.string({ required_error: 'Diga por que a venda foi recusada.' }).trim().min(5, 'Diga por que a venda foi recusada.').max(300) }).parse(req.body);
    const quando = new Date();
    await db.transaction().execute(async (trx) => {
      await trx.updateTable('vendaDireta').set({ situacao: 'CANCELADA', motivoRecusa: motivo, decididaPor: req.usuario.id, decididaEm: quando, atualizadoEm: quando }).where('id', '=', v.id).execute();
      await auditar(trx, [{ entidade: 'vendaDireta', entidadeId: v.id, acao: 'recusar', campo: 'situacao', de: 'AGUARDANDO', para: { situacao: 'CANCELADA', motivo }, autorId: req.usuario.id }]);
    });
    res.json({ ok: true });
  }));

  // ---- Números do "Agora" (fichas leads_sem_resposta, tarefas_vencendo e leads_parados)
  app.get('/atendimento/agora', ...ver, rota(async (req, res) => {
    const meu = !veTodos(req.usuario);
    let abertas = db.selectFrom('oportunidade').select(['etapa', 'primeiraRespostaEm', 'entrouNaEtapaEm']).where('situacao', '=', 'ABERTA');
    if (meu) abertas = abertas.where('vendedorId', '=', req.usuario.id);
    const fimDeHoje = new Date(); fimDeHoje.setHours(23, 59, 59, 999);
    let tarefas = db.selectFrom('atividade').select((eb) => eb.fn.countAll<string>().as('n')).where('status', '=', 'ABERTA').where('prazo', '<=', fimDeHoje);
    if (meu) tarefas = tarefas.where('responsavelId', '=', req.usuario.id);
    const [linhas, t, limite] = await Promise.all([abertas.execute(), tarefas.executeTakeFirstOrThrow(), parametroNumero('tempo_maximo_etapa_horas')]);
    res.json({
      leads_sem_resposta: linhas.filter((l) => l.etapa === 'LEAD' && !l.primeiraRespostaEm).length,
      tarefas_vencendo: Number(t.n),
      // Sem tempo máximo definido em Metas, não há como dizer que um lead está parado: "—".
      leads_parados: limite === null ? null
        : linhas.filter((l) => l.etapa !== 'VENDA' && emHoras(Date.now() - new Date(l.entrouNaEtapaEm).getTime()) > limite).length,
    });
  }));

  // ---- Funil: conversões, perdas e tempos, sempre a partir do histórico de etapas
  app.get('/atendimento/funil', ...ver, rota(async (req, res) => {
    const filtro = z.object({ inicio: z.coerce.date(), fim: z.coerce.date(), vendedorId: z.string().regex(UUID).optional() }).parse(req.query);
    const vendedorId = veTodos(req.usuario) ? filtro.vendedorId : req.usuario.id;
    const etapas = await calcularFunil(db, filtro.inicio, filtro.fim, vendedorId);
    res.json({ inicio: filtro.inicio, fim: filtro.fim, etapas });
  }));
}

/** Funil: conversões, perdas e tempos, sempre a partir do histórico de etapas. Usado pelo Atendimento e pelo Painel. */
export async function calcularFunil(db: Banco, inicio: Date, fim: Date, vendedorId?: string, canal?: string) {
  const filtro = { inicio, fim };
  let noPeriodo = db.selectFrom('historicoEtapa as h').innerJoin('oportunidade as o', 'o.id', 'h.oportunidadeId')
    .select(['h.oportunidadeId', 'h.etapaNova', 'h.entrouEm', 'h.saiuEm'])
    .where('o.situacao', '!=', 'DESCARTADA').where('h.entrouEm', '>=', filtro.inicio).where('h.entrouEm', '<', filtro.fim);
  if (vendedorId) noPeriodo = noPeriodo.where('o.vendedorId', '=', vendedorId);
  if (canal) noPeriodo = noPeriodo.where('o.canal', '=', canal as 'WHATSAPP');
  const passagens = await noPeriodo.execute();
  const ids = [...new Set(passagens.map((p) => p.oportunidadeId))];
  const todas = ids.length
    ? await db.selectFrom('historicoEtapa').select(['oportunidadeId', 'etapaNova', 'entrouEm']).where('oportunidadeId', 'in', ids).execute()
    : [];

  let perdidas = db.selectFrom('oportunidade').select(['etapaDaPerda', 'motivoPerda'])
    .where('situacao', '!=', 'DESCARTADA').where('perdidaEm', '>=', filtro.inicio).where('perdidaEm', '<', filtro.fim).where('motivoPerda', 'is not', null);
  if (vendedorId) perdidas = perdidas.where('vendedorId', '=', vendedorId);
  if (canal) perdidas = perdidas.where('canal', '=', canal as 'WHATSAPP');
  const perdas = await perdidas.execute();

  const etapas = ETAPAS.map((etapa) => {
    const entradas = new Map<string, number>(); // oportunidade → primeira entrada na etapa, dentro do período
    for (const p of passagens) {
      if (p.etapaNova !== etapa.id) continue;
      const t = new Date(p.entrouEm).getTime();
      if (!entradas.has(p.oportunidadeId) || t < entradas.get(p.oportunidadeId)!) entradas.set(p.oportunidadeId, t);
    }
    // "Avançou" = entrou depois na etapa seguinte. Na Recuperação, "avançou" = voltou para a jornada.
    const i = ORDEM.indexOf(etapa.id);
    const seguintes: string[] = etapa.id === 'RECUPERACAO' ? ORDEM : i >= 0 && i < ORDEM.length - 1 ? [ORDEM[i + 1]] : [];
    const avancaram = new Set<string>();
    for (const h of todas) {
      const entrada = entradas.get(h.oportunidadeId);
      if (entrada !== undefined && seguintes.includes(h.etapaNova) && new Date(h.entrouEm).getTime() >= entrada) avancaram.add(h.oportunidadeId);
    }
    const tempos = passagens
      .filter((p) => p.etapaNova === etapa.id && p.saiuEm && new Date(p.saiuEm).getTime() > new Date(p.entrouEm).getTime())
      .map((p) => emHoras(new Date(p.saiuEm!).getTime() - new Date(p.entrouEm).getTime()));
    const motivos = new Map<string, number>();
    for (const p of perdas) if (p.etapaDaPerda === etapa.id) motivos.set(p.motivoPerda!, (motivos.get(p.motivoPerda!) ?? 0) + 1);
    const totalPerdas = [...motivos.values()].reduce((s, n) => s + n, 0);
    const tempo = mediana(tempos);
    return {
      etapa: etapa.id, nome: etapa.nome, fase: etapa.fase,
      entraram: entradas.size,
      avancaram: seguintes.length ? avancaram.size : null,
      // Sem dado no período, a conversão é nula (a tela mostra "—", nunca 0% nem −100%).
      conversaoPct: seguintes.length && entradas.size ? Math.round((avancaram.size / entradas.size) * 1000) / 10 : null,
      tempoMedianoHoras: tempo === null ? null : Math.round(tempo * 10) / 10,
      perdas: {
        total: totalPerdas,
        motivos: [...motivos.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
          .map(([id, quantidade]) => ({ motivo: id, nome: motivoPorId(id)?.nome ?? id, quantidade })),
      },
    };
  });
  return etapas;
}
