'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { BarrasPareadas, CalendarioCalor, CartaoGrafico, GraficoBarras, GraficoLinha, GraficoQuadrantes, SilhuetaLog } from '@/components/graficos';
import { AbasSegmentadas, Modal } from '@/components/interativos';
import { CartaoIndicador, Estado, TelaVazia } from '@/components/ui';
import { chamar, emData, emReais, lerNumero } from '@/lib/formato';

export interface Conexao {
  chaveConfigurada: boolean; versaoApi: string; podeConectar: boolean;
  conexao: null | {
    contaId: string; contaNome: string | null; moeda: string | null; fuso: string | null; token: string;
    diagnostico: Array<{ item: string; ok: boolean; detalhe: string }> | null; diagnosticadaEm: string | null;
    sincronizadaEm: string | null; historicoAte: string | null; ultimoErro: string | null;
  };
  gastoManual: Array<{ competencia: string; valor: number; criadoEm: string; por: string }>;
}
type Tipo = 'BOM' | 'ATENCAO' | 'CRITICO' | 'INFO';
interface Indicador { id: string; nome: string; unidade: string; melhorQuando: 'maior' | 'menor'; valor: number | null; anterior: number | null; variacaoPct: number | null }
interface Criativo {
  id: string; nome: string; titulo: string | null; status: string | null; formato: string | null; miniatura: string | null; campanha: string; conjunto: string;
  rankings: { qualidade: string | null; engajamento: string | null; conversao: string | null };
  investimento: number; impressoes: number; cliques: number; conversas: number; leads: number; ctr: number | null; custoResultado: number | null; quadrante: string | null;
  retencao: null | { plays: number; p25: number | null; p50: number | null; p75: number | null; p100: number | null };
}
export interface DadosTrafego {
  periodo: { desde: string; ate: string; dias: number }; anterior: { desde: string; ate: string };
  fonte: Record<string, 'META' | 'MANUAL' | 'NENHUMA'>; conectada: boolean; sincronizadaEm: string | null;
  resumo: {
    nota: number | null; checagens: Array<{ id: string; nome: string; ok: boolean | null; valor: string; referencia: string; porque: string; fazer: string }>;
    prioridades: Array<{ tipo: Tipo; titulo: string; porque: string; fazer: string }>;
    investidoMes: number | null; projecaoMes: number | null; orcamentoMes: number | null; ritmoPct: number | null; orcamentoDiarioAtivo: number | null; cplMes: number | null;
  };
  jornada: Array<{ id: string; nome: string; volume: number; conversaoPct: number | null; perda: number | null; custo: number | null; custoRotulo: string; meta: number | null; ok: boolean | null }>;
  connectRate: number | null; indicadores: Indicador[];
  ondeMelhorar: Array<{ tipo: Tipo; titulo: string; porque: string; fazer: string }>;
  simulacoes: Array<{ meta: string; atual: string; alvo: string; leadsAMais: number; cplNovo: number | null }>;
  publicos: Record<string, { nome: string; linhas: Array<{ chave: string; rotulo: string; investimento: number; conversas: number; pctInvestimento: number | null; pctResultados: number | null }> }>;
  criativos: Criativo[]; limiares: { investimento: number | null; custoResultado: number | null };
  campanhas: Array<{ id: string; nome: string; status: string | null; objetivo: string | null; orcamentoDiario: number | null; investimento: number; pctInvestimento: number | null; conversas: number; pctResultados: number | null; leads: number; cpl: number | null;
    conjuntos: Array<{ id: string; nome: string; status: string | null; otimizacao: string | null; orcamentoDiario: number | null; faseAprendizado: string | null; publico: Record<string, unknown> | null; investimento: number; conversas: number }> }>;
  diaADia: Array<{ dia: string; investimento: number | null; impressoes: number; cliques: number; conversas: number; leads: number; ctr: number | null; cpc: number | null; cpm: number | null; cpl: number | null }>;
  qualidade: { fonte: 'META' | 'CRM'; conversas: number; passaram: number | null; pct: number | null; viraramLead: number; pctLead: number | null };
  avisoAlcance: string;
}

