import { Cabecalho, SemAcesso } from '@/components/ui';
import { tem } from '@/lib/menu';
import { acesso, buscar } from '@/lib/sessao';
import { EquipeCliente, type Pessoa } from './EquipeCliente';

export default async function Equipe() {
  const { eu, pode } = await acesso(['equipe.ver']);
  if (!pode) return <SemAcesso />;
  const pessoas = await buscar<Pessoa[]>('/equipe');
  return (
    <EquipeCliente pessoas={pessoas} verCifras={tem(eu.permissoes, ['cifras.ver'])} euId={eu.usuario.id}>
      <Cabecalho nome="Equipe e acessos" pergunta="Quem usa o sistema e o que cada pessoa pode fazer?" paraQuem="Sócios e Gerente" />
    </EquipeCliente>
  );
}
