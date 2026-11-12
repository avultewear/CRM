import { Cabecalho, SemAcesso } from '@/components/ui';
import { acesso, buscar } from '@/lib/sessao';
import { MetasCliente, type Parametro } from './MetasCliente';

export default async function Metas() {
  const { pode } = await acesso(['metas.ver']);
  if (!pode) return <SemAcesso />;
  const parametros = await buscar<Parametro[]>('/parametros');
  return (
    <>
      <Cabecalho nome="Metas" pergunta="Quais são as metas, os tetos e os limites do negócio?" paraQuem="Sócios" />
      <p className="secundario">Toda mudança pede uma justificativa e fica no histórico. O que ainda não foi definido aparece como "A definir".</p>
      <MetasCliente parametros={parametros} />
    </>
  );
}
