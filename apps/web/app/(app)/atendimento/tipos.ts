export interface Config {
  etapas: Array<{ id: string; nome: string; fase: string; criterio: string }>;
  motivos: Array<{ id: string; nome: string; destino: 'RECUPERACAO' | 'ENCERRADA' | 'NAO_CONTA'; efeito: string }>;
  canais: Array<{ id: string; nome: string }>;
  origens: Array<{ id: string; nome: string }>;
}

export interface Oportunidade {
  id: string;
  etapa: string;
  situacao: 'ABERTA' | 'GANHA' | 'ENCERRADA' | 'DESCARTADA';
  canal: string;
  origem: string;
  origemDetalhe: string | null;
  interesse: string | null;
  tamanho: string | null;
  quantidade: number | null;
  valor: number | null;
  cupom: string | null;
  linkEnviadoEm: string | null;
  temperatura: string | null;
  etiquetas: string[];
  primeiraRespostaEm: string | null;
  motivoPerda: string | null;
  tentativasRecuperacao: number;
  vendedorId: string | null;
  vendedorNome: string | null;
  entrouNaEtapaEm: string;
  horasNaEtapa: number;
  parado: boolean;
  proximaEtapa: string | null;
  falta: string[];
  cliente: {
    id: string; nome: string; telefone: string; email: string | null; cpf: string | null; temCpf: boolean;
    bloqueado: boolean; aceiteMensagens: boolean;
  };
}

export interface Detalhe extends Oportunidade {
  historico: Array<{ etapaNovaNome: string; etapaAnteriorNome: string | null; entrouEm: string; saiuEm: string | null; autor: string | null }>;
  notas: Array<{ id: string; texto: string; criadoEm: string; autor: string }>;
  atividades: Array<{ id: string; tipo: string; titulo: string; mensagem: string | null; prazo: string; status: string; resultado: string | null }>;
  vendasDiretas: Array<{ id: string; valor: number; valorTabela: number; formaPagamento: string; situacao: string; criadoEm: string; motivoRecusa: string | null }>;
}

export interface Tarefa {
  id: string;
  tipo: 'FOLLOW' | 'LEMBRETE' | 'PRIMEIRO_CONTATO';
  titulo: string;
  mensagem: string | null;
  prazo: string;
  oportunidadeId: string | null;
  responsavel: string;
  clienteNome: string | null;
  clienteTelefone: string | null;
}

export interface Agora {
  leads_sem_resposta: number;
  tarefas_vencendo: number;
  leads_parados: number | null;
}

export interface Funil {
  etapas: Array<{ etapa: string; entraram: number; conversaoPct: number | null; tempoMedianoHoras: number | null }>;
}

export const NOME_SITUACAO_VENDA: Record<string, string> = {
  AGUARDANDO: 'Aguardando confirmação', CONFIRMADA: 'Confirmada', CANCELADA: 'Recusada',
};
