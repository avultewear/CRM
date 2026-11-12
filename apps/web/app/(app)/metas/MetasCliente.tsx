'use client';

import { useState } from 'react';
import { Modal, PainelLateral } from '@/components/interativos';
import { chamar, emData, valorParametro } from '@/lib/formato';

export interface Parametro {
  chave: string;
  rotulo: string;
  grupo: string;
  tipo: 'moeda' | 'percentual' | 'inteiro' | 'texto' | 'json';
  descricao: string;
  valor: unknown;
  atualizadoEm: string | null;
}

interface LinhaHistorico {
  valorAnterior: unknown;
  valorNovo: unknown;
  justificativa: string;
  criadoEm: string;
  autor: string;
}

const DICA: Record<Parametro['tipo'], string> = {
  moeda: 'Valor em R$. Exemplo: 50000 ou 50.000,00',
  percentual: 'De 0 a 100. Exemplo: 12,5',
  inteiro: 'Número inteiro. Exemplo: 30',
  texto: 'Até 280 caracteres',
  json: '',
};

/** Lê o que a pessoa digitou no formato brasileiro (50.000,00) ou simples (50000). */
function lerNumero(texto: string): number | null {
  const limpo = texto.trim().replace(/\s|R\$/g, '');
  if (!limpo) return null;
  const normal = limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : limpo;
  const n = Number(normal);
  return Number.isFinite(n) ? n : null;
}

export function MetasCliente({ parametros }: { parametros: Parametro[] }) {
  const [lista, setLista] = useState(parametros);
  const [editando, setEditando] = useState<Parametro | null>(null);
  const [valor, setValor] = useState('');
  const [justificativa, setJustificativa] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [historico, setHistorico] = useState<{ parametro: Parametro; linhas: LinhaHistorico[] | null } | null>(null);

  const grupos = [...new Set(lista.map((p) => p.grupo))];

  function abrir(p: Parametro) {
    setEditando(p);
    setValor('');
    setJustificativa('');
    setErro('');
  }

  async function salvar(evento: React.FormEvent) {
    evento.preventDefault();
    if (!editando) return;
    setErro('');
    const novo = editando.tipo === 'texto' ? valor.trim() : lerNumero(valor);
    if (novo === null || novo === '') return setErro('Informe o novo valor.');
    setSalvando(true);
    try {
      await chamar('PUT', `/parametros/${editando.chave}`, { valor: novo, justificativa });
      setLista((atual) => atual.map((p) => (p.chave === editando.chave ? { ...p, valor: novo, atualizadoEm: new Date().toISOString() } : p)));
      setEditando(null);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function verHistorico(p: Parametro) {
    setHistorico({ parametro: p, linhas: null });
    try {
      const linhas = await chamar<LinhaHistorico[]>('GET', `/parametros/${p.chave}/historico`);
      setHistorico({ parametro: p, linhas });
    } catch {
      setHistorico({ parametro: p, linhas: [] });
    }
  }

  return (
    <>
      {grupos.map((grupo) => (
        <section className="cartao" key={grupo}>
          <h2>{grupo}</h2>
          <div className="fila">
            {lista.filter((p) => p.grupo === grupo).map((p) => (
              <div className="fila-item" key={p.chave}>
                <div>
                  <strong>{p.rotulo}</strong>
                  <p className="apagado">{p.descricao}</p>
                </div>
                {p.tipo === 'json' ? (
                  <span className="apagado">Definido na própria aba, quando ela entrar</span>
                ) : (
                  <div className="fila-acoes">
                    <span className={`mono ${p.valor === null ? 'apagado' : ''}`} data-teste={`valor-${p.chave}`}>
                      {valorParametro(p.tipo, p.valor)}
                    </span>
                    <button className="botao" onClick={() => abrir(p)} data-teste={`editar-${p.chave}`}>
                      {p.valor === null ? 'Definir' : 'Alterar'}
                    </button>
                    <button className="botao fantasma" onClick={() => verHistorico(p)} data-teste={`historico-${p.chave}`}>
                      Histórico
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}

      {editando && (
        <Modal titulo={editando.rotulo} fechar={() => setEditando(null)}>
          <form onSubmit={salvar} style={{ display: 'grid', gap: 14 }} noValidate>
            <p className="secundario">
              Valor atual: <span className="mono">{valorParametro(editando.tipo, editando.valor)}</span>
            </p>
            <label className="campo">
              <span>Novo valor</span>
              {editando.tipo === 'texto' ? (
                <textarea value={valor} onChange={(e) => setValor(e.target.value)} maxLength={280} data-teste="campo-valor" autoFocus />
              ) : (
                <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" data-teste="campo-valor" autoFocus />
              )}
              <small className="apagado">{DICA[editando.tipo]}</small>
            </label>
            <label className="campo">
              <span>Justificativa (obrigatória, fica no histórico)</span>
              <textarea value={justificativa} onChange={(e) => setJustificativa(e.target.value)} maxLength={500} data-teste="campo-justificativa" />
            </label>
            {erro && <p className="erro" role="alert" data-teste="erro-formulario">{erro}</p>}
            <div className="acoes">
              <button type="button" className="botao fantasma" onClick={() => setEditando(null)}>Cancelar</button>
              <button type="submit" className="botao principal-acao" disabled={salvando} data-teste="salvar-parametro">
                {salvando ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {historico && (
        <PainelLateral titulo={`Histórico: ${historico.parametro.rotulo}`} fechar={() => setHistorico(null)} teste="painel-historico">
          {historico.linhas === null && <p className="apagado">Carregando…</p>}
          {historico.linhas?.length === 0 && <p className="apagado">Nenhuma mudança registrada ainda.</p>}
          <div className="fila">
            {historico.linhas?.map((l, i) => (
              <div className="fila-item" key={i} data-teste="linha-historico">
                <div>
                  <p>
                    <span className="mono apagado">{l.valorAnterior === null ? 'A definir' : valorParametro(historico.parametro.tipo, l.valorAnterior)}</span>
                    {' → '}
                    <strong className="mono">{valorParametro(historico.parametro.tipo, l.valorNovo)}</strong>
                  </p>
                  <p>{l.justificativa}</p>
                  <p className="apagado">{l.autor} · {emData(l.criadoEm)}</p>
                </div>
              </div>
            ))}
          </div>
        </PainelLateral>
      )}
    </>
  );
}
