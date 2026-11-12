'use client';

import { useState } from 'react';

export default function Entrada() {
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function entrar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro('');
    setEnviando(true);
    const dados = Object.fromEntries(new FormData(evento.currentTarget));
    const resposta = await fetch('/api/sessao', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados),
    }).catch(() => null);
    if (resposta?.ok) {
      window.location.assign('/');
      return;
    }
    const corpo = await resposta?.json().catch(() => null);
    setErro(corpo?.erro ?? 'Não foi possível entrar. Tente de novo.');
    setEnviando(false);
  }

  return (
    <main className="entrada">
      <form onSubmit={entrar}>
        <div>
          <h1>AVULTE</h1>
          <p className="secundario">Sistema comercial</p>
        </div>
        <label className="campo">
          <span>E-mail</span>
          <input name="email" type="email" autoComplete="username" required />
        </label>
        <label className="campo">
          <span>Senha</span>
          <input name="senha" type="password" autoComplete="current-password" required />
        </label>
        {erro && <p className="erro" role="alert" data-teste="erro-login">{erro}</p>}
        <button className="botao principal-acao" type="submit" disabled={enviando}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </main>
  );
}
