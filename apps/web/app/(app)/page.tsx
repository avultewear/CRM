import { redirect } from 'next/navigation';
import { menuPara } from '@/lib/menu';
import { obterEu } from '@/lib/sessao';

/** Início: cada papel cai na primeira aba que pode abrir. */
export default async function Inicio() {
  const eu = await obterEu();
  if (!eu) redirect('/login');
  redirect(menuPara(eu.permissoes)[0]?.itens[0]?.rota ?? '/login');
}
