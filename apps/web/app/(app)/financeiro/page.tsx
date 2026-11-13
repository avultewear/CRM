import { Cabecalho, SemAcesso } from '@/components/ui';
import { acesso, buscar } from '@/lib/sessao';
import { ComissoesCliente, type Resumo } from './ComissoesCliente';
import { CustosCliente, type Custos } from './CustosCliente';
import { FinanceiroCliente, type VendaAguardando } from './FinanceiroCliente';

export default async function Financeiro() {
  const { pode } = await acesso(['financeiro.ver']);
  if (!pode) return <SemAcesso />;
  const [vendas, resumo, custos] = await Promise.all([
    buscar<VendaAguardando[]>('/vendas-diretas?situacao=AGUARDANDO'),
    buscar<Resumo>('/financeiro/resumo'),
    buscar<Custos>('/custos'),
  ]);
  return (
    <>
      <Cabecalho nome="Financeiro" pergunta="O que falta confirmar, liberar e pagar?" paraQuem="Sócios" />
      <FinanceiroCliente vendas={vendas} />
      <ComissoesCliente inicial={resumo} />
      <CustosCliente inicial={custos} />
    </>
  );
}
