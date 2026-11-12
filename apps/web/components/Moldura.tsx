'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { NOME_PAPEL } from '@/lib/formato';
import { menuPara, tem } from '@/lib/menu';

const Icone = ({ d }: { d: string }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);
const MENU_ICONE = 'M4 6h16M4 12h16M4 18h16';
const BUSCA_ICONE = 'M21 21l-4.3-4.3M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14z';
const SOL = 'M12 3v2M12 19v2M5 5l1.5 1.5M17.5 17.5L19 19M3 12h2M19 12h2M5 19l1.5-1.5M17.5 6.5L19 5M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z';
const LUA = 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z';

export function Moldura({ usuario, permissoes, children }: {
  usuario: { nome: string; papel: string };
  permissoes: string[];
  children: React.ReactNode;
}) {
  const caminho = usePathname();
  const roteador = useRouter();
  const menu = useMemo(() => menuPara(permissoes), [permissoes]);
  const [aberto, setAberto] = useState(false); // gaveta no celular
  const [recolhido, setRecolhido] = useState(false); // menu recolhido no computador
  const [tema, setTema] = useState('claro');
  const [busca, setBusca] = useState<string | null>(null);

  useEffect(() => {
    setTema(document.documentElement.dataset.tema ?? 'claro');
    try { setRecolhido(localStorage.getItem('menu') === 'recolhido'); } catch { /* sem armazenamento */ }
  }, []);
  useEffect(() => { setAberto(false); setBusca(null); }, [caminho]);
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setBusca(''); }
      if (e.key === 'Escape') { setBusca(null); setAberto(false); }
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, []);

  function alternarMenu() {
    if (window.matchMedia('(max-width: 900px)').matches) return setAberto((a) => !a);
    setRecolhido((r) => {
      try { localStorage.setItem('menu', r ? 'aberto' : 'recolhido'); } catch { /* sem armazenamento */ }
      return !r;
    });
  }
  function alternarTema() {
    const novo = tema === 'escuro' ? 'claro' : 'escuro';
    document.documentElement.dataset.tema = novo;
    try { localStorage.setItem('tema', novo); } catch { /* sem armazenamento */ }
    setTema(novo);
  }
  async function sair() {
    await fetch('/api/sessao', { method: 'DELETE' });
    window.location.assign('/login');
  }

  const itens = menu.flatMap((g) => g.itens.map((i) => ({ ...i, grupo: g.grupo })));
  const destinos = tem(permissoes, ['metas.ver']) ? [...itens, { rota: '/componentes', nome: 'Componentes', grupo: 'Gestão', permissoes: [] }] : itens;
  const atual = destinos.find((i) => caminho === i.rota || caminho.startsWith(`${i.rota}/`));
  const achados = busca === null ? [] : destinos.filter((i) => i.nome.toLowerCase().includes(busca.trim().toLowerCase()));

  return (
    <div className="moldura" data-recolhido={recolhido}>
      <aside className="lateral" data-teste="menu-lateral" data-aberto={aberto}>
        <div className="marca">AVULTE<small>Sistema comercial</small></div>
        <nav aria-label="Menu principal">
          {menu.map((grupo) => (
            <div className="grupo-menu" key={grupo.grupo}>
              <span>{grupo.grupo}</span>
              {grupo.itens.map((item) => (
                <Link key={item.rota} href={item.rota} className="item-menu" data-teste="menu-item" aria-current={atual?.rota === item.rota ? 'page' : undefined}>
                  {item.nome}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="pe-menu">
          <div>
            <strong>{usuario.nome}</strong>
            <small>{NOME_PAPEL[usuario.papel] ?? usuario.papel}</small>
          </div>
          <button className="botao fantasma" onClick={sair} data-teste="sair">Sair</button>
        </div>
      </aside>
      <button className="veu" data-aberto={aberto} aria-label="Fechar menu" onClick={() => setAberto(false)} />

      <div className="principal">
        <header className="topo">
          <button className="botao fantasma icone" onClick={alternarMenu} aria-label="Abrir ou recolher o menu" data-teste="abrir-menu">
            <Icone d={MENU_ICONE} />
          </button>
          <div className="caminho">
            {atual ? <>{atual.grupo} / <strong>{atual.nome}</strong></> : <strong>Avulte Wear</strong>}
          </div>
          <button className="botao" onClick={() => setBusca('')} aria-label="Buscar (Ctrl+K)">
            <Icone d={BUSCA_ICONE} /><span className="so-largo">Buscar</span><span className="so-largo apagado mono">Ctrl K</span>
          </button>
          <button className="botao icone" onClick={alternarTema} data-teste="alternar-tema"
            aria-label={tema === 'escuro' ? 'Mudar para o tema claro' : 'Mudar para o tema escuro'}>
            <Icone d={tema === 'escuro' ? SOL : LUA} />
          </button>
        </header>
        <main className="conteudo">{children}</main>
      </div>

      {busca !== null && (
        <div className="fundo-modal" onClick={() => setBusca(null)} style={{ placeItems: 'start center', paddingTop: '12dvh' }}>
          <div className="modal" role="dialog" aria-label="Buscar" onClick={(e) => e.stopPropagation()}>
            <form onSubmit={(e) => { e.preventDefault(); if (achados[0]) roteador.push(achados[0].rota); }}>
              <label className="campo">
                <span>Ir para</span>
                <input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome da aba" data-teste="busca" />
              </label>
            </form>
            <div className="busca-lista">
              {achados.map((i, n) => (
                <Link key={i.rota} href={i.rota} data-ativo={n === 0}>
                  <span>{i.nome}</span><span className="apagado">{i.grupo}</span>
                </Link>
              ))}
              {achados.length === 0 && <p className="apagado">Nenhuma aba com esse nome.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
