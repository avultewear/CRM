export const PAPEIS = ['SOCIO', 'GERENTE', 'VENDEDOR', 'GESTOR_TRAFEGO', 'SOCIAL_MEDIA', 'INFLUENCIADOR'] as const;
export type Papel = (typeof PAPEIS)[number];

export const NOME_PAPEL: Record<Papel, string> = {
  SOCIO: 'Sócio',
  GERENTE: 'Gerente',
  VENDEDOR: 'Vendedor',
  GESTOR_TRAFEGO: 'Gestor de tráfego',
  SOCIAL_MEDIA: 'Social media',
  INFLUENCIADOR: 'Influenciador',
};

const GESTAO: Papel[] = ['SOCIO', 'GERENTE'];
const COMERCIAL: Papel[] = ['SOCIO', 'GERENTE', 'VENDEDOR'];

/** Matriz única de permissões. Toda rota e toda tela consultam esta tabela. */
const MATRIZ: Record<string, Papel[]> = {
  'painel.ver': GESTAO,
  // Cifras dos Sócios: pró-labore, comissões somadas, gasto com anúncios, custos e lucro.
  'cifras.ver': ['SOCIO'],
  'atendimento.ver': COMERCIAL,
  // Ver os leads de todos os vendedores (o vendedor vê só os próprios).
  'atendimento.todos': GESTAO,
  // Confirmar ou recusar venda direta (Pix ou dinheiro).
  'vendas.confirmar': ['SOCIO'],
  // Ver o CPF completo de um cliente (cada acesso fica na auditoria).
  'cpf.ver': ['SOCIO'],
  'pedidos.ver': COMERCIAL,
  'clientes.ver': COMERCIAL,
  'estoque.ver': ['SOCIO', 'GERENTE', 'VENDEDOR', 'SOCIAL_MEDIA'],
  'estoque.editar': GESTAO,
  'trafego.ver': ['SOCIO', 'GESTOR_TRAFEGO'],
  'social.analise': ['SOCIO'],
  'social.espaco': ['SOCIO', 'SOCIAL_MEDIA'],
  'social.aprovar': GESTAO,
  'influenciadores.gestao': GESTAO,
  'influenciador.espaco': ['INFLUENCIADOR'],
  'metas.ver': ['SOCIO'],
  'metas.editar': ['SOCIO'],
  'equipe.ver': GESTAO,
  'equipe.editar': GESTAO,
  'reunioes.ver': GESTAO,
  'financeiro.ver': ['SOCIO'],
  'auditoria.ver': ['SOCIO'],
  'metricas.ver': ['SOCIO', 'GERENTE', 'VENDEDOR', 'GESTOR_TRAFEGO', 'SOCIAL_MEDIA'],
};

export function pode(papel: Papel, permissao: string): boolean {
  return MATRIZ[permissao]?.includes(papel) ?? false;
}

export function permissoesDe(papel: Papel): string[] {
  return Object.keys(MATRIZ).filter((p) => MATRIZ[p].includes(papel));
}
