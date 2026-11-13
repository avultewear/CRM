'use client';

import { useState } from 'react';

export function CopiarCupom({ codigo }: { codigo: string }) {
  const [copiado, setCopiado] = useState(false);
  async function copiar() {
    try {
      await navigator.clipboard.writeText(codigo);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2500);
    } catch {
      // Sem permissão para a área de transferência: o código continua visível na tela.
    }
  }
  return <button className="botao pequeno" onClick={copiar} data-teste="copiar-cupom">{copiado ? 'Copiado' : 'Copiar código'}</button>;
}
