import { z } from 'zod';
export type TipoParametro = 'moeda' | 'percentual' | 'inteiro' | 'texto' | 'json';

export interface DefParametro {
  chave: string;
  rotulo: string;
  grupo: string;
  tipo: TipoParametro;
  descricao: string;
}

const p = (grupo: string, chave: string, tipo: TipoParametro, rotulo: string, descricao: string): DefParametro => ({
  chave, rotulo, grupo, tipo, descricao,
});

/** Parâmetros dos Sócios. Nenhum nasce com valor: quem define é o Sócio, com justificativa. */
export const CATALOGO_PARAMETROS: DefParametro[] = [
  p('Metas', 'meta_faturamento_mensal', 'moeda', 'Meta de faturamento do mês', 'Usada na previsão de fechamento e no Daily.'),
  p('Metas', 'meta_faturamento_anual', 'moeda', 'Meta de faturamento do ano', 'Aparece na visão anual do Painel.'),
  p('Metas', 'orcamento_anuncios_mensal', 'moeda', 'Orçamento de anúncios do mês', 'Base do ritmo de gasto na aba Tráfego.'),
  p('Metas', 'metas_por_etapa', 'json', 'Metas por etapa da jornada', 'Conversão esperada em cada etapa do Atendimento.'),
  p('Ganho', 'prolabore_pct', 'percentual', 'Pró-labore (% da receita de cada venda)', 'Retirada dos Sócios em cada venda confirmada.'),
  p('Ganho', 'prolabore_divisao_fundador_pct', 'percentual', 'Parte do Fundador no pró-labore (%)', 'O restante fica com o Cofundador.'),
  p('Ganho', 'comissao_vendedor_pct', 'percentual', 'Comissão padrão do vendedor (%)', 'Vale quando a pessoa não tem um % próprio em Equipe.'),
  p('Ganho', 'comissao_vendedor_teto', 'moeda', 'Teto mensal padrão do vendedor', 'Vale quando a pessoa não tem um teto próprio em Equipe.'),
  p('Ganho', 'comissao_influenciador_pct', 'percentual', 'Comissão padrão do influenciador (%)', 'Vale quando o cupom não define outro %.'),
  p('Ganho', 'comissao_influenciador_teto', 'moeda', 'Teto mensal padrão do influenciador', 'Limite da comissão de cada influenciador no mês.'),
  p('Margem', 'limite_desconto_pct', 'percentual', 'Limite de desconto do vendedor (%)', 'Acima disso o sistema bloqueia o cupom.'),
  p('Margem', 'piso_margem_pct', 'percentual', 'Piso de margem (%)', 'Abaixo disso a venda é bloqueada, sem mostrar o custo.'),
  p('Margem', 'prazo_troca_dias', 'inteiro', 'Prazo de troca (dias)', 'A comissão só é liberada depois desse prazo.'),
  p('Clientes', 'recompra_dias', 'inteiro', 'Dias até a oferta de recompra', 'Dispara a sequência de recompra.'),
  p('Clientes', 'segmento_em_risco_dias', 'inteiro', 'Dias sem comprar para "Em risco"', 'Primeiro limite dos segmentos.'),
  p('Clientes', 'segmento_inativo_dias', 'inteiro', 'Dias sem comprar para "Inativo"', 'Segundo limite dos segmentos.'),
  p('Clientes', 'segmento_vip_pct', 'percentual', 'Faixa VIP (% dos que mais compraram)', 'Define quem entra no segmento VIP.'),
  p('Atendimento', 'recuperacao_tentativas', 'inteiro', 'Tentativas na Recuperação', 'Depois delas a oportunidade é encerrada.'),
  p('Atendimento', 'carrinho_abandono_minutos', 'inteiro', 'Minutos sem pagar para carrinho abandonado', 'Tempo que transforma um carrinho em abandonado.'),
  p('Atendimento', 'tempo_maximo_etapa_horas', 'inteiro', 'Tempo máximo inicial por etapa (horas)', 'Vale até haver histórico para o percentil 75.'),
  p('Estoque', 'cobertura_minima_dias', 'inteiro', 'Cobertura mínima do estoque (dias)', 'Abaixo disso a variação entra em alerta de ruptura.'),
  p('Painel', 'frase_motivacional', 'texto', 'Frase motivacional', 'Aparece no topo da sub-aba Hoje.'),
  p('Painel', 'daily_config', 'json', 'Configuração do Daily', 'Ordem e tempo dos blocos da reunião.'),
];

const BLOCOS_DAILY = ['RESULTADO', 'ATENDIMENTO', 'VENDEDORES', 'TRAFEGO', 'SOCIAL', 'CLIENTES', 'GESTAO'] as const;
const configDaily = z.array(z.object({ id: z.enum(BLOCOS_DAILY), minutos: z.number().int().min(1).max(30) }).strict()).min(1).max(7)
  .refine((l) => new Set(l.map((b) => b.id)).size === l.length, 'Cada bloco aparece uma vez só.');
/** Ordem e tempo dos blocos do Daily. Ex.: [{"id":"RESULTADO","minutos":3}, …] */
export const validarDailyConfig = (valor: unknown) => configDaily.safeParse(valor);
const metasPorEtapa = z.record(z.enum(['LEAD', 'ABORDADO', 'LEVANTAMENTO', 'NEGOCIACAO', 'RECUPERACAO']), z.number().min(0).max(100));
/** Conversão esperada (%) por etapa. Ex.: {"LEAD": 60, "ABORDADO": 50} */
export const validarMetasPorEtapa = (valor: unknown) => metasPorEtapa.safeParse(valor);

const PORCHAVE = new Map(CATALOGO_PARAMETROS.map((d) => [d.chave, d]));
export const definicaoDe = (chave: string) => PORCHAVE.get(chave);

export function validarParametro(chave: string, valor: unknown): { ok: boolean; erro?: string } {
  const def = PORCHAVE.get(chave);
  if (!def) return { ok: false, erro: 'Parâmetro fora do catálogo.' };
  const numero = typeof valor === 'number' && Number.isFinite(valor);
  switch (def.tipo) {
    case 'moeda':
      return numero && (valor as number) >= 0 ? { ok: true } : { ok: false, erro: 'Informe um valor em R$ maior ou igual a zero.' };
    case 'percentual':
      return numero && (valor as number) >= 0 && (valor as number) <= 100
        ? { ok: true } : { ok: false, erro: 'Informe um percentual de 0 a 100.' };
    case 'inteiro':
      return numero && Number.isInteger(valor) && (valor as number) >= 0
        ? { ok: true } : { ok: false, erro: 'Informe um número inteiro maior ou igual a zero.' };
    case 'texto':
      return typeof valor === 'string' && valor.trim().length > 0 && valor.length <= 280
        ? { ok: true } : { ok: false, erro: 'Informe um texto de até 280 caracteres.' };
    case 'json':
      if (chave === 'daily_config') return validarDailyConfig(valor).success ? { ok: true }
        : { ok: false, erro: 'Informe os blocos do Daily na ordem, cada um com os minutos. Ex.: [{"id":"RESULTADO","minutos":3}]' };
      if (chave === 'metas_por_etapa') return validarMetasPorEtapa(valor).success ? { ok: true }
        : { ok: false, erro: 'Informe a conversão esperada (0 a 100) por etapa. Ex.: {"LEAD": 60, "ABORDADO": 50}' };
      return typeof valor === 'object' && valor !== null ? { ok: true } : { ok: false, erro: 'Informe uma estrutura válida.' };
  }
}
