'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Modal } from '@/components/interativos';
import { Estado } from '@/components/ui';
import { chamar, emData, emReais } from '@/lib/formato';

interface Numero { rotulo: string; valor: number | string | null; unidade?: string; meta?: number | null; ajuda?: string; pendente?: string; porPessoa?: Array<{ nome: string; quantidade: number }> }
interface Bloco {
  id: string; nome: string; minutos: number; numeros: Numero[];
  tarefas?: { total: number; itens?: Array<{ id: string; titulo: string; prazo: string; responsavel: string; atrasada: boolean }> };
}
export interface Daily {
  data: string; modo: 'GESTAO' | 'EQUIPE'; totalMinutos: number;
  reuniaoAberta: { id: string; modo: string; iniciadaEm: string; tratados: Array<{ bloco: string; item: string }> } | null;
  responsaveis: Array<{ id: string; nome: string }>;
  blocos: Bloco[];
}

function valorDe(n: Numero): string {
  if (n.pendente) return '—';
  if (n.valor === null) return '—';
  if (n.unidade === 'R$') return emReais(Number(n.valor));
  if (n.unidade === 'min') return `${n.valor} min`;
  return String(n.valor);
}

/** Roteiro do Daily: 7 blocos com os números do momento, "Decidido" (vira tarefa) e "Tratado"; no fim, a ata vai para Reuniões. */
export function DailyCliente({ inicial }: { inicial: Daily }) {
  const router = useRouter();
  const [dados, setDados] = useState(inicial);
  const [pulados, setPulados] = useState<string[]>([]);
  const [tratados, setTratados] = useState<Array<{ bloco: string; item: string }>>(inicial.reuniaoAberta?.tratados ?? []);
  const [decisoes, setDecisoes] = useState<Array<{ bloco: string; texto: string; responsavel: string }>>([]);
  const [decidindo, setDecidindo] = useState<Bloco | null>(null);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const reuniao = dados.reuniaoAberta;
  const amanha = new Date(Date.now() - 3 * 3_600_000 + 86_400_000).toISOString().slice(0, 10);

  async function comecar() {
    setErro('');
    try {
      await chamar('POST', '/reunioes', { modo: dados.modo });
      setDados(await chamar<Daily>('GET', `/daily?modo=${dados.modo}`));
      setAviso('Daily começado. Vá bloco a bloco; no fim, encerre para salvar a ata.');
    } catch (e) { setErro((e as Error).message); }
  }
  async function tratar(bloco: string, item: string) {
    if (!reuniao) return;
    try {
      await chamar('POST', `/reunioes/${reuniao.id}/tratados`, { bloco, item });
      setTratados((t) => [...t, { bloco, item }]);
    } catch (e) { setAviso((e as Error).message); }
  }
  async function decidir(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!reuniao || !decidindo) return;
    const f = new FormData(evento.currentTarget);
    const corpo = { bloco: decidindo.id, texto: String(f.get('texto') ?? ''), responsavelId: String(f.get('responsavelId') ?? ''), prazo: String(f.get('prazo') ?? '') };
    try {
      await chamar('POST', `/reunioes/${reuniao.id}/decisoes`, corpo);
      setDecisoes((d) => [...d, { bloco: corpo.bloco, texto: corpo.texto, responsavel: dados.responsaveis.find((r) => r.id === corpo.responsavelId)?.nome ?? '' }]);
      setDecidindo(null);
      setAviso('Decisão registrada: a tarefa já está com o responsável.');
    } catch (e) { setErro((e as Error).message); }
  }
  async function encerrar() {
    if (!reuniao) return;
    setErro('');
    const numeros = dados.blocos.filter((b) => !pulados.includes(b.id)).map((b) => ({
      bloco: b.id, linhas: b.numeros.filter((n) => !n.pendente).map((n) => ({ rotulo: n.rotulo.slice(0, 80), valor: valorDe(n).slice(0, 40) })),
    }));
    try {
      await chamar('POST', `/reunioes/${reuniao.id}/encerrar`, { pulados, numeros });
      router.push('/reunioes');
    } catch (e) { setErro((e as Error).message); }
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="cabecalho-linha">
        <div>
          <p className="apagado">Reunião da manhã · {dados.totalMinutos} minutos em {dados.blocos.length} blocos · ordem e tempo definidos em Metas</p>
          <div className="abas-seg" role="tablist" aria-label="Modo do Daily">
            {(['GESTAO', 'EQUIPE'] as const).map((m) => (
              <Link key={m} href={`/painel?sub=daily&modo=${m}`} role="tab" aria-selected={dados.modo === m} aria-current={dados.modo === m ? 'page' : undefined}
                className="aba-link" data-teste={`modo-${m}`}>{m === 'GESTAO' ? 'Gestão (por pessoa)' : 'Equipe (só totais)'}</Link>
            ))}
          </div>
        </div>
        {reuniao
          ? <button className="botao principal-acao" onClick={encerrar} data-teste="encerrar-daily">Encerrar e salvar a ata</button>
          : <button className="botao principal-acao" onClick={comecar} data-teste="comecar-daily">Começar o Daily</button>}
      </div>
      {reuniao && <p className="secundario" data-teste="daily-aberto">Daily em andamento desde {emData(reuniao.iniciadaEm)}.</p>}
      {erro && <p className="erro" role="alert">{erro}</p>}
      {aviso && <p className="secundario" role="status" data-teste="aviso-daily">{aviso}</p>}

      {dados.blocos.map((b, i) => {
        const pulado = pulados.includes(b.id);
        const foiTratado = (item: string) => tratados.some((t) => t.bloco === b.id && t.item === item);
        return (
          <section key={b.id} className="cartao bloco-daily" data-pulado={pulado} data-teste="bloco-daily" data-bloco={b.id}>
            <div className="cabecalho-linha">
              <h2>{i + 1}. {b.nome} <span className="apagado mono">{b.minutos} min</span></h2>
              <div className="acoes-grafico">
                {reuniao && !pulado && <button className="botao pequeno" onClick={() => { setErro(''); setDecidindo(b); }} data-teste="decidido">Decidido</button>}
                {reuniao && <button className="botao pequeno fantasma" onClick={() => setPulados((p) => (pulado ? p.filter((x) => x !== b.id) : [...p, b.id]))} data-teste="pular-bloco">{pulado ? 'Retomar' : 'Pular'}</button>}
              </div>
            </div>
            {!pulado && (
              <>
                <div className="numeros-bloco">
                  {b.numeros.map((n) => (
                    <div key={n.rotulo} className="numero-daily" data-teste="numero-daily">
                      <span className="apagado">{n.rotulo}</span>
                      <span className="valor mono">{valorDe(n)}</span>
                      {n.pendente && <span className="apagado">entra na {n.pendente}</span>}
                      {n.meta !== undefined && n.meta !== null && <span className="apagado">meta {emReais(n.meta)}</span>}
                      {n.ajuda && <span className="apagado">{n.ajuda}</span>}
                      {n.porPessoa?.map((p) => <span key={p.nome} className="apagado">{p.nome}: {p.quantidade}</span>)}
                      {reuniao && !n.pendente && (foiTratado(n.rotulo)
                        ? <Estado tipo="bom">Tratado</Estado>
                        : <button className="botao pequeno fantasma" onClick={() => tratar(b.id, n.rotulo)} data-teste="tratado">Tratado</button>)}
                    </div>
                  ))}
                </div>
                {b.tarefas && (
                  <div>
                    <strong>Atrasadas ou para hoje: {b.tarefas.total}</strong>
                    {b.tarefas.itens?.map((t) => (
                      <p key={t.id} className="secundario">{t.titulo} · {t.responsavel} {t.atrasada ? <Estado tipo="critico">Atrasada</Estado> : <Estado tipo="atencao">Hoje</Estado>}</p>
                    ))}
                  </div>
                )}
                {decisoes.filter((d) => d.bloco === b.id).map((d, k) => (
                  <p key={k} data-teste="decisao-registrada"><Estado tipo="bom">Decidido</Estado> {d.texto} · {d.responsavel}</p>
                ))}
              </>
            )}
          </section>
        );
      })}

      {decidindo && (
        <Modal titulo={`Decidido no bloco ${decidindo.nome}`} fechar={() => setDecidindo(null)}>
          <form onSubmit={decidir} style={{ display: 'grid', gap: 14 }}>
            <label className="campo"><span>O que foi decidido</span><input name="texto" required minLength={3} maxLength={300} data-teste="texto-decisao" /></label>
            <div className="linha-campos">
              <label className="campo"><span>Responsável</span>
                <select name="responsavelId" required defaultValue="" data-teste="responsavel-decisao">
                  <option value="" disabled>Escolha</option>
                  {dados.responsaveis.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
                </select>
              </label>
              <label className="campo"><span>Prazo</span><input name="prazo" type="date" defaultValue={amanha} required /></label>
            </div>
            <p className="apagado">Vira uma tarefa para o responsável, ligada a este Daily.</p>
            {erro && <p className="erro" role="alert" data-teste="erro-formulario">{erro}</p>}
            <div className="acoes">
              <button type="button" className="botao fantasma" onClick={() => setDecidindo(null)}>Cancelar</button>
              <button type="submit" className="botao principal-acao" data-teste="salvar-decisao">Criar a tarefa</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
