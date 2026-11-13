import { Cabecalho, SemAcesso } from '@/components/ui';
import { tem } from '@/lib/menu';
import { acesso, buscar } from '@/lib/sessao';
import { ClientesCliente, type Dados } from './ClientesCliente';

export default async function Clientes() {
  const { eu, pode } = await acesso(['clientes.ver']);
  if (!pode) return <SemAcesso />;
  const dados = await buscar<Dados>('/clientes');
  return (
    <ClientesCliente inicial={dados} gestao={tem(eu.permissoes, ['atendimento.todos'])} socio={tem(eu.permissoes, ['cifras.ver'])}>
      <Cabecalho nome="Clientes, recompra e comunidade" pergunta="Quem são os nossos clientes, quem volta e quem está sumindo?" paraQuem="Sócios, Gerente e vendedores (cada um com os próprios clientes)" />
    </ClientesCliente>
  );
}
