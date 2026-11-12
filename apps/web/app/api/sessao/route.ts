import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { API_URL, COOKIE } from '@/lib/sessao';

/** Entrar: confere e-mail e senha na API e guarda o token num cookie só do servidor. */
export async function POST(pedido: Request) {
  const corpo = await pedido.json().catch(() => ({}));
  const resposta = await fetch(`${API_URL}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo), cache: 'no-store',
  }).catch(() => null);
  if (!resposta) return NextResponse.json({ erro: 'A API não respondeu. Tente de novo.' }, { status: 502 });
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) return NextResponse.json({ erro: dados.erro ?? 'Não foi possível entrar.' }, { status: resposta.status });
  (await cookies()).set(COOKIE, dados.token, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' && !process.env.SEM_HTTPS,
    path: '/', maxAge: 60 * 60 * 12,
  });
  return NextResponse.json({ ok: true });
}

/** Sair. */
export async function DELETE() {
  (await cookies()).delete(COOKIE);
  return NextResponse.json({ ok: true });
}
