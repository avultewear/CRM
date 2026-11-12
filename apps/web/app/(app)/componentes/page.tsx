import { Cabecalho, SemAcesso } from '@/components/ui';
import { acesso } from '@/lib/sessao';
import { ComponentesCliente } from './ComponentesCliente';

/** Mostruário do design system: as mesmas peças usadas em todas as abas, no claro e no escuro. */
export default async function Componentes() {
  const { pode } = await acesso(['metas.ver']);
  if (!pode) return <SemAcesso />;
  return (
    <>
      <Cabecalho nome="Componentes" pergunta="Como é cada peça da interface, no claro e no escuro?" paraQuem="Sócios" />
      <p className="secundario">Os números desta tela são exemplos fictícios, só para mostrar o desenho de cada peça.</p>
      <ComponentesCliente />
    </>
  );
}
