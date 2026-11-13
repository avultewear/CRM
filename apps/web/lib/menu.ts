export interface ItemMenu {
  rota: string;
  nome: string;
  /** Basta ter uma destas permissões. */
  permissoes: string[];
}

/** Menu agrupado, igual para todos; cada papel vê só os itens que pode abrir. */
export const MENU: Array<{ grupo: string; itens: ItemMenu[] }> = [
  { grupo: 'Início', itens: [{ rota: '/painel', nome: 'Painel', permissoes: ['painel.ver'] }] },
  {
    grupo: 'Comercial',
    itens: [
      { rota: '/atendimento', nome: 'Atendimento', permissoes: ['atendimento.ver'] },
      { rota: '/pedidos', nome: 'Pedidos', permissoes: ['pedidos.ver'] },
      { rota: '/clientes', nome: 'Clientes', permissoes: ['clientes.ver'] },
      { rota: '/estoque', nome: 'Estoque', permissoes: ['estoque.ver'] },
    ],
  },
  {
    grupo: 'Marketing',
    itens: [
      { rota: '/trafego', nome: 'Tráfego', permissoes: ['trafego.ver'] },
      { rota: '/social', nome: 'Social Media', permissoes: ['social.analise', 'social.espaco', 'social.aprovar'] },
      { rota: '/influenciadores', nome: 'Influenciadores', permissoes: ['influenciadores.gestao'] },
    ],
  },
  {
    grupo: 'Gestão',
    itens: [
      { rota: '/metas', nome: 'Metas', permissoes: ['metas.ver'] },
      { rota: '/equipe', nome: 'Equipe', permissoes: ['equipe.ver'] },
      { rota: '/reunioes', nome: 'Reuniões', permissoes: ['reunioes.ver'] },
      { rota: '/financeiro', nome: 'Financeiro', permissoes: ['financeiro.ver'] },
      { rota: '/metricas', nome: 'Métricas', permissoes: ['metricas.ver'] },
      { rota: '/auditoria', nome: 'Auditoria', permissoes: ['auditoria.ver'] },
    ],
  },
  { grupo: 'Meu espaço', itens: [{ rota: '/meu-espaco', nome: 'Meu espaço', permissoes: ['influenciador.espaco'] }] },
];

export const tem = (permissoes: string[], alguma: string[]) => alguma.some((p) => permissoes.includes(p));

export function menuPara(permissoes: string[]) {
  return MENU.map((g) => ({ ...g, itens: g.itens.filter((i) => tem(permissoes, i.permissoes)) })).filter((g) => g.itens.length);
}

export interface AbaFutura {
  nome: string;
  pergunta: string;
  paraQuem: string;
  permissoes: string[];
  etapa: number;
  /** Tela vazia que ensina o primeiro passo. */
  vazio: string;
}

/** Abas que entram nas próximas etapas. Já existem com cabeçalho, permissão e tela vazia. */
export const ABAS_FUTURAS: Record<string, AbaFutura> = {
  pedidos: { nome: 'Pedidos e pós-venda', pergunta: 'O que foi vendido, o que falta enviar e o que voltou?', paraQuem: 'Sócios e Gerente; cada vendedor vê os próprios', permissoes: ['pedidos.ver'], etapa: 2, vazio: 'Nenhum pedido ainda. Eles aparecem aqui assim que a loja vender. Primeiro passo: ligar a loja da Hostinger ao sistema.' },
  estoque: { nome: 'Estoque', pergunta: 'O que temos, o que está parado, o que vai faltar e o que os clientes pedem?', paraQuem: 'Sócios, Gerente, vendedores e social media', permissoes: ['estoque.ver'], etapa: 2, vazio: 'Cadastre os produtos na loja da Hostinger. Eles aparecem aqui com giro, cobertura e alerta de ruptura.' },
  trafego: { nome: 'Tráfego', pergunta: 'O dinheiro em anúncio está virando venda?', paraQuem: 'Gestor de tráfego e Sócios', permissoes: ['trafego.ver'], etapa: 7, vazio: 'Aqui entra a auditoria do tráfego pago. Primeiro passo: um Sócio conecta a conta de anúncios da Meta.' },
  social: { nome: 'Social Media', pergunta: 'O que publicar hoje e o que funcionou?', paraQuem: 'Sócios (análise), social media (trabalho) e Gerente (aprovação)', permissoes: ['social.analise', 'social.espaco', 'social.aprovar'], etapa: 8, vazio: 'Aqui entram a análise do Instagram, o calendário e as pautas. Primeiro passo: conectar a conta Instagram Business.' },
};
