import { Cabecalho, SemAcesso } from '@/components/ui';
import { tem } from '@/lib/menu';
import { acesso, buscar } from '@/lib/sessao';
import { AtendimentoCliente } from './AtendimentoCliente';
import type { Agora, Config, Funil, Oportunidade, Tarefa } from './tipos';

/** Intervalo do mês em andamento, para a conversão que aparece no cabeçalho de cada coluna. */
function mesAtual() {
  const agora = new Date();
  const inicio = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1));
  const fim = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() + 1, 1));
  return `inicio=${inicio.toISOString()}&fim=${fim.toISOString()}`;
}

export default async function Atendimento({ searchParams }: { searchParams: Promise<{ etapa?: string }> }) {
  const { eu, pode } = await acesso(['atendimento.ver']);
  if (!pode) return <SemAcesso />;
  const gestao = tem(eu.permissoes, ['atendimento.todos']);
  const [config, oportunidades, tarefas, agora, funil, equipe] = await Promise.all([
    buscar<Config>('/atendimento/config'),
    buscar<Oportunidade[]>('/oportunidades'),
    buscar<Tarefa[]>('/atividades'),
    buscar<Agora>('/atendimento/agora'),
    buscar<Funil>(`/atendimento/funil?${mesAtual()}`),
    gestao ? buscar<Array<{ id: string; nome: string; vende: boolean; ativo: boolean }>>('/equipe') : Promise.resolve([]),
  ]);
  return (
    <AtendimentoCliente
      config={config}
      inicial={{ oportunidades, tarefas, agora, funil }}
      vendedores={equipe.filter((p) => p.vende && p.ativo).map((p) => ({ id: p.id, nome: p.nome }))}
      gestao={gestao}
      periodoFunil={mesAtual()}
      etapaInicial={(await searchParams).etapa}
    >
      <Cabecalho
        nome="Atendimento"
        pergunta="Quem está conversando com a gente e qual é o próximo passo?"
        paraQuem="Vendedores e Gerente"
      />
    </AtendimentoCliente>
  );
}
