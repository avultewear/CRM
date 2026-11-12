import { redirect } from 'next/navigation';
import { Moldura } from '@/components/Moldura';
import { obterEu } from '@/lib/sessao';

export const dynamic = 'force-dynamic';

export default async function AreaLogada({ children }: { children: React.ReactNode }) {
  const eu = await obterEu();
  if (!eu) redirect('/login');
  return (
    <Moldura usuario={{ nome: eu.usuario.nome, papel: eu.usuario.papel }} permissoes={eu.permissoes}>
      {children}
    </Moldura>
  );
}
