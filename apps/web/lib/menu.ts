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
  painel: { nome: 'Painel', pergunta: 'Como está o negócio e o que depende de mim?', paraQuem: 'Sócios e Gerente', permissoes: ['painel.ver'], etapa: 6, vazio: 'Aqui entram a previsão de fechamento, os indicadores, a jornada no funil e o Daily. Primeiro passo: definir as metas do mês e do ano em Metas.' },
  atendimento: { nome: 'Atendimento', pergunta: 'Quem está conversando com a gente e qual é o próximo passo?', paraQuem: 'Vendedores e Gerente', permissoes: ['atendimento.ver'], etapa: 3, vazio: 'Aqui entra o quadro com as 6 etapas, o link de compra e o follow como tarefa. Primeiro passo: cadastrar o primeiro lead ou transformar um direct em lead.' },
  pedidos: { nome: 'Pedidos e pós-venda', pergunta: 'O que foi vendido, o que falta enviar e o que voltou?', paraQuem: 'Sócios e Gerente; cada vendedor vê os próprios', permissoes: ['pedidos.ver'], etapa: 2, vazio: 'Nenhum pedido ainda. Eles aparecem aqui assim que a loja vender. Primeiro passo: ligar a loja da Hostinger ao sistema.' },
  clientes: { nome: 'Clientes, recompra e comunidade', pergunta: 'Quem são os nossos clientes, quem volta e quem está sumindo?', paraQuem: 'Sócios, Gerente e vendedores', permissoes: ['clientes.ver'], etapa: 4, vazio: 'Os clientes aparecem aqui depois da primeira compra, já separados por segmento.' },
  estoque: { nome: 'Estoque', pergunta: 'O que temos, o que está parado, o que vai faltar e o que os clientes pedem?', paraQuem: 'Sócios, Gerente, vendedores e social media', permissoes: ['estoque.ver'], etapa: 2, vazio: 'Cadastre os produtos na loja da Hostinger. Eles aparecem aqui com giro, cobertura e alerta de ruptura.' },
  trafego: { nome: 'Tráfego', pergunta: 'O dinheiro em anúncio está virando venda?', paraQuem: 'Gestor de tráfego e Sócios', permissoes: ['trafego.ver'], etapa: 7, vazio: 'Aqui entra a auditoria do tráfego pago. Primeiro passo: um Sócio conecta a conta de anúncios da Meta.' },
  social: { nome: 'Social Media', pergunta: 'O que publicar hoje e o que funcionou?', paraQuem: 'Sócios (análise), social media (trabalho) e Gerente (aprovação)', permissoes: ['social.analise', 'social.espaco', 'social.aprovar'], etapa: 8, vazio: 'Aqui entram a análise do Instagram, o calendário e as pautas. Primeiro passo: conectar a conta Instagram Business.' },
  influenciadores: { nome: 'Influenciadores', pergunta: 'Quanto cada influenciador trouxe e quanto custou?', paraQuem: 'Sócios e Gerente', permissoes: ['influenciadores.gestao'], etapa: 5, vazio: 'Aqui entram cupons, links, peças enviadas e o retorno de cada um. Primeiro passo: cadastrar o influenciador em Equipe.' },
  reunioes: { nome: 'Reuniões', pergunta: 'O que foi decidido em cada Daily?', paraQuem: 'Sócios e Gerente', permissoes: ['reunioes.ver'], etapa: 6, vazio: 'As atas do Daily e as tarefas criadas em cada uma aparecem aqui depois da primeira reunião.' },
  financeiro: { nome: 'Financeiro', pergunta: 'O que falta confirmar, liberar e pagar?', paraQuem: 'Sócios', permissoes: ['financeiro.ver'], etapa: 6, vazio: 'Aqui entram as vendas diretas a confirmar, as comissões a liberar e a pagar, os custos do mês e o lucro.' },
  'meu-espaco': { nome: 'Meu espaço', pergunta: 'Quanto as minhas indicações venderam e quanto eu ganhei?', paraQuem: 'Influenciadores', permissoes: ['influenciador.espaco'], etapa: 5, vazio: 'Aqui você vai ver as vendas dos seus cupons e links, a comissão e a projeção de ganhos.' },
};
