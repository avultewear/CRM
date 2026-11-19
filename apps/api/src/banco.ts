import { CamelCasePlugin, Kysely, PostgresDialect, type Generated } from 'kysely';
import pg from 'pg';
import type { Papel } from './papeis.js';

// Datas sem hora (validade do cupom, envio de peça) ficam como texto AAAA-MM-DD, sem fuso.
pg.types.setTypeParser(1082, (valor) => valor);

// numeric volta do Postgres como texto; a API converte para número na saída.
type Numerico = string | number | null;

export interface TabelaUsuario {
  id: Generated<string>;
  nome: string;
  email: string;
  senhaHash: string;
  papel: Papel;
  funcao: string | null;
  vende: Generated<boolean>;
  ativo: Generated<boolean>;
  metaMensal: Numerico;
  comissaoPct: Numerico;
  comissaoTeto: Numerico;
  limiteDescontoPct: Numerico;
  codigoVendedor: string | null;
  editaEstoque: Generated<boolean>;
  criadoEm: Generated<Date>;
  atualizadoEm: Generated<Date>;
}

export interface TabelaParametro {
  chave: string;
  valor: unknown;
  criadoEm: Generated<Date>;
  atualizadoEm: Generated<Date>;
}

export interface TabelaHistoricoParametro {
  id: Generated<string>;
  chave: string;
  valorAnterior: unknown | null;
  valorNovo: unknown;
  justificativa: string;
  autorId: string;
  criadoEm: Generated<Date>;
  atualizadoEm: Generated<Date>;
}

export interface TabelaAuditoria {
  id: Generated<string>;
  entidade: string;
  entidadeId: string;
  acao: string;
  campo: string | null;
  de: unknown | null;
  para: unknown | null;
  autorId: string | null;
  criadoEm: Generated<Date>;
  atualizadoEm: Generated<Date>;
}

export type Etapa = 'LEAD' | 'ABORDADO' | 'LEVANTAMENTO' | 'NEGOCIACAO' | 'VENDA' | 'RECUPERACAO';
export type Situacao = 'ABERTA' | 'GANHA' | 'ENCERRADA' | 'DESCARTADA';

export interface TabelaCliente {
  id: Generated<string>;
  nome: string;
  telefone: string;
  email: string | null;
  cpf: string | null;
  bloqueado: Generated<boolean>;
  aceiteMensagens: Generated<boolean>;
  aceiteEm: Date | null;
  aceiteCanal: string | null;
  vendedorId: string | null;
  etiquetas: Generated<string[]>;
  codigoIndicacao: string | null;
  criadoEm: Generated<Date>;
  atualizadoEm: Generated<Date>;
}

export interface TabelaTroca {
  id: Generated<string>;
  vendaDiretaId: string;
  clienteId: string;
  item: string;
  quantidade: Generated<number>;
  motivo: 'TAMANHO' | 'DEFEITO' | 'NAO_GOSTOU' | 'ARREPENDIMENTO';
  situacao: Generated<'SOLICITADA' | 'PECA_RECEBIDA' | 'RESOLVIDA'>;
  estadoDaPeca: 'BOM' | 'DEFEITO' | null;
  resolucao: 'NOVA_PECA' | 'VALOR_DEVOLVIDO' | null;
  observacao: string | null;
  abertaPor: string;
  recebidaEm: Date | null;
  resolvidaPor: string | null;
  resolvidaEm: Date | null;
  criadoEm: Generated<Date>;
  atualizadoEm: Generated<Date>;
}

export type CategoriaCusto = 'PRODUCAO' | 'EMBALAGEM' | 'FRETE' | 'MARKETING' | 'FERRAMENTAS' | 'PESSOAL' | 'IMPOSTOS' | 'OUTROS';
export interface TabelaCustoMes {
  id: Generated<string>;
  competencia: string;
  categoria: CategoriaCusto;
  descricao: string;
  valor: string | number;
  criadoPor: string;
  anuladoEm: Date | null;
  anuladoPor: string | null;
  motivoAnulacao: string | null;
  criadoEm: Generated<Date>;
  atualizadoEm: Generated<Date>;
}

export interface TabelaReuniao {
  id: Generated<string>;
  tipo: Generated<'DAILY'>;
  modo: 'GESTAO' | 'EQUIPE';
  abertaPor: string;
  iniciadaEm: Generated<Date>;
  encerradaEm: Date | null;
  ata: unknown;
  tratados: Generated<unknown>;
  criadoEm: Generated<Date>;
  atualizadoEm: Generated<Date>;
}

