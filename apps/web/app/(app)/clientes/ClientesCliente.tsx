'use client';

import { useState } from 'react';
import { Modal, PainelLateral } from '@/components/interativos';
import { CartaoIndicador, Estado, TelaVazia } from '@/components/ui';
import { chamar, emData, emReais, emTelefone, lerNumero } from '@/lib/formato';

type Segmento = 'NOVO' | 'RECORRENTE' | 'VIP' | 'EM_RISCO' | 'INATIVO';
interface Linha {
  id: string; nome: string; telefone: string; segmento: Segmento; compras: number; total: number; ultimaCompra: string;
  etiquetas: string[]; vendedor: string | null; aceiteMensagens: boolean; bloqueado: boolean;
}
interface TrocaAberta { id: string; clienteId: string; clienteNome: string; item: string; quantidade: number; motivo: string; situacao: 'SOLICITADA' | 'PECA_RECEBIDA'; estadoDaPeca: string | null; criadoEm: string }
export interface Dados {
  limites: { emRisco: boolean; inativo: boolean; vip: boolean };
  agora: { clientes_ativos: number; taxa_recompra: number | null; clientes_em_risco: number | null; tempo_entre_compras: number | null; ltv: number | null };
  clientes: Linha[];
  trocasAbertas: TrocaAberta[];
}
interface Ficha {
  id: string; nome: string; telefone: string; email: string | null; cpf: string | null; bloqueado: boolean; aceiteMensagens: boolean;
  etiquetas: string[]; codigoIndicacao: string | null; segmento: Segmento | null; compras: number; total: number;
  vendas: Array<{ id: string; itens: Array<{ descricao: string; quantidade: number }>; valor: number; formaPagamento: string; data: string; devolvida: boolean; cupom: string | null; indicadoPor: string | null }>;
  trocas: Array<{ id: string; item: string; quantidade: number; motivo: string; situacao: string; resolucao: string | null; criadoEm: string }>;
  atendimentos: Array<{ id: string; etapa: string; situacao: string; canal: string; interesse: string | null; criadoEm: string }>;
  indicacoes: Array<{ nome: string; valor: number; data: string }>;
  brindes: Array<{ id: string; descricao: string; motivo: string; entregueEm: string; custo?: number | null }>;
}

const SEGMENTO: Record<Segmento, { nome: string; tipo: 'bom' | 'atencao' | 'critico' | 'neutro' }> = {
  NOVO: { nome: 'Novo', tipo: 'neutro' }, RECORRENTE: { nome: 'Recorrente', tipo: 'bom' }, VIP: { nome: 'VIP', tipo: 'bom' },
  EM_RISCO: { nome: 'Em risco', tipo: 'atencao' }, INATIVO: { nome: 'Inativo', tipo: 'critico' },
};
const ETIQUETA: Record<string, string> = { CORRE: 'Corre', TREINA: 'Treina', GRUPO: 'Grupo ou assessoria', DIVULGADOR: 'Divulgador' };
const MOTIVO: Record<string, string> = { TAMANHO: 'Tamanho', DEFEITO: 'Defeito', NAO_GOSTOU: 'Não gostou', ARREPENDIMENTO: 'Arrependimento' };
const SITUACAO_TROCA: Record<string, string> = { SOLICITADA: 'Aguardando a peça', PECA_RECEBIDA: 'Peça recebida', RESOLVIDA: 'Resolvida' };
const RESOLUCAO: Record<string, string> = { NOVA_PECA: 'nova peça enviada', VALOR_DEVOLVIDO: 'valor devolvido' };
const ETAPA: Record<string, string> = { LEAD: 'Lead', ABORDADO: 'Abordado', LEVANTAMENTO: 'Levantamento', NEGOCIACAO: 'Negociação', VENDA: 'Venda', RECUPERACAO: 'Recuperação' };
const emDia = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
const diaSimples = (iso: string) => iso.split('-').reverse().join('/');
const hoje = () => new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);

