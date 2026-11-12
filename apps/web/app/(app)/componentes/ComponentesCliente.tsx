'use client';

import { useState } from 'react';
import { AbasSegmentadas, Modal, PainelLateral } from '@/components/interativos';
import { CartaoIndicador, Estado, TelaVazia } from '@/components/ui';

const TOKENS: Array<[string, string]> = [
  ['--fundo', 'fundo'], ['--superficie', 'superfície'], ['--tinta-1', 'tinta 1'], ['--tinta-2', 'tinta 2'],
  ['--tinta-apagada', 'apagada'], ['--borda', 'borda'], ['--borda-forte', 'borda forte'], ['--destaque-fundo', 'destaque'],
  ['--anuncios', 'anúncios'], ['--prolabore', 'pró-labore'], ['--ambar', 'ticket e atenção'], ['--funil', 'funil e ROAS'],
  ['--conversao', 'conversão'], ['--bom', 'bom'], ['--critico', 'crítico'],
];

const ETAPAS = ['Lead', 'Abordado', 'Levantamento', 'Negociação', 'Venda', 'Recuperação'];

export function ComponentesCliente() {
  const [chip, setChip] = useState('Tudo');
  const [aba, setAba] = useState('Hoje');
  const [modal, setModal] = useState(false);
  const [painel, setPainel] = useState(false);

  return (
    <>
      <section className="cartao">
        <h2>Tokens de cor</h2>
        <div className="amostras">
          {TOKENS.map(([variavel, nome]) => (
            <div className="amostra" key={variavel}>
              <i style={{ background: `var(${variavel})` }} />
              <span>{nome}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="cartao">
        <h2>Cartão de indicador</h2>
        <div className="grade-indicadores">
          <CartaoIndicador metrica="receita" rotulo="Receita" valor="R$ 12.480,00" variacao="+18,2%" direcao="sobe" bomQuando="maior" comparado="vs. 1 a 12/out" faixa={{ tipo: 'bom', rotulo: 'Dentro da meta' }} />
          <CartaoIndicador metrica="pro_labore" rotulo="Pró-labore" valor="R$ 1.248,00" variacao="+18,2%" direcao="sobe" bomQuando="maior" comparado="vs. 1 a 12/out" cor="var(--prolabore)" />
          <CartaoIndicador metrica="custo_por_lead" rotulo="Custo por lead" valor="R$ 6,40" variacao="+9,0%" direcao="sobe" bomQuando="menor" comparado="vs. 1 a 12/out" faixa={{ tipo: 'atencao', rotulo: 'Atenção' }} cor="var(--anuncios)" />
          <CartaoIndicador metrica="taxa_recompra" rotulo="Taxa de recompra" valor="—" variacao="—" comparado="sem dado no período" />
        </div>
      </section>

      <section className="cartao">
        <h2>Status, botões, chips e abas</h2>
        <div style={{ display: 'grid', gap: 14 }}>
          <div className="chips">
            <Estado tipo="bom">Bom</Estado>
            <Estado tipo="atencao">Atenção</Estado>
            <Estado tipo="critico">Crítico</Estado>
            <Estado tipo="neutro">Sem dado</Estado>
          </div>
          <div className="chips">
            <button className="botao principal-acao">Ação principal</button>
            <button className="botao">Secundária</button>
            <button className="botao fantasma">Discreta</button>
            <button className="botao" disabled>Desativada</button>
          </div>
          <div className="chips">
            {['Tudo', 'Pré-venda', 'Venda', 'Fechamento', 'Recuperação'].map((c) => (
              <button key={c} className="chip" aria-pressed={chip === c} onClick={() => setChip(c)}>{c}</button>
            ))}
          </div>
          <AbasSegmentadas opcoes={['Hoje', 'Daily', 'Painel']} valor={aba} mudar={setAba} />
        </div>
      </section>

      <section className="cartao">
        <h2>Lista com ação</h2>
        <div className="fila">
          <div className="fila-item">
            <div><strong>Venda direta a confirmar</strong><p className="apagado">Cliente Exemplo · Pix · R$ 199,80</p></div>
            <button className="botao principal-acao">Confirmar</button>
          </div>
          <div className="fila-item">
            <div><strong>Troca aguardando</strong><p className="apagado">Camiseta Técnica · tamanho M por G</p></div>
            <button className="botao">Abrir</button>
          </div>
        </div>
      </section>

      <section className="cartao">
        <h2>Quadro (rola dentro do cartão)</h2>
        <div className="quadro">
          {ETAPAS.map((etapa, i) => (
            <div className="coluna-quadro" key={etapa}>
              <h3>{etapa}<span className="apagado mono">{i === 0 ? 2 : 1}</span></h3>
              <div className="card-quadro">
                <strong>Cliente Exemplo {i + 1}</strong>
                <span className="apagado mono">(11) 90000-000{i}</span>
                <span>Regata Running · <span className="mono">R$ 90</span></span>
              </div>
              {i === 0 && (
                <div className="card-quadro">
                  <strong>Cliente Exemplo 7</strong>
                  <span className="apagado mono">(11) 90000-0007</span>
                  <span>Short Running · <span className="mono">R$ 110</span></span>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="cartao">
        <h2>Tabela (rola dentro do cartão)</h2>
        <div className="rolagem">
          <table className="tabela">
            <thead><tr><th>Modelo</th><th>Peças</th><th>Dias sem venda</th><th>Cobertura</th><th>Status</th></tr></thead>
            <tbody>
              <tr><td>Regata Running</td><td className="mono">42</td><td className="mono">3</td><td className="mono">28 dias</td><td><Estado tipo="bom">Ok</Estado></td></tr>
              <tr><td>Short Dupla Camada</td><td className="mono">18</td><td className="mono">22</td><td className="mono">61 dias</td><td><Estado tipo="atencao">Atenção</Estado></td></tr>
              <tr><td>Jaqueta Training</td><td className="mono">25</td><td className="mono">34</td><td className="mono">—</td><td><Estado tipo="critico">Parado</Estado></td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="cartao">
        <h2>Modal e painel lateral</h2>
        <div className="chips">
          <button className="botao" onClick={() => setModal(true)}>Abrir modal</button>
          <button className="botao" onClick={() => setPainel(true)}>Abrir painel lateral</button>
        </div>
      </section>

      <TelaVazia titulo="Tela vazia que ensina o primeiro passo" texto="Toda aba começa assim: diz o que vai aparecer ali e qual é o primeiro passo.">
        <button className="botao principal-acao">Primeiro passo</button>
      </TelaVazia>

      {modal && (
        <Modal titulo="Exemplo de modal" fechar={() => setModal(false)}>
          <p className="secundario">Usado para cadastrar e alterar. Fecha com Esc ou clicando fora.</p>
          <div className="acoes"><button className="botao principal-acao" onClick={() => setModal(false)}>Entendi</button></div>
        </Modal>
      )}
      {painel && (
        <PainelLateral titulo="Exemplo de painel lateral" fechar={() => setPainel(false)}>
          <p className="secundario">Usado para o detalhe de um lead, de um pedido ou de uma métrica, sem sair da tela.</p>
        </PainelLateral>
      )}
    </>
  );
}
