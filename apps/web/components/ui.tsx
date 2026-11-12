import Link from 'next/link';

/** Cabeçalho padrão: nome da aba, a pergunta que ela responde e para quem ela é. */
export function Cabecalho({ nome, pergunta, paraQuem, children }: {
  nome: string; pergunta: string; paraQuem: string; children?: React.ReactNode;
}) {
  return (
    <header className="cabecalho-aba cabecalho-linha" data-teste="cabecalho-aba">
      <div>
        <h1>{nome}</h1>
        <p>{pergunta}</p>
        <small>Para: {paraQuem}</small>
      </div>
      {children}
    </header>
  );
}

/** Tela vazia que ensina o primeiro passo. */
export function TelaVazia({ titulo, texto, children }: { titulo: string; texto: string; children?: React.ReactNode }) {
  return (
    <div className="vazia">
      <h2>{titulo}</h2>
      <p>{texto}</p>
      {children}
    </div>
  );
}

export function SemAcesso() {
  return (
    <div className="vazia" data-teste="sem-acesso">
      <h2>Sem acesso</h2>
      <p>Seu papel não abre esta tela. Se precisar dela, fale com um Sócio ou com o Gerente.</p>
      <Link className="botao" href="/">Voltar ao início</Link>
    </div>
  );
}

/** Status sempre com rótulo, nunca só cor. */
export function Estado({ tipo, children }: { tipo: 'bom' | 'atencao' | 'critico' | 'neutro'; children: React.ReactNode }) {
  return <span className={`estado ${tipo}`}>{children}</span>;
}

/**
 * Cartão de indicador. Recebe tudo pronto do dicionário de métricas: nenhuma tela calcula.
 * Clicar abre a ficha da métrica.
 */
export function CartaoIndicador({ metrica, rotulo, valor, variacao, direcao, bomQuando, comparado, faixa, cor }: {
  metrica: string; rotulo: string; valor: string; variacao: string; direcao?: 'sobe' | 'desce';
  bomQuando?: 'maior' | 'menor'; comparado: string; faixa?: { tipo: 'bom' | 'atencao' | 'critico'; rotulo: string }; cor?: string;
}) {
  const bom = direcao && bomQuando ? (direcao === 'sobe') === (bomQuando === 'maior') : null;
  const classe = direcao && bom !== null ? `${direcao}-${bom ? 'bom' : 'ruim'}` : 'apagado';
  return (
    <Link href={`/metricas?id=${metrica}`} className="cartao indicador" title="Abrir a ficha da métrica">
      <span className="rotulo">{cor && <i className="ponto" style={{ background: cor }} />}{rotulo}</span>
      <span className="valor mono">{valor}</span>
      <span className="variacao">
        <b className={`mono ${classe}`}>{direcao === 'sobe' ? '↑ ' : direcao === 'desce' ? '↓ ' : ''}{variacao}</b>
        <span className="apagado"> {comparado}</span>
      </span>
      {faixa && <Estado tipo={faixa.tipo}>{faixa.rotulo}</Estado>}
    </Link>
  );
}
