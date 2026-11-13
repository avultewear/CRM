'use client';

import { useState } from 'react';
import { Modal } from '@/components/interativos';
import { Estado, TelaVazia } from '@/components/ui';
import { chamar, emReais, lerNumero } from '@/lib/formato';

export interface Influenciador {
  id: string;
  nome: string;
  arroba: string | null;
  ativo: boolean;
  login: string | null;
  usuarioId: string | null;
  cupons: Array<{ id: string; codigo: string; descontoPct: number; validade: string | null; ativo: boolean; comissaoPct?: number | null }>;
  vendas: number;
  valorVendas: number;
  /** Clientes cuja primeira compra foi com um cupom dele, e quantos desses compraram de novo. */
  clientes: number;
  clientesQueVoltaram: number;
  pecas: Array<{ id: string; descricao: string; quantidade: number; enviadaEm: string; custo?: number | null }>;
  posts: { mes: string; combinados: number | null; feitos: number | null };
  // Cifras dos Sócios: a API só envia para quem pode ver.
  comissaoTeto?: number | null;
  comissao?: number;
  custoPecas?: number;
  retorno?: number;
}

type Aberto =
  | { tipo: 'influenciador'; alvo: Influenciador | null }
  | { tipo: 'cupom' | 'peca' | 'posts'; alvo: Influenciador };

const emDia = (iso: string) => iso.split('-').reverse().join('/');
const pct = (n: number) => `${n.toLocaleString('pt-BR')}%`;
const hoje = () => new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);