const TIPO: Record<Tipo, { nome: string; estado: 'bom' | 'atencao' | 'critico' | 'neutro' }> = {
  CRITICO: { nome: 'Crítico', estado: 'critico' }, ATENCAO: { nome: 'Atenção', estado: 'atencao' }, BOM: { nome: 'Bom sinal', estado: 'bom' }, INFO: { nome: 'Informação', estado: 'neutro' },
};
const RANKING: Record<string, string> = { ABOVE_AVERAGE: 'Acima da média', AVERAGE: 'Na média', BELOW_AVERAGE_35: 'Abaixo (35% piores)', BELOW_AVERAGE_20: 'Abaixo (20% piores)', BELOW_AVERAGE_10: 'Abaixo (10% piores)', UNKNOWN: 'Sem dado' };
const FASE: Record<string, string> = { LEARNING: 'Aprendendo', SUCCESS: 'Aprendizado concluído', FAIL: 'Aprendizado limitado' };
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const dia = (iso: string) => iso.split('-').reverse().slice(0, 2).join('/');
const COR: Record<string, string> = { investimento_trafego: 'var(--anuncios)', roas: 'var(--funil)' };

function formatar(unidade: string, v: number | null): string {
  if (v === null) return '—';
  if (unidade === 'R$') return emReais(v);
  if (unidade === '%') return `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
  if (unidade === 'x') return `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}x`;
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}
const METRICAS_DIA = [
  { id: 'investimento', nome: 'Investimento', unidade: 'R$', forma: 'barras' }, { id: 'impressoes', nome: 'Impressões', unidade: 'n', forma: 'barras' },
  { id: 'cliques', nome: 'Cliques no link', unidade: 'n', forma: 'barras' }, { id: 'conversas', nome: 'Conversas', unidade: 'n', forma: 'barras' },
  { id: 'leads', nome: 'Leads no CRM', unidade: 'n', forma: 'barras' }, { id: 'ctr', nome: 'CTR', unidade: '%', forma: 'linha' },
  { id: 'cpc', nome: 'CPC', unidade: 'R$', forma: 'linha' }, { id: 'cpm', nome: 'CPM', unidade: 'R$', forma: 'linha' }, { id: 'cpl', nome: 'Custo por lead', unidade: 'R$', forma: 'linha' },
] as const;

export function TrafegoCliente({ conexao, dados, filtro, children }: { conexao: Conexao; dados: DadosTrafego; filtro: string; children: React.ReactNode }) {
  const router = useRouter();
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [metricaDia, setMetricaDia] = useState<(typeof METRICAS_DIA)[number]['id']>('investimento');
  const [dimensao, setDimensao] = useState('IDADE_GENERO');
  const [conectando, setConectando] = useState(false);
  const [personalizado, setPersonalizado] = useState(filtro === 'personalizado');
  const semNada = !dados.conectada && dados.criativos.length === 0 && Object.values(dados.fonte).every((f) => f === 'NENHUMA');

  async function sincronizar() {
    setOcupado(true); setAviso('Sincronizando com a Meta…');
    try {
      await chamar('POST', '/trafego/sincronizar', { parte: 'estrutura' });
      await chamar('POST', '/trafego/sincronizar', { parte: 'dias' });
      const h = await chamar<{ concluido?: boolean }>('POST', '/trafego/sincronizar', { parte: 'historico' });
      setAviso(h.concluido ? 'Sincronizado.' : 'Sincronizado. O histórico de 90 dias continua chegando em blocos, um por vez.');
      router.refresh();
    } catch (e) { setAviso((e as Error).message); } finally { setOcupado(false); }
  }
  async function diagnosticar() {
    setOcupado(true);
    try {
      const r = await chamar<{ ok: boolean }>('POST', '/trafego/conexao/diagnosticar', {});
      setAviso(r.ok ? 'Conexão em ordem: token, permissões e conta.' : 'O diagnóstico encontrou um problema. Veja a lista na conexão.');
      router.refresh();
    } catch (e) { setAviso((e as Error).message); } finally { setOcupado(false); }
  }
  const irPeriodo = (q: string) => router.push(`/trafego?${q}`);
  const fontes = Object.entries(dados.fonte);
  const metrica = METRICAS_DIA.find((m) => m.id === metricaDia)!;
  const serieDia = dados.diaADia.map((d) => d[metricaDia] as number | null);
  const sel = dados.publicos[dimensao];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 16 }}>
      <div className="cabecalho-linha">
        {children}
        <div className="acoes-grafico">
          {dados.conectada && <button className="botao" onClick={sincronizar} disabled={ocupado} data-teste="sincronizar">Sincronizar agora</button>}
          {dados.conectada && <button className="botao fantasma" onClick={diagnosticar} disabled={ocupado} data-teste="diagnosticar">Diagnosticar conexão</button>}
        </div>
      </div>

      {/* Filtro global de período */}
      <div className="filtros" data-teste="filtro-periodo">
        <div className="chips">
          {['7', '30', '90'].map((d) => <button key={d} className="chip" aria-pressed={filtro === d} onClick={() => irPeriodo(`dias=${d}`)} data-dias={d}>{d} dias</button>)}
          <button className="chip" aria-pressed={filtro === 'personalizado'} onClick={() => setPersonalizado(true)} data-dias="personalizado">Personalizado</button>
        </div>
        {personalizado && (
          <form className="filtros" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); irPeriodo(`desde=${f.get('desde')}&ate=${f.get('ate')}`); }}>
            <label className="campo"><span>De</span><input type="date" name="desde" defaultValue={dados.periodo.desde} /></label>
            <label className="campo"><span>Até</span><input type="date" name="ate" defaultValue={dados.periodo.ate} /></label>
            <button className="botao" type="submit" style={{ alignSelf: 'end' }}>Ver</button>
          </form>
        )}
        <p className="apagado" style={{ alignSelf: 'center' }}>
          {dia(dados.periodo.desde)} a {dia(dados.periodo.ate)} · comparado com {dia(dados.anterior.desde)} a {dia(dados.anterior.ate)}
          {' · '}{fontes.map(([m, f]) => `${MESES[Number(m.slice(5)) - 1]}: ${f === 'META' ? 'Meta' : f === 'MANUAL' ? 'gasto digitado' : 'sem gasto'}`).join(' · ')}
          {dados.sincronizadaEm ? ` · sincronizado em ${emData(dados.sincronizadaEm)}` : ''}
        </p>
      </div>
      {aviso && <p className="secundario" role="status" data-teste="aviso-trafego">{aviso}</p>}

      {/* 1. Conexão */}
      <Conectar conexao={conexao} abrir={conectando} setAbrir={setConectando} aposMudar={() => router.refresh()} />

      {semNada ? (
        <TelaVazia titulo="Ainda sem dados de anúncio" texto="Conecte a conta de anúncios da Meta (o sistema puxa os últimos 90 dias) ou, sem conexão, um Sócio digita o gasto do mês. A auditoria aparece aqui com os primeiros dados." />
      ) : (
        <>
          {/* 2. Resumo */}
          <section className="cartao" data-teste="resumo-trafego">
            <h2>Resumo da auditoria</h2>
            <div className="nota-auditoria">
              <span className="nota mono" data-teste="nota">{dados.resumo.nota === null ? '—' : dados.resumo.nota}<small>/100</small></span>
              <div style={{ display: 'grid', gap: 4 }}>
                <span className="apagado">{dados.resumo.checagens.filter((c) => c.ok !== null).length} checagens avaliadas · {dados.resumo.checagens.filter((c) => c.ok === null).length} sem referência ou sem dado</span>
                {dados.resumo.prioridades.length > 0 && <strong>Prioridades do momento</strong>}
                {dados.resumo.prioridades.map((p, i) => <span key={i} data-teste="prioridade"><Estado tipo={TIPO[p.tipo].estado}>{TIPO[p.tipo].nome}</Estado> {p.titulo}</span>)}
              </div>
            </div>
            <div className="grade-indicadores">
              <div className="destaque-numero"><span className="apagado">Investido no mês</span><span className="valor mono" data-teste="investido-mes">{formatar('R$', dados.resumo.investidoMes)}</span></div>
              <div className="destaque-numero"><span className="apagado">Projeção do mês</span><span className="valor mono">{formatar('R$', dados.resumo.projecaoMes)}</span>
                <span className="apagado">{dados.resumo.orcamentoMes === null ? 'sem orçamento em Metas' : `orçamento ${emReais(dados.resumo.orcamentoMes)} · ${formatar('%', dados.resumo.ritmoPct)}`}</span></div>
              <div className="destaque-numero"><span className="apagado">Orçamento diário ativo</span><span className="valor mono">{formatar('R$', dados.resumo.orcamentoDiarioAtivo)}</span></div>
              <div className="destaque-numero"><span className="apagado">Custo por lead no mês</span><span className="valor mono">{formatar('R$', dados.resumo.cplMes)}</span></div>
            </div>
            <details>
              <summary className="apagado">Ver as checagens da nota</summary>
              <div className="rolagem">
                <table className="tabela">
                  <thead><tr><th>Checagem</th><th>Valor</th><th>Referência</th><th>Situação</th></tr></thead>
                  <tbody>{dados.resumo.checagens.map((c) => (
                    <tr key={c.id}><td>{c.nome}</td><td className="mono">{c.valor}</td><td>{c.referencia}</td>
                      <td><Estado tipo={c.ok === null ? 'neutro' : c.ok ? 'bom' : 'critico'}>{c.ok === null ? 'Não avaliada' : c.ok ? 'Ok' : 'Fora'}</Estado></td></tr>
                  ))}</tbody>
                </table>
              </div>
              <p className="apagado">As referências (CTR, CPC, CPM, frequência, connect rate, custo por lead e as taxas do funil) são definidas pelos Sócios em Metas.</p>
            </details>
          </section>

          {/* 3. Jornada até o lead */}
          <section className="cartao jornada" data-teste="jornada-trafego">
            <div className="cabecalho-linha">
              <div><h2>Jornada até o lead</h2><p className="apagado">Do anúncio ao lead cadastrado no CRM · silhueta em escala logarítmica</p></div>
              <div className="destaque-numero" data-teste="connect-rate"><span className="apagado">Connect rate</span><span className="valor mono">{formatar('%', dados.connectRate)}</span>
                <span className="apagado">{dados.connectRate === null ? 'a Meta não informou' : 'conversas com 2+ mensagens da pessoa'}</span></div>
            </div>
            <div className="rolagem-jornada">
              <div className="colunas" style={{ gridTemplateColumns: 'repeat(4, minmax(130px, 1fr))' }}>
                {dados.jornada.map((e) => <strong key={e.id}>{e.nome}</strong>)}
              </div>
              <SilhuetaLog etapas={dados.jornada} />
              <div className="colunas" style={{ gridTemplateColumns: 'repeat(4, minmax(130px, 1fr))' }}>
                {dados.jornada.map((e) => (
                  <div key={e.id} className="etapa-jornada" data-teste="etapa-trafego" data-etapa={e.id}>
                    <span className="volume mono">{e.volume.toLocaleString('pt-BR')}</span>
                    {e.conversaoPct !== null && <span>Conversão <b className="mono">{formatar('%', e.conversaoPct)}</b></span>}
                    {e.perda !== null && <span>Perda <b className="mono">{e.perda.toLocaleString('pt-BR')}</b></span>}
                    <span>Custo <b className="mono">{formatar('R$', e.custo)}</b> <span className="apagado">{e.custoRotulo}</span></span>
                    {e.id !== 'IMPRESSOES' && (e.meta === null ? <span className="apagado">Sem meta</span>
                      : <span>Meta <b className="mono">{e.meta}%</b> <Estado tipo={e.ok === null ? 'neutro' : e.ok ? 'bom' : 'critico'}>{e.ok === null ? '—' : e.ok ? 'ok' : 'fora'}</Estado></span>)}
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* 4. Indicadores */}
          <div className="grade-indicadores" data-teste="indicadores-trafego">
            {dados.indicadores.map((i) => (
              <div key={i.id} data-teste="indicador" data-metrica={i.id} style={{ display: 'grid' }}>
                <CartaoIndicador metrica={i.id} rotulo={i.nome} valor={formatar(i.unidade, i.valor)} cor={COR[i.id]} bomQuando={i.melhorQuando}
                  variacao={i.variacaoPct === null ? '—' : `${i.variacaoPct > 0 ? '+' : i.variacaoPct < 0 ? '−' : ''}${Math.abs(i.variacaoPct).toLocaleString('pt-BR')}%`}
                  direcao={i.variacaoPct === null || i.variacaoPct === 0 ? undefined : i.variacaoPct > 0 ? 'sobe' : 'desce'}
                  comparado={`antes: ${formatar(i.unidade, i.anterior)}`} />
              </div>
            ))}
          </div>
          <p className="apagado">{dados.avisoAlcance}</p>

          {/* 5. Onde melhorar */}
          <section className="cartao" data-teste="onde-melhorar">
            <h2>Onde melhorar</h2>
            {dados.ondeMelhorar.length === 0 ? <p className="apagado">Nada a apontar neste período.</p> : dados.ondeMelhorar.map((a, i) => (
              <div className="achado" key={i} data-teste="achado" data-tipo={a.tipo}>
                <Estado tipo={TIPO[a.tipo].estado}>{TIPO[a.tipo].nome}</Estado>
                <div><strong>{a.titulo}</strong><p className="secundario">{a.porque}</p><p className="apagado">O que fazer: {a.fazer}</p></div>
              </div>
            ))}
            {dados.simulacoes.length > 0 && (
              <div className="secao" data-teste="simulacoes">
                <h3>Quanto cada meta batida renderia</h3>
                <div className="rolagem">
                  <table className="tabela">
                    <thead><tr><th>Meta</th><th>Hoje</th><th>Alvo</th><th>Leads a mais</th><th>Custo por lead</th></tr></thead>
                    <tbody>{dados.simulacoes.map((s) => <tr key={s.meta}><td>{s.meta}</td><td className="mono">{s.atual}</td><td className="mono">{s.alvo}</td><td className="mono">+{s.leadsAMais}</td><td className="mono">{formatar('R$', s.cplNovo)}</td></tr>)}</tbody>
                  </table>
                </div>
                <p className="apagado">Mantendo o investimento e as outras taxas do período.</p>
              </div>
            )}
          </section>

          {/* 6. Públicos */}
          <CartaoGrafico titulo="Públicos" subtitulo="Quem viu, clicou e virou contato. O pedaço que consome mais do que devolve aparece com a barra de cima maior que a de baixo." teste="publicos"
            acoes={<AbasSegmentadas opcoes={Object.values(dados.publicos).map((p) => p.nome)} valor={sel?.nome ?? ''} mudar={(nome) => setDimensao(Object.entries(dados.publicos).find(([, p]) => p.nome === nome)![0])} />}
            tabela={sel ? { colunas: [sel.nome, '% do investimento', '% dos resultados', 'Investimento', 'Conversas'], linhas: sel.linhas.map((l) => [l.rotulo, formatar('%', l.pctInvestimento), formatar('%', l.pctResultados), emReais(l.investimento), l.conversas]) } : undefined}>
            {!sel || sel.linhas.length === 0 ? <p className="apagado">Sem dados de público no período. Eles chegam com a conta da Meta conectada.</p>
              : <BarrasPareadas nomes={['% do investimento', '% dos resultados']} linhas={sel.linhas.map((l) => ({ rotulo: l.rotulo, a: l.pctInvestimento, b: l.pctResultados }))} />}
          </CartaoGrafico>

          {/* 7. Criativos */}
          <section className="cartao" data-teste="criativos">
            <h2>Criativos</h2>
            {dados.criativos.length === 0 ? <p className="apagado">Os anúncios aparecem aqui com a conta da Meta conectada.</p> : (
              <>
                <GraficoQuadrantes formatarX={emReais} formatarY={emReais} limiarX={dados.limiares.investimento} limiarY={dados.limiares.custoResultado}
                  rotulos={{ escalar: 'Manter e escalar', verba: 'Dar mais verba', revisar: 'Revisar já', pausar: 'Pausar ou testar' }}
                  pontos={dados.criativos.filter((c) => c.investimento > 0).map((c) => ({ id: c.id, nome: c.nome, x: c.investimento, y: c.custoResultado, quadrante: c.quadrante }))} />
                <p className="apagado">Linhas tracejadas = medianas dos anúncios do período. Ponto vazado = anúncio sem nenhuma conversa.</p>
                <div className="criativos">
                  {dados.criativos.map((c) => (
                    <article className="criativo" key={c.id} data-teste="criativo" data-id={c.id}>
                      <div className="miniatura">{c.miniatura ? <img src={c.miniatura} alt={`Miniatura do anúncio ${c.nome}`} loading="lazy" /> : <span>{c.formato === 'VIDEO' ? 'Vídeo' : c.formato === 'CARROSSEL' ? 'Carrossel' : 'Imagem'}</span>}</div>
                      <strong>{c.nome}</strong>
                      <span className="apagado">{c.campanha} · {c.conjunto}</span>
                      {c.quadrante && <Estado tipo={c.quadrante === 'Manter e escalar' ? 'bom' : c.quadrante === 'Dar mais verba' ? 'neutro' : c.quadrante === 'Revisar já' ? 'critico' : 'atencao'}>{c.quadrante}</Estado>}
                      <div className="numeros">
                        <span>Investido <b className="mono">{emReais(c.investimento)}</b></span><span>CTR <b className="mono">{formatar('%', c.ctr)}</b></span>
                        <span>Conversas <b className="mono">{c.conversas}</b></span><span>Leads <b className="mono">{c.leads}</b></span>
                        <span>Por conversa <b className="mono">{formatar('R$', c.custoResultado)}</b></span>
                      </div>
                      <span className="apagado">Qualidade: {RANKING[c.rankings.qualidade ?? 'UNKNOWN'] ?? '—'} · Engajamento: {RANKING[c.rankings.engajamento ?? 'UNKNOWN'] ?? '—'} · Conversão: {RANKING[c.rankings.conversao ?? 'UNKNOWN'] ?? '—'}</span>
                      {c.retencao && (
                        <div data-teste="retencao">
                          <span className="apagado">Retenção do vídeo ({c.retencao.plays.toLocaleString('pt-BR')} reproduções)</span>
                          <div className="retencao">
                            {(['p25', 'p50', 'p75', 'p100'] as const).map((k) => <span key={k}><i style={{ height: `${c.retencao![k] ?? 0}%` }} />{c.retencao![k] ?? 0}%<br />{k.slice(1)}%</span>)}
                          </div>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              </>
            )}
          </section>

          {/* 8. Campanhas */}
          <CartaoGrafico titulo="Campanhas" subtitulo="Como a verba se divide e se o resultado acompanha." teste="campanhas"
            tabela={{ colunas: ['Campanha', 'Investimento', '% da verba', '% das conversas', 'Leads', 'Custo por lead'], linhas: dados.campanhas.map((k) => [k.nome, emReais(k.investimento), formatar('%', k.pctInvestimento), formatar('%', k.pctResultados), k.leads, formatar('R$', k.cpl)]) }}>
            {dados.campanhas.length === 0 ? <p className="apagado">As campanhas aparecem com a conta da Meta conectada.</p> : (
              <>
                <BarrasPareadas nomes={['% da verba', '% das conversas']} linhas={dados.campanhas.map((k) => ({ rotulo: k.nome, a: k.pctInvestimento, b: k.pctResultados }))} />
                <div className="rolagem" data-teste="conjuntos">
                  <table className="tabela">
                    <thead><tr><th>Conjunto</th><th>Campanha</th><th>Público</th><th>Otimização</th><th>Orçamento/dia</th><th>Aprendizado</th><th>Investido</th><th>Conversas</th></tr></thead>
                    <tbody>{dados.campanhas.flatMap((k) => k.conjuntos.map((s) => (
                      <tr key={s.id}><td>{s.nome}</td><td>{k.nome}</td><td>{descreverPublico(s.publico)}</td><td>{s.otimizacao ?? '—'}</td>
                        <td className="mono">{s.orcamentoDiario === null ? (k.orcamentoDiario === null ? '—' : 'da campanha') : emReais(s.orcamentoDiario)}</td>
                        <td>{s.faseAprendizado ? <Estado tipo={s.faseAprendizado === 'FAIL' ? 'critico' : s.faseAprendizado === 'LEARNING' ? 'atencao' : 'bom'}>{FASE[s.faseAprendizado] ?? s.faseAprendizado}</Estado> : '—'}</td>
                        <td className="mono">{emReais(s.investimento)}</td><td className="mono">{s.conversas}</td></tr>
                    )))}</tbody>
                  </table>
                </div>
              </>
            )}
          </CartaoGrafico>

          {/* 9. Dia a dia */}
          <CartaoGrafico titulo="Dia a dia" teste="dia-a-dia"
            acoes={<select value={metricaDia} onChange={(e) => setMetricaDia(e.target.value as typeof metricaDia)} aria-label="Métrica do dia a dia" data-teste="metrica-dia">
              {METRICAS_DIA.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}</select>}
            tabela={{ colunas: ['Dia', metrica.nome], linhas: dados.diaADia.map((d) => [dia(d.dia), formatar(metrica.unidade, d[metricaDia] as number | null)]) }}>
            {metrica.forma === 'barras'
              ? <GraficoBarras categorias={dados.diaADia.map((d) => dia(d.dia))} formatar={(v) => formatar(metrica.unidade, v)} rotular={false} series={[{ nome: metrica.nome, cor: metricaDia === 'investimento' ? 'var(--anuncios)' : 'var(--serie-1)', valores: serieDia }]} />
              : <GraficoLinha categorias={dados.diaADia.map((d) => dia(d.dia))} valores={serieDia} formatar={(v) => formatar(metrica.unidade, v)} rotuloSerie={metrica.nome} />}
            <CalendarioCalor dias={dados.diaADia.map((d) => ({ dia: d.dia, valor: d[metricaDia] as number | null }))} formatar={(v) => formatar(metrica.unidade, v)} />
          </CartaoGrafico>

          {/* 10. Qualidade das conversas */}
          <section className="cartao" data-teste="qualidade-conversas">
            <h2>Qualidade das conversas</h2>
            <div className="grade-indicadores">
              <div className="destaque-numero"><span className="apagado">Conversas iniciadas</span><span className="valor mono">{dados.qualidade.conversas.toLocaleString('pt-BR')}</span></div>
              {dados.qualidade.fonte === 'META' && <div className="destaque-numero"><span className="apagado">Passaram da mensagem pronta</span><span className="valor mono">{formatar('%', dados.qualidade.pct)}</span><span className="apagado">{dados.qualidade.passaram} conversas</span></div>}
              <div className="destaque-numero"><span className="apagado">Viraram lead no CRM</span><span className="valor mono">{formatar('%', dados.qualidade.pctLead)}</span><span className="apagado">{dados.qualidade.viraramLead} leads</span></div>
            </div>
            {dados.qualidade.fonte === 'CRM' && <p className="apagado">A Meta não informou a profundidade das conversas (o caso comum do WhatsApp); a qualidade usa quantas viraram lead no CRM.</p>}
          </section>
        </>
      )}
    </div>
  );
}

function descreverPublico(p: Record<string, unknown> | null) {
  if (!p) return '—';
  const partes: string[] = [];
  if (p.idadeMin || p.idadeMax) partes.push(`${p.idadeMin ?? 18}-${p.idadeMax ?? '65+'}`);
  if (Array.isArray(p.generos)) partes.push((p.generos as number[]).map((g) => (g === 1 ? 'homens' : 'mulheres')).join(' e '));
  if (Array.isArray(p.locais) && p.locais.length) partes.push((p.locais as string[]).join(', '));
  if (Array.isArray(p.interesses) && p.interesses.length) partes.push(`interesses: ${(p.interesses as string[]).slice(0, 3).join(', ')}`);
  if (p.advantage) partes.push('Advantage+');
  return partes.join(' · ') || 'aberto';
}

function Conectar({ conexao, abrir, setAbrir, aposMudar }: { conexao: Conexao; abrir: boolean; setAbrir: (v: boolean) => void; aposMudar: () => void }) {
  const [token, setToken] = useState('');
  const [contas, setContas] = useState<Array<{ id: string; nome: string; ativa: boolean; moeda: string | null }> | null>(null);
  const [diagnostico, setDiagnostico] = useState<Array<{ item: string; ok: boolean; detalhe: string }> | null>(null);
  const [erro, setErro] = useState('');
  const [gasto, setGasto] = useState(false);
  const c = conexao.conexao;
  const mesAtual = new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 7);

  async function listarContas() {
    setErro(''); setContas(null);
    try { setContas(await chamar('POST', '/trafego/conexao/contas', { token })); } catch (e) { setErro((e as Error).message); }
  }
  async function conectar(contaId: string) {
    setErro('');
    const r = await fetch('/api/px/trafego/conexao', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, contaId }) });
    const corpo = await r.json();
    if (!r.ok) { setErro(corpo.erro); setDiagnostico(corpo.diagnostico ?? null); return; }
    setDiagnostico(corpo.diagnostico); setToken(''); setContas(null); setAbrir(false);
    // Primeira carga: a estrutura e os últimos dias. O histórico de 90 dias completa pela rotina do dia ou por "Sincronizar agora".
    try { await chamar('POST', '/trafego/sincronizar', { parte: 'estrutura' }); await chamar('POST', '/trafego/sincronizar', { parte: 'dias' }); } catch { /* aparece no próximo diagnóstico */ }
    aposMudar();
  }
  async function desconectar() {
    try { await chamar('POST', '/trafego/conexao/desconectar', {}); aposMudar(); } catch (e) { setErro((e as Error).message); }
  }

  return (
    <section className="cartao" data-teste="conexao">
      <div className="cabecalho-linha">
        <div>
          <h2>Conexão com a Meta</h2>
          {c ? <p className="apagado" data-teste="conta-conectada">Conta {c.contaNome ?? c.contaId} ({c.contaId}) · token {c.token} · API {conexao.versaoApi}</p>
            : <p className="apagado">Nenhuma conta de anúncios conectada.{conexao.gastoManual.length ? ' Usando o gasto digitado pelos Sócios.' : ''}</p>}
        </div>
        <div className="acoes-grafico">
          {conexao.podeConectar && <button className="botao pequeno" onClick={() => { setGasto(true); setErro(''); }} data-teste="gasto-manual">Digitar gasto do mês</button>}
          {conexao.podeConectar && (c ? <button className="botao pequeno fantasma" onClick={desconectar} data-teste="desconectar">Desconectar</button>
            : <button className="botao pequeno principal-acao" onClick={() => setAbrir(true)} data-teste="conectar">Conectar a conta</button>)}
        </div>
      </div>
      {c?.ultimoErro && <p className="erro" data-teste="erro-sincronizacao">Última sincronização: {c.ultimoErro}</p>}
      {c?.diagnostico && (
        <div className="fila" data-teste="diagnostico">
          {c.diagnostico.map((d) => <div className="fila-item" key={d.item}><span><strong>{d.item}</strong> · {d.detalhe}</span><Estado tipo={d.ok ? 'bom' : 'critico'}>{d.ok ? 'Ok' : 'Problema'}</Estado></div>)}
        </div>
      )}
      {!conexao.chaveConfigurada && conexao.podeConectar && <p className="secundario">Antes de conectar, quem cuida do servidor precisa definir a variável META_CHAVE (é ela que cifra o token).</p>}
      {conexao.gastoManual.length > 0 && <p className="apagado">Gasto digitado: {conexao.gastoManual.map((g) => `${g.competencia.split('-').reverse().join('/')} ${emReais(g.valor)}`).join(' · ')}</p>}

      {abrir && (
        <Modal titulo="Conectar a conta de anúncios" fechar={() => setAbrir(false)}>
          <div style={{ display: 'grid', gap: 14 }}>
            <ol className="passos-token">
              <li>No <strong>Gerenciador de Negócios</strong> da Meta, abra Configurações do negócio → Usuários → <strong>Usuários do sistema</strong> e crie um (função Administrador).</li>
              <li>Em <strong>Atribuir ativos</strong>, dê a ele acesso à conta de anúncios da Avulte.</li>
              <li>Clique em <strong>Gerar novo token</strong>, escolha o app, marque a permissão <strong>ads_read</strong> e a validade <strong>Nunca</strong>.</li>
              <li>Copie o token e cole abaixo. Ele fica guardado cifrado; ninguém mais vê o token inteiro.</li>
            </ol>
            <label className="campo"><span>Token de acesso</span><input type="password" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" data-teste="campo-token" /></label>
            {erro && <p className="erro" role="alert" data-teste="erro-formulario">{erro}</p>}
            {diagnostico && <div className="fila">{diagnostico.map((d) => <div className="fila-item" key={d.item}><span><strong>{d.item}</strong> · {d.detalhe}</span><Estado tipo={d.ok ? 'bom' : 'critico'}>{d.ok ? 'Ok' : 'Problema'}</Estado></div>)}</div>}
            {contas && (contas.length === 0 ? <p className="apagado">Este token não enxerga nenhuma conta de anúncios.</p> : (
              <div className="fila">
                {contas.map((k) => (
                  <div className="fila-item" key={k.id}>
                    <span><strong>{k.nome}</strong> · {k.id}{k.moeda ? ` · ${k.moeda}` : ''} {!k.ativa && <Estado tipo="atencao">Inativa</Estado>}</span>
                    <button className="botao pequeno principal-acao" onClick={() => conectar(k.id)} data-teste="escolher-conta">Conectar esta</button>
                  </div>
                ))}
              </div>
            ))}
            <div className="acoes">
              <button className="botao fantasma" onClick={() => setAbrir(false)}>Cancelar</button>
              <button className="botao principal-acao" onClick={listarContas} disabled={token.trim().length < 20} data-teste="ver-contas">Ver as contas do token</button>
            </div>
          </div>
        </Modal>
      )}

      {gasto && (
        <Modal titulo="Gasto com anúncios do mês (sem conexão)" fechar={() => setGasto(false)}>
          <form style={{ display: 'grid', gap: 14 }} onSubmit={async (ev) => {
            ev.preventDefault();
            const f = new FormData(ev.currentTarget);
            setErro('');
            try { await chamar('PUT', '/trafego/gasto-manual', { competencia: String(f.get('competencia')), valor: lerNumero(f.get('valor')) ?? -1 }); setGasto(false); aposMudar(); }
            catch (e) { setErro((e as Error).message); }
          }}>
            <p className="apagado">Sem a conta da Meta conectada, o sistema divide o valor igualmente pelos dias do mês para calcular o custo por lead, o ROAS e o lucro. Num mês com dados da Meta, vale o número da Meta.</p>
            <div className="linha-campos">
              <label className="campo"><span>Mês</span><input type="month" name="competencia" defaultValue={mesAtual} required /></label>
              <label className="campo"><span>Gasto total do mês (R$)</span><input name="valor" inputMode="decimal" required data-teste="valor-gasto" /></label>
            </div>
            {erro && <p className="erro" role="alert" data-teste="erro-formulario">{erro}</p>}
            <div className="acoes">
              <button type="button" className="botao fantasma" onClick={() => setGasto(false)}>Cancelar</button>
              <button type="submit" className="botao principal-acao" data-teste="salvar-gasto">Salvar</button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
