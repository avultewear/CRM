'use client';

import { useState } from 'react';
import { Modal } from '@/components/interativos';
import { chamar, emData, emReais } from '@/lib/formato';

export interface VendaAguardando {
  id: string;
  oportunidadeId: string;
  itens: Array<{ descricao: string; quantidade: number; precoTabela: number; preco: number }>;
  valorTabela: number;
  valor: number;
  formaPagamento: 'PIX' | 'DINHEIRO';
  criadoEm: string;
  clienteNome: string;
  vendedorNome: string | null;
  lancadaPorNome: string;
  cupom: string | null;
}

/** Regra 11: a venda direta só vira venda com a confirmação de um Sócio. */
export function FinanceiroCliente({ vendas }: { vendas: VendaAguardando[] }) {
  const [lista, setLista] = useState(vendas);
  const [recusando, setRecusando] = useState<VendaAguardando | null>(null);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');

  async function confirmar(v: VendaAguardando) {
    setErro('');
    try {
      await chamar('POST', `/vendas-diretas/${v.id}/confirmar`, {});
      setLista((atual) => atual.filter((x) => x.id !== v.id));
      setAviso(`Venda de ${v.clienteNome} confirmada: o card foi para Venda e o pró-labore e as comissões foram gerados.`);
      window.dispatchEvent(new Event('avulte:venda-decidida'));
    } catch (e) {
      setAviso((e as Error).message);
    }
  }

  async function recusar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!recusando) return;
    setErro('');
    try {
      await chamar('POST', `/vendas-diretas/${recusando.id}/recusar`, { motivo: new FormData(evento.currentTarget).get('motivo') });
      setLista((atual) => atual.filter((x) => x.id !== recusando.id));
      setAviso(`Venda de ${recusando.clienteNome} recusada. O lead continua em Negociação.`);
      setRecusando(null);
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  return (
    <section className="cartao" data-teste="vendas-a-confirmar">
      <h2>Vendas diretas a confirmar ({lista.length})</h2>
      {lista.length === 0 ? (
        <p className="apagado">Nenhuma venda direta aguardando. Quando um vendedor lançar um Pix ou um pagamento em dinheiro, ela aparece aqui.</p>
      ) : (
        <div className="fila">
          {lista.map((v) => {
            const desconto = v.valorTabela > 0 ? (1 - v.valor / v.valorTabela) * 100 : 0;
            return (
              <div className="fila-item" key={v.id} data-teste="venda-aguardando">
                <div>
                  <strong>{v.clienteNome}</strong> · <span className="mono">{emReais(v.valor)}</span> · {v.formaPagamento === 'PIX' ? 'Pix' : 'Dinheiro'}
                  <p className="secundario">{v.itens.map((i) => `${i.quantidade}× ${i.descricao}`).join(', ')}</p>
                  <p className="apagado">
                    Lançada por {v.lancadaPorNome} em {emData(v.criadoEm)}
                    {v.vendedorNome ? ` · vendedor: ${v.vendedorNome}` : ''}
                    {v.cupom ? ` · cupom ${v.cupom}` : ''}
                    {desconto > 0.05 ? ` · desconto de ${desconto.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% sobre a tabela` : ''}
                  </p>
                </div>
                <div className="fila-acoes">
                  <button className="botao principal-acao" onClick={() => confirmar(v)} data-teste="confirmar-venda">Confirmar</button>
                  <button className="botao" onClick={() => { setErro(''); setRecusando(v); }}>Recusar</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {aviso && <p className="secundario" role="status" data-teste="aviso-financeiro">{aviso}</p>}

      {recusando && (
        <Modal titulo={`Recusar a venda de ${recusando.clienteNome}`} fechar={() => setRecusando(null)}>
          <form onSubmit={recusar} style={{ display: 'grid', gap: 14 }}>
            <label className="campo">
              <span>Motivo (fica na auditoria)</span>
              <textarea name="motivo" required minLength={5} maxLength={300} placeholder="Exemplo: o Pix não caiu na conta" />
            </label>
            {erro && <p className="erro" role="alert">{erro}</p>}
            <div className="acoes">
              <button type="button" className="botao fantasma" onClick={() => setRecusando(null)}>Cancelar</button>
              <button type="submit" className="botao principal-acao">Recusar venda</button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
