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

/** Lê um número digitado no formato brasileiro (50.000,00) ou simples (50000). Vazio ou inválido vira null. */
export function lerNumero(texto: FormDataEntryValue | string | null | undefined): number | null {
  const limpo = String(texto ?? '').trim().replace(/\s|R\$|%/g, '');
  if (!limpo) return null;
  const n = Number(limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : limpo);
  return Number.isFinite(n) ? n : null;
}

/** 5511988880001 → (11) 98888-0001 */
export function emTelefone(digitos: string): string {
  const d = digitos.startsWith('55') && digitos.length >= 12 ? digitos.slice(2) : digitos;
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `+${digitos}`;
}

/** Tempo na etapa, curto: "menos de 1 h", "5 h", "3 d". */
export function emTempo(horas: number): string {
  if (horas < 1) return 'menos de 1 h';
  if (horas < 48) return `${Math.round(horas)} h`;
  return `${Math.round(horas / 24)} d`;
}

/** Valor curto para o card: "R$ 99". */
export const valorCurto = (v: number) => `R$ ${Math.round(v).toLocaleString('pt-BR')}`;

/** Abre a conversa no WhatsApp com a mensagem pronta. */
export const linkWhatsApp = (telefone: string, mensagem?: string | null) =>
  `https://wa.me/${telefone}${mensagem ? `?text=${encodeURIComponent(mensagem)}` : ''}`;
