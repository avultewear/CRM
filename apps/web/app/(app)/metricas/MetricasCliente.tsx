'use client';

import { useMemo, useState } from 'react';
import { PainelLateral } from '@/components/interativos';
import { TelaVazia } from '@/components/ui';
import { NOME_PAPEL } from '@/lib/formato';

export interface Metrica {
  id: string;
  nome: string;
  unidade: string;
  melhorQuando: 'maior' | 'menor';
  definicao: string;
  formula: string;
  fonte: string;
  janela: string;
  comparacao: string;
  faixas: string;
  quemVe: string[];
  versao: string;
  etapa: number;
}

const NOME_UNIDADE: Record<string, string> = {
  'R$': 'em reais', '%': 'em porcentagem', x: 'em vezes', tempo: 'em tempo (mediana)', dias: 'em dias', quantidade: 'em quantidade',
};

export function MetricasCliente({ metricas, inicial }: { metricas: Metrica[]; inicial?: string }) {
  const [filtro, setFiltro] = useState('');
  const [aberta, setAberta] = useState<Metrica | null>(() => metricas.find((m) => m.id === inicial) ?? null);

  const visiveis = useMemo(() => {
    const termo = filtro.trim().toLowerCase();
    return termo ? metricas.filter((m) => `${m.nome} ${m.definicao}`.toLowerCase().includes(termo)) : metricas;
  }, [filtro, metricas]);

  if (metricas.length === 0) {
    return <TelaVazia titulo="Nenhuma métrica para o seu papel" texto="As métricas aparecem aqui conforme o papel de cada pessoa." />;
  }

  return (
    <>
      <label className="campo" style={{ maxWidth: 360 }}>
        <span>Procurar métrica</span>
        <input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Nome ou parte da definição" />
      </label>
      <p className="apagado">
        Todo número do sistema sai destas fichas, com um único cálculo. Enquanto não há dados, o valor aparece como "—".
      </p>

      <div className="grade-indicadores">
        {visiveis.map((m) => (
          <button key={m.id} className="cartao indicador" onClick={() => setAberta(m)} data-teste={`metrica-${m.id}`}>
            <span className="rotulo">{m.nome}</span>
            <span className="valor mono">—</span>
            <span className="variacao apagado">Cálculo entra na etapa {m.etapa}</span>
          </button>
        ))}
      </div>
      {visiveis.length === 0 && <p className="apagado">Nenhuma métrica com esse nome.</p>}

      {aberta && (
        <PainelLateral titulo={aberta.nome} fechar={() => setAberta(null)} teste="ficha-metrica">
          <dl className="ficha">
            <div><dt>Definição</dt><dd>{aberta.definicao}</dd></div>
            <div><dt>Fórmula</dt><dd className="mono">{aberta.formula}</dd></div>
            <div><dt>Fonte</dt><dd>{aberta.fonte}</dd></div>
            <div><dt>Janela</dt><dd>{aberta.janela}</dd></div>
            <div><dt>Comparação</dt><dd>{aberta.comparacao}</dd></div>
            <div><dt>Faixas (o que é bom, atenção ou crítico)</dt><dd>{aberta.faixas}</dd></div>
            <div><dt>Leitura</dt><dd>Melhor quando é {aberta.melhorQuando}; {NOME_UNIDADE[aberta.unidade] ?? aberta.unidade}</dd></div>
            <div><dt>Quem vê</dt><dd>{aberta.quemVe.map((p) => NOME_PAPEL[p] ?? p).join(', ')}</dd></div>
            <div><dt>Valor hoje</dt><dd>— (sem dados: o cálculo entra na etapa {aberta.etapa})</dd></div>
            <div><dt>Versão da ficha</dt><dd className="mono">{aberta.versao}</dd></div>
          </dl>
        </PainelLateral>
      )}
    </>
  );
}
