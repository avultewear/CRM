import { Cabecalho, Estado, SemAcesso, TelaVazia } from '@/components/ui';
import { emReais } from '@/lib/formato';
import { acesso, buscar } from '@/lib/sessao';
import { CopiarCupom } from './CopiarCupom';

interface Espaco {
  semCadastro?: true;
  nome: string;
  periodo: { inicio: string; fim: string };
  cupons: Array<{ codigo: string; descontoPct: number; validade: string | null; ativo: boolean }>;
  vendas: { quantidade: number; valor: number };
  comissao: { periodo: number; mes: number; teto: number | null; faltaParaOTeto: number | null };
  projecao: number | null;
  porDia: Array<{ dia: string; cupom: string; quantidade: number; valor: number }>;
  pagamentos: { aguardando: number; liberadas: number; pagas: number };
}

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const DIA = 86_400_000;

/** Atalhos de período, no horário de Brasília. */
function atalhos() {
  const agora = new Date(Date.now() - 3 * 3_600_000);
  const dia = (d: Date) => d.toISOString().slice(0, 10);
  const hoje = dia(agora);
  const inicioDoMes = `${hoje.slice(0, 7)}-01`;
  const fimDoMesPassado = new Date(new Date(`${inicioDoMes}T00:00:00Z`).getTime() - DIA);
  return [
    { nome: 'Hoje', inicio: hoje, fim: hoje },
    { nome: 'Últimos 7 dias', inicio: dia(new Date(agora.getTime() - 6 * DIA)), fim: hoje },
    { nome: 'Este mês', inicio: inicioDoMes, fim: hoje },
    { nome: 'Mês passado', inicio: `${dia(fimDoMesPassado).slice(0, 7)}-01`, fim: dia(fimDoMesPassado) },
  ];
}
const emDia = (iso: string) => iso.split('-').reverse().join('/');

