'use client';

import { useEffect, useRef, useState } from 'react';

/* Gráficos do sistema, em SVG puro. Regras (skill dataviz): marcas finas, linha de 2 px, barras de até 24 px
   com ponta arredondada de 4 px e base reta, 2 px de folga entre barras vizinhas, grade fina e discreta,
   legenda quando há duas séries, rótulos na tinta (nunca na cor da série), dica ao passar o mouse
   e "Ver tabela" em todo gráfico. Cores: --serie-1 / --serie-2 (validadas no claro e no escuro). */

export type Formato = (v: number) => string;

function useLargura<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [largura, setLargura] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const obs = new ResizeObserver(([e]) => setLargura(Math.floor(e.contentRect.width)));
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return [ref, largura] as const;
}

/** Marcas redondas no eixo: 0, 1, 2, 2,5 ou 5 × 10ⁿ. */
function marcasDoEixo(maximo: number, quantas = 4): number[] {
  if (!(maximo > 0)) return [0, 1];
  const bruto = maximo / quantas;
  const base = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * base).find((p) => p >= bruto) ?? 10 * base;
  const topo = Math.ceil(maximo / passo) * passo;
  return Array.from({ length: Math.round(topo / passo) + 1 }, (_, i) => i * passo);
}
export const compacto = (v: number) => (Math.abs(v) >= 10_000 ? `${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : v.toLocaleString('pt-BR', { maximumFractionDigits: 0 }));

interface Dica { x: number; y: number; titulo: string; linhas: Array<{ cor?: string; rotulo: string; valor: string }> }
function CaixaDica({ dica }: { dica: Dica | null }) {
  if (!dica) return null;
  return (
    <div className="dica-grafico" style={{ left: dica.x, top: dica.y }} role="status">
      <strong>{dica.titulo}</strong>
      {dica.linhas.map((l) => (
        <span key={l.rotulo}>{l.cor && <i style={{ background: l.cor }} />}{l.rotulo}: <b className="mono">{l.valor}</b></span>
      ))}
    </div>
  );
}

export function Legenda({ series }: { series: Array<{ nome: string; cor: string }> }) {
  if (series.length < 2) return null;
  return (
    <div className="legenda-grafico">
      {series.map((s) => <span key={s.nome}><i style={{ background: s.cor }} />{s.nome}</span>)}
    </div>
  );
}

/** Cartão de gráfico: título, ações, o gráfico e a tabela equivalente ("Ver tabela"). */
export function CartaoGrafico({ titulo, subtitulo, acoes, tabela, children, teste }: {
  titulo: string; subtitulo?: React.ReactNode; acoes?: React.ReactNode; teste?: string;
  tabela?: { colunas: string[]; linhas: Array<Array<string | number>> };
  children: React.ReactNode;
}) {
  const [verTabela, setVerTabela] = useState(false);
  return (
    <section className="cartao cartao-grafico" data-teste={teste}>
      <div className="cabecalho-linha">
        <div>
          <h2>{titulo}</h2>
          {subtitulo && <p className="apagado">{subtitulo}</p>}
        </div>
        <div className="acoes-grafico">
          {acoes}
          {tabela && <button className="botao pequeno fantasma" onClick={() => setVerTabela((v) => !v)} aria-pressed={verTabela} data-teste="ver-tabela">{verTabela ? 'Ver gráfico' : 'Ver tabela'}</button>}
        </div>
      </div>
      {verTabela && tabela ? (
        <div className="rolagem">
          <table className="tabela">
            <thead><tr>{tabela.colunas.map((c) => <th key={c}>{c}</th>)}</tr></thead>
            <tbody>{tabela.linhas.map((l, i) => <tr key={i}>{l.map((c, j) => <td key={j} className={j ? 'mono' : undefined}>{c}</td>)}</tr>)}</tbody>
          </table>
        </div>
      ) : children}
    </section>
  );
}

const ALTURA = 220;
const MARGEM = { topo: 12, direita: 12, base: 26, esquerda: 52 };

/** Linha de uma série (ex.: receita mês a mês). Clicar num ponto seleciona a categoria. */
export function GraficoLinha({ categorias, valores, formatar, cor = 'var(--serie-1)', selecionado, aoSelecionar, rotuloSerie }: {
  categorias: string[]; valores: Array<number | null>; formatar: Formato; cor?: string; rotuloSerie: string;
  selecionado?: number | null; aoSelecionar?: (i: number) => void;
}) {
  const [ref, largura] = useLargura<HTMLDivElement>();
  const [foco, setFoco] = useState<number | null>(null);
  const w = Math.max(largura, 280);
  const ih = ALTURA - MARGEM.topo - MARGEM.base;
  const iw = w - MARGEM.esquerda - MARGEM.direita;
  const marcas = marcasDoEixo(Math.max(0, ...valores.map((v) => v ?? 0)));
  const topo = marcas[marcas.length - 1];
  const x = (i: number) => MARGEM.esquerda + (categorias.length < 2 ? iw / 2 : (i * iw) / (categorias.length - 1));
  const y = (v: number) => MARGEM.topo + ih - (v / topo) * ih;
  const pontos = valores.map((v, i) => (v === null ? null : { i, x: x(i), y: y(v), v }));
  const trechos: string[] = [];
  let atual = '';
  for (const p of pontos) {
    if (!p) { if (atual) trechos.push(atual); atual = ''; continue; }
    atual += `${atual ? 'L' : 'M'}${p.x},${p.y}`;
  }
  if (atual) trechos.push(atual);
  const validos = pontos.filter(Boolean) as Array<{ i: number; x: number; y: number; v: number }>;
  const area = validos.length > 1 ? `M${validos[0].x},${y(0)} ${validos.map((p) => `L${p.x},${p.y}`).join(' ')} L${validos[validos.length - 1].x},${y(0)} Z` : '';
  const ultimo = validos[validos.length - 1];
  const faixa = categorias.length > 1 ? iw / (categorias.length - 1) : iw;
  return (
    <div className="grafico" ref={ref} onMouseLeave={() => setFoco(null)}>
      <svg width={w} height={ALTURA} role="img" aria-label={rotuloSerie}>
        {marcas.map((m) => (
          <g key={m}>
            <line x1={MARGEM.esquerda} x2={w - MARGEM.direita} y1={y(m)} y2={y(m)} className="grade" />
            <text x={MARGEM.esquerda - 8} y={y(m)} className="eixo" textAnchor="end" dominantBaseline="middle">{compacto(m)}</text>
          </g>
        ))}
        {categorias.map((c, i) => <text key={c} x={x(i)} y={ALTURA - 8} className="eixo" textAnchor="middle">{c}</text>)}
        {area && <path d={area} fill={cor} opacity={0.1} />}
        {trechos.map((d) => <path key={d} d={d} fill="none" stroke={cor} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />)}
        {foco !== null && <line x1={x(foco)} x2={x(foco)} y1={MARGEM.topo} y2={MARGEM.topo + ih} className="mira" />}
        {validos.map((p) => (
          <circle key={p.i} cx={p.x} cy={p.y} r={p.i === selecionado || p.i === foco ? 5 : 4} fill={cor} stroke="var(--superficie)" strokeWidth={2} />
        ))}
        {ultimo && <text x={Math.min(ultimo.x, w - MARGEM.direita - 4)} y={ultimo.y - 10} className="rotulo-dado" textAnchor="end">{formatar(ultimo.v)}</text>}
        {categorias.map((c, i) => (
          <rect key={c} x={x(i) - faixa / 2} y={MARGEM.topo} width={faixa} height={ih} fill="transparent" style={{ cursor: aoSelecionar ? 'pointer' : 'default' }}
            onMouseEnter={() => setFoco(i)} onClick={() => aoSelecionar?.(i)} data-teste="ponto-grafico" />
        ))}
      </svg>
      <CaixaDica dica={foco === null ? null : {
        x: Math.min(x(foco) + 12, w - 170), y: 8, titulo: categorias[foco],
        linhas: [{ cor, rotulo: rotuloSerie, valor: valores[foco] === null ? '—' : formatar(valores[foco]!) }],
      }} />
    </div>
  );
}

/** Colunas agrupadas (uma ou duas séries por categoria). */
export function GraficoBarras({ categorias, series, formatar, rotular = true }: {
  categorias: string[]; series: Array<{ nome: string; cor: string; valores: Array<number | null> }>; formatar: Formato; rotular?: boolean;
}) {
  const [ref, largura] = useLargura<HTMLDivElement>();
  const [foco, setFoco] = useState<number | null>(null);
  const w = Math.max(largura, 280);
  const ih = ALTURA - MARGEM.topo - MARGEM.base;
  const iw = w - MARGEM.esquerda - MARGEM.direita;
  const marcas = marcasDoEixo(Math.max(0, ...series.flatMap((s) => s.valores.map((v) => v ?? 0))));
  const topo = marcas[marcas.length - 1];
  const y = (v: number) => MARGEM.topo + ih - (v / topo) * ih;
  const faixa = iw / categorias.length;
  const barra = Math.min(24, Math.max(4, (faixa * 0.7 - (series.length - 1) * 2) / series.length));
  const grupo = barra * series.length + (series.length - 1) * 2;
  const r = Math.min(4, barra / 2);
  const coluna = (cx: number, v: number) => {
    const alto = Math.max(0, y(0) - y(v));
    if (alto <= 0) return '';
    const rr = Math.min(r, alto);
    return `M${cx},${y(0)} V${y(v) + rr} Q${cx},${y(v)} ${cx + rr},${y(v)} H${cx + barra - rr} Q${cx + barra},${y(v)} ${cx + barra},${y(v) + rr} V${y(0)} Z`;
  };
  return (
    <div className="grafico" ref={ref} onMouseLeave={() => setFoco(null)}>
      <Legenda series={series} />
      <svg width={w} height={ALTURA} role="img" aria-label={series.map((s) => s.nome).join(' e ')}>
        {marcas.map((m) => (
          <g key={m}>
            <line x1={MARGEM.esquerda} x2={w - MARGEM.direita} y1={y(m)} y2={y(m)} className="grade" />
            <text x={MARGEM.esquerda - 8} y={y(m)} className="eixo" textAnchor="end" dominantBaseline="middle">{compacto(m)}</text>
          </g>
        ))}
        {categorias.map((c, i) => {
          const inicio = MARGEM.esquerda + i * faixa + (faixa - grupo) / 2;
          return (
            <g key={c}>
              {foco === i && <rect x={MARGEM.esquerda + i * faixa} y={MARGEM.topo} width={faixa} height={ih} className="realce" />}
              {series.map((s, k) => {
                const v = s.valores[i];
                return v ? <path key={s.nome} d={coluna(inicio + k * (barra + 2), v)} fill={s.cor} /> : null;
              })}
              {rotular && series.length === 1 && series[0].valores[i] ? (
                <text x={inicio + barra / 2} y={y(series[0].valores[i]!) - 6} className="rotulo-dado" textAnchor="middle">{compacto(series[0].valores[i]!)}</text>
              ) : null}
              <text x={MARGEM.esquerda + i * faixa + faixa / 2} y={ALTURA - 8} className="eixo" textAnchor="middle">{c}</text>
              <rect x={MARGEM.esquerda + i * faixa} y={MARGEM.topo} width={faixa} height={ih} fill="transparent" onMouseEnter={() => setFoco(i)} />
            </g>
          );
        })}
      </svg>
      <CaixaDica dica={foco === null ? null : {
        x: Math.min(MARGEM.esquerda + foco * faixa + faixa, w - 190), y: 28, titulo: categorias[foco],
        linhas: series.map((s) => ({ cor: s.cor, rotulo: s.nome, valor: s.valores[foco] === null ? '—' : formatar(s.valores[foco]!) })),
      }} />
    </div>
  );
}

/** Barras horizontais em ordem (ranking). Uma série: sem legenda; o valor fica na ponta. */
export function BarrasHorizontais({ itens, formatar, cor = 'var(--serie-1)' }: {
  itens: Array<{ rotulo: string; valor: number; detalhe?: string }>; formatar: Formato; cor?: string;
}) {
  const maximo = Math.max(1, ...itens.map((i) => i.valor));
  return (
    <div className="barras-h">
      {itens.map((i) => (
        <div className="barra-h" key={i.rotulo} title={`${i.rotulo}: ${formatar(i.valor)}${i.detalhe ? ` · ${i.detalhe}` : ''}`} data-teste="barra-ranking">
          <span className="rotulo-barra">{i.rotulo}</span>
          <span className="trilho"><span style={{ width: `${(i.valor / maximo) * 100}%`, background: cor }} /></span>
          <span className="valor-barra mono">{formatar(i.valor)}</span>
          {i.detalhe && <span className="detalhe-barra apagado">{i.detalhe}</span>}
        </div>
      ))}
    </div>
  );
}

export interface EtapaFunil { id: string; nome: string; volume: number; pctDoTopo: number | null; situacao: 'bom' | 'atencao' | 'critico' | 'neutro' }
const COR_SITUACAO = { bom: 'var(--bom)', atencao: 'var(--ambar)', critico: 'var(--critico)', neutro: 'var(--funil)' };

/** Funil em faixa horizontal com curvas suaves; a altura de cada etapa é proporcional à raiz do volume. */
export function FaixaFunil({ etapas }: { etapas: EtapaFunil[] }) {
  const [ref, largura] = useLargura<HTMLDivElement>();
  const w = Math.max(largura, 6 * 110);
  const alturaMax = 96;
  const meio = alturaMax / 2 + 4;
  const coluna = w / etapas.length;
  const maior = Math.max(1, ...etapas.map((e) => e.volume));
  const meiaAltura = (v: number) => Math.max(5, (Math.sqrt(v) / Math.sqrt(maior)) * (alturaMax / 2));
  return (
    <div className="grafico funil-faixa" ref={ref}>
      <svg width={w} height={alturaMax + 8} role="img" aria-label="Funil da jornada de atendimento">
        {etapas.map((e, i) => {
          const x0 = i * coluna + 2;
          const x1 = (i + 1) * coluna - 2;
          const h0 = meiaAltura(e.volume);
          const h1 = i < etapas.length - 1 && etapas[i + 1].id !== 'RECUPERACAO' ? meiaAltura(etapas[i + 1].volume) : h0;
          const curva = (x1 - x0) * 0.5;
          const d = `M${x0},${meio - h0} C${x0 + curva},${meio - h0} ${x1 - curva},${meio - h1} ${x1},${meio - h1}`
            + ` L${x1},${meio + h1} C${x1 - curva},${meio + h1} ${x0 + curva},${meio + h0} ${x0},${meio + h0} Z`;
          return (
            <g key={e.id} data-teste="faixa-etapa">
              <path d={d} fill={COR_SITUACAO[e.situacao]} opacity={e.id === 'RECUPERACAO' ? 0.6 : 1} />
              {e.pctDoTopo !== null && h0 > 9 && (
                <text x={x0 + 10} y={meio} dominantBaseline="middle" className={`rotulo-interno ri-${e.id === 'RECUPERACAO' ? 'claro' : e.situacao}`}>{`${e.pctDoTopo.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`}</text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
