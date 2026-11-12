import { NextResponse } from 'next/server';
import { api } from '@/lib/sessao';

// Repassa as chamadas do navegador para a API, juntando a sessão da pessoa.
// Não existe repasse de DELETE: nada é apagado.
async function repassar(pedido: Request, { params }: { params: Promise<{ caminho: string[] }> }) {
  const { caminho } = await params;
  const busca = new URL(pedido.url).search;
  const corpo = pedido.method === 'GET' ? undefined : await pedido.text();
  const resposta = await api(`/${caminho.map(encodeURIComponent).join('/')}${busca}`, { method: pedido.method, body: corpo }).catch(() => null);
  if (!resposta) return NextResponse.json({ erro: 'A API não respondeu. Tente de novo.' }, { status: 502 });
  return NextResponse.json(await resposta.json().catch(() => ({})), { status: resposta.status });
}

export { repassar as GET, repassar as POST, repassar as PATCH, repassar as PUT };
