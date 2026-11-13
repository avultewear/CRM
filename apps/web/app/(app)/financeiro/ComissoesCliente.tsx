'use client';

import { useEffect, useState } from 'react';
import { CartaoIndicador } from '@/components/ui';
import { chamar, emData, emReais } from '@/lib/formato';

interface Linha {
  id: string;
  tipo: 'COMISSAO_VENDEDOR' | 'COMISSAO_INFLUENCIADOR';
  base: number;
  pct: number;
  valor: number;
  valorSemTeto: number;
  liberarEm: string | null;
  criadoEm: string;
  cliente: string | null;
  quem: string | null;
}

export interface Resumo {
  mes: string;
  prazoTrocaDefinido: boolean;
  pro_labore: number;
  comissao_mes: number;
  comissoes_pagas: number;
  proLaboreDivisao: { fundador: number; cofundador: number } | null;
  aPagar: Linha[];
  aguardando: Linha[];
  totalAPagar: number;
  totalAguardando: number;
}

const NOME_TIPO = { COMISSAO_VENDEDOR: 'Vendedor', COMISSAO_INFLUENCIADOR: 'Influenciador' };
const mesPorExtenso = (mes: string) => mes.split('-').reverse().join('/');

function Comissao({ l, children }: { l: Linha; children: React.ReactNode }) {
  return (
    <div className="fila-item" data-teste="comissao" data-quem={l.quem ?? ''}>
      <div>
        <strong>{l.quem ?? '—'}</strong> <span className="etiqueta">{NOME_TIPO[l.tipo]}</span> · <span className="mono" data-teste="valor-comissao">{emReais(l.valor)}</span>
        <p className="apagado">
          {l.pct.toLocaleString('pt-BR')}% de {emReais(l.base)}{l.cliente ? ` · venda para ${l.cliente}` : ''} · {emData(l.criadoEm)}
          {l.valor < l.valorSemTeto ? ` · limitada pelo teto do mês (seria ${emReais(l.valorSemTeto)})` : ''}
        </p>
      </div>
      <div className="fila-acoes">{children}</div>
    </div>
  );
}

/** Pró-labore e comissões: nascem na confirmação da venda, esperam o prazo de troca e são pagas pelos Sócios. */
export function ComissoesCliente({ inicial }: { inicial: Resumo }) {
  const [r, setR] = useState(inicial);
  const [aviso, setAviso] = useState('');

  // A confirmação de uma venda (lista acima) gera pró-labore e comissões: busca de novo quando ela acontece.
  useEffect(() => {
    const ouvir = () => { chamar<Resumo>('GET', '/financeiro/resumo').then(setR).catch(() => undefined); };
    window.addEventListener('avulte:venda-decidida', ouvir);
    return () => window.removeEventListener('avulte:venda-decidida', ouvir);
  }, []);

  async function agir(caminho: string, mensagem: string) {
    try {
      await chamar('POST', caminho, {});
      setR(await chamar<Resumo>('GET', '/financeiro/resumo'));
      setAviso(mensagem);
    } catch (e) {
      setAviso((e as Error).message);
    }
  }

  const mes = mesPorExtenso(r.mes);
  return (
    <>
      <div className="grade-indicadores" data-teste="resumo-financeiro">
        <CartaoIndicador metrica="pro_labore" rotulo="Pró-labore do mês" valor={emReais(r.pro_labore)} variacao="" comparado={`em ${mes}`} cor="var(--prolabore)" />
        <CartaoIndicador metrica="comissao_mes" rotulo="Comissões geradas no mês" valor={emReais(r.comissao_mes)} variacao="" comparado={`em ${mes}`} />
        <CartaoIndicador metrica="comissoes_pagas" rotulo="Comissões pagas no mês" valor={emReais(r.comissoes_pagas)} variacao="" comparado={`em ${mes}`} />
        <div className="cartao indicador">
          <span className="rotulo">Divisão do pró-labore</span>
          {r.proLaboreDivisao ? (
            <>
              <span className="mono">Fundador: {emReais(r.proLaboreDivisao.fundador)}</span>
              <span className="mono">Cofundador: {emReais(r.proLaboreDivisao.cofundador)}</span>
            </>
          ) : <span className="apagado">Defina a divisão entre os Sócios em Metas.</span>}
        </div>
      </div>

      <section className="cartao" data-teste="comissoes-a-pagar">
        <h2>Comissões a pagar ({r.aPagar.length}) <span className="mono apagado">{r.aPagar.length ? emReais(r.totalAPagar) : ''}</span></h2>
        {r.aPagar.length === 0 ? <p className="apagado">Nenhuma comissão liberada. Elas chegam aqui quando o prazo de troca termina.</p> : (
          <div className="fila">
            {r.aPagar.map((l) => (
              <Comissao l={l} key={l.id}>
                <button className="botao principal-acao" data-teste="pagar-comissao" onClick={() => agir(`/ganhos/${l.id}/pagar`, `Comissão de ${l.quem} marcada como paga.`)}>Marcar como paga</button>
              </Comissao>
            ))}
          </div>
        )}
      </section>

      <section className="cartao" data-teste="comissoes-aguardando">
        <h2>Aguardando o prazo de troca ({r.aguardando.length}) <span className="mono apagado">{r.aguardando.length ? emReais(r.totalAguardando) : ''}</span></h2>
        {!r.prazoTrocaDefinido && (
          <p className="secundario" data-teste="sem-prazo-troca">O prazo de troca ainda não foi definido em Metas. Enquanto isso, cada comissão espera a liberação manual de um Sócio.</p>
        )}
        {r.aguardando.length === 0 ? <p className="apagado">Nenhuma comissão aguardando.</p> : (
          <div className="fila">
            {r.aguardando.map((l) => (
              <Comissao l={l} key={l.id}>
                <span className="apagado">{l.liberarEm ? `libera em ${emData(l.liberarEm)}` : 'sem data de liberação'}</span>
                <button className="botao" data-teste="liberar-comissao" onClick={() => agir(`/ganhos/${l.id}/liberar`, `Comissão de ${l.quem} liberada para pagamento.`)}>Liberar agora</button>
              </Comissao>
            ))}
          </div>
        )}
      </section>
      {aviso && <p className="secundario" role="status" data-teste="aviso-comissoes">{aviso}</p>}
    </>
  );
}
