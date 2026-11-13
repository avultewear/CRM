import { Cabecalho, SemAcesso, TelaVazia } from '@/components/ui';
import { acesso, buscar } from '@/lib/sessao';
import { ComissoesCliente, type Resumo } from './ComissoesCliente';
import { FinanceiroCliente, type VendaAguardando } from './FinanceiroCliente';

export default async function Financeiro() {
  const { pode } = await acesso(['financeiro.ver']);
  if (!pode) return <SemAcesso />;
  const [vendas, resumo] = await Promise.all([
    buscar<VendaAguardando[]>('/vendas-diretas?situacao=AGUARDANDO'),
    buscar<Resumo>('/financeiro/resumo'),
  ]);
  return (
    <>
      <Cabecalho nome="Financeiro" pergunta="O que falta confirmar, liberar e pagar?" paraQuem="Sócios" />
      <FinanceiroCliente vendas={vendas} />
      <ComissoesCliente inicial={resumo} />
      <TelaVazia
        titulo="Custos do mês e lucro entram na etapa 6"
        texto="Com a tabela de custos e o custo das peças (etapa 2), esta tela passa a fechar a conta: receita − custo das peças − comissões − anúncios − custos do mês."
      />
    </>
  );
}
