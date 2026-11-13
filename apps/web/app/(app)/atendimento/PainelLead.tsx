'use client';

import { useEffect, useState } from 'react';
import { Modal, PainelLateral } from '@/components/interativos';
import { Estado } from '@/components/ui';
import { chamar, emData, emReais, emTelefone, emTempo, lerNumero, linkWhatsApp } from '@/lib/formato';
import { NOME_SITUACAO_VENDA, type Config, type Detalhe } from './tipos';

const NOME_DESTINO: Record<string, string> = {
  RECUPERACAO: 'vai para a Recuperação', ENCERRADA: 'encerra a oportunidade', NAO_CONTA: 'não conta como perda',
};
const NOME_SITUACAO: Record<string, string> = { ABERTA: 'Aberta', GANHA: 'Ganha', ENCERRADA: 'Encerrada', DESCARTADA: 'Não conta' };
const ITEM_VAZIO = { descricao: '', quantidade: '1', precoTabela: '', preco: '' };

export function PainelLead({ id, versao, config, gestao, vendedores, fechar, acao, avisar }: {
  id: string;
  /** Muda a cada recarga do quadro, para o painel buscar o lead de novo. */
  versao: number;
  config: Config;
  gestao: boolean;
  vendedores: Array<{ id: string; nome: string }>;
  fechar: () => void;
  acao: <T>(fn: () => Promise<T>) => Promise<T | undefined>;
  avisar: (texto: string) => void;
}) {
  const [d, setD] = useState<Detalhe | null>(null);
  const [modal, setModal] = useState<'link' | 'venda' | 'perdido' | null>(null);
  const [erro, setErro] = useState('');
  const [itens, setItens] = useState([ITEM_VAZIO]);

  useEffect(() => {
    let vivo = true;
    chamar<Detalhe>('GET', `/oportunidades/${id}`)
      .then((dados) => { if (vivo) setD(dados); })
      .catch((e) => { if (vivo) { avisar((e as Error).message); fechar(); } });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, versao]);

  if (!d) {
    return <PainelLateral titulo="Carregando…" fechar={fechar}><p className="apagado">Buscando o lead.</p></PainelLateral>;
  }

  const etapa = config.etapas.find((e) => e.id === d.etapa);
  const proxima = config.etapas.find((e) => e.id === d.proximaEtapa);
  const aberta = d.situacao === 'ABERTA';
  const recarregar = () => acao(() => Promise.resolve());
  const abrirModal = (qual: 'link' | 'venda' | 'perdido') => { setErro(''); setItens([ITEM_VAZIO]); setModal(qual); };

  /** Ação de formulário dentro de um modal: o erro aparece no próprio modal. */
  async function enviar(fn: () => Promise<unknown>, depois?: string) {
    setErro('');
    try {
      await fn();
      setModal(null);
      await recarregar();
      if (depois) avisar(depois);
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  function salvarLevantamento(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const f = new FormData(evento.currentTarget);
    acao(() => chamar('PATCH', `/oportunidades/${d!.id}`, {
      interesse: String(f.get('interesse') ?? '').trim() || null,
      tamanho: String(f.get('tamanho') ?? '').trim() || null,
      quantidade: lerNumero(f.get('quantidade')),
      valor: lerNumero(f.get('valor')),
      temperatura: f.get('temperatura') || null,
      etiquetas: String(f.get('etiquetas') ?? '').split(',').map((e) => e.trim()).filter(Boolean),
    })).then((r) => { if (r) avisar('Levantamento salvo.'); });
  }

  function salvarContato(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const f = new FormData(evento.currentTarget);
    const corpo: Record<string, unknown> = {
      nome: String(f.get('nome') ?? '').trim(),
      email: String(f.get('email') ?? '').trim() || null,
    };
    if (!d!.cliente.bloqueado) corpo.aceiteMensagens = f.get('aceite') === 'on';
    const cpf = String(f.get('cpf') ?? '').trim();
    if (cpf) corpo.cpf = cpf;
    acao(() => chamar('PATCH', `/clientes/${d!.cliente.id}`, corpo)).then((r) => { if (r) avisar('Contato salvo.'); });
  }

  function adicionarNota(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const formulario = evento.currentTarget;
    const texto = String(new FormData(formulario).get('texto') ?? '');
    acao(() => chamar('POST', `/oportunidades/${d!.id}/notas`, { texto })).then((r) => { if (r) formulario.reset(); });
  }

  function adicionarLembrete(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const formulario = evento.currentTarget;
    const f = new FormData(formulario);
    const quando = String(f.get('prazo') ?? '');
    acao(() => chamar('POST', `/oportunidades/${d!.id}/lembretes`, { titulo: f.get('titulo'), prazo: quando ? new Date(quando).toISOString() : '' }))
      .then((r) => { if (r) formulario.reset(); });
  }

  const totalVenda = itens.reduce((s, i) => s + (lerNumero(i.preco) ?? 0) * (lerNumero(i.quantidade) ?? 0), 0);
  const mudarItem = (n: number, campo: keyof typeof ITEM_VAZIO, valor: string) =>
    setItens((atual) => atual.map((i, k) => (k === n ? { ...i, [campo]: valor } : i)));

  return (
    <>
      <PainelLateral titulo={d.cliente.nome} fechar={fechar} teste="painel-lead">
        <div className="chips">
          <Estado tipo={d.situacao === 'GANHA' ? 'bom' : aberta ? 'neutro' : 'critico'}>
            <span data-teste="etapa-atual">{etapa?.nome ?? d.etapa}</span>
          </Estado>
          <Estado tipo="neutro">{NOME_SITUACAO[d.situacao]}</Estado>
          {d.parado && <Estado tipo="critico">Parado</Estado>}
          {d.cliente.bloqueado && <Estado tipo="critico">Não contatar</Estado>}
        </div>
        <p className="apagado">
          Na etapa há {emTempo(d.horasNaEtapa)} · {d.vendedorNome ? `com ${d.vendedorNome}` : 'sem vendedor'}
          {d.motivoPerda ? ` · motivo: ${config.motivos.find((m) => m.id === d.motivoPerda)?.nome ?? d.motivoPerda}` : ''}
        </p>

        {aberta && (
          <div className="secao">
            <h3>Próximo passo</h3>
            {proxima && d.falta.length > 0 && (
              <div data-teste="falta">
                <p className="secundario">Falta para entrar em {proxima.nome}:</p>
                <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{d.falta.map((f) => <li key={f}>{f}</li>)}</ul>
              </div>
            )}
            {d.etapa === 'RECUPERACAO' && <p className="secundario">Na Recuperação, marque no follow se o cliente respondeu ou não.</p>}
            <div className="chips">
              {!d.primeiraRespostaEm && (
                <button className="botao" data-teste="acao-resposta" onClick={() => acao(() => chamar('POST', `/oportunidades/${d.id}/resposta`, {}))}>
                  Registrar resposta
                </button>
              )}
              {proxima && proxima.id !== 'VENDA' && (
                <button className="botao principal-acao" data-teste="acao-avancar" onClick={() => acao(() => chamar('POST', `/oportunidades/${d.id}/avancar`, {}))}>
                  Avançar para {proxima.nome}
                </button>
              )}
              <button className="botao" data-teste="acao-link" onClick={() => abrirModal('link')}>Enviar link</button>
              <button className="botao" data-teste="acao-venda" onClick={() => abrirModal('venda')}>Venda direta</button>
              <button className="botao fantasma" data-teste="acao-perdido" onClick={() => abrirModal('perdido')}>Perdido</button>
            </div>
          </div>
        )}

        <form className="secao" onSubmit={salvarContato} key={`contato-${versao}`}>
          <h3>Contato</h3>
          <p>
            <span className="mono">{emTelefone(d.cliente.telefone)}</span>{' '}
            <a className="botao pequeno" href={linkWhatsApp(d.cliente.telefone)} target="_blank" rel="noreferrer">Abrir WhatsApp</a>
          </p>
          <div className="linha-campos">
            <label className="campo"><span>Nome</span><input name="nome" defaultValue={d.cliente.nome} required minLength={2} /></label>
            <label className="campo"><span>E-mail</span><input name="email" type="email" defaultValue={d.cliente.email ?? ''} /></label>
          </div>
          <label className="campo">
            <span>CPF {d.cliente.temCpf ? <>(informado: <span className="mono" data-teste="cpf-mascarado">{d.cliente.cpf}</span>)</> : '(obrigatório na venda)'}</span>
            <input name="cpf" inputMode="numeric" placeholder={d.cliente.temCpf ? 'Digite só para trocar' : '000.000.000-00'} autoComplete="off" />
          </label>
          {d.cliente.bloqueado ? (
            <p className="erro">Este cliente pediu para não ser contatado. Nenhuma abordagem é criada para ele.</p>
          ) : (
            <label className="marcar"><input type="checkbox" name="aceite" defaultChecked={d.cliente.aceiteMensagens} /> Aceitou receber mensagens de oferta</label>
          )}
          <div className="acoes"><button className="botao" type="submit" data-teste="salvar-contato">Salvar contato</button></div>
        </form>

        <form className="secao" onSubmit={salvarLevantamento} key={`lev-${versao}`}>
          <h3>Levantamento</h3>
          <div className="linha-campos">
            <label className="campo"><span>Produto de interesse</span><input name="interesse" defaultValue={d.interesse ?? ''} maxLength={160} /></label>
            <label className="campo"><span>Tamanho</span><input name="tamanho" defaultValue={d.tamanho ?? ''} maxLength={20} /></label>
          </div>
          <div className="linha-campos">
            <label className="campo"><span>Quantidade</span><input name="quantidade" inputMode="numeric" defaultValue={d.quantidade ?? ''} /></label>
            <label className="campo"><span>Valor (R$)</span><input name="valor" inputMode="decimal" defaultValue={d.valor === null ? '' : String(d.valor).replace('.', ',')} /></label>
            <label className="campo">
              <span>Temperatura</span>
              <select name="temperatura" defaultValue={d.temperatura ?? ''}>
                <option value="">Não definida</option><option value="FRIA">Fria</option><option value="MORNA">Morna</option><option value="QUENTE">Quente</option>
              </select>
            </label>
          </div>
          <label className="campo"><span>Etiquetas (separe por vírgula)</span><input name="etiquetas" defaultValue={d.etiquetas.join(', ')} /></label>
          {gestao && vendedores.length > 0 && aberta && (
            <label className="campo">
              <span>Vendedor</span>
              <select value={d.vendedorId ?? ''} onChange={(e) => e.target.value && acao(() => chamar('PATCH', `/oportunidades/${d.id}`, { vendedorId: e.target.value }))}>
                {!d.vendedorId && <option value="">Sem vendedor</option>}
                {!vendedores.some((v) => v.id === d.vendedorId) && d.vendedorId && <option value={d.vendedorId}>{d.vendedorNome}</option>}
                {vendedores.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
              </select>
            </label>
          )}
          <div className="acoes"><button className="botao" type="submit" data-teste="salvar-levantamento">Salvar levantamento</button></div>
        </form>

        {d.vendasDiretas.length > 0 && (
          <div className="secao">
            <h3>Vendas diretas</h3>
            {d.vendasDiretas.map((v) => (
              <p key={v.id} data-teste="venda-direta">
                <span className="mono">{emReais(v.valor)}</span> · {v.formaPagamento === 'PIX' ? 'Pix' : 'Dinheiro'} ·{' '}
                <Estado tipo={v.situacao === 'CONFIRMADA' ? 'bom' : v.situacao === 'CANCELADA' ? 'critico' : 'atencao'}>{NOME_SITUACAO_VENDA[v.situacao]}</Estado>
                {v.motivoRecusa ? <span className="apagado"> · {v.motivoRecusa}</span> : null}
              </p>
            ))}
          </div>
        )}

        <div className="secao">
          <h3>Notas da negociação</h3>
          <form onSubmit={adicionarNota} style={{ display: 'grid', gap: 8 }}>
            <label className="campo"><textarea name="texto" required maxLength={2000} placeholder="Só a equipe vê. As notas nunca vão para a IA." aria-label="Nova nota" /></label>
            <div className="acoes"><button className="botao" type="submit">Adicionar nota</button></div>
          </form>
          {d.notas.map((n) => (
            <div key={n.id}><p>{n.texto}</p><p className="apagado">{n.autor} · {emData(n.criadoEm)}</p></div>
          ))}
        </div>

        <div className="secao">
          <h3>Follow e lembretes</h3>
          {d.atividades.length === 0 && <p className="apagado">Nenhuma tarefa ainda.</p>}
          {d.atividades.map((a) => (
            <div key={a.id}>
              <p>
                <strong>{a.titulo}</strong>{' '}
                <Estado tipo={a.status === 'ABERTA' ? 'atencao' : 'neutro'}>
                  {a.status === 'ABERTA' ? `Até ${emData(a.prazo)}` : a.status === 'CANCELADA' ? 'Cancelada' : a.resultado === 'RESPONDEU' ? 'Respondeu' : a.resultado === 'SEM_RESPOSTA' ? 'Sem resposta' : 'Feita'}
                </Estado>
              </p>
              {a.mensagem && <p className="secundario">{a.mensagem}</p>}
            </div>
          ))}
          {aberta && (
            <form onSubmit={adicionarLembrete} className="linha-campos" style={{ alignItems: 'end' }}>
              <label className="campo"><span>Novo lembrete</span><input name="titulo" required minLength={2} maxLength={160} placeholder="Ligar, mandar foto…" /></label>
              <label className="campo"><span>Quando</span><input name="prazo" type="datetime-local" required /></label>
              <button className="botao" type="submit">Criar lembrete</button>
            </form>
          )}
        </div>

        <div className="secao">
          <h3>Histórico de etapas</h3>
          {d.historico.map((h, i) => (
            <p key={i} data-teste="linha-historico-etapa">
              <strong>{h.etapaNovaNome}</strong>
              <span className="apagado"> · entrou {emData(h.entrouEm)}{h.saiuEm ? ` · saiu ${emData(h.saiuEm)}` : ' · etapa atual'}{h.autor ? ` · ${h.autor}` : ''}</span>
            </p>
          ))}
        </div>
      </PainelLateral>

      {modal === 'link' && (
        <Modal titulo="Enviar link de compra" fechar={() => setModal(null)}>
          <form style={{ display: 'grid', gap: 14 }} onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            enviar(() => chamar('POST', `/oportunidades/${d.id}/link`, {
              interesse: String(f.get('interesse') ?? ''), tamanho: String(f.get('tamanho') ?? ''),
              quantidade: lerNumero(f.get('quantidade')) ?? 0, valor: lerNumero(f.get('valor')), cupom: String(f.get('cupom') ?? '').trim() || null,
            }), 'Link registrado: o lead foi para Negociação e o follow foi criado.');
          }}>
            <p className="secundario">
              O endereço do link será gerado pelo sistema quando a loja estiver ligada (etapa 2). Por enquanto, registre aqui o que você enviou.
            </p>
            <div className="linha-campos">
              <label className="campo"><span>Produto</span><input name="interesse" defaultValue={d.interesse ?? ''} required /></label>
              <label className="campo"><span>Tamanho</span><input name="tamanho" defaultValue={d.tamanho ?? ''} required /></label>
            </div>
            <div className="linha-campos">
              <label className="campo"><span>Quantidade</span><input name="quantidade" inputMode="numeric" defaultValue={d.quantidade ?? 1} required /></label>
              <label className="campo"><span>Valor (R$)</span><input name="valor" inputMode="decimal" defaultValue={d.valor === null ? '' : String(d.valor).replace('.', ',')} /></label>
              <label className="campo"><span>Cupom</span><input name="cupom" defaultValue={d.cupom ?? ''} maxLength={40} /></label>
            </div>
            {erro && <p className="erro" role="alert" data-teste="erro-formulario">{erro}</p>}
            <div className="acoes">
              <button type="button" className="botao fantasma" onClick={() => setModal(null)}>Cancelar</button>
              <button type="submit" className="botao principal-acao" data-teste="salvar-link">Registrar envio</button>
            </div>
          </form>
        </Modal>
      )}

      {modal === 'venda' && (
        <Modal titulo="Venda direta (Pix ou dinheiro)" fechar={() => setModal(null)}>
          <form style={{ display: 'grid', gap: 14 }} onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const corpo: Record<string, unknown> = {
              itens: itens.map((i) => ({
                descricao: i.descricao.trim(), quantidade: lerNumero(i.quantidade) ?? 0,
                precoTabela: lerNumero(i.precoTabela) ?? 0, preco: lerNumero(i.preco) ?? lerNumero(i.precoTabela) ?? 0,
              })),
              formaPagamento: f.get('formaPagamento'),
            };
            const cpf = String(f.get('cpf') ?? '').trim();
            if (cpf) corpo.cpf = cpf;
            enviar(() => chamar('POST', `/oportunidades/${d.id}/venda-direta`, corpo), 'Venda lançada. Ela vira venda quando um Sócio confirmar.');
          }}>
            <p className="secundario">Exceção para quem paga fora do site. A venda só é confirmada por um Sócio.</p>
            {itens.map((item, n) => (
              <div className="item-linha" key={n}>
                <label className="campo"><span>Peça</span><input value={item.descricao} onChange={(e) => mudarItem(n, 'descricao', e.target.value)} required data-teste="item-descricao" /></label>
                <label className="campo"><span>Qtd.</span><input value={item.quantidade} onChange={(e) => mudarItem(n, 'quantidade', e.target.value)} inputMode="numeric" required /></label>
                <label className="campo"><span>Tabela (R$)</span><input value={item.precoTabela} onChange={(e) => mudarItem(n, 'precoTabela', e.target.value)} inputMode="decimal" required data-teste="item-tabela" /></label>
                <label className="campo"><span>Cobrado (R$)</span><input value={item.preco} onChange={(e) => mudarItem(n, 'preco', e.target.value)} inputMode="decimal" required data-teste="item-preco" /></label>
              </div>
            ))}
            <div className="chips">
              <button type="button" className="botao pequeno" onClick={() => setItens((a) => [...a, ITEM_VAZIO])}>Adicionar peça</button>
              {itens.length > 1 && <button type="button" className="botao pequeno fantasma" onClick={() => setItens((a) => a.slice(0, -1))}>Tirar a última</button>}
              <span className="mono">Total: {emReais(totalVenda)}</span>
            </div>
            <div className="linha-campos">
              <label className="campo">
                <span>Forma de pagamento</span>
                <select name="formaPagamento" defaultValue="PIX"><option value="PIX">Pix</option><option value="DINHEIRO">Dinheiro</option></select>
              </label>
              {!d.cliente.temCpf && (
                <label className="campo"><span>CPF do cliente (obrigatório na venda)</span><input name="cpf" inputMode="numeric" required placeholder="000.000.000-00" autoComplete="off" /></label>
              )}
            </div>
            {erro && <p className="erro" role="alert" data-teste="erro-formulario">{erro}</p>}
            <div className="acoes">
              <button type="button" className="botao fantasma" onClick={() => setModal(null)}>Cancelar</button>
              <button type="submit" className="botao principal-acao" data-teste="salvar-venda">Lançar venda</button>
            </div>
          </form>
        </Modal>
      )}

      {modal === 'perdido' && (
        <Modal titulo="Marcar como perdido" fechar={() => setModal(null)}>
          <form style={{ display: 'grid', gap: 8 }} onSubmit={(e) => {
            e.preventDefault();
            const motivo = new FormData(e.currentTarget).get('motivo');
            if (!motivo) return setErro('Escolha o motivo da perda.');
            const escolhido = config.motivos.find((m) => m.id === motivo);
            enviar(() => chamar('POST', `/oportunidades/${d.id}/perder`, { motivo }), escolhido ? `${escolhido.nome}: ${NOME_DESTINO[escolhido.destino]}.` : undefined);
          }}>
            <p className="secundario">Escolha o motivo. O sistema decide o destino.</p>
            {config.motivos.map((m) => (
              <label className="opcao-motivo" key={m.id}>
                <input type="radio" name="motivo" value={m.id} data-teste={`motivo-${m.id}`} />
                <span>{m.nome}<small>{m.efeito} · {NOME_DESTINO[m.destino]}</small></span>
              </label>
            ))}
            {erro && <p className="erro" role="alert" data-teste="erro-formulario">{erro}</p>}
            <div className="acoes">
              <button type="button" className="botao fantasma" onClick={() => setModal(null)}>Cancelar</button>
              <button type="submit" className="botao principal-acao" data-teste="salvar-perdido">Confirmar perda</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