type Aberto = { tipo: 'troca'; venda: Ficha['vendas'][number] } | { tipo: 'brinde' } | { tipo: 'receber' | 'resolver'; troca: TrocaAberta };

export function ClientesCliente({ inicial, gestao, socio, children }: { inicial: Dados; gestao: boolean; socio: boolean; children: React.ReactNode }) {
  const [dados, setDados] = useState(inicial);
  const [filtro, setFiltro] = useState<string>('TODOS');
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [aberto, setAberto] = useState<Aberto | null>(null);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');

  async function abrirFicha(id: string) {
    setErro('');
    try { setFicha(await chamar<Ficha>('GET', `/clientes/${id}/ficha`)); } catch (e) { setAviso((e as Error).message); }
  }
  async function executar(fn: () => Promise<unknown>, mensagem: string) {
    setErro('');
    try {
      await fn();
      setDados(await chamar<Dados>('GET', '/clientes'));
      if (ficha) setFicha(await chamar<Ficha>('GET', `/clientes/${ficha.id}/ficha`));
      setAberto(null);
      setAviso(mensagem);
    } catch (e) {
      setErro((e as Error).message);
    }
  }
  function alternarEtiqueta(id: string) {
    if (!ficha) return;
    const etiquetas = ficha.etiquetas.includes(id) ? ficha.etiquetas.filter((e) => e !== id) : [...ficha.etiquetas, id];
    executar(() => chamar('PUT', `/clientes/${ficha.id}/etiquetas`, { etiquetas }), 'Etiquetas atualizadas.');
  }
  const mudarAceite = (aceite: boolean) => ficha && executar(() => chamar('PATCH', `/clientes/${ficha.id}`, { aceiteMensagens: aceite }),
    aceite ? 'Aceite registrado: o cliente entra nas sequências.' : 'Aceite retirado: o cliente sai das sequências.');

  const { agora, clientes, trocasAbertas } = dados;
  const chips: Array<[string, string, number]> = [
    ['TODOS', 'Todos', clientes.length],
    ...(Object.keys(SEGMENTO) as Segmento[]).map((s): [string, string, number] => [s, SEGMENTO[s].nome, clientes.filter((c) => c.segmento === s).length]),
    ...Object.keys(ETIQUETA).map((e): [string, string, number] => [`E:${e}`, ETIQUETA[e], clientes.filter((c) => c.etiquetas.includes(e)).length]),
  ];
  const visiveis = clientes.filter((c) => filtro === 'TODOS' || c.segmento === filtro || (filtro.startsWith('E:') && c.etiquetas.includes(filtro.slice(2))));
  const semLimites = [!dados.limites.emRisco && 'Em risco', !dados.limites.inativo && 'Inativo', !dados.limites.vip && 'VIP'].filter(Boolean);

  return (
    <>
      {children}
      {clientes.length === 0 && trocasAbertas.length === 0 ? (
        <TelaVazia titulo="Os clientes aparecem aqui depois da primeira compra" texto="Quando um Sócio confirma a primeira venda, o cliente entra nesta lista já com o segmento, o código de indicação e o pós-compra como tarefa." />
      ) : (
        <>
          <div className="grade-indicadores" data-teste="agora-clientes">
            <CartaoIndicador metrica="clientes_ativos" rotulo="Clientes ativos" valor={String(agora.clientes_ativos)} variacao="" comparado="já compraram e não estão inativos" />
            <CartaoIndicador metrica="taxa_recompra" rotulo="Taxa de recompra" valor={agora.taxa_recompra === null ? '—' : `${agora.taxa_recompra.toLocaleString('pt-BR')}%`} variacao="" comparado="compraram mais de uma vez" />
            <CartaoIndicador metrica="clientes_em_risco" rotulo="Clientes em risco" valor={agora.clientes_em_risco === null ? '—' : String(agora.clientes_em_risco)} variacao=""
              comparado={agora.clientes_em_risco === null ? 'defina o limite em Metas' : 'sem comprar além do limite'}
              faixa={agora.clientes_em_risco ? { tipo: 'atencao', rotulo: 'Chamar de volta' } : undefined} />
            <CartaoIndicador metrica="tempo_entre_compras" rotulo="Tempo entre compras" valor={agora.tempo_entre_compras === null ? '—' : `${agora.tempo_entre_compras.toLocaleString('pt-BR')} dias`} variacao="" comparado="mediana" />
            <CartaoIndicador metrica="ltv" rotulo="Valor do cliente (LTV)" valor={agora.ltv === null ? '—' : emReais(agora.ltv)} variacao="" comparado="média por cliente" />
          </div>
          {semLimites.length > 0 && (
            <p className="secundario" data-teste="sem-limites">Sem limite definido em Metas, ainda não aparecem os segmentos: {semLimites.join(', ')}.</p>
          )}

          {trocasAbertas.length > 0 && (
            <section className="cartao" data-teste="trocas-abertas">
              <h2>Trocas e devoluções em andamento ({trocasAbertas.length})</h2>
              <div className="fila">
                {trocasAbertas.map((t) => (
                  <div className="fila-item" key={t.id} data-teste="troca-aberta">
                    <div>
                      <strong>{t.clienteNome}</strong> · {t.quantidade}× {t.item} <span className="etiqueta">{MOTIVO[t.motivo]}</span>{' '}
                      <Estado tipo={t.situacao === 'SOLICITADA' ? 'atencao' : 'neutro'}>{SITUACAO_TROCA[t.situacao]}</Estado>
                      <p className="apagado">Pedida em {emDia(t.criadoEm)}{t.estadoDaPeca ? ` · chegou ${t.estadoDaPeca === 'BOM' ? 'em bom estado' : 'com defeito'}` : ''}</p>
                    </div>
                    <div className="fila-acoes">
                      {gestao && t.situacao === 'SOLICITADA' && <button className="botao pequeno" onClick={() => { setErro(''); setAberto({ tipo: 'receber', troca: t }); }} data-teste="receber-troca">Peça recebida</button>}
                      {gestao && t.situacao === 'PECA_RECEBIDA' && <button className="botao pequeno principal-acao" onClick={() => { setErro(''); setAberto({ tipo: 'resolver', troca: t }); }} data-teste="resolver-troca">Resolver</button>}
                      <button className="botao pequeno fantasma" onClick={() => abrirFicha(t.clienteId)}>Abrir cliente</button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="chips" data-teste="filtros-clientes">
            {chips.filter(([id, , n]) => id === 'TODOS' || n > 0 || id === filtro).map(([id, nome, n]) => (
              <button key={id} className="chip" aria-pressed={filtro === id} onClick={() => setFiltro(id)} data-filtro={id}>{nome} <span className="mono">{n}</span></button>
            ))}
          </div>

          <section className="cartao">
            <div className="rolagem">
              <table className="tabela" data-teste="lista-clientes">
                <thead><tr><th>Cliente</th><th>Segmento</th><th>Compras</th><th>Total gasto</th><th>Última compra</th><th>Etiquetas</th>{gestao && <th>Vendedor</th>}</tr></thead>
                <tbody>
                  {visiveis.map((c) => (
                    <tr key={c.id} data-teste="cliente" data-nome={c.nome} onClick={() => abrirFicha(c.id)} style={{ cursor: 'pointer' }}>
                      <td><strong>{c.nome}</strong>{c.bloqueado && <> <Estado tipo="critico">Não contatar</Estado></>}</td>
                      <td><Estado tipo={SEGMENTO[c.segmento].tipo}>{SEGMENTO[c.segmento].nome}</Estado></td>
                      <td className="mono">{c.compras}</td>
                      <td className="mono">{emReais(c.total)}</td>
                      <td>{emDia(c.ultimaCompra)}</td>
                      <td>{c.etiquetas.map((e) => <span className="etiqueta" key={e}>{ETIQUETA[e]}</span>)}</td>
                      {gestao && <td>{c.vendedor ?? '—'}</td>}
                    </tr>
                  ))}
                  {visiveis.length === 0 && <tr><td colSpan={gestao ? 7 : 6} className="apagado">Nenhum cliente neste filtro.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
      {aviso && <p className="secundario" role="status" data-teste="aviso-clientes">{aviso}</p>}

      {ficha && (
        <PainelLateral titulo={ficha.nome} fechar={() => setFicha(null)} teste="ficha-cliente">
          <p>
            {ficha.segmento && <Estado tipo={SEGMENTO[ficha.segmento].tipo}>{SEGMENTO[ficha.segmento].nome}</Estado>}{' '}
            <span className="mono">{ficha.compras}</span> {ficha.compras === 1 ? 'compra' : 'compras'} · <span className="mono">{emReais(ficha.total)}</span>
          </p>
          <div className="ficha-dados">
            <span>Telefone</span><span className="mono">{emTelefone(ficha.telefone)}</span>
            <span>CPF</span><span className="mono" data-teste="cpf-mascarado">{ficha.cpf ?? '—'}</span>
            <span>Código de indicação</span><span className="mono" data-teste="codigo-indicacao">{ficha.codigoIndicacao ?? 'nasce na primeira compra'}</span>
          </div>

          <div className="secao">
            <h3>Mensagens</h3>
            {ficha.bloqueado ? <p><Estado tipo="critico">Não contatar</Estado> Este cliente pediu para não receber mensagens.</p> : (
              <label className="marcar">
                <input type="checkbox" checked={ficha.aceiteMensagens} onChange={(e) => mudarAceite(e.target.checked)} data-teste="aceite-mensagens" />
                Aceitou receber mensagens (sem o aceite, não entra em nenhuma sequência)
              </label>
            )}
          </div>

          <div className="secao">
            <h3>Comunidade</h3>
            <div className="chips">
              {Object.keys(ETIQUETA).map((e) => (
                <button key={e} className="chip" aria-pressed={ficha.etiquetas.includes(e)} onClick={() => alternarEtiqueta(e)} data-teste={`etiqueta-${e}`}>{ETIQUETA[e]}</button>
              ))}
            </div>
          </div>

          <div className="secao" data-teste="compras-cliente">
            <h3>Compras</h3>
            {ficha.vendas.length === 0 && <p className="apagado">Nenhuma compra confirmada.</p>}
            {ficha.vendas.map((v) => (
              <div className="compra" key={v.id}>
                <div>
                  <strong>{emDia(v.data)}</strong> · <span className="mono">{emReais(v.valor)}</span> {v.devolvida && <Estado tipo="critico">Valor devolvido</Estado>}
                  <p className="secundario">{v.itens.map((i) => `${i.quantidade}× ${i.descricao}`).join(', ')}</p>
                  <p className="apagado">Venda direta ({v.formaPagamento === 'PIX' ? 'Pix' : 'dinheiro'}){v.cupom ? ` · cupom ${v.cupom}` : ''}{v.indicadoPor ? ` · indicação de ${v.indicadoPor}` : ''}</p>
                </div>
                {!v.devolvida && <button className="botao pequeno" onClick={() => { setErro(''); setAberto({ tipo: 'troca', venda: v }); }} data-teste="abrir-troca">Troca ou devolução</button>}
              </div>
            ))}
          </div>

          {ficha.trocas.length > 0 && (
            <div className="secao" data-teste="trocas-cliente">
              <h3>Trocas e devoluções</h3>
              {ficha.trocas.map((t) => (
                <p key={t.id}>{t.quantidade}× {t.item} <span className="etiqueta">{MOTIVO[t.motivo]}</span> · {SITUACAO_TROCA[t.situacao]}{t.resolucao ? `: ${RESOLUCAO[t.resolucao]}` : ''} <span className="apagado">· {emDia(t.criadoEm)}</span></p>
              ))}
            </div>
          )}

          <div className="secao" data-teste="indicacoes-cliente">
            <h3>Indicações</h3>
            {ficha.indicacoes.length === 0 ? <p className="apagado">Ninguém comprou com o código deste cliente ainda.</p>
              : ficha.indicacoes.map((i, n) => <p key={n}>{i.nome} comprou em {emDia(i.data)} · <span className="mono">{emReais(i.valor)}</span></p>)}
          </div>

          <div className="secao" data-teste="brindes-cliente">
            <div className="cabecalho-linha">
              <h3>Brindes</h3>
              {gestao && <button className="botao pequeno" onClick={() => { setErro(''); setAberto({ tipo: 'brinde' }); }} data-teste="novo-brinde">Registrar brinde</button>}
            </div>
            {ficha.brindes.length === 0 ? <p className="apagado">Nenhum brinde registrado.</p>
              : ficha.brindes.map((b) => <p key={b.id}>{b.descricao} · {b.motivo} <span className="apagado">· {diaSimples(b.entregueEm)}</span>{socio && <span className="mono apagado"> · {b.custo == null ? 'sem custo informado' : emReais(b.custo)}</span>}</p>)}
          </div>

          <div className="secao">
            <h3>Atendimentos</h3>
            {ficha.atendimentos.map((a) => (
              <p key={a.id}>{emDia(a.criadoEm)} · {ETAPA[a.etapa] ?? a.etapa}{a.situacao === 'ABERTA' ? ' (em andamento)' : ''}{a.interesse ? ` · ${a.interesse}` : ''}</p>
            ))}
          </div>
          <p className="apagado">Avaliações com foto entram quando a loja estiver ligada (etapa 2).</p>
        </PainelLateral>
      )}

      {aberto?.tipo === 'troca' && ficha && (
        <Modal titulo={`Troca ou devolução de ${ficha.nome}`} fechar={() => setAberto(null)}>
          <form style={{ display: 'grid', gap: 14 }} onSubmit={(ev) => {
            ev.preventDefault();
            const f = new FormData(ev.currentTarget);
            executar(() => chamar('POST', `/vendas-diretas/${aberto.venda.id}/trocas`, {
              item: String(f.get('item') ?? ''), quantidade: lerNumero(f.get('quantidade')) ?? 1, motivo: String(f.get('motivo') ?? ''),
              ...(String(f.get('observacao') ?? '').trim() ? { observacao: String(f.get('observacao')).trim() } : {}),
            }), 'Troca aberta: aguardando a peça voltar.');
          }}>
            <div className="linha-campos">
              <label className="campo"><span>Peça que volta</span>
                <select name="item" required>{aberto.venda.itens.map((i) => <option key={i.descricao} value={i.descricao}>{i.descricao}</option>)}</select></label>
              <label className="campo"><span>Quantidade</span><input name="quantidade" inputMode="numeric" defaultValue="1" required /></label>
            </div>
            <fieldset className="campo"><legend>Motivo</legend>
              {Object.keys(MOTIVO).map((m) => <label className="marcar" key={m}><input type="radio" name="motivo" value={m} required data-teste={`motivo-${m}`} /> {MOTIVO[m]}</label>)}
            </fieldset>
            <label className="campo"><span>Observação (opcional)</span><input name="observacao" maxLength={500} /></label>
            <p className="apagado">A troca segue: solicitada → peça recebida → resolvida (nova peça enviada ou valor devolvido).</p>
            {erro && <p className="erro" role="alert" data-teste="erro-formulario">{erro}</p>}
            <div className="acoes">
              <button type="button" className="botao fantasma" onClick={() => setAberto(null)}>Cancelar</button>
              <button type="submit" className="botao principal-acao" data-teste="salvar-troca">Abrir troca</button>
            </div>
          </form>
        </Modal>
      )}

      {aberto?.tipo === 'receber' && (
        <Modal titulo={`A peça de ${aberto.troca.clienteNome} chegou`} fechar={() => setAberto(null)}>
          <p>{aberto.troca.quantidade}× {aberto.troca.item}. Em que estado ela chegou?</p>
          <p className="apagado">Em bom estado, volta ao estoque; com defeito, sai como perda. A baixa no estoque entra com a etapa 2.</p>
          {erro && <p className="erro" role="alert" data-teste="erro-formulario">{erro}</p>}
          <div className="acoes">
            <button className="botao" onClick={() => executar(() => chamar('POST', `/trocas/${aberto.troca.id}/receber`, { estado: 'DEFEITO' }), 'Peça recebida com defeito.')} data-teste="estado-defeito">Com defeito</button>
            <button className="botao principal-acao" onClick={() => executar(() => chamar('POST', `/trocas/${aberto.troca.id}/receber`, { estado: 'BOM' }), 'Peça recebida em bom estado.')} data-teste="estado-bom">Em bom estado</button>
          </div>
        </Modal>
      )}

      {aberto?.tipo === 'resolver' && (
        <Modal titulo={`Resolver a troca de ${aberto.troca.clienteNome}`} fechar={() => setAberto(null)}>
          <p>{aberto.troca.quantidade}× {aberto.troca.item} · motivo: {MOTIVO[aberto.troca.motivo]}</p>
          <p className="apagado">{socio
            ? 'Devolver o valor cancela o pró-labore e as comissões desta venda que ainda não foram pagos, e a venda deixa de contar como compra do cliente.'
            : 'A devolução do valor é confirmada por um Sócio, porque cancela o pró-labore e as comissões da venda.'}</p>
          {erro && <p className="erro" role="alert" data-teste="erro-formulario">{erro}</p>}
          <div className="acoes">
            {socio && <button className="botao" onClick={() => executar(() => chamar('POST', `/trocas/${aberto.troca.id}/resolver`, { resolucao: 'VALOR_DEVOLVIDO' }), 'Valor devolvido: pró-labore e comissões da venda cancelados.')} data-teste="resolver-valor">Valor devolvido</button>}
            <button className="botao principal-acao" onClick={() => executar(() => chamar('POST', `/trocas/${aberto.troca.id}/resolver`, { resolucao: 'NOVA_PECA' }), 'Troca resolvida: nova peça enviada.')} data-teste="resolver-peca">Nova peça enviada</button>
          </div>
        </Modal>
      )}

      {aberto?.tipo === 'brinde' && ficha && (
        <Modal titulo={`Brinde para ${ficha.nome}`} fechar={() => setAberto(null)}>
          <form style={{ display: 'grid', gap: 14 }} onSubmit={(ev) => {
            ev.preventDefault();
            const f = new FormData(ev.currentTarget);
            const corpo: Record<string, unknown> = { descricao: String(f.get('descricao') ?? ''), motivo: String(f.get('motivo') ?? ''), entregueEm: String(f.get('entregueEm') ?? '') };
            if (socio && lerNumero(f.get('custo')) !== null) corpo.custo = lerNumero(f.get('custo'));
            executar(() => chamar('POST', `/clientes/${ficha.id}/brindes`, corpo), 'Brinde registrado.');
          }}>
            <label className="campo"><span>O que foi dado</span><input name="descricao" required minLength={2} maxLength={160} /></label>
            <label className="campo"><span>Por quê</span><input name="motivo" required minLength={2} maxLength={200} placeholder="Cliente fiel, indicou amigos, evento…" /></label>
            <div className="linha-campos">
              <label className="campo"><span>Data</span><input name="entregueEm" type="date" defaultValue={hoje()} required /></label>
              {socio && <label className="campo"><span>Custo (R$)</span><input name="custo" inputMode="decimal" /></label>}
            </div>
            <p className="apagado">A saída do estoque como "brinde" entra com a etapa 2.</p>
            {erro && <p className="erro" role="alert" data-teste="erro-formulario">{erro}</p>}
            <div className="acoes">
              <button type="button" className="botao fantasma" onClick={() => setAberto(null)}>Cancelar</button>
              <button type="submit" className="botao principal-acao" data-teste="salvar-brinde">Registrar</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
