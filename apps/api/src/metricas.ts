import type { Papel } from './papeis.js';

/** Ficha de uma métrica (regra 1): o código calcula, a IA explica. */
export interface Metrica {
  id: string;
  nome: string;
  unidade: 'R$' | '%' | 'x' | 'tempo' | 'dias' | 'quantidade';
  melhorQuando: 'maior' | 'menor';
  definicao: string;
  formula: string;
  fonte: string;
  janela: string;
  comparacao: string;
  faixas: string;
  quemVe: Papel[];
  versao: string;
  /** Entrega em que a métrica passa a ser calculada. */
  etapa: number;
}

const SOCIOS: Papel[] = ['SOCIO'];
const GESTAO: Papel[] = ['SOCIO', 'GERENTE'];
const COMERCIAL: Papel[] = ['SOCIO', 'GERENTE', 'VENDEDOR'];
const TRAFEGO: Papel[] = ['SOCIO', 'GESTOR_TRAFEGO'];
const SOCIAL: Papel[] = ['SOCIO', 'SOCIAL_MEDIA'];

const COMPARACAO = 'Mesmo intervalo do período anterior, com projeção de fechamento. Sem dado, mostra "—".';
const FAIXAS = 'A definir pelos Sócios depois dos primeiros dados.';
const MES = 'Mês corrente até hoje';

function m(
  id: string, nome: string, unidade: Metrica['unidade'], melhorQuando: Metrica['melhorQuando'], quemVe: Papel[],
  etapa: number, definicao: string, formula: string, fonte: string, janela = MES,
): Metrica {
  return { id, nome, unidade, melhorQuando, quemVe, etapa, definicao, formula, fonte, janela, comparacao: COMPARACAO, faixas: FAIXAS, versao: '1' };
}

