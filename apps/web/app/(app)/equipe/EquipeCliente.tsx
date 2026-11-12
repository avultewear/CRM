'use client';

import { useState } from 'react';
import { Modal } from '@/components/interativos';
import { Estado, TelaVazia } from '@/components/ui';
import { NOME_PAPEL, chamar, emReais } from '@/lib/formato';

export interface Pessoa {
  id: string;
  nome: string;
  email: string;
  papel: string;
  funcao: string | null;
  vende: boolean;
  ativo: boolean;
  metaMensal: number | null;
  codigoVendedor: string | null;
  editaEstoque: boolean;
  // Cifras dos Sócios: a API só envia estes campos para quem pode ver.
  comissaoPct?: number | null;
  comissaoTeto?: number | null;
  limiteDescontoPct?: number | null;
}

const PAPEIS = Object.keys(NOME_PAPEL);

function numeroOuNulo(texto: FormDataEntryValue | null): number | null {
  const limpo = String(texto ?? '').trim().replace(/\s|R\$|%/g, '');
  if (!limpo) return null;
  const n = Number(limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : limpo);
  return Number.isFinite(n) ? n : null;
}
const textoOuNulo = (texto: FormDataEntryValue | null) => String(texto ?? '').trim() || null;
const numeroBr = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n).replace('.', ','));