export interface TabelaBrinde {
  id: Generated<string>;
  clienteId: string;
  descricao: string;
  motivo: string;
  custo: string | number | null;
  entregueEm: string;
  criadoPor: string;
  criadoEm: Generated<Date>;
  atualizadoEm: Generated<Date>;
}

export interface TabelaOportunidade {
  id: Generated<string>;
  clienteId: string;
  vendedorId: string | null;
  tipo: Generated<string>;
  etapa: Generated<Etapa>;
  situacao: Generated<Situacao>;
  entrouNaEtapaEm: Generated<Date>;
  canal: string;
  origem: string;
  origemDetalhe: string | null;
  campanhaId: string | null;
  conjuntoId: string | null;
  anuncioId: string | null;
  anuncioTitulo: string | null;
  interesse: string | null;
  tamanho: string | null;
  quantidade: number | null;
  valor: Numerico;
  cupom: string | null;
  linkEnviadoEm: Date | null;
  temperatura: string | null;
  etiquetas: Generated<string[]>;
  primeiraRespostaEm: Date | null;
  motivoPerda: string | null;
  destinoPerda: string | null;
  perdidaEm: Date | null;
  etapaDaPerda: string | null;
  etapaAntesRecuperacao: Etapa | null;
  tentativasRecuperacao: Generated<number>;
  criadoEm: Generated<Date>;
  atualizadoEm: Generated<Date>;
}

export interface TabelaHistoricoEtapa {
  id: Generated<string>;
  oportunidadeId: string;
  etapaAnterior: string | null;
  etapaNova: string;
  entrouEm: Generated<Date>;
  saiuEm: Date | null;
  autorId: string | null;
  criadoEm: Generated<Date>;
  atualizadoEm: Generated<Date>;
}

export interface TabelaAtividade {
  id: Generated<string>;
  tipo: 'FOLLOW' | 'LEMBRETE' | 'PRIMEIRO_CONTATO' | 'SEQUENCIA' | 'DECISAO';
  origem: Generated<string>;
  oportunidadeId: string | null;
  clienteId: string | null;
  sequencia: 'POS_COMPRA' | 'RECOMPRA' | 'EM_RISCO' | null;
  referencia: string | null;
  reuniaoId: string | null;
  bloco: string | null;
  responsavelId: string;
  titulo: string;
  mensagem: string | null;
  prazo: Date;
  status: Generated<'ABERTA' | 'FEITA' | 'CANCELADA'>;
  resultado: string | null;
  concluidaEm: Date | null;
  criadoEm: Generated<Date>;
  atualizadoEm: Generated<Date>;
}

export interface TabelaNota {
  id: Generated<string>;
  oportunidadeId: string;
  autorId: string;
  texto: string;
  criadoEm: Generated<Date>;
  atualizadoEm: Generated<Date>;
}

export interface TabelaVendaDireta {
  id: Generated<string>;
  oportunidadeId: string;
  clienteId: string;
  vendedorId: string | null;
  itens: unknown;
  valorTabela: string | number;
  valor: string | number;
  formaPagamento: 'PIX' | 'DINHEIRO';
  situacao: Generated<'AGUARDANDO' | 'CONFIRMADA' | 'CANCELADA'>;
  lancadaPor: string;
  decididaPor: string | null;
  decididaEm: Date | null;
  motivoRecusa: string | null;
  cupomId: string | null;
  indicadoPorId: string | null;
  devolvidaEm: Date | null;
  criadoEm: Generated<Date>;
  atualizadoEm: Generated<Date>;
}

export interface TabelaInfluenciador {
  id: Generated<string>;
  usuarioId: string | null;
  nome: string;
  arroba: string | null;
  comissaoTeto: Numerico;
  ativo: Generated<boolean>;
  criadoEm: Generated<Date>;
  atualizadoEm: Generated<Date>;
}

export interface TabelaCupom {
  id: Generated<string>;
  codigo: string;
  influenciadorId: string;
  descontoPct: string | number;
  comissaoPct: Numerico;
  validade: string | null;
  ativo: Generated<boolean>;
  criadoEm: Generated<Date>;
  atualizadoEm: Generated<Date>;
}

export type TipoGanho = 'PRO_LABORE' | 'COMISSAO_VENDEDOR' | 'COMISSAO_INFLUENCIADOR';
export interface TabelaGanho {
  id: Generated<string>;
  tipo: TipoGanho;
  vendaDiretaId: string | null;
  usuarioId: string | null;
  influenciadorId: string | null;
  base: string | number;
  pct: string | number;
  valorSemTeto: string | number;
  valor: string | number;
  situacao: Generated<'AGUARDANDO' | 'LIBERADA' | 'PAGA' | 'CANCELADA'>;
  competencia: string;
  liberarEm: Date | null;
  liberadaEm: Date | null;
  pagaEm: Date | null;
  pagaPor: string | null;
  criadoEm: Generated<Date>;
  atualizadoEm: Generated<Date>;
}

