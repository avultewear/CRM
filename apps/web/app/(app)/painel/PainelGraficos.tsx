'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { BarrasHorizontais, CartaoGrafico, FaixaFunil, GraficoBarras, GraficoLinha } from '@/components/graficos';
import { CartaoIndicador, Estado, TelaVazia } from '@/components/ui';
import { emReais, emTempo } from '@/lib/formato';
import type { EtapaJornada, Indicador, Indicadores, Jornada, Ranking, Series } from './tipos';

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const ORIGEM: Record<string, string> = { ANUNCIO: 'Anúncio', POST: 'Post', INFLUENCIADOR: 'Influenciador', INDICACAO: 'Indicação', ORGANICO: 'Orgânico', OUTRO: 'Outro' };
const CANAIS = [['', 'Todos os canais'], ['WHATSAPP', 'WhatsApp'], ['INSTAGRAM', 'Instagram'], ['SITE', 'Site'], ['MANUAL', 'À mão']];
const COR: Record<string, string> = { pro_labore: 'var(--prolabore)', gasto_anuncios: 'var(--anuncios)', ticket_medio: 'var(--ambar)', roas: 'var(--funil)' };
const nomeMes = (mes: string) => `${MESES[Number(mes.slice(5)) - 1]}/${mes.slice(2, 4)}`;
const dia = (iso: string) => iso.split('-').reverse().slice(0, 2).join('/');

function formatar(unidade: string, v: number | null): string {
  if (v === null) return '—';
  if (unidade === 'R$') return emReais(v);
  if (unidade === '%') return `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
  if (unidade === 'x') return `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}x`;
  if (unidade === 'dias') return `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} dias`;
  return v.toLocaleString('pt-BR');
}

function Cartao({ i, comparado }: { i: Indicador; comparado: string }) {
  const variacao = i.variacaoPct === null ? '—' : `${i.variacaoPct > 0 ? '+' : i.variacaoPct < 0 ? '−' : ''}${Math.abs(i.variacaoPct).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
  const texto = i.pendente ?? (i.janela ? i.janela : `${comparado}${i.projecao !== null ? ` · projeção ${formatar(i.unidade, i.projecao)}` : ''}`);
  return (
    <CartaoIndicador metrica={i.id} rotulo={i.nome} valor={formatar(i.unidade, i.valor)} cor={COR[i.id]}
      variacao={i.pendente || i.janela ? '' : variacao} comparado={texto} bomQuando={i.melhorQuando}
      direcao={i.variacaoPct === null || i.variacaoPct === 0 ? undefined : i.variacaoPct > 0 ? 'sobe' : 'desce'} />
  );
}