export function EquipeCliente({ pessoas, verCifras, euId, children }: {
  pessoas: Pessoa[];
  /** Só Sócios: meta, comissão, teto e limite de cada pessoa podem ser alterados. */
  verCifras: boolean;
  euId: string;
  children: React.ReactNode;
}) {
  const [lista, setLista] = useState(pessoas);
  const [aberta, setAberta] = useState<Pessoa | 'nova' | null>(null);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  const editando = aberta && aberta !== 'nova' ? aberta : null;
  const papeisPermitidos = verCifras ? PAPEIS : PAPEIS.filter((p) => p !== 'SOCIO');

  function abrir(alvo: Pessoa | 'nova') {
    setErro('');
    setAberta(alvo);
  }

  async function salvar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro('');
    const f = new FormData(evento.currentTarget);
    const dados: Record<string, unknown> = {
      nome: String(f.get('nome') ?? '').trim(),
      email: String(f.get('email') ?? '').trim(),
      papel: f.get('papel'),
      funcao: textoOuNulo(f.get('funcao')),
      vende: f.get('vende') === 'on',
      editaEstoque: f.get('editaEstoque') === 'on',
      codigoVendedor: textoOuNulo(f.get('codigoVendedor')),
    };
    const senha = String(f.get('senha') ?? '');
    if (senha) dados.senha = senha;
    if (editando && editando.id !== euId) dados.ativo = f.get('ativo') === 'on';
    // O Gerente não envia os campos dos Sócios: a API recusaria o pedido inteiro.
    if (verCifras) {
      dados.metaMensal = numeroOuNulo(f.get('metaMensal'));
      dados.comissaoPct = numeroOuNulo(f.get('comissaoPct'));
      dados.comissaoTeto = numeroOuNulo(f.get('comissaoTeto'));
      dados.limiteDescontoPct = numeroOuNulo(f.get('limiteDescontoPct'));
    }
    setSalvando(true);
    try {
      if (editando) {
        const salva = await chamar<Pessoa>('PATCH', `/equipe/${editando.id}`, dados);
        setLista((atual) => atual.map((p) => (p.id === salva.id ? salva : p)));
      } else {
        const criada = await chamar<Pessoa>('POST', '/equipe', dados);
        setLista((atual) => [...atual, criada].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')));
      }
      setAberta(null);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <>
      <div className="cabecalho-linha">
        {children}
        <button className="botao principal-acao" onClick={() => abrir('nova')} data-teste="adicionar-pessoa">Adicionar pessoa</button>
      </div>

      {lista.length === 0 ? (
        <TelaVazia titulo="Ninguém na equipe ainda" texto="Adicione a primeira pessoa e escolha o papel dela. O papel decide o que ela vê." />
      ) : (
        <div className="rolagem">
          <table className="tabela">
            <thead>
              <tr>
                <th>Nome</th><th>E-mail</th><th>Papel</th><th>Função</th><th>Vende</th><th>Meta do mês</th>
                {verCifras && <><th>Comissão</th><th>Teto</th><th>Limite de desconto</th></>}
                <th>Código</th><th>Situação</th><th />
              </tr>
            </thead>
            <tbody>
              {lista.map((p) => {
                const bloqueada = !verCifras && p.papel === 'SOCIO';
                return (
                  <tr key={p.id}>
                    <td>{p.nome}</td>
                    <td>{p.email}</td>
                    <td>{NOME_PAPEL[p.papel] ?? p.papel}</td>
                    <td>{p.funcao ?? '—'}</td>
                    <td>{p.vende ? 'Sim' : 'Não'}</td>
                    <td className="mono">{p.metaMensal === null ? '—' : emReais(p.metaMensal)}</td>
                    {verCifras && (
                      <>
                        <td className="mono">{p.comissaoPct == null ? '—' : `${numeroBr(p.comissaoPct)}%`}</td>
                        <td className="mono">{p.comissaoTeto == null ? '—' : emReais(p.comissaoTeto)}</td>
                        <td className="mono">{p.limiteDescontoPct == null ? '—' : `${numeroBr(p.limiteDescontoPct)}%`}</td>
                      </>
                    )}
                    <td className="mono">{p.codigoVendedor ?? '—'}</td>
                    <td><Estado tipo={p.ativo ? 'bom' : 'neutro'}>{p.ativo ? 'Ativa' : 'Inativa'}</Estado></td>
                    <td>
                      {!bloqueada && (
                        <button className="botao" onClick={() => abrir(p)} data-teste={`editar-pessoa-${p.email}`}>Editar</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="apagado">Ninguém é apagado: quem sai da equipe fica como inativa e perde o acesso na hora.</p>

      {aberta && (
        <Modal titulo={editando ? `Editar ${editando.nome}` : 'Adicionar pessoa'} fechar={() => setAberta(null)}>
          <form onSubmit={salvar} style={{ display: 'grid', gap: 14 }} key={editando?.id ?? 'nova'}>
            <div className="linha-campos">
              <label className="campo">
                <span>Nome</span>
                <input name="nome" defaultValue={editando?.nome} required minLength={2} />
              </label>
              <label className="campo">
                <span>E-mail</span>
                <input name="email" type="email" defaultValue={editando?.email} required autoComplete="off" />
              </label>
            </div>
            <div className="linha-campos">
              <label className="campo">
                <span>{editando ? 'Nova senha (deixe vazio para manter)' : 'Senha (8 caracteres ou mais)'}</span>
                <input name="senha" type="password" required={!editando} minLength={8} autoComplete="new-password" />
              </label>
              <label className="campo">
                <span>Papel</span>
                <select name="papel" defaultValue={editando?.papel ?? 'VENDEDOR'}>
                  {papeisPermitidos.map((p) => <option key={p} value={p}>{NOME_PAPEL[p]}</option>)}
                </select>
              </label>
            </div>
            <div className="linha-campos">
              <label className="campo">
                <span>Função</span>
                <input name="funcao" defaultValue={editando?.funcao ?? ''} maxLength={80} />
              </label>
              <label className="campo">
                <span>Código de vendedor (entra nos links de compra)</span>
                <input name="codigoVendedor" defaultValue={editando?.codigoVendedor ?? ''} maxLength={12} style={{ textTransform: 'uppercase' }} />
              </label>
            </div>
            {verCifras && (
              <div className="linha-campos">
                <label className="campo">
                  <span>Meta do mês (R$)</span>
                  <input name="metaMensal" inputMode="decimal" defaultValue={numeroBr(editando?.metaMensal)} />
                </label>
                <label className="campo">
                  <span>Comissão (%)</span>
                  <input name="comissaoPct" inputMode="decimal" defaultValue={numeroBr(editando?.comissaoPct)} />
                </label>
                <label className="campo">
                  <span>Teto mensal (R$)</span>
                  <input name="comissaoTeto" inputMode="decimal" defaultValue={numeroBr(editando?.comissaoTeto)} />
                </label>
                <label className="campo">
                  <span>Limite de desconto (%)</span>
                  <input name="limiteDescontoPct" inputMode="decimal" defaultValue={numeroBr(editando?.limiteDescontoPct)} />
                </label>
              </div>
            )}
            <label className="marcar">
              <input type="checkbox" name="vende" defaultChecked={editando?.vende ?? false} /> Vende (entra no rodízio de leads)
            </label>
            <label className="marcar">
              <input type="checkbox" name="editaEstoque" defaultChecked={editando?.editaEstoque ?? false} /> Pode editar o estoque
            </label>
            {editando && editando.id !== euId && (
              <label className="marcar">
                <input type="checkbox" name="ativo" defaultChecked={editando.ativo} /> Ativa (desmarque para tirar o acesso)
              </label>
            )}
            {erro && <p className="erro" role="alert" data-teste="erro-formulario">{erro}</p>}
            <div className="acoes">
              <button type="button" className="botao fantasma" onClick={() => setAberta(null)}>Cancelar</button>
              <button type="submit" className="botao principal-acao" disabled={salvando} data-teste="salvar-pessoa">
                {salvando ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
