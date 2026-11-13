'use client';

import { useState } from 'react';
import { Modal } from '@/components/interativos';
import { Estado } from '@/components/ui';
import { chamar, emData, emReais, lerNumero } from '@/lib/formato';

export interface Custos {
  mes: string;
  categorias: Array<{ id: string; nome: string }>;
  custos: Array<{ id: string; categoria: string; descricao: string; valor: number; criadoEm: string; anuladoEm: string | null; motivoAnulacao: string | null; lancadoPor: string }>;
  totalPorCategoria: Array<{ categoria: string; total: number }>;
  conta: { receita: number; comissoes: number; custos: number; lucro: number | null; observacao: string };
}
const mesPorExtenso = (mes: string) => mes.split('-').reverse().join('/');

/** Custos do mês lançados à mão e a conta do lucro. Só Sócios. Nada é apagado: lançamento errado é anulado. */
export function CustosCliente({ inicial }: { inicial: Custos }) {
  const [d, setD] = useState(inicial);
  const [novo, setNovo] = useState(false);
  const [anulando, setAnulando] = useState<Custos['custos'][number] | null>(null);
  const [erro, setErro] = useState('');
  const nomeCategoria = (id: string) => d.categorias.find((c) => c.id === id)?.nome ?? id;

  async function executar(fn: () => Promise<unknown>) {
    setErro('');
    try {
      await fn();
      setD(await chamar<Custos>('GET', `/custos?mes=${d.mes}`));
      setNovo(false); setAnulando(null);
    } catch (e) { setErro((e as Error).message); }
  }

  return (
    <section className="cartao" data-teste="custos-mes">
      <div className="cabecalho-linha">
        <h2>Custos e lucro de {mesPorExtenso(d.mes)}</h2>
        <button className="botao principal-acao" onClick={() => { setErro(''); setNovo(true); }} data-teste="novo-custo">Lançar custo</button>
      </div>
      <div className="ficha-dados" data-teste="conta-lucro">
        <span>Receita</span><span className="mono">{emReais(d.conta.receita)}</span>
        <span>− Comissões</span><span className="mono">{emReais(d.conta.comissoes)}</span>
        <span>− Custos do mês</span><span className="mono" style={{ color: 'var(--anuncios)' }}>{emReais(d.conta.custos)}</span>
        <span><strong>= Lucro</strong></span><span className="mono"><strong data-teste="lucro">{d.conta.lucro === null ? '—' : emReais(d.conta.lucro)}</strong></span>
      </div>
      <p className="apagado">{d.conta.observacao}</p>
      {d.custos.length === 0 ? <p className="apagado">Nenhum custo lançado neste mês.</p> : (
        <div className="fila">
          {d.custos.map((c) => (
            <div className="fila-item" key={c.id} data-teste="custo">
              <div>
                <strong className={c.anuladoEm ? 'apagado' : undefined} style={c.anuladoEm ? { textDecoration: 'line-through' } : undefined}>{c.descricao}</strong>{' '}
                <span className="etiqueta">{nomeCategoria(c.categoria)}</span> · <span className="mono">{emReais(c.valor)}</span>
                <p className="apagado">Lançado por {c.lancadoPor} em {emData(c.criadoEm)}{c.anuladoEm ? ` · anulado: ${c.motivoAnulacao}` : ''}</p>
              </div>
              <div className="fila-acoes">
                {c.anuladoEm ? <Estado tipo="neutro">Anulado</Estado>
                  : <button className="botao pequeno fantasma" onClick={() => { setErro(''); setAnulando(c); }} data-teste="anular-custo">Anular</button>}
              </div>
            </div>
          ))}
        </div>
      )}

      {novo && (
        <Modal titulo="Lançar custo do mês" fechar={() => setNovo(false)}>
          <form style={{ display: 'grid', gap: 14 }} onSubmit={(ev) => {
            ev.preventDefault();
            const f = new FormData(ev.currentTarget);
            executar(() => chamar('POST', '/custos', { competencia: String(f.get('competencia')), categoria: String(f.get('categoria') ?? ''), descricao: String(f.get('descricao') ?? ''), valor: lerNumero(f.get('valor')) }));
          }}>
            <div className="linha-campos">
              <label className="campo"><span>Mês</span><input name="competencia" type="month" defaultValue={d.mes} required /></label>
              <label className="campo"><span>Categoria</span>
                <select name="categoria" required defaultValue="">
                  <option value="" disabled>Escolha</option>
                  {d.categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </label>
            </div>
            <label className="campo"><span>Descrição</span><input name="descricao" required minLength={2} maxLength={160} placeholder="Ex.: lote de regatas, sistema de e-mail" /></label>
            <label className="campo"><span>Valor (R$)</span><input name="valor" inputMode="decimal" required /></label>
            {erro && <p className="erro" role="alert" data-teste="erro-formulario">{erro}</p>}
            <div className="acoes">
              <button type="button" className="botao fantasma" onClick={() => setNovo(false)}>Cancelar</button>
              <button type="submit" className="botao principal-acao" data-teste="salvar-custo">Lançar</button>
            </div>
          </form>
        </Modal>
      )}
      {anulando && (
        <Modal titulo={`Anular "${anulando.descricao}"`} fechar={() => setAnulando(null)}>
          <form style={{ display: 'grid', gap: 14 }} onSubmit={(ev) => {
            ev.preventDefault();
            const f = new FormData(ev.currentTarget);
            executar(() => chamar('POST', `/custos/${anulando.id}/anular`, { motivo: String(f.get('motivo') ?? '') }));
          }}>
            <p className="apagado">O lançamento continua na lista, riscado, e sai da conta do lucro.</p>
            <label className="campo"><span>Motivo</span><input name="motivo" required minLength={3} maxLength={200} data-teste="motivo-anulacao" /></label>
            {erro && <p className="erro" role="alert" data-teste="erro-formulario">{erro}</p>}
            <div className="acoes">
              <button type="button" className="botao fantasma" onClick={() => setAnulando(null)}>Cancelar</button>
              <button type="submit" className="botao principal-acao" data-teste="confirmar-anulacao">Anular</button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
