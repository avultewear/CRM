import { Cabecalho, SemAcesso, TelaVazia } from '@/components/ui';
import { acesso, buscar } from '@/lib/sessao';
import { FinanceiroCliente, type VendaAguardando } from './FinanceiroCliente';

export default async function Financeiro() {
  const { pode } = await acesso(['financeiro.ver']);
  if (!pode) return <SemAcesso />;
  const vendas = await buscar<VendaAguardando[]>('/vendas-diretas?situacao=AGUARDANDO');
  return (
    <>
      <Cabecalho nome="Financeiro" pergunta="O que falta confirmar, liberar e pagar?" paraQuem="Sócios" />
      <FinanceiroCliente vendas={vendas} />
      <TelaVazia
        titulo="Comissões, custos e lucro entram nas etapas 5 e 6"
        texto="Aqui também vão aparecer as comissões a liberar e a pagar, os custos do mês e o lucro."
      />
    </>
  );
}
