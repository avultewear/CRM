'use client';

import { useEffect } from 'react';

function useEsc(fechar: () => void) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') fechar(); };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [fechar]);
}

export function Modal({ titulo, fechar, children }: { titulo: string; fechar: () => void; children: React.ReactNode }) {
  useEsc(fechar);
  return (
    <div className="fundo-modal" onClick={fechar}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={titulo} onClick={(e) => e.stopPropagation()}>
        <h2>{titulo}</h2>
        {children}
      </div>
    </div>
  );
}

/** Painel lateral de detalhe. */
export function PainelLateral({ titulo, fechar, children, teste }: {
  titulo: string; fechar: () => void; children: React.ReactNode; teste?: string;
}) {
  useEsc(fechar);
  return (
    <>
      <div className="fundo-modal" onClick={fechar} />
      <aside className="painel-lateral" role="dialog" aria-label={titulo} data-teste={teste}>
        <div className="cabecalho-linha">
          <h2>{titulo}</h2>
          <button className="botao fantasma" onClick={fechar}>Fechar</button>
        </div>
        {children}
      </aside>
    </>
  );
}

export function AbasSegmentadas({ opcoes, valor, mudar }: { opcoes: string[]; valor: string; mudar: (v: string) => void }) {
  return (
    <div className="abas-seg" role="tablist">
      {opcoes.map((o) => (
        <button key={o} role="tab" aria-selected={o === valor} onClick={() => mudar(o)}>{o}</button>
      ))}
    </div>
  );
}