export function PainelGraficos({ mes, vendedorId, jVendedor, jCanal, socio, frase, indicadores, series, ranking, jornada, vendedores }: {
  mes: string; vendedorId: string; jVendedor: string; jCanal: string; socio: boolean; frase: string | null;
  indicadores: Indicadores; series: Series; ranking: Ranking; jornada: Jornada; vendedores: Array<{ id: string; nome: string }>;
}) {
  const router = useRouter();
  const ir = (mudancas: Record<string, string>) => {
    const q = new URLSearchParams({ sub: 'painel', mes, ...(vendedorId ? { vendedor: vendedorId } : {}), ...(jVendedor ? { jvendedor: jVendedor } : {}), ...(jCanal ? { jcanal: jCanal } : {}) });
    for (const [k, v] of Object.entries(mudancas)) { if (v) q.set(k, v); else q.delete(k); }
    router.push(`/painel?${q}`);
  };
  const doAno = series.series;
  const indiceMes = doAno.findIndex((s) => s.mes === mes);
  const [selecionado, setSelecionado] = useState<number>(indiceMes);
  const sel = doAno[selecionado] ?? doAno[indiceMes];
  const comparado = `vs. ${dia(indicadores.comparadoCom.inicio)} a ${dia(indicadores.comparadoCom.fim)}`;
  const mesAtual = new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 7);
  const passado = doAno.filter((s) => !s.futuro);
  const rotulos = passado.map((s) => MESES[Number(s.mes.slice(5)) - 1]);
  const ind = (id: string) => indicadores.indicadores.find((i) => i.id === id);
  const lucro = ind('lucro');
  const semVendas = indicadores.indicadores.every((i) => i.valor === null || i.valor === 0);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="filtros" data-teste="filtros-painel">
        <div className="chips" aria-label="Mês">
          {MESES.map((nome, i) => {
            const m = `${series.ano}-${String(i + 1).padStart(2, '0')}`;
            return <button key={m} className="chip" aria-pressed={m === mes} disabled={m > mesAtual} onClick={() => ir({ mes: m })} data-mes={m}>{nome}</button>;
          })}
        </div>
        <label className="campo" style={{ minWidth: 200 }}>
          <span>Vendedor</span>
          <select value={vendedorId} onChange={(e) => ir({ vendedor: e.target.value })} data-teste="filtro-vendedor">
            <option value="">Toda a equipe</option>
            {vendedores.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
          </select>
        </label>
      </div>

      <div className="grade-indicadores" data-teste="indicadores">
        {indicadores.indicadores.map((i) => <div key={i.id} data-teste="indicador" data-metrica={i.id} style={{ display: 'grid' }}><Cartao i={i} comparado={comparado} /></div>)}
      </div>
      {lucro && <p className="apagado" data-teste="obs-lucro">Lucro: {lucro.observacao} <Link href="/financeiro">Lançar custos do mês</Link>.</p>}
      {semVendas && <p className="secundario">Ainda não há vendas confirmadas neste mês. Os gráficos se enchem com as primeiras vendas.</p>}

      <section className="cartao" data-teste="visao-anual">
        <h2>Visão de {series.ano}</h2>
        <div className="visao-anual">
          <span className="grande mono" data-teste="acumulado-ano">{emReais(series.anual.acumulado)}</span>
          <div style={{ display: 'grid', gap: 6 }}>
            {series.anual.meta === null ? <span className="apagado">Sem meta anual. {socio && <Link href="/metas">Definir em Metas</Link>}</span> : (
              <>
                <span className="apagado">Meta do ano {emReais(series.anual.meta)} · {series.anual.progressoPct?.toLocaleString('pt-BR')}% · faltam <b className="mono">{emReais(series.anual.faltam ?? 0)}</b></span>
                <div className="progresso" role="progressbar" aria-valuenow={series.anual.progressoPct ?? 0} aria-valuemin={0} aria-valuemax={100}>
                  <span style={{ width: `${Math.min(100, series.anual.progressoPct ?? 0)}%` }} />
                </div>
              </>
            )}
          </div>
        </div>
        {frase && <p className="frase">“{frase}”</p>}
      </section>

      <div className="grade-graficos">
        <CartaoGrafico titulo="Receita mês a mês" subtitulo="Clique num mês para ver os números dele." teste="grafico-receita"
          tabela={{ colunas: ['Mês', 'Receita', 'Vendas', 'Ticket'], linhas: passado.map((s) => [nomeMes(s.mes), formatar('R$', s.receita), s.vendas ?? 0, formatar('R$', s.ticket)]) }}>
          <GraficoLinha categorias={rotulos} valores={passado.map((s) => s.receita)} formatar={emReais} rotuloSerie="Receita" selecionado={selecionado} aoSelecionar={setSelecionado} />
          {sel && (
            <div className="ficha-dados" data-teste="mes-selecionado">
              <span>{nomeMes(sel.mes)}</span><span />
              <span>Receita</span><span className="mono">{formatar('R$', sel.receita)}</span>
              <span>Vendas</span><span className="mono">{sel.vendas ?? '—'}</span>
              <span>Ticket médio</span><span className="mono">{formatar('R$', sel.ticket)}</span>
              {socio && <><span>Pró-labore</span><span className="mono">{formatar('R$', sel.proLabore ?? null)}</span></>}
              {socio && <><span>Comissões geradas</span><span className="mono">{formatar('R$', sel.comissoesGeradas ?? null)}</span></>}
              {socio && <><span>Gasto com anúncios</span><span className="apagado">entra com o Tráfego (etapa 7)</span></>}
            </div>
          )}
        </CartaoGrafico>

        {socio && (() => {
          const vend = passado.map((s) => s.comissoesPagasVendedores ?? 0);
          const infl = passado.map((s) => s.comissoesPagasInfluenciadores ?? 0);
          const total = vend.reduce((a, b) => a + b, 0) + infl.reduce((a, b) => a + b, 0);
          const vendas = passado.reduce((a, s) => a + (s.vendas ?? 0), 0);
          return (
            <CartaoGrafico titulo="Comissões pagas por mês" teste="grafico-comissoes"
              subtitulo={<>Total no ano <b className="mono">{emReais(total)}</b> · média por venda <b className="mono">{vendas ? emReais(total / vendas) : '—'}</b></>}
              tabela={{ colunas: ['Mês', 'Vendedores', 'Influenciadores'], linhas: passado.map((s, i) => [nomeMes(s.mes), emReais(vend[i]), emReais(infl[i])]) }}>
              {total === 0 ? <p className="apagado">Nenhuma comissão paga em {series.ano}. Elas aparecem aqui quando um Sócio marcar o pagamento no Financeiro.</p> : (
                <GraficoBarras categorias={rotulos} formatar={emReais} rotular={false}
                  series={[{ nome: 'Vendedores', cor: 'var(--serie-1)', valores: vend }, { nome: 'Influenciadores', cor: 'var(--serie-2)', valores: infl }]} />
              )}
            </CartaoGrafico>
          );
        })()}

        {socio && (
          <CartaoGrafico titulo="Pró-labore mês a mês" teste="grafico-prolabore"
            subtitulo={sel?.proLaboreMedioPorVenda ? <>Médio por venda em {nomeMes(sel.mes)}: <b className="mono">{emReais(sel.proLaboreMedioPorVenda)}</b></> : 'Total de cada mês.'}
            tabela={{ colunas: ['Mês', 'Pró-labore', 'Médio por venda'], linhas: passado.map((s) => [nomeMes(s.mes), formatar('R$', s.proLabore ?? null), formatar('R$', s.proLaboreMedioPorVenda ?? null)]) }}>
            <GraficoBarras categorias={rotulos} formatar={emReais} series={[{ nome: 'Pró-labore', cor: 'var(--prolabore)', valores: passado.map((s) => s.proLabore ?? null) }]} />
          </CartaoGrafico>
        )}

        <CartaoGrafico titulo="Clientes novos e recorrentes" teste="grafico-clientes"
          subtitulo={<>Recompra {formatar('%', ind('taxa_recompra')?.valor ?? null)} · LTV {formatar('R$', ind('ltv')?.valor ?? null)}{socio ? ' · CAC entra com o Tráfego (etapa 7)' : ''}</>}
          tabela={{ colunas: ['Mês', 'Novos', 'Recorrentes'], linhas: passado.map((s) => [nomeMes(s.mes), s.clientesNovos ?? 0, s.clientesRecorrentes ?? 0]) }}>
          <GraficoBarras categorias={rotulos} formatar={(v) => `${v} clientes`} rotular={false}
            series={[{ nome: 'Novos', cor: 'var(--serie-1)', valores: passado.map((s) => s.clientesNovos) }, { nome: 'Recorrentes', cor: 'var(--serie-2)', valores: passado.map((s) => s.clientesRecorrentes) }]} />
        </CartaoGrafico>
      </div>

      <JornadaAtendimento jornada={jornada} socio={socio} vendedores={vendedores} jVendedor={jVendedor} jCanal={jCanal} mes={mes} ir={ir} />

      <section className="cartao" data-teste="onde-perdemos">
        <h2>Onde e por que perdemos</h2>
        {jornada.etapas.every((e) => e.perdas.total === 0) ? <p className="apagado">Nenhuma perda registrada em {nomeMes(mes)}.</p> : (
          <div className="grade-graficos">
            {jornada.etapas.filter((e) => e.perdas.total > 0).map((e) => (
              <div key={e.etapa}>
                <strong>{e.nome}</strong> <span className="mono apagado">{e.perdas.total} {e.perdas.total === 1 ? 'perda' : 'perdas'}</span>
                <BarrasHorizontais itens={e.perdas.motivos.map((m) => ({ rotulo: m.nome, valor: m.quantidade }))} formatar={(v) => String(v)} cor="var(--serie-1)" />
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grade-graficos">
        <CartaoGrafico titulo={`Ranking de vendedores em ${nomeMes(mes)}`} teste="ranking-vendedores"
          tabela={{ colunas: ['Vendedor', 'Receita', 'Vendas', ...(socio ? ['Comissão'] : [])], linhas: ranking.vendedores.map((v) => [v.nome, emReais(v.receita), v.vendas, ...(socio ? [emReais(v.comissao ?? 0)] : [])]) }}>
          {ranking.vendedores.length === 0 ? <p className="apagado">Nenhuma venda confirmada no mês.</p> : (
            <BarrasHorizontais formatar={emReais}
              itens={ranking.vendedores.map((v) => ({ rotulo: v.nome, valor: v.receita, detalhe: `${v.vendas} ${v.vendas === 1 ? 'venda' : 'vendas'}${socio ? ` · comissão ${emReais(v.comissao ?? 0)}` : ''}` }))} />
          )}
        </CartaoGrafico>
        <CartaoGrafico titulo="ROAS mensal">
          <TelaVazia titulo="Entra com o Tráfego (etapa 7)" texto="Com a conta de anúncios da Meta conectada, aqui aparecem o ROAS de cada mês, o gasto, o custo por venda e o custo por lead." />
        </CartaoGrafico>
      </div>

      <details className="cartao" data-teste="painel-detalhado">
        <summary><strong>Painel detalhado</strong> <span className="apagado">influenciadores, origem e séries mensais</span></summary>
        <div className="grade-graficos" style={{ marginTop: 12 }}>
          <CartaoGrafico titulo="Influenciadores por vendas com cupom" tabela={{ colunas: ['Influenciador', 'Vendas', 'Receita'], linhas: ranking.influenciadores.map((i) => [i.nome, i.vendas, emReais(i.receita)]) }}>
            {ranking.influenciadores.length === 0 ? <p className="apagado">Nenhuma venda com cupom no mês.</p>
              : <BarrasHorizontais formatar={emReais} itens={ranking.influenciadores.map((i) => ({ rotulo: i.nome, valor: i.receita, detalhe: `${i.vendas} vendas` }))} />}
          </CartaoGrafico>
          <CartaoGrafico titulo="Faturamento por origem" tabela={{ colunas: ['Origem', 'Receita'], linhas: ranking.porOrigem.map((o) => [ORIGEM[o.origem] ?? o.origem, emReais(o.receita)]) }}>
            {ranking.porOrigem.length === 0 ? <p className="apagado">Nenhuma venda confirmada no mês.</p>
              : <BarrasHorizontais formatar={emReais} itens={ranking.porOrigem.map((o) => ({ rotulo: ORIGEM[o.origem] ?? o.origem, valor: o.receita }))} />}
          </CartaoGrafico>
          <CartaoGrafico titulo="Ticket médio mês a mês" tabela={{ colunas: ['Mês', 'Ticket'], linhas: passado.map((s) => [nomeMes(s.mes), formatar('R$', s.ticket)]) }}>
            <GraficoLinha categorias={rotulos} valores={passado.map((s) => s.ticket)} formatar={emReais} rotuloSerie="Ticket médio" />
          </CartaoGrafico>
        </div>
        <p className="apagado">Filtros por influenciador, origem e canal valendo para tudo, e as séries de ROAS e custo por lead, entram com a loja (etapa 2) e o Tráfego (etapa 7).</p>
      </details>
    </div>
  );
}

function JornadaAtendimento({ jornada, socio, vendedores, jVendedor, jCanal, mes, ir }: {
  jornada: Jornada; socio: boolean; vendedores: Array<{ id: string; nome: string }>; jVendedor: string; jCanal: string; mes: string;
  ir: (m: Record<string, string>) => void;
}) {
  const [copiado, setCopiado] = useState(false);
  const topo = jornada.etapas.find((e) => e.etapa === 'LEAD')?.entraram ?? 0;
  const ordem = ['LEAD', 'ABORDADO', 'LEVANTAMENTO', 'NEGOCIACAO', 'VENDA', 'RECUPERACAO'];
  const etapas = ordem.map((id) => jornada.etapas.find((e) => e.etapa === id)).filter(Boolean) as EtapaJornada[];
  const relatorio = () => [
    `Jornada de atendimento · ${nomeMes(mes)}`,
    ...etapas.map((e) => `${e.nome}: ${e.entraram} · conversão ${formatar('%', e.conversaoPct)} · perdas ${e.perdas.total}${e.meta !== null ? ` · meta ${e.meta}%` : ''}${jornada.gargalo === e.etapa ? ' · GARGALO' : ''}`),
  ].join('\n');
  async function copiar() {
    try { await navigator.clipboard.writeText(relatorio()); setCopiado(true); setTimeout(() => setCopiado(false), 2500); } catch { /* sem permissão */ }
  }
  const fasesDe = [['Pré-venda', 3], ['Venda', 1], ['Fechamento', 1], ['Recuperação', 1]] as const;
  return (
    <section className="cartao jornada" data-teste="jornada">
      <div className="cabecalho-linha">
        <div>
          <h2>Jornada de atendimento</h2>
          <p className="apagado">{nomeMes(mes)} · conversão de cada etapa para a seguinte{jornada.metasDefinidas ? '' : ' · sem metas por etapa em Metas, as cores ficam neutras'}</p>
        </div>
        <div className="acoes-grafico">
          <select value={jVendedor} onChange={(e) => ir({ jvendedor: e.target.value })} aria-label="Vendedor da jornada">
            <option value="">Toda a equipe</option>
            {vendedores.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
          </select>
          <select value={jCanal} onChange={(e) => ir({ jcanal: e.target.value })} aria-label="Canal da jornada" data-teste="filtro-canal">
            {CANAIS.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
          </select>
          <button className="botao pequeno" onClick={copiar} data-teste="copiar-relatorio">{copiado ? 'Copiado' : 'Copiar relatório'}</button>
        </div>
      </div>
      <div className="rolagem-jornada">
        <div className="fases" style={{ gridTemplateColumns: fasesDe.map(([, n]) => `${n}fr`).join(' ') }}>
          {fasesDe.map(([fase]) => {
            const f = jornada.fases.find((x) => x.fase === fase);
            return <span key={fase}>{fase} · {f?.entraram ?? 0}{socio && f?.oportunidade ? ` · ${emReais(f.oportunidade)}` : ''}</span>;
          })}
        </div>
        <div className="colunas">
          {etapas.map((e) => (
            <div key={e.etapa} className="etapa-jornada">
              <Link className="nome-etapa" href={`/atendimento?etapa=${e.etapa}`}>{e.nome}</Link>
              {jornada.gargalo === e.etapa && <span className="selo-gargalo" data-teste="gargalo">gargalo</span>}
              {socio && e.reais && (
                <div className="reais" data-teste="reais-etapa">
                  <span>Oportunidade <b className="mono">{emReais(e.reais.oportunidade)}</b></span>
                  <span>Pró-labore previsto <b className="mono">{formatar('R$', e.reais.proLaborePrevisto)}</b></span>
                  <span>Comissão prevista <b className="mono">{formatar('R$', e.reais.comissaoPrevista)}</b></span>
                  <span>Comissão perdida <b className="mono">{formatar('R$', e.reais.comissaoPerdida)}</b></span>
                </div>
              )}
            </div>
          ))}
        </div>
        <FaixaFunil etapas={etapas.map((e) => ({ id: e.etapa, nome: e.nome, volume: e.entraram, situacao: e.situacao, pctDoTopo: topo ? (e.entraram / topo) * 100 : null }))} />
        <div className="colunas">
          {etapas.map((e) => (
            <div key={e.etapa} className="etapa-jornada" data-teste="etapa-jornada" data-etapa={e.etapa}>
              <span className="volume mono">{e.entraram}</span>
              <Estado tipo={e.situacao}>{e.situacao === 'bom' ? 'Na meta' : e.situacao === 'atencao' ? 'Atenção' : e.situacao === 'critico' ? 'Fora da meta' : 'Sem meta'}</Estado>
              {e.etapa !== 'VENDA' && <span>Conversão <b className="mono">{formatar('%', e.conversaoPct)}</b></span>}
              <span>Perda <b className="mono">{e.perdas.total}{e.perdaPct !== null ? ` (${formatar('%', e.perdaPct)})` : ''}</b></span>
              {e.perdas.motivos.map((m) => <span key={m.motivo} className="apagado">{m.nome}: {m.quantidade}</span>)}
              <span>Tempo <b className="mono">{e.tempoMedianoHoras === null ? '—' : emTempo(e.tempoMedianoHoras)}</b>{jornada.tempoMaximoHoras !== null ? <span className="apagado"> / máx. {emTempo(jornada.tempoMaximoHoras)}</span> : ''}</span>
              {e.etapa !== 'VENDA' && (e.meta === null
                ? socio ? <Link href="/metas" className="apagado">Definir meta</Link> : <span className="apagado">Sem meta</span>
                : <span>Meta <b className="mono">{e.meta}%</b> <Estado tipo={e.metaOk === null ? 'neutro' : e.metaOk ? 'bom' : 'critico'}>{e.metaOk === null ? '—' : e.metaOk ? 'ok' : 'fora'}</Estado></span>)}
              <span className="apagado">Custo: entra na etapa 7</span>
            </div>
          ))}
        </div>
      </div>
      <p className="apagado">{jornada.exclusoes}</p>
    </section>
  );
}
