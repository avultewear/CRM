import Link from 'next/link';
import { Cabecalho, SemAcesso } from '@/components/ui';
import { tem } from '@/lib/menu';
import { acesso, buscar } from '@/lib/sessao';
import { DailyCliente, type Daily } from './DailyCliente';
import { Hoje, type DadosHoje } from './Hoje';
import { PainelGraficos } from './PainelGraficos';
import type { Indicadores, Jornada, Ranking, Series } from './tipos';

const SUBS = [{ id: 'hoje', nome: 'Hoje' }, { id: 'daily', nome: 'Daily' }, { id: 'painel', nome: 'Painel' }] as const;
const MES = /^\d{4}-(0[1-9]|1[0-2])$/;
const UUID = /^[0-9a-f-]{36}$/i;
const CANAIS = ['WHATSAPP', 'INSTAGRAM', 'SITE', 'MANUAL'];
const hoje = () => new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);

export default async function Painel({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { eu, pode } = await acesso(['painel.ver']);
  if (!pode) return <SemAcesso />;
  const q = await searchParams;
  const sub = SUBS.some((s) => s.id === q.sub) ? q.sub! : 'hoje';
  const socio = tem(eu.permissoes, ['cifras.ver']);

  const abas = (
    <nav className="sub-abas" aria-label="Sub-abas do Painel">
      <div className="abas-seg" data-teste="sub-abas">
        {SUBS.map((s) => <Link key={s.id} href={`/painel?sub=${s.id}`} aria-current={s.id === sub ? 'page' : undefined} data-teste={`sub-${s.id}`}>{s.nome}</Link>)}
      </div>
    </nav>
  );
  const cabecalho = <Cabecalho nome="Painel" pergunta="Como está o negócio e o que depende de mim?" paraQuem={socio ? 'Sócios e Gerente' : 'Sócios e Gerente (o Gerente sem as cifras dos Sócios)'} />;

  if (sub === 'daily') {
    const modo = q.modo === 'EQUIPE' ? 'EQUIPE' : 'GESTAO';
    const daily = await buscar<Daily>(`/daily?modo=${modo}`);
    return <>{cabecalho}{abas}<DailyCliente inicial={daily} /></>;
  }
  if (sub === 'painel') {
    const mes = q.mes && MES.test(q.mes) && q.mes <= hoje().slice(0, 7) ? q.mes : hoje().slice(0, 7);
    const vendedorId = q.vendedor && UUID.test(q.vendedor) ? q.vendedor : '';
    const jVendedor = q.jvendedor && UUID.test(q.jvendedor) ? q.jvendedor : '';
    const jCanal = q.jcanal && CANAIS.includes(q.jcanal) ? q.jcanal : '';
    const [a, m] = mes.split('-').map(Number);
    const inicio = new Date(`${mes}-01T00:00:00-03:00`).toISOString();
    const fim = new Date(`${m === 12 ? a + 1 : a}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01T00:00:00-03:00`).toISOString();
    const filtroV = vendedorId ? `&vendedorId=${vendedorId}` : '';
    const [indicadores, series, ranking, jornada, equipe, frase] = await Promise.all([
      buscar<Indicadores>(`/painel/indicadores?mes=${mes}${filtroV}`),
      buscar<Series>(`/painel/series?ano=${a}${filtroV}`),
      buscar<Ranking>(`/painel/ranking?mes=${mes}`),
      buscar<Jornada>(`/painel/jornada?inicio=${inicio}&fim=${fim}${jVendedor ? `&vendedorId=${jVendedor}` : ''}${jCanal ? `&canal=${jCanal}` : ''}`),
      buscar<Array<{ id: string; nome: string; vende: boolean; ativo: boolean }>>('/equipe'),
      buscar<DadosHoje>('/painel/hoje').then((h) => h.frase),
    ]);
    return (
      <>
        {cabecalho}{abas}
        <PainelGraficos
          mes={mes} vendedorId={vendedorId} jVendedor={jVendedor} jCanal={jCanal} socio={socio} frase={frase}
          indicadores={indicadores} series={series} ranking={ranking} jornada={jornada}
          vendedores={equipe.filter((p) => p.vende).map((p) => ({ id: p.id, nome: p.nome }))}
        />
      </>
    );
  }
  const dados = await buscar<DadosHoje>('/painel/hoje');
  return <>{cabecalho}{abas}<Hoje dados={dados} socio={socio} metas={tem(eu.permissoes, ['metas.ver'])} /></>;
}