export interface TabelaPecaEnviada {
  id: Generated<string>;
  influenciadorId: string;
  descricao: string;
  quantidade: number;
  custo: Numerico;
  enviadaEm: string;
  registradaPor: string;
  criadoEm: Generated<Date>;
  atualizadoEm: Generated<Date>;
}

export interface TabelaCombinadoPosts {
  id: Generated<string>;
  influenciadorId: string;
  mes: string;
  combinados: number;
  feitos: number;
  criadoEm: Generated<Date>;
  atualizadoEm: Generated<Date>;
}

type Num = string | number;
export interface TabelaMetaConexao {
  id: Generated<string>; contaId: string; contaNome: string | null; moeda: string | null; fuso: string | null;
  tokenCifrado: string; conectadaPor: string; ativa: Generated<boolean>; ultimoDiagnostico: unknown; diagnosticadaEm: Date | null;
  sincronizadaEm: Date | null; historicoAte: string | null; ultimoErro: string | null; criadoEm: Generated<Date>; atualizadoEm: Generated<Date>;
}
export interface TabelaAnuncioCampanha { id: string; nome: string; objetivo: string | null; status: string | null; orcamentoDiario: Num | null; atualizadoEm: Generated<Date> }
export interface TabelaAnuncioConjunto {
  id: string; campanhaId: string; nome: string; status: string | null; otimizacao: string | null; orcamentoDiario: Num | null;
  faseAprendizado: string | null; publico: unknown; atualizadoEm: Generated<Date>;
}
export interface TabelaAnuncio {
  id: string; conjuntoId: string; nome: string; titulo: string | null; status: string | null; formato: string | null; miniaturaUrl: string | null;
  rankingQualidade: string | null; rankingEngajamento: string | null; rankingConversao: string | null; atualizadoEm: Generated<Date>;
}
export interface TabelaAnuncioDia {
  anuncioId: string; dia: string; investimento: Num; impressoes: number; alcance: number | null; cliquesLink: number; conversas: number;
  conversasProfundas: number | null; videoPlays: number | null; videoP25: number | null; videoP50: number | null; videoP75: number | null; videoP100: number | null;
  atualizadoEm: Generated<Date>;
}
export type DimensaoPublico = 'IDADE_GENERO' | 'REGIAO' | 'POSICIONAMENTO' | 'DISPOSITIVO' | 'HORARIO';
export interface TabelaAnuncioPublicoDia { dia: string; dimensao: DimensaoPublico; chave: string; investimento: Num; impressoes: number; cliquesLink: number; conversas: number }
export interface TabelaGastoManual { id: Generated<string>; competencia: string; valor: Num; criadoPor: string; substituidoEm: Date | null; criadoEm: Generated<Date> }

export interface Tabelas {
  usuario: TabelaUsuario;
  parametro: TabelaParametro;
  historicoParametro: TabelaHistoricoParametro;
  auditoria: TabelaAuditoria;
  cliente: TabelaCliente;
  oportunidade: TabelaOportunidade;
  historicoEtapa: TabelaHistoricoEtapa;
  atividade: TabelaAtividade;
  nota: TabelaNota;
  vendaDireta: TabelaVendaDireta;
  influenciador: TabelaInfluenciador;
  cupom: TabelaCupom;
  ganho: TabelaGanho;
  pecaEnviada: TabelaPecaEnviada;
  combinadoPosts: TabelaCombinadoPosts;
  troca: TabelaTroca;
  brinde: TabelaBrinde;
  custoMes: TabelaCustoMes;
  reuniao: TabelaReuniao;
  metaConexao: TabelaMetaConexao;
  anuncioCampanha: TabelaAnuncioCampanha;
  anuncioConjunto: TabelaAnuncioConjunto;
  anuncio: TabelaAnuncio;
  anuncioDia: TabelaAnuncioDia;
  anuncioPublicoDia: TabelaAnuncioPublicoDia;
  gastoManual: TabelaGastoManual;
}

export type Banco = Kysely<Tabelas>;

export function abrirBanco(url: string): Banco {
  return new Kysely<Tabelas>({
    dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: url, max: 5 }) }),
    plugins: [new CamelCasePlugin()],
  });
}

/** Valores jsonb precisam ir como texto JSON (inclusive números e textos soltos). */
export const comoJson = (valor: unknown) => JSON.stringify(valor);