/** O influenciador vê só os números dos próprios cupons. Nenhum dado de cliente chega aqui. */
export default async function MeuEspaco({ searchParams }: { searchParams: Promise<{ inicio?: string; fim?: string }> }) {
  const { pode } = await acesso(['influenciador.espaco']);
  if (!pode) return <SemAcesso />;
  const { inicio, fim } = await searchParams;
  const q = new URLSearchParams();
  if (inicio && DATA.test(inicio)) q.set('inicio', inicio);
  if (fim && DATA.test(fim)) q.set('fim', fim);
  const e = await buscar<Espaco>(`/meu-espaco?${q}`);

  const cabecalho = <Cabecalho nome="Meu espaço" pergunta="Quanto os meus cupons venderam e quanto eu vou receber?" paraQuem="Influenciador" />;
  if (e.semCadastro) {
    return (
      <>
        {cabecalho}
        <TelaVazia titulo="Seu cadastro ainda não foi ligado a este acesso" texto="Fale com a Avulte Wear: assim que o cadastro for ligado e o cupom criado, as suas vendas aparecem aqui." />
      </>
    );
  }

  return (
    <>
      {cabecalho}

      <form className="filtros" method="get" data-teste="periodo">
        <label className="campo"><span>De</span><input type="date" name="inicio" defaultValue={e.periodo.inicio} /></label>
        <label className="campo"><span>Até</span><input type="date" name="fim" defaultValue={e.periodo.fim} /></label>
        <button className="botao" type="submit" style={{ alignSelf: 'end' }}>Ver período</button>
      </form>
      <div className="chips" data-teste="atalhos-periodo">
        {atalhos().map((a) => (
          <a key={a.nome} className="chip" style={{ display: 'inline-flex', alignItems: 'center' }} href={`/meu-espaco?inicio=${a.inicio}&fim=${a.fim}`}
            aria-current={a.inicio === e.periodo.inicio && a.fim === e.periodo.fim ? 'true' : undefined}>{a.nome}</a>
        ))}
      </div>

      <div className="grade-indicadores">
        <div className="cartao indicador">
          <span className="rotulo">Vendas com meus cupons</span>
          <span className="valor mono" data-teste="espaco-vendas">{e.vendas.quantidade}</span>
          <span className="variacao apagado">{e.vendas.quantidade ? emReais(e.vendas.valor) : 'nenhuma venda no período'}</span>
        </div>
        <div className="cartao indicador">
          <span className="rotulo"><i className="ponto" style={{ background: 'var(--prolabore)' }} />Minha comissão no período</span>
          <span className="valor mono" data-teste="espaco-comissao">{emReais(e.comissao.periodo)}</span>
          <span className="variacao apagado">de {emDia(e.periodo.inicio)} a {emDia(e.periodo.fim)}</span>
        </div>
        <div className="cartao indicador">
          <span className="rotulo">Comissão neste mês</span>
          <span className="valor mono">{emReais(e.comissao.mes)}</span>
          <span className="variacao apagado" data-teste="espaco-teto">
            {e.comissao.teto === null ? 'sem teto definido' : e.comissao.faltaParaOTeto === 0 ? `teto de ${emReais(e.comissao.teto)} atingido` : `faltam ${emReais(e.comissao.faltaParaOTeto ?? 0)} para o teto de ${emReais(e.comissao.teto)}`}
          </span>
        </div>
        <div className="cartao indicador">
          <span className="rotulo">Projeção</span>
          <span className="valor mono">{e.projecao === null ? '—' : emReais(e.projecao)}</span>
          <span className="variacao apagado">{e.projecao === null ? 'aparece depois da primeira venda' : 'no ritmo atual até o fim do período, já com o teto'}</span>
        </div>
      </div>

      <section className="cartao">
        <h2>Meus cupons</h2>
        {e.cupons.length === 0 && <p className="apagado">Nenhum cupom criado ainda.</p>}
        <div className="fila">
          {e.cupons.map((c) => (
            <div className="fila-item" key={c.codigo} data-teste="meu-cupom">
              <div>
                <strong className="mono">{c.codigo}</strong> · {c.descontoPct.toLocaleString('pt-BR')}% de desconto para quem compra
                <span className="apagado"> · {c.validade ? `vale até ${emDia(c.validade)}` : 'sem validade'}</span>
              </div>
              <div className="fila-acoes">
                <Estado tipo={c.ativo ? 'bom' : 'neutro'}>{c.ativo ? 'Ativo' : 'Desativado'}</Estado>
                {c.ativo && <CopiarCupom codigo={c.codigo} />}
              </div>
            </div>
          ))}
        </div>
        <p className="apagado">O link rastreado da loja entra junto com o site (etapa 2). Por enquanto, divulgue o código.</p>
      </section>

      <section className="cartao" data-teste="vendas-por-dia">
        <h2>Vendas por dia</h2>
        {e.porDia.length === 0 ? <p className="apagado">Nenhuma venda com os seus cupons neste período.</p> : (
          <div className="rolagem">
            <table className="tabela">
              <thead><tr><th>Dia</th><th>Cupom</th><th>Vendas</th><th>Valor</th></tr></thead>
              <tbody>
                {e.porDia.map((l) => (
                  <tr key={`${l.dia}${l.cupom}`}><td>{emDia(l.dia)}</td><td className="mono">{l.cupom}</td><td className="mono">{l.quantidade}</td><td className="mono">{emReais(l.valor)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="cartao" data-teste="pagamentos">
        <h2>Pagamentos</h2>
        <div className="grade-indicadores">
          <div className="indicador"><span className="rotulo">Aguardando o prazo de troca</span><span className="valor mono">{emReais(e.pagamentos.aguardando)}</span></div>
          <div className="indicador"><span className="rotulo">Liberada, a receber</span><span className="valor mono">{emReais(e.pagamentos.liberadas)}</span></div>
          <div className="indicador"><span className="rotulo">Já paga</span><span className="valor mono">{emReais(e.pagamentos.pagas)}</span></div>
        </div>
        <p className="apagado">A comissão é liberada depois do prazo de troca do pedido. Se a compra for devolvida, a comissão dela é cancelada.</p>
      </section>
    </>
  );
}
