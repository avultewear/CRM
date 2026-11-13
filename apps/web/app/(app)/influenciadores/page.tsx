import { Cabecalho, SemAcesso } from '@/components/ui';
import { tem } from '@/lib/menu';
import { acesso, buscar } from '@/lib/sessao';
import { InfluenciadoresCliente, type Influenciador } from './InfluenciadoresCliente';

export default async function Influenciadores() {
  const { eu, pode } = await acesso(['influenciadores.gestao']);
  if (!pode) return <SemAcesso />;
  const [lista, equipe] = await Promise.all([
    buscar<Influenciador[]>('/influenciadores'),
    buscar<Array<{ id: string; nome: string; email: string; papel: string; ativo: boolean }>>('/equipe'),
  ]);
  return (
    <InfluenciadoresCliente
      inicial={lista}
      acessos={equipe.filter((p) => p.papel === 'INFLUENCIADOR' && p.ativo).map((p) => ({ id: p.id, nome: p.nome, email: p.email }))}
      verCifras={tem(eu.permissoes, ['cifras.ver'])}
    >
      <Cabecalho
        nome="Influenciadores"
        pergunta="Quanto cada influenciador trouxe e o que foi combinado com ele?"
        paraQuem="Sócios e Gerente"
      />
    </InfluenciadoresCliente>
  );
}
