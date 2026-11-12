import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { tem } from './menu';

export const COOKIE = 'avulte_sessao';
export const API_URL = process.env.API_URL ?? 'http://localhost:4000';

export interface Eu {
  usuario: { id: string; nome: string; email: string; papel: string; funcao: string | null };
  permissoes: string[];
}

/** Chama a API com a sessão da pessoa. O token fica num cookie que o navegador não lê. */
export async function api(caminho: string, init: RequestInit = {}) {
  const token = (await cookies()).get(COOKIE)?.value;
  return fetch(`${API_URL}${caminho}`, {
    ...init,
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers },
  });
}

export const obterEu = cache(async (): Promise<Eu | null> => {
  const resposta = await api('/auth/eu').catch(() => null);
  return resposta?.ok ? resposta.json() : null;
});

/** Devolve a pessoa logada e se ela pode abrir a tela. Sem login, vai para a entrada. */
export async function acesso(permissoes: string[]) {
  const eu = await obterEu();
  if (!eu) redirect('/login');
  return { eu, pode: tem(eu.permissoes, permissoes) };
}

export async function buscar<T>(caminho: string): Promise<T> {
  const resposta = await api(caminho);
  if (!resposta.ok) throw new Error(`A API respondeu ${resposta.status} em ${caminho}`);
  return resposta.json();
}
