import Link from 'next/link';
import { Estado } from '@/components/ui';
import { emReais } from '@/lib/formato';

export interface DadosHoje {
  frase: string | null;
  agora: {
    previsao_fechamento: { valor: number | null; meta: number | null; faltaParaMeta: number | null; receitaAteHoje: number | null };
    pro_labore?: number; decisoes: number;
  };
  fila: Array<{ tipo: string; titulo: string; detalhe: string; acao: string; rota: string; id?: string }>;
  areas: {
    comercial: { leadsAbertos: number; semResposta: number; vendasDoMes: number };
    clientes: { ativos: number; taxaRecompra: number | null; emRisco: number | null };
    marketing: { vendasComCupom: number; social: string; leadsDeAnuncio: string | number; gastoAnuncios?: number | null; orcamentoAnuncios?: number | null };
    financeiro?: { aPagar: number; custosDoMes: number; lucro: number | null };
    porOrigem: Array<{ origem: string; receita: number }>;
  };
}
const ORIGEM: Record<string, string> = { ANUNCIO: 'Anúncio', POST: 'Post', INFLUENCIADOR: 'Influenciador', INDICACAO: 'Indicação', ORGANICO: 'Orgânico', OUTRO: 'Outro' };
const pct = (v: number | null) => (v === null ? '—' : `${v.toLocaleString('pt-BR')}%`);

/** Sub-aba Hoje: três números, a fila de decisões e o painel por área. Tudo vem pronto da API. */
export function Hoje({ dados, socio, metas }: { dados: DadosHoje; socio: boolean; metas: boolean }) {
  const prev = dados.agora.previsao_fechamento;
  const situacao = prev.valor === null || prev.meta === null ? 'neutro' : prev.valor >= prev.meta ? 'bom' : prev.valor >= prev.meta * 0.8 ? 'atencao' : 'critico';
  const linha = (rotulo: string, valor: string, rota: string) => (
    <Link className="fila-item" href={rota} key={rotulo}><span>{rotulo}</span><strong className="mono">{valor}</strong></Link>
  );
  return (
    <>
      {dados.frase ? <p className="frase" data-teste="frase">“{dados.frase}”</p>
        : socio && <p className="apagado">Escreva a frase motivacional da equipe em <Link href="/metas">Metas</Link>.</p>}

      <div className="grade-indicadores" data-teste="agora-hoje">
        <Link href="/metricas?id=previsao_fechamento" className="cartao indicador">
          <span className="rotulo">Previsão de fechamento</span>
          <span className="valor mono" data-teste="previsao">{prev.valor === null ? '—' : emReais(prev.valor)}</span>
          <span className="variacao apagado">
            {prev.meta === null ? 'sem meta do mês' : `meta ${emReais(prev.meta)}${prev.faltaParaMeta ? ` · faltam ${emReais(prev.faltaParaMeta)}` : ''}`}
          </span>
          {situacao !== 'neutro' && <Estado tipo={situacao}>{situacao === 'bom' ? 'No ritmo da meta' : situacao === 'atencao' ? 'Perto da meta' : 'Abaixo da meta'}</Estado>}
        </Link>
        {dados.agora.pro_labore !== undefined && (
          <Link href="/metricas?id=pro_labore" className="cartao indicador">
            <span className="rotulo"><i className="ponto" style={{ background: 'var(--prolabore)' }} />Pró-labore do mês</span>
            <span className="valor mono" data-teste="pro-labore-hoje">{emReais(dados.agora.pro_labore)}</span>
            <span className="variacao apagado">até hoje</span>
          </Link>
        )}
        <div className="cartao indicador">
          <span className="rotulo">Decisões aguardando</span>
          <span className="valor mono" data-teste="decisoes">{dados.agora.decisoes}</span>
          <span className="variacao apagado">{dados.agora.decisoes ? 'na fila abaixo' : 'nada esperando você'}</span>
        </div>
      </div>
      {prev.meta === null && metas && <p className="secundario">Sem a meta do mês, a previsão não tem com o que comparar. <Link href="/metas">Definir a meta</Link>.</p>}

      <section className="cartao" data-teste="fila-decisoes">
        <h2>Fila de decisões</h2>
        {dados.fila.length === 0 ? <p className="apagado">Nada esperando decisão agora.</p> : (
          <div className="fila">
            {dados.fila.map((f, i) => (
              <div className="fila-item" key={`${f.tipo}${f.id ?? i}`} data-teste="decisao" data-tipo={f.tipo}>
                <div><strong>{f.titulo}</strong><p className="apagado">{f.detalhe}</p></div>
                <div className="fila-acoes"><Link className="botao pequeno principal-acao" href={f.rota}>{f.acao}</Link></div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grade-graficos" data-teste="areas">
        <section className="cartao">
          <h2>Comercial</h2>
          <div className="fila">
            {linha('Leads em atendimento', String(dados.areas.comercial.leadsAbertos), '/atendimento')}
            {linha('Leads sem resposta', String(dados.areas.comercial.semResposta), '/atendimento')}
            {linha('Vendas no mês', String(dados.areas.comercial.vendasDoMes), '/painel?sub=painel')}
          </div>
        </section>
        <section className="cartao">
          <h2>Clientes e recompra</h2>
          <div className="fila">
            {linha('Clientes ativos', String(dados.areas.clientes.ativos), '/clientes')}
            {linha('Taxa de recompra', pct(dados.areas.clientes.taxaRecompra), '/clientes')}
            {linha('Clientes em risco', dados.areas.clientes.emRisco === null ? '—' : String(dados.areas.clientes.emRisco), '/clientes')}
          </div>
        </section>
        <section className="cartao">
          <h2>Marketing</h2>
          <div className="fila">
            {linha('Vendas com cupom no mês', String(dados.areas.marketing.vendasComCupom), '/influenciadores')}
            {linha('Leads de anúncio no mês', String(dados.areas.marketing.leadsDeAnuncio), '/trafego')}
            {dados.areas.marketing.gastoAnuncios !== undefined && linha('Gasto com anúncios no mês',
              dados.areas.marketing.gastoAnuncios === null ? '—' : `${emReais(dados.areas.marketing.gastoAnuncios)}${dados.areas.marketing.orcamentoAnuncios ? ` de ${emReais(dados.areas.marketing.orcamentoAnuncios)}` : ''}`, '/trafego')}
            {linha('Social Media', dados.areas.marketing.social, '/social')}
          </div>
        </section>
        {dados.areas.financeiro && (
          <section className="cartao">
            <h2>Financeiro</h2>
            <div className="fila">
              {linha('Comissões a pagar', emReais(dados.areas.financeiro.aPagar), '/financeiro')}
              {linha('Custos do mês', emReais(dados.areas.financeiro.custosDoMes), '/financeiro')}
              {linha('Lucro do mês', dados.areas.financeiro.lucro === null ? '—' : emReais(dados.areas.financeiro.lucro), '/financeiro')}
            </div>
          </section>
        )}
        <section className="cartao">
          <h2>Faturamento por origem</h2>
          {dados.areas.porOrigem.length === 0 ? <p className="apagado">Nenhuma venda confirmada no mês.</p> : (
            <div className="fila">{dados.areas.porOrigem.map((o) => linha(ORIGEM[o.origem] ?? o.origem, emReais(o.receita), '/painel?sub=painel'))}</div>
          )}
        </section>
      </div>
    </>
  );
}
