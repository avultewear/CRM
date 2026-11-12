const reais = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const numero = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const dataHora = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });

export const NOME_PAPEL: Record<string, string> = {
  SOCIO: 'Sócio', GERENTE: 'Gerente', VENDEDOR: 'Vendedor', GESTOR_TRAFEGO: 'Gestor de tráfego',
  SOCIAL_MEDIA: 'Social media', INFLUENCIADOR: 'Influenciador',
};

export const emReais = (v: number) => reais.format(v);
export const emData = (iso: string | Date) => dataHora.format(new Date(iso));

/** Mostra um valor de parâmetro conforme o tipo. Sem valor, "A definir". */
export function valorParametro(tipo: string, valor: unknown): string {
  if (valor === null || valor === undefined) return 'A definir';
  if (tipo === 'moeda') return emReais(valor as number);
  if (tipo === 'percentual') return `${numero.format(valor as number)}%`;
  if (tipo === 'inteiro') return numero.format(valor as number);
  if (tipo === 'json') return JSON.stringify(valor);
  return String(valor);
}

/** Valor solto da auditoria (de/para). */
export function valorSolto(valor: unknown): string {
  if (valor === null || valor === undefined) return '—';
  if (typeof valor === 'boolean') return valor ? 'sim' : 'não';
  if (typeof valor === 'object') return JSON.stringify(valor);
  return String(valor);
}

/** Chamada do navegador para a API, passando pelo servidor do site (que guarda a sessão). */
export async function chamar<T = unknown>(metodo: string, caminho: string, corpo?: unknown): Promise<T> {
  const resposta = await fetch(`/api/px${caminho}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new Error(dados.erro ?? 'Não foi possível concluir.');
  return dados as T;
}