export function InfluenciadoresCliente({ inicial, acessos, verCifras, children }: {
  inicial: Influenciador[];
  /** Pessoas com o papel Influenciador, para ligar o cadastro ao login. */
  acessos: Array<{ id: string; nome: string; email: string }>;
  verCifras: boolean;
  children: React.ReactNode;
}) {
  const [lista, setLista] = useState(inicial);
  const [aberto, setAberto] = useState<Aberto | null>(null);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');

  const abrir = (a: Aberto) => { setErro(''); setAberto(a); };

  async function executar(fn: () => Promise<unknown>, mensagem: string) {
    setErro('');
    try {
      await fn();
      setLista(await chamar<Influenciador[]>('GET', '/influenciadores'));
      setAberto(null);
      setAviso(mensagem);
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  function salvarInfluenciador(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (aberto?.tipo !== 'influenciador') return;
    const f = new FormData(evento.currentTarget);
    const corpo: Record<string, unknown> = {
      nome: String(f.get('nome') ?? '').trim(),
      arroba: String(f.get('arroba') ?? '').trim() || null,
      usuarioId: String(f.get('usuarioId') ?? '') || null,
    };
    if (verCifras) corpo.comissaoTeto = lerNumero(f.get('comissaoTeto'));
    const alvo = aberto.alvo;
    if (alvo) corpo.ativo = f.get('ativo') === 'on';
    executar(() => (alvo ? chamar('PATCH', `/influenciadores/${alvo.id}`, corpo) : chamar('POST', '/influenciadores', corpo)),
      alvo ? 'Cadastro atualizado.' : 'Influenciador cadastrado.');
  }

  function salvarCupom(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (aberto?.tipo !== 'cupom') return;
    const f = new FormData(evento.currentTarget);
    executar(() => chamar('POST', `/influenciadores/${aberto.alvo.id}/cupons`, {
      codigo: String(f.get('codigo') ?? ''), descontoPct: lerNumero(f.get('descontoPct')) ?? 0,
      comissaoPct: lerNumero(f.get('comissaoPct')), validade: String(f.get('validade') ?? '') || null,
    }), 'Cupom criado.');
  }

  function salvarPeca(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (aberto?.tipo !== 'peca') return;
    const f = new FormData(evento.currentTarget);
    const corpo: Record<string, unknown> = {
      descricao: String(f.get('descricao') ?? ''), quantidade: lerNumero(f.get('quantidade')) ?? 0, enviadaEm: String(f.get('enviadaEm') ?? ''),
    };
    if (verCifras && lerNumero(f.get('custo')) !== null) corpo.custo = lerNumero(f.get('custo'));
    executar(() => chamar('POST', `/influenciadores/${aberto.alvo.id}/pecas`, corpo), 'Peça registrada.');
  }

  function salvarPosts(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (aberto?.tipo !== 'posts') return;
    const f = new FormData(evento.currentTarget);
    executar(() => chamar('PUT', `/influenciadores/${aberto.alvo.id}/posts`, {
      mes: aberto.alvo.posts.mes, combinados: lerNumero(f.get('combinados')) ?? 0, feitos: lerNumero(f.get('feitos')) ?? 0,
    }), 'Posts do mês atualizados.');
  }

  const alternarCupom = (id: string, ativo: boolean) =>
    executar(() => chamar('PATCH', `/cupons/${id}`, { ativo }), ativo ? 'Cupom reativado.' : 'Cupom desativado.');

  return (
    <>
      <div className="cabecalho-linha">
        {children}
        <button className="botao principal-acao" onClick={() => abrir({ tipo: 'influenciador', alvo: null })} data-teste="novo-influenciador">Novo influenciador</button>
      </div>
      {aviso && <p className="secundario" role="status" data-teste="aviso-influenciadores">{aviso}</p>}

      {lista.length === 0 ? (
        <TelaVazia titulo="Nenhum influenciador ainda" texto="Cadastre o primeiro, ligue o cadastro ao login dele e crie o cupom. As vendas com o cupom aparecem aqui e no espaço dele.">
          <button className="botao principal-acao" onClick={() => abrir({ tipo: 'influenciador', alvo: null })}>Cadastrar o primeiro</button>
        </TelaVazia>
      ) : lista.map((i) => (
        <section className="cartao" key={i.id} data-teste="influenciador" data-nome={i.nome}>
          <div className="cabecalho-linha">
            <div>
              <h2>{i.nome} {i.arroba && <span className="apagado">{i.arroba}</span>}</h2>
              <p className="apagado">
                {i.login ? `Acesso: ${i.login}` : 'Sem acesso ao espaço dele ainda'}{' '}
                <Estado tipo={i.ativo ? 'bom' : 'neutro'}>{i.ativo ? 'Ativo' : 'Inativo'}</Estado>
              </p>
            </div>
            <button className="botao" onClick={() => abrir({ tipo: 'influenciador', alvo: i })} data-teste="alterar-influenciador">Editar</button>
          </div>

          <div className="grade-indicadores">
            <div className="cartao indicador"><span className="rotulo">Vendas com cupom</span><span className="valor mono" data-teste="vendas-influenciador">{i.vendas}</span></div>
            <div className="cartao indicador"><span className="rotulo">Valor vendido</span><span className="valor mono">{i.vendas ? emReais(i.valorVendas) : '—'}</span></div>
            <div className="cartao indicador"><span className="rotulo">Clientes novos trazidos</span><span className="valor mono" data-teste="clientes-influenciador">{i.clientes}</span>
              <span className="variacao apagado">{i.clientes ? `${i.clientesQueVoltaram} ${i.clientesQueVoltaram === 1 ? 'voltou' : 'voltaram'} a comprar` : 'primeira compra com o cupom'}</span></div>
            {verCifras && (
              <>
                <div className="cartao indicador"><span className="rotulo">Comissão gerada</span><span className="valor mono" style={{ color: 'var(--prolabore)' }}>{emReais(i.comissao ?? 0)}</span>
                  <span className="variacao apagado">{i.comissaoTeto == null ? 'teto padrão de Metas' : `teto de ${emReais(i.comissaoTeto)} por mês`}</span></div>
                <div className="cartao indicador"><span className="rotulo">Custo das peças enviadas</span><span className="valor mono" style={{ color: 'var(--anuncios)' }}>{emReais(i.custoPecas ?? 0)}</span></div>
                <div className="cartao indicador"><span className="rotulo">Retorno</span><span className="valor mono">{emReais(i.retorno ?? 0)}</span>
                  <span className="variacao apagado">vendas − comissão − peças</span></div>
              </>
            )}
          </div>

          <div className="secao">
            <div className="cabecalho-linha">
              <h3>Cupons</h3>
              {verCifras && <button className="botao pequeno" onClick={() => abrir({ tipo: 'cupom', alvo: i })} data-teste="novo-cupom">Novo cupom</button>}
            </div>
            {i.cupons.length === 0 && <p className="apagado">{verCifras ? 'Nenhum cupom. Crie o primeiro.' : 'Nenhum cupom. Os cupons são criados pelos Sócios.'}</p>}
            {i.cupons.map((c) => (
              <div className="fila-item" key={c.id} data-teste="cupom">
                <div>
                  <strong className="mono">{c.codigo}</strong> · {pct(c.descontoPct)} de desconto
                  {verCifras && <> · {c.comissaoPct == null ? 'comissão padrão de Metas' : `${pct(c.comissaoPct)} de comissão`}</>}
                  <span className="apagado"> · {c.validade ? `vale até ${emDia(c.validade)}` : 'sem validade'}</span>
                </div>
                <div className="fila-acoes">
                  <Estado tipo={c.ativo ? 'bom' : 'neutro'}>{c.ativo ? 'Ativo' : 'Desativado'}</Estado>
                  {verCifras && <button className="botao pequeno fantasma" onClick={() => alternarCupom(c.id, !c.ativo)}>{c.ativo ? 'Desativar' : 'Reativar'}</button>}
                </div>
              </div>
            ))}
          </div>

          <div className="secao">
            <div className="cabecalho-linha">
              <h3>Posts de {i.posts.mes.split('-').reverse().join('/')}</h3>
              <button className="botao pequeno" onClick={() => abrir({ tipo: 'posts', alvo: i })} data-teste="atualizar-posts">Atualizar</button>
            </div>
            {i.posts.combinados === null ? <p className="apagado">Nada combinado neste mês ainda.</p> : (
              <p>
                <strong data-teste="posts-feitos">{i.posts.feitos} de {i.posts.combinados}</strong> posts combinados foram feitos{' '}
                <Estado tipo={(i.posts.feitos ?? 0) >= (i.posts.combinados ?? 0) ? 'bom' : 'atencao'}>
                  {(i.posts.feitos ?? 0) >= (i.posts.combinados ?? 0) ? 'Cumprido' : `Faltam ${(i.posts.combinados ?? 0) - (i.posts.feitos ?? 0)}`}
                </Estado>
              </p>
            )}
          </div>

          <div className="secao">
            <div className="cabecalho-linha">
              <h3>Peças enviadas</h3>
              <button className="botao pequeno" onClick={() => abrir({ tipo: 'peca', alvo: i })} data-teste="registrar-peca">Registrar peça</button>
            </div>
            {i.pecas.length === 0 && <p className="apagado">Nenhuma peça enviada.</p>}
            {i.pecas.map((p) => (
              <p key={p.id}>
                {p.quantidade}× {p.descricao} <span className="apagado">· {emDia(p.enviadaEm)}</span>
                {verCifras && <span className="mono apagado"> · {p.custo == null ? 'sem custo informado' : emReais(p.custo)}</span>}
              </p>
            ))}
          </div>
        </section>
      ))}

      {aberto?.tipo === 'influenciador' && (
        <Modal titulo={aberto.alvo ? `Editar ${aberto.alvo.nome}` : 'Novo influenciador'} fechar={() => setAberto(null)}>
          <form onSubmit={salvarInfluenciador} style={{ display: 'grid', gap: 14 }}>
            <div className="linha-campos">
              <label className="campo"><span>Nome</span><input name="nome" defaultValue={aberto.alvo?.nome} required minLength={2} /></label>
              <label className="campo"><span>Perfil no Instagram</span><input name="arroba" defaultValue={aberto.alvo?.arroba ?? ''} placeholder="@perfil" maxLength={60} /></label>
            </div>
            <label className="campo">
              <span>Acesso ao espaço do influenciador</span>
              <select name="usuarioId" defaultValue={aberto.alvo?.usuarioId ?? ''}>
                <option value="">Sem acesso por enquanto</option>
                {acessos.map((a) => <option key={a.id} value={a.id}>{a.nome} ({a.email})</option>)}
              </select>
              <small className="apagado">O login é criado em Equipe, com o papel Influenciador.</small>
            </label>
            {verCifras && (
              <label className="campo">
                <span>Teto mensal de comissão (R$). Vazio usa o padrão de Metas</span>
                <input name="comissaoTeto" inputMode="decimal" defaultValue={aberto.alvo?.comissaoTeto == null ? '' : String(aberto.alvo.comissaoTeto).replace('.', ',')} />
              </label>
            )}
            {aberto.alvo && <label className="marcar"><input type="checkbox" name="ativo" defaultChecked={aberto.alvo.ativo} /> Ativo (desmarque para os cupons dele pararem de valer)</label>}
            {erro && <p className="erro" role="alert" data-teste="erro-formulario">{erro}</p>}
            <div className="acoes">
              <button type="button" className="botao fantasma" onClick={() => setAberto(null)}>Cancelar</button>
              <button type="submit" className="botao principal-acao" data-teste="salvar-influenciador">Salvar</button>
            </div>
          </form>
        </Modal>
      )}

      {aberto?.tipo === 'cupom' && (
        <Modal titulo={`Novo cupom de ${aberto.alvo.nome}`} fechar={() => setAberto(null)}>
          <form onSubmit={salvarCupom} style={{ display: 'grid', gap: 14 }}>
            <div className="linha-campos">
              <label className="campo"><span>Código (sem espaço)</span><input name="codigo" required maxLength={20} style={{ textTransform: 'uppercase' }} /></label>
              <label className="campo"><span>Desconto para o cliente (%)</span><input name="descontoPct" inputMode="decimal" required /></label>
            </div>
            <div className="linha-campos">
              <label className="campo"><span>Comissão (%). Vazio usa o padrão de Metas</span><input name="comissaoPct" inputMode="decimal" /></label>
              <label className="campo"><span>Vale até (opcional)</span><input name="validade" type="date" /></label>
            </div>
            <p className="apagado">Quando a loja estiver ligada (etapa 2), o cupom passa a valer também no checkout do site.</p>
            {erro && <p className="erro" role="alert" data-teste="erro-formulario">{erro}</p>}
            <div className="acoes">
              <button type="button" className="botao fantasma" onClick={() => setAberto(null)}>Cancelar</button>
              <button type="submit" className="botao principal-acao" data-teste="salvar-cupom">Criar cupom</button>
            </div>
          </form>
        </Modal>
      )}

      {aberto?.tipo === 'peca' && (
        <Modal titulo={`Peça enviada a ${aberto.alvo.nome}`} fechar={() => setAberto(null)}>
          <form onSubmit={salvarPeca} style={{ display: 'grid', gap: 14 }}>
            <label className="campo"><span>Peça</span><input name="descricao" required minLength={2} maxLength={160} placeholder="Modelo, cor e tamanho" /></label>
            <div className="linha-campos">
              <label className="campo"><span>Quantidade</span><input name="quantidade" inputMode="numeric" defaultValue="1" required /></label>
              <label className="campo"><span>Data do envio</span><input name="enviadaEm" type="date" defaultValue={hoje()} required /></label>
              {verCifras && <label className="campo"><span>Custo total (R$)</span><input name="custo" inputMode="decimal" /></label>}
            </div>
            <p className="apagado">A baixa no estoque entra junto com a etapa 2.</p>
            {erro && <p className="erro" role="alert" data-teste="erro-formulario">{erro}</p>}
            <div className="acoes">
              <button type="button" className="botao fantasma" onClick={() => setAberto(null)}>Cancelar</button>
              <button type="submit" className="botao principal-acao" data-teste="salvar-peca">Registrar</button>
            </div>
          </form>
        </Modal>
      )}

      {aberto?.tipo === 'posts' && (
        <Modal titulo={`Posts de ${aberto.alvo.nome} em ${aberto.alvo.posts.mes.split('-').reverse().join('/')}`} fechar={() => setAberto(null)}>
          <form onSubmit={salvarPosts} style={{ display: 'grid', gap: 14 }}>
            <div className="linha-campos">
              <label className="campo"><span>Posts combinados</span><input name="combinados" inputMode="numeric" defaultValue={aberto.alvo.posts.combinados ?? ''} required /></label>
              <label className="campo"><span>Posts feitos</span><input name="feitos" inputMode="numeric" defaultValue={aberto.alvo.posts.feitos ?? 0} required /></label>
            </div>
            {erro && <p className="erro" role="alert" data-teste="erro-formulario">{erro}</p>}
            <div className="acoes">
              <button type="button" className="botao fantasma" onClick={() => setAberto(null)}>Cancelar</button>
              <button type="submit" className="botao principal-acao" data-teste="salvar-posts">Salvar</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
