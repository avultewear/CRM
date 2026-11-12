import { Cabecalho, SemAcesso } from '@/components/ui';
import { acesso, buscar } from '@/lib/sessao';
import { MetricasCliente, type Metrica } from './MetricasCliente';

export default async function Metricas({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { pode } = await acesso(['metricas.ver']);
  if (!pode) return <SemAcesso />;
  const metricas = await buscar<Metrica[]>('/metricas');
  return (
    <>
      <Cabecalho nome="Métricas" pergunta="O que cada número significa e como ele é calculado?" paraQuem="Toda a equipe; cada papel vê as suas" />
      <MetricasCliente metricas={metricas} inicial={(await searchParams).id} />
    </>
  );
}
