export interface Indicador {
  id: string; nome: string; unidade: string; melhorQuando: 'maior' | 'menor';
  valor: number | null; anterior: number | null; variacaoPct: number | null; projecao: number | null;
  pendente?: string; janela?: string; observacao?: string;
}
export interface Indicadores { mes: string; emAndamento: boolean; comparadoCom: { inicio: string; fim: string }; indicadores: Indicador[] }
export interface MesSerie {
  mes: string; futuro: boolean; receita: number | null; vendas: number | null; ticket: number | null;
  clientesNovos: number | null; clientesRecorrentes: number | null;
  proLabore?: number | null; proLaboreMedioPorVenda?: number | null; comissoesGeradas?: number | null;
  comissoesPagasVendedores?: number | null; comissoesPagasInfluenciadores?: number | null;
}
export interface Series { ano: number; series: MesSerie[]; anual: { acumulado: number; meta: number | null; faltam: number | null; progressoPct: number | null } }
export interface Ranking {
  mes: string;
  vendedores: Array<{ vendedorId: string; nome: string; vendas: number; receita: number; comissao?: number }>;
  influenciadores: Array<{ nome: string; vendas: number; receita: number }>;
  porOrigem: Array<{ origem: string; receita: number }>;
}
export interface EtapaJornada {
  etapa: string; nome: string; fase: string; entraram: number; avancaram: number | null; conversaoPct: number | null; tempoMedianoHoras: number | null;
  perdas: { total: number; motivos: Array<{ motivo: string; nome: string; quantidade: number }> };
  abertas: number; meta: number | null; metaOk: boolean | null; foraDoTempo: boolean; situacao: 'bom' | 'atencao' | 'critico' | 'neutro';
  perdaPct: number | null; custo: number | null;
  reais?: { oportunidade: number; proLaborePrevisto: number | null; comissaoPrevista: number | null; comissaoPerdida: number | null };
}
export interface Jornada {
  etapas: EtapaJornada[]; fases: Array<{ fase: string; entraram: number; oportunidade?: number }>; gargalo: string | null;
  tempoMaximoHoras: number | null; metasDefinidas: boolean; exclusoes: string;
}
