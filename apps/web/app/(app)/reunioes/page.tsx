import Link from 'next/link';
import { Cabecalho, Estado, SemAcesso, TelaVazia } from '@/components/ui';
import { emData } from '@/lib/formato';
import { acesso, buscar } from '@/lib/sessao';

interface Reuniao {
  id: string; modo: 'GESTAO' | 'EQUIPE'; iniciadaEm: string; encerradaEm: string | null; abertaPor: string;
  ata: null | { data: string; duracaoMinutos: number; pulados: string[]; tratados: Array<{ bloco: string; item: string }>;
    numeros: Array<{ bloco: string; linhas: Array<{ rotulo: string; valor: string }> }> };
  tarefas: Array<{ id: string; bloco: string | null; titulo: string; prazo: string; status: string; responsavel: string }>;
}
const BLOCO: Record<string, string> = { RESULTADO: 'Resultado', ATENDIMENTO: 'Atendimento', VENDEDORES: 'Vendedores', TRAFEGO: 'Tráfego', SOCIAL: 'Social media', CLIENTES: 'Clientes e recuperação', GESTAO: 'Gestão' };

export default async function Reunioes() {
  const { pode } = await acesso(['reunioes.ver']);
  if (!pode) return <SemAcesso />;
  const reunioes = await buscar<Reuniao[]>('/reunioes');
  return (
    <>
      <Cabecalho nome="Reuniões" pergunta="O que foi decidido em cada Daily?" paraQuem="Sócios e Gerente" />
      {reunioes.length === 0 ? (
        <TelaVazia titulo="Nenhuma reunião ainda" texto="As atas do Daily e as tarefas criadas em cada uma aparecem aqui depois da primeira reunião.">
          <Link className="botao principal-acao" href="/painel?sub=daily">Ir para o Daily</Link>
        </TelaVazia>
      ) : reunioes.map((r) => (
        <section key={r.id} className="cartao ata" data-teste="reuniao">
          <div className="cabecalho-linha">
            <div>
              <h2>Daily de {emData(r.iniciadaEm).split(' ')[0]}</h2>
              <p className="apagado">Aberto por {r.abertaPor} · modo {r.modo === 'GESTAO' ? 'Gestão' : 'Equipe'}{r.ata ? ` · ${r.ata.duracaoMinutos} min` : ''}</p>
            </div>
            {r.encerradaEm ? <Estado tipo="neutro">Encerrado</Estado> : <Link className="botao pequeno" href="/painel?sub=daily">Em andamento: continuar</Link>}
          </div>
          <div className="secao">
            <h3>Decisões ({r.tarefas.length})</h3>
            {r.tarefas.length === 0 ? <p className="apagado">Nenhuma decisão registrada.</p> : r.tarefas.map((t) => (
              <p key={t.id} data-teste="tarefa-reuniao">
                {t.titulo} · {t.responsavel} · prazo {emData(t.prazo).split(' ')[0]}{' '}
                <Estado tipo={t.status === 'FEITA' ? 'bom' : t.status === 'CANCELADA' ? 'neutro' : new Date(t.prazo) < new Date() ? 'critico' : 'atencao'}>
                  {t.status === 'FEITA' ? 'Feita' : t.status === 'CANCELADA' ? 'Cancelada' : new Date(t.prazo) < new Date() ? 'Atrasada' : 'Aberta'}
                </Estado>
              </p>
            ))}
          </div>
          {r.ata && (
            <>
              {r.ata.tratados.length > 0 && <div className="secao"><h3>Tratado</h3>{r.ata.tratados.map((t, i) => <p key={i}>{BLOCO[t.bloco] ?? t.bloco}: {t.item}</p>)}</div>}
              {r.ata.pulados.length > 0 && <p className="apagado">Blocos pulados: {r.ata.pulados.map((b) => BLOCO[b] ?? b).join(', ')}</p>}
              <details>
                <summary className="apagado">Números do momento</summary>
                {r.ata.numeros.map((b) => (
                  <p key={b.bloco}><strong>{BLOCO[b.bloco] ?? b.bloco}:</strong> {b.linhas.map((l) => `${l.rotulo} ${l.valor}`).join(' · ')}</p>
                ))}
              </details>
            </>
          )}
        </section>
      ))}
    </>
  );
}
