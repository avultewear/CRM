// Cálculos comuns a todas as métricas. Nenhuma tela calcula por conta própria.

/** Regra 3: todo tempo é medido pela mediana. */
export function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const ordenados = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 ? ordenados[meio] : (ordenados[meio - 1] + ordenados[meio]) / 2;
}

function mesAnterior(data: string): string {
  const [ano, mes, dia] = data.split('-').map(Number);
  const anoAnt = mes === 1 ? ano - 1 : ano;
  const mesAnt = mes === 1 ? 12 : mes - 1;
  const ultimoDia = new Date(Date.UTC(anoAnt, mesAnt, 0)).getUTCDate();
  const d = Math.min(dia, ultimoDia);
  return `${anoAnt}-${String(mesAnt).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Regra 2: o mesmo intervalo do mês anterior (1 a 10/nov contra 1 a 10/out). Datas em AAAA-MM-DD. */
export function intervaloAnterior(inicio: string, fim: string): { inicio: string; fim: string } {
  return { inicio: mesAnterior(inicio), fim: mesAnterior(fim) };
}

/** Variação em %. Sem dado em um dos períodos (ou base zero) não há variação: devolve null. */
export function variacaoPct(atual: number | null, anterior: number | null): number | null {
  if (atual === null || anterior === null || anterior === 0) return null;
  return ((atual - anterior) / anterior) * 100;
}

/** Sem variação mostra "—", nunca "−100%". */
export function formatarVariacao(variacao: number | null): string {
  if (variacao === null) return '—';
  const sinal = variacao > 0 ? '+' : variacao < 0 ? '−' : '';
  return `${sinal}${Math.abs(variacao).toFixed(1).replace('.', ',')}%`;
}

/** Projeta o ritmo do período até o fim do mês. */
export function projecaoFechamento(valorAteAgora: number, diasCorridos: number, diasNoMes: number): number | null {
  if (diasCorridos <= 0) return null;
  return (valorAteAgora / diasCorridos) * diasNoMes;
}
