import { Cabecalho, SemAcesso, TelaVazia } from '@/components/ui';
import { emData, valorSolto } from '@/lib/formato';
import { acesso, buscar } from '@/lib/sessao';

interface Linha { id: string; entidade: string; entidadeId: string; acao: string; campo: string | null; de: unknown; para: unknown; criadoEm: string; autor: string }

export default async function Auditoria() {
  const { pode } = await acesso(['auditoria.ver']);
  if (!pode) return <SemAcesso />;
  const linhas = await buscar<Linha[]>('/auditoria?limite=100');
  return (
    <>
      <Cabecalho nome="Auditoria" pergunta="Quem mudou o quê, de qual valor para qual, e quando?" paraQuem="Sócios" />
      {linhas.length === 0 ? (
        <TelaVazia titulo="Nenhuma mudança registrada" texto="Cada cadastro e cada alteração aparecem aqui. Nada é apagado." />
      ) : (
        <div className="rolagem">
          <table className="tabela">
            <thead><tr><th>Quando</th><th>Quem</th><th>O quê</th><th>Ação</th><th>Campo</th><th>De</th><th>Para</th></tr></thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.id}>
                  <td className="mono">{emData(l.criadoEm)}</td>
                  <td>{l.autor}</td>
                  <td>{l.entidade} <span className="apagado mono">{l.entidade === 'parametro' ? l.entidadeId : l.entidadeId.slice(0, 8)}</span></td>
                  <td>{l.acao}</td>
                  <td>{l.campo ?? '—'}</td>
                  <td className="mono">{valorSolto(l.de)}</td>
                  <td className="mono">{valorSolto(l.para)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="apagado">Mostrando as 100 mudanças mais recentes. A auditoria não pode ser alterada nem apagada.</p>
    </>
  );
}