export const METRICAS: Metrica[] = [
  m('receita', 'Receita', 'R$', 'maior', GESTAO, 2, 'Soma das vendas confirmadas.', 'Σ valor dos pedidos pagos + vendas diretas confirmadas − devoluções', 'Pedidos da loja e vendas diretas'),
  m('previsao_fechamento', 'Previsão de fechamento', 'R$', 'maior', GESTAO, 6, 'Quanto o mês fecha se o ritmo atual continuar.', 'receita até hoje ÷ dias corridos × dias do mês', 'Receita'),
  m('ticket_medio', 'Ticket médio', 'R$', 'maior', COMERCIAL, 2, 'Valor médio de uma venda confirmada.', 'receita ÷ número de vendas confirmadas', 'Pedidos da loja e vendas diretas'),
  m('pro_labore', 'Pró-labore', 'R$', 'maior', SOCIOS, 2, 'Retirada dos Sócios sobre as vendas confirmadas.', 'Σ (valor da venda × % de pró-labore)', 'Vendas confirmadas e parâmetro de pró-labore'),
  m('lucro', 'Lucro', 'R$', 'maior', SOCIOS, 2, 'O que sobra da receita depois dos custos.', 'receita − custo das peças − comissões − anúncios − custos do mês', 'Vendas, custos dos Sócios, comissões e tráfego'),
  m('comissao_mes', 'Comissão do mês', 'R$', 'menor', SOCIOS, 5, 'Comissões geradas pelas vendas do mês, de vendedores e influenciadores.', 'Σ comissões geradas, cada pessoa até o seu teto', 'Vendas confirmadas e tabela de comissões'),
  m('comissoes_pagas', 'Comissões pagas', 'R$', 'menor', SOCIOS, 5, 'Comissões já pagas no período.', 'Σ comissões com situação "paga"', 'Tabela de comissões'),
  m('gasto_anuncios', 'Gasto com anúncios', 'R$', 'menor', SOCIOS, 7, 'Total investido em anúncios, como aparece no Painel.', 'Σ investimento diário das campanhas', 'Gerenciador de Anúncios da Meta'),
  m('investimento_trafego', 'Investimento', 'R$', 'menor', TRAFEGO, 7, 'Valor investido em anúncios no período da aba Tráfego.', 'Σ investimento diário por anúncio', 'Gerenciador de Anúncios da Meta', 'Período do filtro (7, 30, 90 dias ou personalizado)'),
  m('roas', 'ROAS', 'x', 'maior', TRAFEGO, 7, 'Quanto volta em faturamento para cada real investido.', 'faturamento dos pedidos com código de anúncio ÷ investimento', 'Pedidos da loja e Gerenciador de Anúncios'),
  m('custo_por_lead', 'Custo por lead', 'R$', 'menor', TRAFEGO, 7, 'Quanto custa cada lead vindo de tráfego pago.', 'investimento ÷ leads novos de tráfego pago', 'Gerenciador de Anúncios e Atendimento'),
  m('custo_por_lead_qualificado', 'Custo por lead qualificado', 'R$', 'menor', TRAFEGO, 7, 'Quanto custa cada lead que chegou à etapa Levantamento.', 'investimento ÷ leads de tráfego pago que chegaram a Levantamento', 'Gerenciador de Anúncios e histórico de etapas'),
  m('ctr', 'CTR', '%', 'maior', TRAFEGO, 7, 'Parte de quem viu o anúncio e clicou no link.', 'cliques no link ÷ impressões', 'Gerenciador de Anúncios da Meta', 'Período do filtro'),
  m('cpm', 'CPM', 'R$', 'menor', TRAFEGO, 7, 'Custo de mil impressões.', 'investimento ÷ impressões × 1000', 'Gerenciador de Anúncios da Meta', 'Período do filtro'),
  m('connect_rate', 'Connect rate', '%', 'maior', TRAFEGO, 7, 'Parte das conversas iniciadas em que a pessoa mandou 2 mensagens ou mais.', 'conversas com 2+ mensagens da pessoa ÷ conversas iniciadas', 'Gerenciador de Anúncios e Atendimento', 'Período do filtro'),
  m('conversao_lead_venda', 'Conversão lead → venda', '%', 'maior', COMERCIAL, 3, 'Parte dos leads que virou venda.', 'oportunidades em Venda ÷ oportunidades criadas, sem as que não contam como perda', 'Histórico de etapas'),
  m('conversao_qualificado_venda', 'Conversão qualificado → venda', '%', 'maior', COMERCIAL, 3, 'Parte dos leads qualificados (Levantamento) que virou venda.', 'oportunidades em Venda ÷ oportunidades que chegaram a Levantamento', 'Histórico de etapas'),
  m('tempo_primeira_resposta', 'Tempo de 1ª resposta', 'tempo', 'menor', COMERCIAL, 3, 'Quanto tempo o lead espera pela primeira resposta de uma pessoa.', 'mediana (primeira resposta humana − criação do lead)', 'Atendimento'),
  m('tempo_na_etapa', 'Tempo na etapa', 'tempo', 'menor', COMERCIAL, 3, 'Quanto tempo uma oportunidade fica em cada etapa.', 'mediana (saída − entrada na etapa); limite = percentil 75', 'Histórico de etapas'),
  m('taxa_recuperacao_carrinho', 'Recuperação de carrinho', '%', 'maior', COMERCIAL, 3, 'Parte dos carrinhos abandonados que virou venda.', 'carrinhos abandonados com venda ÷ carrinhos abandonados', 'Eventos da loja e pedidos'),
  m('taxa_recompra', 'Taxa de recompra', '%', 'maior', GESTAO, 4, 'Parte dos clientes que comprou mais de uma vez.', 'clientes com 2+ compras ÷ clientes com 1+ compra', 'Pedidos por cliente', 'Desde a primeira venda'),
  m('tempo_entre_compras', 'Tempo entre compras', 'dias', 'menor', GESTAO, 4, 'Quantos dias passam entre uma compra e a seguinte do mesmo cliente.', 'mediana (data da compra − data da compra anterior)', 'Pedidos por cliente', 'Desde a primeira venda'),
  m('ltv', 'Valor do cliente (LTV)', 'R$', 'maior', GESTAO, 4, 'Quanto um cliente compra, em média, desde a primeira compra.', 'receita total ÷ clientes com 1+ compra', 'Pedidos por cliente', 'Desde a primeira venda'),
  m('cac', 'Custo de aquisição (CAC)', 'R$', 'menor', SOCIOS, 7, 'Quanto custa conquistar um cliente novo.', '(anúncios + comissões de influenciadores + peças enviadas) ÷ clientes novos', 'Tráfego, comissões, estoque e pedidos'),
  m('ltv_cac', 'LTV ÷ CAC', 'x', 'maior', SOCIOS, 7, 'Quantas vezes o cliente devolve o que custou para conquistá-lo.', 'LTV ÷ CAC', 'LTV e CAC', 'Desde a primeira venda'),
  m('taxa_troca', 'Taxa de troca', '%', 'menor', GESTAO, 4, 'Parte das peças vendidas que voltou em troca ou devolução.', 'peças trocadas ou devolvidas ÷ peças vendidas, por modelo e tamanho', 'Trocas e devoluções'),
  m('taxa_avaliacao', 'Taxa de avaliação', '%', 'maior', GESTAO, 4, 'Parte dos pedidos entregues que recebeu avaliação.', 'pedidos avaliados ÷ pedidos entregues', 'Avaliações'),
  m('dias_sem_venda', 'Dias sem venda', 'dias', 'menor', ['SOCIO', 'GERENTE', 'SOCIAL_MEDIA'], 2, 'Há quantos dias o modelo não vende. Base do status de giro.', 'hoje − data da última venda do modelo (ou da primeira entrada)', 'Pedidos e estoque da loja', 'Hoje'),
  m('cobertura_estoque', 'Cobertura do estoque', 'dias', 'maior', GESTAO, 2, 'Quantos dias de estoque restam em cada variação.', 'quantidade ÷ venda média por dia dos últimos 30 dias', 'Estoque e pedidos da loja', 'Últimos 30 dias'),
  m('alcance', 'Alcance', 'quantidade', 'maior', SOCIAL, 8, 'Contas que viram o conteúdo.', 'soma do alcance dos posts do período', 'Instagram Business', 'Período do filtro'),
  m('vendas_por_post', 'Vendas por post', 'quantidade', 'maior', SOCIAL, 8, 'Vendas que chegaram com o código de um post.', 'pedidos pagos com o código do post', 'Pedidos da loja e pautas', 'Período do filtro'),
];

export function metricasPara(papel: Papel): Metrica[] {
  return METRICAS.filter((metrica) => metrica.quemVe.includes(papel));
}
