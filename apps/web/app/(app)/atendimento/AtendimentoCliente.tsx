'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal } from '@/components/interativos';
import { CartaoIndicador, Estado, TelaVazia } from '@/components/ui';
import { chamar, emData, emReais, emTelefone, emTempo, linkWhatsApp, valorCurto } from '@/lib/formato';
import { PainelLead } from './PainelLead';
import type { Agora, Config, Funil, Oportunidade, Tarefa } from './tipos';

interface Dados { oportunidades: Oportunidade[]; tarefas: Tarefa[]; agora: Agora; funil: Funil }

const NOME_TEMPERATURA: Record<string, string> = { FRIA: 'Fria', MORNA: 'Morna', QUENTE: 'Quente' };

export interface MinhaComissao { comissaoDoMes: number; teto: number | null; faltaParaOTeto: number | null }

export function AtendimentoCliente({ config, inicial, vendedores, gestao, periodoFunil, etapaInicial, comissao, children }: {
  config: Config;
  inicial: Dados;
  vendedores: Array<{ id: string; nome: string }>;
  /** Gestão (Sócios e Gerente) vê os leads de todos e pode escolher o vendedor. */
  gestao: boolean;
  periodoFunil: string;
  etapaInicial?: string;
  /** Só para quem recebe comissão (vendedores e Gerente). Cada um vê a própria. */
  comissao: MinhaComissao | null;
  children: React.ReactNode;
}) {
  const [dados, setDados] = useState(inicial);
  const [fase, setFase] = useState(() => config.etapas.find((e) => e.id === etapaInicial)?.fase ?? 'Tudo');
  const [vendedor, setVendedor] = useState('');
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);
  const [novo, setNovo] = useState(false);
  const [aviso, setAviso] = useState('');
  const [alvo, setAlvo] = useState<string | null>(null);
  const [erroNovo, setErroNovo] = useState('');
  const primeiraVez = useRef(true);

  const nomeEtapa = (id: string | null) => config.etapas.find((e) => e.id === id)?.nome ?? '';
  const fases = ['Tudo', ...new Set(config.etapas.map((e) => e.fase))];

  const avisar = useCallback((texto: string) => {
    setAviso(texto);
    window.setTimeout(() => setAviso((atual) => (atual === texto ? '' : atual)), 6000);
  }, []);

  const recarregar = useCallback(async () => {
    const q = new URLSearchParams();
    if (vendedor) q.set('vendedorId', vendedor);
    if (busca.trim()) q.set('busca', busca.trim());
    const [oportunidades, tarefas, agora, funil] = await Promise.all([
      chamar<Oportunidade[]>('GET', `/oportunidades?${q}`),
      chamar<Tarefa[]>('GET', '/atividades'),
      chamar<Agora>('GET', '/atendimento/agora'),
      chamar<Funil>('GET', `/atendimento/funil?${periodoFunil}${vendedor ? `&vendedorId=${vendedor}` : ''}`),
    ]);
    setDados({ oportunidades, tarefas, agora, funil });
    setVersao((v) => v + 1);
  }, [vendedor, busca, periodoFunil]);

  // Filtros de vendedor e busca valem para o quadro inteiro.
  useEffect(() => {
    if (primeiraVez.current) { primeiraVez.current = false; return; }
    const espera = window.setTimeout(() => { recarregar().catch((e) => avisar((e as Error).message)); }, 300);
    return () => window.clearTimeout(espera);
  }, [recarregar, avisar]);

  /** Executa uma ação, recarrega o quadro e mostra o erro da API quando ela recusa. */
  const acao = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    try {
      const r = await fn();
      await recarregar();
      return r;
    } catch (e) {
      avisar((e as Error).message);
      return undefined;
    }
  }, [recarregar, avisar]);

  const avancar = (o: Oportunidade) => acao(() => chamar('POST', `/oportunidades/${o.id}/avancar`, {}));

  function soltar(etapaId: string, evento: React.DragEvent) {
    evento.preventDefault();
    setAlvo(null);
    const o = dados.oportunidades.find((x) => x.id === evento.dataTransfer.getData('text/plain'));
    if (!o || o.etapa === etapaId) return;
    if (o.proximaEtapa !== etapaId) {
      return avisar(o.proximaEtapa
        ? `Não se pula etapa: de ${nomeEtapa(o.etapa)}, a próxima é ${nomeEtapa(o.proximaEtapa)}.`
        : `De ${nomeEtapa(o.etapa)} o card não é arrastado. Abra o lead para ver as ações.`);
    }
    avancar(o);
  }

  async function criarLead(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErroNovo('');
    const f = new FormData(evento.currentTarget);
    const corpo: Record<string, unknown> = {
      nome: String(f.get('nome') ?? ''), telefone: String(f.get('telefone') ?? ''), canal: f.get('canal'), origem: f.get('origem'),
      origemDetalhe: String(f.get('origemDetalhe') ?? '').trim() || null,
      interesse: String(f.get('interesse') ?? '').trim() || null,
      tamanho: String(f.get('tamanho') ?? '').trim() || null,
    };
    if (gestao && f.get('vendedorId')) corpo.vendedorId = f.get('vendedorId');
    try {
      const r = await chamar<{ oportunidade: Oportunidade; clienteJaExistia: boolean; comOutraPessoa: boolean }>('POST', '/oportunidades', corpo);
      setNovo(false);
      await recarregar();
      const partes = ['Lead cadastrado.'];
      if (r.clienteJaExistia) partes.push('Este telefone já era de um cliente: a oportunidade entrou no cadastro dele.');
      if (r.comOutraPessoa) partes.push(`Ele já é atendido por ${r.oportunidade.vendedorNome ?? 'outra pessoa'}, que ficou com o lead.`);
      avisar(partes.join(' '));
    } catch (e) {
      setErroNovo((e as Error).message);
    }
  }

  const adiar = (t: Tarefa) => acao(() => chamar('POST', `/atividades/${t.id}/adiar`, { prazo: new Date(Date.now() + 24 * 3_600_000).toISOString() }));
  const concluir = async (t: Tarefa, resultado: string) => {
    const r = await acao(() => chamar<{ efeito: string }>('POST', `/atividades/${t.id}/concluir`, { resultado }));
    if (r) avisar(r.efeito);
  };

  const fimDeHoje = new Date(); fimDeHoje.setHours(23, 59, 59, 999);
  const etapasVisiveis = config.etapas.filter((e) => fase === 'Tudo' || e.fase === fase);
  const conversao = (etapaId: string) => dados.funil.etapas.find((e) => e.etapa === etapaId)?.conversaoPct ?? null;

  return (
    <>
      <div className="cabecalho-linha">
        {children}
        <button className="botao principal-acao" onClick={() => { setErroNovo(''); setNovo(true); }} data-teste="novo-lead">Novo lead</button>
      </div>

      <div className="grade-indicadores">
        <CartaoIndicador metrica="leads_sem_resposta" rotulo="Leads sem resposta" valor={String(dados.agora.leads_sem_resposta)} variacao="" comparado="agora"
          faixa={dados.agora.leads_sem_resposta ? { tipo: 'atencao', rotulo: 'Responder' } : { tipo: 'bom', rotulo: 'Em dia' }} />
        <CartaoIndicador metrica="tarefas_vencendo" rotulo="Tarefas para hoje" valor={String(dados.agora.tarefas_vencendo)} variacao="" comparado="atrasadas ou de hoje"
          faixa={dados.agora.tarefas_vencendo ? { tipo: 'atencao', rotulo: 'Fazer hoje' } : { tipo: 'bom', rotulo: 'Em dia' }} />
        <CartaoIndicador metrica="leads_parados" rotulo="Leads parados"
          valor={dados.agora.leads_parados === null ? '—' : String(dados.agora.leads_parados)} variacao=""
          comparado={dados.agora.leads_parados === null ? 'defina o tempo máximo em Metas' : 'acima do tempo máximo'}
          faixa={dados.agora.leads_parados ? { tipo: 'critico', rotulo: 'Destravar' } : undefined} />
        {comissao && (
          <CartaoIndicador metrica="minha_comissao" rotulo="Minha comissão no mês" valor={emReais(comissao.comissaoDoMes)} variacao="" cor="var(--prolabore)"
            comparado={comissao.teto === null ? 'sem teto definido' : comissao.faltaParaOTeto === 0 ? 'teto do mês atingido' : `faltam ${emReais(comissao.faltaParaOTeto ?? 0)} para o teto`} />
        )}
      </div>

      <section className="cartao" data-teste="tarefas">
        <h2>Tarefas ({dados.tarefas.length})</h2>
        {dados.tarefas.length === 0 ? (
          <p className="apagado">Nenhuma tarefa aberta. Os follows aparecem aqui com a mensagem pronta.</p>
        ) : (
          <div className="fila">
            {dados.tarefas.slice(0, 8).map((t) => {
              const prazo = new Date(t.prazo);
              const situacao = prazo.getTime() < Date.now() ? 'critico' : prazo <= fimDeHoje ? 'atencao' : 'neutro';
              return (
                <div className="fila-item" key={t.id} data-teste="tarefa">
                  <div>
                    <strong>{t.titulo}</strong>{' '}
                    <Estado tipo={situacao}>{situacao === 'critico' ? 'Atrasada' : situacao === 'atencao' ? 'Hoje' : emData(t.prazo)}</Estado>
                    {t.mensagem && <p className="secundario">{t.mensagem}</p>}
                    {gestao && <p className="apagado">Com {t.responsavel}</p>}
                  </div>
                  <div className="fila-acoes">
                    {(t.tipo === 'FOLLOW' || t.tipo === 'SEQUENCIA') && t.clienteTelefone && (
                      <a className="botao pequeno" href={linkWhatsApp(t.clienteTelefone, t.mensagem)} target="_blank" rel="noreferrer">Abrir WhatsApp</a>
                    )}
                    {t.tipo === 'FOLLOW' ? (
                      <>
                        <button className="botao pequeno" onClick={() => concluir(t, 'RESPONDEU')} data-teste="tarefa-respondeu">Respondeu</button>
                        <button className="botao pequeno" onClick={() => concluir(t, 'SEM_RESPOSTA')} data-teste="tarefa-sem-resposta">Sem resposta</button>
                      </>
                    ) : (
                      <button className="botao pequeno" onClick={() => concluir(t, 'FEITA')}>Feito</button>
                    )}
                    <button className="botao pequeno fantasma" onClick={() => adiar(t)}>Adiar 1 dia</button>
                    {t.oportunidadeId && <button className="botao pequeno fantasma" onClick={() => setAberto(t.oportunidadeId)}>Abrir lead</button>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {dados.tarefas.length > 8 && <p className="apagado">Mais {dados.tarefas.length - 8} tarefas depois destas.</p>}
      </section>

      <div className="filtros">
        <div className="chips" role="group" aria-label="Fase">
          {fases.map((f) => (
            <button key={f} className="chip" aria-pressed={fase === f} onClick={() => setFase(f)}>{f}</button>
          ))}
        </div>
        {gestao && (
          <label className="campo">
            <select value={vendedor} onChange={(e) => setVendedor(e.target.value)} aria-label="Vendedor">
              <option value="">Todos os vendedores</option>
              {vendedores.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
            </select>
          </label>
        )}
        <label className="campo">
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou telefone" aria-label="Buscar" />
        </label>
      </div>

      {dados.oportunidades.length === 0 && !busca && !vendedor ? (
        <TelaVazia titulo="Nenhum atendimento ainda" texto="Cadastre o primeiro lead ou transforme um direct em lead. Ele entra na etapa Lead, com a origem registrada.">
          <button className="botao principal-acao" onClick={() => setNovo(true)}>Cadastrar o primeiro lead</button>
        </TelaVazia>
      ) : (
        <section className="cartao">
          <div className="quadro" data-teste="quadro">
            {etapasVisiveis.map((etapa) => {
              const cards = dados.oportunidades.filter((o) => o.etapa === etapa.id);
              const soma = cards.reduce((s, o) => s + (o.valor ?? 0), 0);
              const conv = conversao(etapa.id);
              return (
                <div className="coluna-quadro" key={etapa.id} data-teste={`coluna-${etapa.id}`} data-alvo={alvo === etapa.id}
                  data-destacada={etapaInicial === etapa.id}
                  onDragOver={(e) => { e.preventDefault(); setAlvo(etapa.id); }}
                  onDragLeave={() => setAlvo((a) => (a === etapa.id ? null : a))}
                  onDrop={(e) => soltar(etapa.id, e)}>
                  <span className="fase">{etapa.fase}</span>
                  <h3>{etapa.nome}<span className="apagado mono">{cards.length}</span></h3>
                  <div className="resumo">
                    <span className="mono">{soma ? emReais(soma) : '—'}</span>
                    {etapa.id !== 'VENDA' && <span title="Conversão para a etapa seguinte, no mês">conv. {conv === null ? '—' : `${conv.toLocaleString('pt-BR')}%`}</span>}
                  </div>
                  {cards.map((o) => (
                    <div className="card-quadro" key={o.id} role="button" tabIndex={0} draggable={o.situacao === 'ABERTA'} data-teste="card" data-nome={o.cliente.nome}
                      onDragStart={(e) => e.dataTransfer.setData('text/plain', o.id)}
                      onClick={() => setAberto(o.id)}
                      onKeyDown={(e) => { if (e.key === 'Enter') setAberto(o.id); }}>
                      <div className="linha"><strong>{o.cliente.nome}</strong>{o.parado && <Estado tipo="critico">Parado</Estado>}</div>
                      <span className="apagado mono">{emTelefone(o.cliente.telefone)}</span>
                      <div className="linha">
                        <span>{o.interesse ?? 'Sem produto ainda'}{o.tamanho ? ` · ${o.tamanho}` : ''}</span>
                        {o.valor !== null && <span className="mono">{valorCurto(o.valor)}</span>}
                      </div>
                      <div className="linha">
                        <span className="apagado">
                          {emTempo(o.horasNaEtapa)}{o.temperatura ? ` · ${NOME_TEMPERATURA[o.temperatura]}` : ''}{gestao && o.vendedorNome ? ` · ${o.vendedorNome}` : ''}
                        </span>
                        {o.situacao === 'ABERTA' && o.proximaEtapa && o.proximaEtapa !== 'VENDA' && (
                          <button className="botao pequeno" data-teste="card-avancar" onClick={(e) => { e.stopPropagation(); avancar(o); }}>Avançar</button>
                        )}
                      </div>
                      {(o.etiquetas.length > 0 || o.cliente.bloqueado) && (
                        <div className="chips">
                          {o.cliente.bloqueado && <span className="etiqueta">Não contatar</span>}
                          {o.etiquetas.map((e) => <span className="etiqueta" key={e}>{e}</span>)}
                        </div>
                      )}
                    </div>
                  ))}
                  {cards.length === 0 && <p className="apagado">Vazia</p>}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {aberto && (
        <PainelLead id={aberto} versao={versao} config={config} gestao={gestao} vendedores={vendedores}
          fechar={() => setAberto(null)} acao={acao} avisar={avisar} />
      )}

      {novo && (
        <Modal titulo="Novo lead" fechar={() => setNovo(false)}>
          <form onSubmit={criarLead} style={{ display: 'grid', gap: 14 }}>
            <div className="linha-campos">
              <label className="campo"><span>Nome</span><input name="nome" required minLength={2} /></label>
              <label className="campo"><span>Telefone com DDD</span><input name="telefone" required inputMode="tel" placeholder="(11) 90000-0000" /></label>
            </div>
            <div className="linha-campos">
              <label className="campo">
                <span>Por onde chegou</span>
                <select name="canal" defaultValue="WHATSAPP">{config.canais.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
              </label>
              <label className="campo">
                <span>Origem (obrigatória)</span>
                <select name="origem" defaultValue="" required>
                  <option value="" disabled>Escolha</option>
                  {config.origens.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
                </select>
              </label>
            </div>
            <label className="campo"><span>Detalhe da origem (anúncio, post, quem indicou)</span><input name="origemDetalhe" maxLength={160} /></label>
            <div className="linha-campos">
              <label className="campo"><span>Produto de interesse</span><input name="interesse" maxLength={160} /></label>
              <label className="campo"><span>Tamanho</span><input name="tamanho" maxLength={20} /></label>
            </div>
            {gestao && (
              <label className="campo">
                <span>Vendedor</span>
                <select name="vendedorId" defaultValue="">
                  <option value="">Rodízio (ou o vendedor que já atende o cliente)</option>
                  {vendedores.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
                </select>
              </label>
            )}
            {erroNovo && <p className="erro" role="alert" data-teste="erro-formulario">{erroNovo}</p>}
            <div className="acoes">
              <button type="button" className="botao fantasma" onClick={() => setNovo(false)}>Cancelar</button>
              <button type="submit" className="botao principal-acao" data-teste="salvar-lead">Cadastrar</button>
            </div>
          </form>
        </Modal>
      )}

      {aviso && <div className="aviso" role="status" data-teste="aviso">{aviso}</div>}
    </>
  );
}
