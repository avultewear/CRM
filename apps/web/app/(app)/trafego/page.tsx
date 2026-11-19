import { Cabecalho, SemAcesso } from '@/components/ui';
import { acesso, buscar } from '@/lib/sessao';
import { TrafegoCliente, type Conexao, type DadosTrafego } from './TrafegoCliente';

const DATA = /^\d{4}-\d{2}-\d{2}$/;

export default async function Trafego({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { pode } = await acesso(['trafego.ver']);
  if (!pode) return <SemAcesso />;
  const q = await searchParams;
  const params = new URLSearchParams();
  if (q.desde && DATA.test(q.desde) && q.ate && DATA.test(q.ate)) { params.set('desde', q.desde); params.set('ate', q.ate); }
  else params.set('dias', ['7', '30', '90'].includes(q.dias ?? '') ? q.dias! : '30');
  const [conexao, dados] = await Promise.all([buscar<Conexao>('/trafego/conexao'), buscar<DadosTrafego>(`/trafego?${params}`)]);
  return (
    <TrafegoCliente conexao={conexao} dados={dados} filtro={q.desde ? 'personalizado' : params.get('dias')!}>
      <Cabecalho nome="Tráfego" pergunta="O dinheiro em anúncio está virando venda?" paraQuem="Gestor de tráfego e Sócios" />
    </TrafegoCliente>
  );
}
