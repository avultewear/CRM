import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Cabecalho, SemAcesso, TelaVazia } from '@/components/ui';
import { ABAS_FUTURAS, tem } from '@/lib/menu';
import { acesso } from '@/lib/sessao';

/** Abas das próximas etapas: já têm permissão, cabeçalho e a tela vazia que ensina o primeiro passo. */
export default async function AbaFutura({ params }: { params: Promise<{ aba: string }> }) {
  const aba = ABAS_FUTURAS[(await params).aba];
  if (!aba) notFound();
  const { eu, pode } = await acesso(aba.permissoes);
  if (!pode) return <SemAcesso />;
  return (
    <>
      <Cabecalho nome={aba.nome} pergunta={aba.pergunta} paraQuem={aba.paraQuem} />
      <TelaVazia titulo={`Esta aba entra na etapa ${aba.etapa}`} texto={aba.vazio}>
        {aba.nome === 'Painel' && tem(eu.permissoes, ['metas.ver']) && (
          <Link className="botao principal-acao" href="/metas">Definir metas</Link>
        )}
      </TelaVazia>
    </>
  );
}
