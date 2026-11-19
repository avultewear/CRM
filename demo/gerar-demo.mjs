// Gera a demonstração clicável: uma página só, com as telas reais do sistema e dados fictícios.
//
// Como funciona: o roteiro entra no sistema de verdade (API + telas rodando), preenche o banco de
// desenvolvimento com dados FICTÍCIOS, visita cada tela com três papéis e guarda o HTML que o
// sistema desenhou. A página final navega entre esses retratos. Nada é gravado na demonstração.
//
// Pré-requisitos: API em :4000, telas em :3000 e o banco recém-criado pelo `npm run semear`.
// Uso: node demo/gerar-demo.mjs   →   demo/saida/index.html
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import puppeteer from 'puppeteer-core';

const AQUI = dirname(fileURLToPath(import.meta.url));
const WEB = process.env.WEB_URL ?? 'http://localhost:3000';
const API = process.env.API_URL ?? 'http://localhost:4000';
const env = readFileSync(join(AQUI, '..', 'apps', 'api', '.env'), 'utf8');
const SENHA = process.env.SEMENTE_SENHA ?? env.match(/SEMENTE_SENHA="?([^"\n]+)/)[1];
const BANCO = process.env.DATABASE_URL ?? env.match(/DATABASE_URL="?([^"\n]+)/)[1];
const PAPEIS = [
  { id: 'socio', nome: 'Sócio', inicio: '/atendimento' },
  { id: 'gerente', nome: 'Gerente', inicio: '/atendimento' },
  { id: 'vendedor', nome: 'Vendedor', inicio: '/atendimento' },
  { id: 'influenciador', nome: 'Influenciador', inicio: '/meu-espaco' },
  { id: 'trafego', nome: 'Gestor de tráfego', inicio: '/trafego' },
];

// ------------------------------------------------------------------ 1. Dados fictícios
async function entrarApi(papel) {
  const r = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `${papel}@avulte.teste`, senha: SENHA }) });
  return (await r.json()).token;
}
function cliente(token) {
  return async (metodo, caminho, corpo) => {
    const r = await fetch(`${API}${caminho}`, { method: metodo, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: corpo ? JSON.stringify(corpo) : undefined });
    const dados = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`${metodo} ${caminho}: ${dados.erro ?? r.status}`);
    return dados;
  };
}
/** Dia no horário de Brasília (AAAA-MM-DD), com deslocamento em dias. */
const hoje = (dias = 0) => new Date(Date.now() - 3 * 3_600_000 + dias * 86_400_000).toISOString().slice(0, 10);
/** CPF fictício com dígitos verificadores válidos. */
function cpfFicticio(n) {
  const base = String(100000000 + n * 7919).slice(0, 9).split('').map(Number);
  const digito = (ds) => { const r = (ds.reduce((s, d, i) => s + d * (ds.length + 1 - i), 0) * 10) % 11; return r === 10 ? 0 : r; };
  const d1 = digito(base); const d2 = digito([...base, d1]);
  return [...base, d1, d2].join('');
}

async function semearDemo() {
  const socio = cliente(await entrarApi('socio'));
  const gerente = cliente(await entrarApi('gerente'));
  const vendedora = cliente(await entrarApi('vendedor'));

  const jaTem = await socio('GET', '/oportunidades');
  if (jaTem.length) { console.log('Banco já tem leads: mantendo os dados existentes.'); return; }

  // Parâmetros de exemplo (os Sócios definem os reais em Metas).
  const exemplo = 'Valor de exemplo para a demonstração';
  for (const [chave, valor] of [['meta_faturamento_mensal', 20000], ['tempo_maximo_etapa_horas', 48], ['recuperacao_tentativas', 3], ['limite_desconto_pct', 10],
    ['prolabore_pct', 10], ['comissao_vendedor_pct', 5], ['comissao_vendedor_teto', 800], ['comissao_influenciador_pct', 10], ['comissao_influenciador_teto', 500], ['prazo_troca_dias', 7],
    ['segmento_em_risco_dias', 60], ['segmento_inativo_dias', 120], ['segmento_vip_pct', 20], ['recompra_dias', 45],
    ['meta_faturamento_anual', 240000], ['orcamento_anuncios_mensal', 2000],
    ['referencias_trafego', { ctrMin: 1.29, cpcMax: 1.5, frequenciaMax: 3, taxaLeadMin: 40 }], ['frase_motivacional', 'Cada treino conta. Cada cliente também.'],
    ['metas_por_etapa', { LEAD: 70, ABORDADO: 60, LEVANTAMENTO: 60, NEGOCIACAO: 50, RECUPERACAO: 30 }]]) {
    await socio('PUT', `/parametros/${chave}`, { valor, justificativa: exemplo });
  }
  // Segundo vendedor, para o rodízio e o filtro por vendedor.
  const lucas = await socio('POST', '/equipe', { nome: 'Vendedor Lucas (teste)', email: 'lucas@avulte.teste', senha: SENHA, papel: 'VENDEDOR', funcao: 'Vendas', vende: true, codigoVendedor: 'LUCAS01', comissaoPct: 5, comissaoTeto: 800, metaMensal: 6000 });
  const equipe = await socio('GET', '/equipe');
  const ana = equipe.find((p) => p.email === 'vendedor@avulte.teste');
  await socio('PATCH', `/equipe/${ana.id}`, { codigoVendedor: 'ANA01', comissaoPct: 5, comissaoTeto: 800, metaMensal: 6000 });

  let fone = 11_98800_1000;
  const lead = async (nome, extra, dono) => (await gerente('POST', '/oportunidades', {
    nome, telefone: String(++fone), canal: 'WHATSAPP', origem: 'ANUNCIO', vendedorId: dono, ...extra,
  })).oportunidade;
  const responder = (o) => gerente('POST', `/oportunidades/${o.id}/resposta`, {});
  const avancar = (o) => gerente('POST', `/oportunidades/${o.id}/avancar`, {});
  const link = (o, corpo) => gerente('POST', `/oportunidades/${o.id}/link`, corpo);

  // Lead
  await lead('Rafael Monteiro', { origemDetalhe: 'Campanha de lançamento', interesse: 'Camiseta Técnica Running' }, ana.id);
  await lead('Juliana Prado', { canal: 'INSTAGRAM', origem: 'POST', origemDetalhe: 'Reels do treino de sábado' }, lucas.id);
  // Abordado
  const bruno = await lead('Bruno Carvalho', { origemDetalhe: 'Campanha de lançamento', interesse: 'Short Dupla Camada Running' }, ana.id);
  await responder(bruno); await avancar(bruno);
  await gerente('PATCH', `/oportunidades/${bruno.id}`, { temperatura: 'MORNA', etiquetas: ['corrida'] });
  await gerente('POST', `/oportunidades/${bruno.id}/notas`, { texto: 'Corre 10 km aos domingos. Ficou em dúvida entre M e G.' });
  // Levantamento
  const camila = await lead('Camila Ribeiro', { origem: 'INDICACAO', origemDetalhe: 'Indicada por um cliente', interesse: 'Camiseta Técnica Running', tamanho: 'M' }, lucas.id);
  await responder(camila); await avancar(camila); await avancar(camila);
  await gerente('PATCH', `/oportunidades/${camila.id}`, { temperatura: 'QUENTE', quantidade: 2, valor: 199.8, etiquetas: ['corrida', 'grupo de corrida'] });
  // Negociação: link enviado
  const diego = await lead('Diego Nunes', { origemDetalhe: 'Campanha de lançamento' }, ana.id);
  await link(diego, { interesse: 'Regata Running', tamanho: 'G', quantidade: 2, valor: 180 });
  await gerente('PATCH', `/oportunidades/${diego.id}`, { temperatura: 'QUENTE', etiquetas: ['academia'] });
  // Negociação: venda direta aguardando os Sócios
  const fernanda = await lead('Fernanda Lopes', { canal: 'MANUAL', origem: 'INDICACAO', origemDetalhe: 'Amiga da equipe' }, lucas.id);
  await gerente('POST', `/oportunidades/${fernanda.id}/venda-direta`, {
    itens: [{ descricao: 'Compressão Manga Curta M', quantidade: 1, precoTabela: 109.9, preco: 109.9 }, { descricao: 'Shorts de Musculação M', quantidade: 1, precoTabela: 99.9, preco: 99.9 }],
    formaPagamento: 'PIX', cpf: cpfFicticio(1),
  });
  // Venda: venda direta confirmada
  const gustavo = await lead('Gustavo Almeida', { origem: 'ORGANICO' }, ana.id);
  const venda = await gerente('POST', `/oportunidades/${gustavo.id}/venda-direta`, {
    itens: [{ descricao: 'Camiseta Oversized Gym G', quantidade: 1, precoTabela: 119.9, preco: 119.9 }], formaPagamento: 'DINHEIRO', cpf: cpfFicticio(2),
  });
  await socio('POST', `/vendas-diretas/${venda.id}/confirmar`, {});
  // Influenciadores, cupons e vendas com cupom (etapa 5)
  const acessoBia = equipe.find((p) => p.email === 'influenciador@avulte.teste');
  const bia = await socio('POST', '/influenciadores', { nome: 'Bia Corre', arroba: '@biacorre.teste', usuarioId: acessoBia.id });
  await socio('POST', `/influenciadores/${bia.id}/cupons`, { codigo: 'BIA10', descontoPct: 10 });
  await socio('POST', `/influenciadores/${bia.id}/pecas`, { descricao: 'Camiseta Técnica Running P', quantidade: 1, enviadaEm: hoje(-9), custo: 42 });
  await socio('POST', `/influenciadores/${bia.id}/pecas`, { descricao: 'Short Dupla Camada Running P', quantidade: 1, enviadaEm: hoje(-9), custo: 38 });
  await gerente('PUT', `/influenciadores/${bia.id}/posts`, { mes: hoje().slice(0, 7), combinados: 4, feitos: 3 });
  const leo = await socio('POST', '/influenciadores', { nome: 'Léo Treina', arroba: '@leotreina.teste' });
  await socio('POST', `/influenciadores/${leo.id}/cupons`, { codigo: 'LEO10', descontoPct: 10, comissaoPct: 8 });
  await gerente('PUT', `/influenciadores/${leo.id}/posts`, { mes: hoje().slice(0, 7), combinados: 2, feitos: 0 });

  const comCupom = [];
  for (const [n, nome, dono, peca, tabela, diasAtras] of [
    [3, 'Larissa Pinto', ana.id, 'Camiseta Técnica Running M', 119.9, 2],
    [4, 'Marcos Vieira', lucas.id, 'Short Dupla Camada Running G', 129.9, 5],
    [5, 'Natália Reis', ana.id, 'Regata Running P', 89.9, 0],
    [6, 'Otávio Lima', lucas.id, 'Camiseta Técnica Running G', 119.9, 5],
  ]) {
    const o = await lead(nome, { canal: 'INSTAGRAM', origem: 'INFLUENCIADOR', origemDetalhe: 'Cupom BIA10' }, dono);
    const v = await gerente('POST', `/oportunidades/${o.id}/venda-direta`, {
      itens: [{ descricao: peca, quantidade: 1, precoTabela: tabela, preco: Math.round(tabela * 90) / 100 }], formaPagamento: 'PIX', cpf: cpfFicticio(n), cupom: 'BIA10',
    });
    await socio('POST', `/vendas-diretas/${v.id}/confirmar`, {});
    comCupom.push({ venda: v.id, diasAtras, nome, cliente: o.cliente, dono });
  }
  // Uma comissão já paga e outra liberada, para o Financeiro mostrar os três momentos.
  const resumo = await socio('GET', '/financeiro/resumo');
  const daBia = resumo.aguardando.find((g) => g.quem === 'Bia Corre' && g.cliente === 'Marcos Vieira');
  await socio('POST', `/ganhos/${daBia.id}/liberar`, {});
  await socio('POST', `/ganhos/${daBia.id}/pagar`, {});
  const daAna = resumo.aguardando.find((g) => g.tipo === 'COMISSAO_VENDEDOR' && g.cliente === 'Gustavo Almeida');
  await socio('POST', `/ganhos/${daAna.id}/liberar`, {});

  // Clientes, pós-venda e recompra (etapa 4)
  const cli = Object.fromEntries(comCupom.map((c) => [c.nome.split(' ')[0], c]));
  const recomprar = async (c, n, itens, extra = {}) => {
    const o = (await gerente('POST', '/oportunidades', { nome: c.nome, telefone: c.cliente.telefone, canal: 'WHATSAPP', origem: 'ORGANICO', vendedorId: c.dono })).oportunidade;
    const v = await gerente('POST', `/oportunidades/${o.id}/venda-direta`, { itens, formaPagamento: 'PIX', ...extra });
    await socio('POST', `/vendas-diretas/${v.id}/confirmar`, {});
    return v.id;
  };
  await gerente('PATCH', `/clientes/${cli.Larissa.cliente.id}`, { aceiteMensagens: true });
  await gerente('PUT', `/clientes/${cli.Larissa.cliente.id}/etiquetas`, { etiquetas: ['CORRE', 'GRUPO', 'DIVULGADOR'] });
  await gerente('PATCH', `/clientes/${cli.Marcos.cliente.id}`, { aceiteMensagens: true });
  await gerente('PUT', `/clientes/${cli.Marcos.cliente.id}/etiquetas`, { etiquetas: ['TREINA'] });
  await gerente('PUT', `/clientes/${cli.Natália.cliente.id}/etiquetas`, { etiquetas: ['CORRE'] });
  // Larissa volta a comprar duas vezes (vira VIP) e indica a Paula.
  await recomprar(cli.Larissa, 0, [{ descricao: 'Short Dupla Camada Running M', quantidade: 1, precoTabela: 129.9, preco: 129.9 }, { descricao: 'Regata Running M', quantidade: 1, precoTabela: 89.9, preco: 89.9 }]);
  await recomprar(cli.Larissa, 0, [{ descricao: 'Jaqueta Training M', quantidade: 1, precoTabela: 199.9, preco: 199.9 }]);
  const codigoLarissa = (await gerente('GET', `/clientes/${cli.Larissa.cliente.id}/ficha`)).codigoIndicacao;
  const paula = await lead('Paula Freitas', { origem: 'INDICACAO', origemDetalhe: 'Indicada pela Larissa' }, ana.id);
  const vendaPaula = await gerente('POST', `/oportunidades/${paula.id}/venda-direta`, {
    itens: [{ descricao: 'Regata Running P', quantidade: 1, precoTabela: 89.9, preco: 89.9 }], formaPagamento: 'PIX', cpf: cpfFicticio(7), indicacao: codigoLarissa });
  await socio('POST', `/vendas-diretas/${vendaPaula.id}/confirmar`, {});
  await socio('POST', `/clientes/${cli.Larissa.cliente.id}/brindes`, { descricao: 'Squeeze Avulte', motivo: 'Indicou uma amiga', entregueEm: hoje(-1), custo: 14 });
  // Marcos compra de novo (Recorrente) e pede troca de tamanho; a Natália pede devolução.
  const vendaMarcos = await recomprar(cli.Marcos, 0, [{ descricao: 'Camiseta Técnica Running G', quantidade: 2, precoTabela: 119.9, preco: 119.9 }]);
  const trocaMarcos = await gerente('POST', `/vendas-diretas/${vendaMarcos}/trocas`, { item: 'Camiseta Técnica Running G', quantidade: 1, motivo: 'TAMANHO', observacao: 'Quer trocar por GG' });
  await gerente('POST', `/trocas/${trocaMarcos.id}/receber`, { estado: 'BOM' });
  await gerente('POST', `/vendas-diretas/${cli.Natália.venda}/trocas`, { item: 'Regata Running P', quantidade: 1, motivo: 'ARREPENDIMENTO' });
  // Clientes antigos, para os segmentos Em risco e Inativo aparecerem.
  const antigos = [];
  for (const [n, nome, dias] of [[8, 'Quésia Barros', 75], [9, 'Renato Dias', 150]]) {
    const o = await lead(nome, { origem: 'ORGANICO' }, lucas.id);
    await gerente('PATCH', `/clientes/${o.cliente.id}`, { aceiteMensagens: true });
    const v = await gerente('POST', `/oportunidades/${o.id}/venda-direta`, { itens: [{ descricao: 'Regata Running G', quantidade: 1, precoTabela: 89.9, preco: 89.9 }], formaPagamento: 'DINHEIRO', cpf: cpfFicticio(n) });
    await socio('POST', `/vendas-diretas/${v.id}/confirmar`, {});
    antigos.push({ venda: v.id, dias });
  }

  // Custos do mês (Sócios) e um Daily já encerrado, com ata e decisões (etapa 6)
  const mesDemo = hoje().slice(0, 7);
  await socio('POST', '/custos', { competencia: mesDemo, categoria: 'PRODUCAO', descricao: 'Lote de regatas e camisetas', valor: 380 });
  await socio('POST', '/custos', { competencia: mesDemo, categoria: 'FERRAMENTAS', descricao: 'Sistema de e-mail e domínio', valor: 59.9 });
  const daily = await gerente('POST', '/reunioes', { modo: 'GESTAO' });
  await gerente('POST', `/reunioes/${daily.id}/tratados`, { bloco: 'GESTAO', item: 'Vendas diretas a confirmar' });
  await gerente('POST', `/reunioes/${daily.id}/decisoes`, { bloco: 'VENDEDORES', texto: 'Ligar para os links enviados sem compra', responsavelId: ana.id, prazo: hoje(1) });
  await gerente('POST', `/reunioes/${daily.id}/decisoes`, { bloco: 'CLIENTES', texto: 'Chamar de volta os clientes em risco', responsavelId: lucas.id, prazo: hoje(2) });
  await gerente('POST', `/reunioes/${daily.id}/encerrar`, { pulados: ['TRAFEGO', 'SOCIAL'], numeros: [{ bloco: 'RESULTADO', linhas: [{ rotulo: 'Vendas de ontem', valor: '2' }] }] });

  // Recuperação
  const helena = await lead('Helena Duarte', { canal: 'INSTAGRAM', origem: 'INFLUENCIADOR', origemDetalhe: 'Cupom de influenciadora', interesse: 'Jaqueta Training', tamanho: 'P' }, lucas.id);
  await responder(helena); await avancar(helena); await avancar(helena);
  await gerente('POST', `/oportunidades/${helena.id}/perder`, { motivo: 'ACHOU_CARO' });
  const igor = await lead('Igor Santana', { origemDetalhe: 'Campanha de lançamento', interesse: 'Bermuda de Compressão' }, ana.id);
  await responder(igor); await avancar(igor);
  await gerente('POST', `/oportunidades/${igor.id}/perder`, { motivo: 'SEM_RESPOSTA' });
  // Perdas que saem do quadro (aparecem só no funil)
  const p1 = await lead('Karina Melo', {}, ana.id); await gerente('POST', `/oportunidades/${p1.id}/perder`, { motivo: 'COMPROU_EM_OUTRO_LUGAR' });
  const p2 = await lead('Contato Errado', {}, lucas.id); await gerente('POST', `/oportunidades/${p2.id}/perder`, { motivo: 'NAO_ERA_CLIENTE' });
  // Lembrete
  await vendedora('POST', `/oportunidades/${bruno.id}/lembretes`, { titulo: 'Mandar a tabela de medidas', prazo: new Date(Date.now() + 3 * 3_600_000).toISOString() });

  // Ajustes de data direto no banco de demonstração: um lead parado e um follow atrasado.
  const banco = new pg.Client({ connectionString: BANCO });
  await banco.connect();
  await banco.query(`UPDATE oportunidade SET entrou_na_etapa_em = now() - interval '3 days' WHERE id = $1`, [bruno.id]);
  await semearTrafego(banco);
  await banco.query(`UPDATE historico_etapa SET entrou_em = now() - interval '3 days' WHERE oportunidade_id = $1 AND saiu_em IS NULL`, [bruno.id]);
  await banco.query(`UPDATE atividade SET prazo = now() - interval '5 hours' WHERE oportunidade_id = $1 AND tipo = 'FOLLOW'`, [diego.id]);
  await banco.query(`UPDATE atividade SET prazo = now() + interval '2 hours' WHERE oportunidade_id = $1 AND tipo = 'FOLLOW'`, [helena.id]);
  // Compras antigas: só a data da compra recua (os ganhos ficam fora do mês, como seria de verdade).
  for (const { venda, dias } of antigos) {
    await banco.query(`UPDATE venda_direta SET decidida_em = decidida_em - make_interval(days => $2), criado_em = criado_em - make_interval(days => $2) WHERE id = $1`, [venda, dias]);
    await banco.query(`UPDATE ganho SET criado_em = criado_em - make_interval(days => $2), liberar_em = liberar_em - make_interval(days => $2),
      competencia = to_char((criado_em - make_interval(days => $2)) AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') WHERE venda_direta_id = $1`, [venda, dias]);
    await banco.query(`UPDATE atividade SET status = 'CANCELADA' WHERE sequencia = 'POS_COMPRA' AND referencia = $1`, [venda]);
  }
  // Vendas com cupom em dias diferentes (sempre dentro do mês em andamento).
  for (const { venda, diasAtras } of comCupom) {
    const dias = Math.min(diasAtras, Number(hoje().slice(8)) - 1);
    if (!dias) continue;
    await banco.query(`UPDATE venda_direta SET decidida_em = decidida_em - make_interval(days => $2), criado_em = criado_em - make_interval(days => $2) WHERE id = $1`, [venda, dias]);
    await banco.query(`UPDATE ganho SET criado_em = criado_em - make_interval(days => $2), liberar_em = liberar_em - make_interval(days => $2) WHERE venda_direta_id = $1`, [venda, dias]);
  }
  await banco.end();
  console.log('Dados fictícios criados.');
}

/* Conta de anúncios fictícia (só na demonstração): a estrutura, 45 dias de números por anúncio e os recortes de público,
   no mesmo formato que a sincronização com a Meta grava. O token é fictício e não vale na Meta. */
async function semearTrafego(banco) {
  const { createCipheriv, createHash, randomBytes } = await import('node:crypto');
  const chave = readFileSync(join(AQUI, '..', 'apps', 'api', '.env'), 'utf8').match(/META_CHAVE="?([^"\n]+)/)?.[1];
  if (chave) {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', createHash('sha256').update(chave).digest(), iv);
    const dados = Buffer.concat([c.update('EAAtokenFicticioDaDemonstracao0000DEMO', 'utf8'), c.final()]);
    const cifrado = [iv, c.getAuthTag(), dados].map((b) => b.toString('base64')).join('.');
    const { rows: [socio] } = await banco.query(`SELECT id FROM usuario WHERE email = 'socio@avulte.teste'`);
    const diag = [{ item: 'Token', ok: true, detalhe: 'Válido, de Usuário do sistema (demonstração).' }, { item: 'Permissões', ok: true, detalhe: 'Pode ler os anúncios (ads_read).' },
      { item: 'Conta de anúncios', ok: true, detalhe: 'Avulte Wear (demonstração): ativa, em BRL.' }];
    await banco.query(`INSERT INTO meta_conexao (conta_id, conta_nome, moeda, fuso, token_cifrado, conectada_por, ultimo_diagnostico, diagnosticada_em, sincronizada_em, historico_ate)
      VALUES ('act_000000000001', 'Avulte Wear (demonstração)', 'BRL', 'America/Sao_Paulo', $1, $2, $3, now(), now(), current_date - 89)`, [cifrado, socio.id, JSON.stringify(diag)]);
  }
  await banco.query(`INSERT INTO anuncio_campanha (id, nome, objetivo, status, orcamento_diario) VALUES
    ('120000001', 'Conversas WhatsApp · Coleção Running', 'OUTCOME_ENGAGEMENT', 'ACTIVE', 60),
    ('120000002', 'Remarketing · Instagram', 'OUTCOME_ENGAGEMENT', 'ACTIVE', NULL)`);
  await banco.query(`INSERT INTO anuncio_conjunto (id, campanha_id, nome, status, otimizacao, orcamento_diario, fase_aprendizado, publico) VALUES
    ('230000001', '120000001', 'Mulheres 25-34 · São Paulo', 'ACTIVE', 'CONVERSATIONS', NULL, 'SUCCESS', '{"idadeMin":25,"idadeMax":34,"generos":[2],"locais":["São Paulo"],"interesses":["Corrida","Academia"],"advantage":false}'),
    ('230000002', '120000001', 'Aberto Brasil · Advantage+', 'ACTIVE', 'CONVERSATIONS', NULL, 'LEARNING', '{"locais":["BR"],"interesses":[],"advantage":true}'),
    ('230000003', '120000002', 'Engajou no Instagram (30 dias)', 'ACTIVE', 'CONVERSATIONS', 25, 'FAIL', '{"idadeMin":18,"idadeMax":45,"interesses":[],"advantage":false}')`);
  const anuncios = [
    { id: '340000001', conj: '230000001', nome: 'Regata preta · vídeo', titulo: 'A regata que não marca no treino', formato: 'VIDEO', base: 22, cpm: 19, ctr: 1.6, conv: 0.22, q: 'ABOVE_AVERAGE' },
    { id: '340000002', conj: '230000001', nome: 'Short dupla camada · foto', titulo: 'Short dupla camada', formato: 'IMAGEM', base: 12, cpm: 21, ctr: 1.1, conv: 0.16, q: 'AVERAGE' },
    { id: '340000003', conj: '230000002', nome: 'Kit corrida · carrossel', titulo: 'Kit corrida completo', formato: 'CARROSSEL', base: 14, cpm: 16, ctr: 0.9, conv: 0.12, q: 'AVERAGE' },
    { id: '340000004', conj: '230000002', nome: 'Camiseta técnica · vídeo', titulo: 'Camiseta que seca rápido', formato: 'VIDEO', base: 10, cpm: 17, ctr: 1.3, conv: 0.19, q: 'AVERAGE' },
    { id: '340000005', conj: '230000003', nome: 'Depoimento cliente · vídeo', titulo: 'O que dizem de quem treina com a Avulte', formato: 'VIDEO', base: 9, cpm: 28, ctr: 0.6, conv: 0.08, q: 'BELOW_AVERAGE_20' },
  ];
  for (const a of anuncios) {
    await banco.query(`INSERT INTO anuncio (id, conjunto_id, nome, titulo, status, formato, ranking_qualidade, ranking_engajamento, ranking_conversao)
      VALUES ($1, $2, $3, $4, 'ACTIVE', $5, $6, 'AVERAGE', $7)`, [a.id, a.conj, a.nome, a.titulo, a.formato, a.q, a.q === 'ABOVE_AVERAGE' ? 'ABOVE_AVERAGE' : 'AVERAGE']);
  }
  const ruido = (n) => { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x); };
  for (let d = 44; d >= 0; d -= 1) {
    const { rows: [{ dia, semana }] } = await banco.query(`SELECT to_char(current_date - $1::int, 'YYYY-MM-DD') AS dia, extract(dow FROM current_date - $1::int)::int AS semana`, [d]);
    const fimDeSemana = semana === 0 || semana === 6 ? 0.75 : 1;
    let tot = { inv: 0, imp: 0, cli: 0, conv: 0 };
    for (const [k, a] of anuncios.entries()) {
      const r = ruido(d * 7 + k);
      const inv = Math.round(a.base * (0.8 + 0.4 * r) * fimDeSemana * 100) / 100;
      const imp = Math.round((inv / a.cpm) * 1000);
      const cli = Math.round(imp * (a.ctr / 100) * (0.85 + 0.3 * ruido(d * 11 + k)));
      const conv = Math.round(cli * a.conv);
      const video = a.formato === 'VIDEO' ? Math.round(imp * 0.35) : null;
      await banco.query(`INSERT INTO anuncio_dia (anuncio_id, dia, investimento, impressoes, alcance, cliques_link, conversas, conversas_profundas, video_plays, video_p25, video_p50, video_p75, video_p100)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [a.id, dia, inv, imp, Math.round(imp / 1.25), cli, conv, Math.round(conv * 0.55), video, video && Math.round(video * 0.52), video && Math.round(video * 0.3), video && Math.round(video * 0.17), video && Math.round(video * 0.08)]);
      tot = { inv: tot.inv + inv, imp: tot.imp + imp, cli: tot.cli + cli, conv: tot.conv + conv };
    }
    const recortes = {
      IDADE_GENERO: [['18-24|female', 0.14, 0.12], ['25-34|female', 0.38, 0.5], ['35-44|female', 0.12, 0.1], ['25-34|male', 0.2, 0.18], ['35-44|male', 0.16, 0.1]],
      REGIAO: [['São Paulo', 0.52, 0.62], ['Rio de Janeiro', 0.18, 0.16], ['Minas Gerais', 0.14, 0.12], ['Bahia', 0.16, 0.1]],
      POSICIONAMENTO: [['instagram|story', 0.42, 0.5], ['instagram|feed', 0.3, 0.32], ['instagram|reels', 0.18, 0.14], ['facebook|feed', 0.1, 0.04]],
      DISPOSITIVO: [['mobile_app', 0.93, 0.97], ['desktop', 0.07, 0.03]],
      HORARIO: [['07', 0.08, 0.06], ['12', 0.16, 0.14], ['18', 0.18, 0.18], ['20', 0.3, 0.38], ['22', 0.28, 0.24]],
    };
    for (const [dimensao, linhas] of Object.entries(recortes)) {
      for (const [chave, pInv, pRes] of linhas) {
        await banco.query(`INSERT INTO anuncio_publico_dia (dia, dimensao, chave, investimento, impressoes, cliques_link, conversas) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [dia, dimensao, chave, Math.round(tot.inv * pInv * 100) / 100, Math.round(tot.imp * pInv), Math.round(tot.cli * pRes), Math.round(tot.conv * pRes)]);
      }
    }
  }
  // Os leads de anúncio ganham o anúncio de origem (um fica sem, para a checagem aparecer).
  const { rows: leads } = await banco.query(`SELECT id FROM oportunidade WHERE origem = 'ANUNCIO' ORDER BY criado_em`);
  for (const [i, l] of leads.slice(1).entries()) {
    const a = anuncios[i % 4];
    const { rows: [s] } = await banco.query(`SELECT campanha_id FROM anuncio_conjunto WHERE id = $1`, [a.conj]);
    await banco.query(`UPDATE oportunidade SET anuncio_id = $1, conjunto_id = $2, campanha_id = $3, anuncio_titulo = $4 WHERE id = $5`, [a.id, a.conj, s.campanha_id, a.titulo, l.id]);
  }
}

// ------------------------------------------------------------------ 2. Retratos das telas
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

/** Grava no HTML o que está nos campos (valor digitado, opção escolhida), para o retrato sair fiel. */
const fixarCampos = (pagina) => pagina.evaluate(() => {
  document.querySelectorAll('input').forEach((i) => {
    if (i.type === 'checkbox' || i.type === 'radio') { if (i.checked) i.setAttribute('checked', ''); else i.removeAttribute('checked'); }
    else if (i.type !== 'password') i.setAttribute('value', i.value);
  });
  document.querySelectorAll('textarea').forEach((t) => { t.textContent = t.value; });
  document.querySelectorAll('select').forEach((s) => [...s.options].forEach((o) => { if (o.selected) o.setAttribute('selected', ''); else o.removeAttribute('selected'); }));
});
async function retratoDoCorpo(pagina) {
  await fixarCampos(pagina);
  return pagina.evaluate(() => {
    const copia = document.body.cloneNode(true);
    copia.querySelectorAll('script, next-route-announcer, template, [data-teste="aviso"]').forEach((e) => e.remove());
    return copia.innerHTML;
  });
}
async function retratoDe(pagina, seletor) {
  await fixarCampos(pagina);
  return pagina.$eval(seletor, (e) => e.outerHTML);
}
const retratoDoModal = async (pagina) => { await fixarCampos(pagina); return pagina.$eval('.modal', (e) => e.parentElement.outerHTML); };
async function fecharTudo(pagina) {
  for (let i = 0; i < 3; i++) {
    if (!(await pagina.$('.modal, .painel-lateral'))) return;
    await pagina.keyboard.press('Escape'); await pausa(150);
  }
}

/** Sobrepostos (painéis e modais) de cada tela. A chave é o que o clique na demonstração procura. */
const EXTRAS = {
  '/atendimento': async (pagina, sobre) => {
    const nomes = await pagina.$$eval('[data-teste="card"]', (cs) => cs.map((c) => c.dataset.nome));
    for (const nome of nomes) {
      await pagina.click(`[data-teste="card"][data-nome="${nome}"]`);
      await pagina.waitForSelector('[data-teste="painel-lead"] [data-teste="etapa-atual"]');
      sobre[`lead:${nome}`] = await retratoDe(pagina, '[data-teste="painel-lead"]');
      await fecharTudo(pagina);
    }
    await pagina.click('[data-teste="novo-lead"]');
    await pagina.waitForSelector('[data-teste="salvar-lead"]');
    sobre['modal:novo-lead'] = await retratoDoModal(pagina);
    await fecharTudo(pagina);
    const aberto = await pagina.$eval('[data-teste="coluna-LEAD"] [data-teste="card"]', (c) => c.dataset.nome).catch(() => null);
    for (const acao of ['perdido', 'link', 'venda']) {
      if (!aberto) break;
      await pagina.click(`[data-teste="card"][data-nome="${aberto}"]`);
      await pagina.waitForSelector(`[data-teste="acao-${acao}"]`);
      await pagina.click(`[data-teste="acao-${acao}"]`);
      await pagina.waitForSelector('.modal');
      sobre[`modal:${acao}`] = await retratoDoModal(pagina);
      await fecharTudo(pagina);
    }
  },
  '/metas': async (pagina, sobre) => {
    const chaves = await pagina.$$eval('[data-teste^="editar-"]', (bs) => bs.map((b) => b.dataset.teste.replace('editar-', '')));
    for (const chave of chaves) {
      await pagina.click(`[data-teste="editar-${chave}"]`);
      await pagina.waitForSelector('[data-teste="salvar-parametro"]');
      sobre[`modal:meta:${chave}`] = await retratoDoModal(pagina);
      await fecharTudo(pagina);
      await pagina.click(`[data-teste="historico-${chave}"]`);
      await pagina.waitForFunction(() => { const p = document.querySelector('[data-teste="painel-historico"]'); return p && !p.textContent.includes('Carregando'); });
      sobre[`painel:meta:${chave}`] = await retratoDe(pagina, '[data-teste="painel-historico"]');
      await fecharTudo(pagina);
    }
  },
  '/equipe': async (pagina, sobre) => {
    await pagina.click('[data-teste="adicionar-pessoa"]');
    await pagina.waitForSelector('[data-teste="salvar-pessoa"]');
    sobre['modal:pessoa-nova'] = await retratoDoModal(pagina);
    await fecharTudo(pagina);
    const emails = await pagina.$$eval('[data-teste^="editar-pessoa-"]', (bs) => bs.map((b) => b.dataset.teste.replace('editar-pessoa-', '')));
    for (const email of emails) {
      await pagina.click(`[data-teste="editar-pessoa-${email}"]`);
      await pagina.waitForSelector('[data-teste="salvar-pessoa"]');
      sobre[`modal:pessoa:${email}`] = await retratoDoModal(pagina);
      await fecharTudo(pagina);
    }
  },
  '/influenciadores': async (pagina, sobre) => {
    await pagina.click('[data-teste="novo-influenciador"]');
    await pagina.waitForSelector('[data-teste="salvar-influenciador"]');
    sobre['modal:influenciador-novo'] = await retratoDoModal(pagina);
    await fecharTudo(pagina);
    const nomes = await pagina.$$eval('[data-teste="influenciador"]', (cs) => cs.map((c) => c.dataset.nome));
    for (const nome of nomes) {
      const dentro = `[data-teste="influenciador"][data-nome="${nome}"]`;
      for (const [botao, chave] of [['alterar-influenciador', 'influenciador'], ['novo-cupom', 'cupom'], ['editar-cupom', 'cupom-editar'], ['atualizar-posts', 'posts'], ['registrar-peca', 'peca']]) {
        if (!(await pagina.$(`${dentro} [data-teste="${botao}"]`))) continue; // o Gerente não cria cupom
        await pagina.click(`${dentro} [data-teste="${botao}"]`);
        await pagina.waitForSelector('.modal');
        sobre[`modal:${chave}:${nome}`] = await retratoDoModal(pagina);
        await fecharTudo(pagina);
      }
    }
  },
  '/clientes': async (pagina, sobre) => {
    const abrirFicha = async (nome) => {
      await pagina.click(`[data-teste="cliente"][data-nome="${nome}"]`);
      await pagina.waitForFunction((n) => document.querySelector('[data-teste="ficha-cliente"] h2')?.textContent === n, {}, nome);
    };
    const nomes = await pagina.$$eval('[data-teste="cliente"]', (cs) => cs.map((c) => c.dataset.nome));
    for (const nome of nomes) {
      await abrirFicha(nome);
      sobre[`painel:cliente:${nome}`] = await retratoDe(pagina, '[data-teste="ficha-cliente"]');
      await fecharTudo(pagina);
    }
    // Os modais da ficha: um de cada vez, reabrindo a ficha (o Esc fecha a ficha junto).
    for (const [botao, chave, pronto] of [['abrir-troca', 'modal:troca', 'salvar-troca'], ['novo-brinde', 'modal:brinde', 'salvar-brinde']]) {
      await abrirFicha(nomes[0]);
      if (await pagina.$(`[data-teste="ficha-cliente"] [data-teste="${botao}"]`)) {
        await pagina.$eval(`[data-teste="ficha-cliente"] [data-teste="${botao}"]`, (b) => b.click());
        await pagina.waitForSelector(`[data-teste="${pronto}"]`);
        sobre[chave] = await retratoDoModal(pagina);
      }
      await fecharTudo(pagina);
    }
    for (const [botao, chave] of [['receber-troca', 'modal:receber-troca'], ['resolver-troca', 'modal:resolver-troca']]) {
      if (!(await pagina.$(`[data-teste="${botao}"]`))) continue;
      await pagina.click(`[data-teste="${botao}"]`);
      await pagina.waitForSelector('.modal');
      sobre[chave] = await retratoDoModal(pagina);
      await fecharTudo(pagina);
    }
  },
  '/trafego': async (pagina, sobre) => {
    const abas = await pagina.$$eval('[data-teste="publicos"] .abas-seg button', (bs) => bs.map((b) => b.textContent.trim()));
    for (const [i, aba] of abas.entries()) {
      await pagina.$$eval('[data-teste="publicos"] .abas-seg button', (bs, n) => bs[n].click(), i);
      await pausa(150);
      sobre[`troca:publicos:${aba}`] = await retratoDe(pagina, '[data-teste="publicos"]');
    }
    const metricas = await pagina.$$eval('[data-teste="metrica-dia"] option', (os) => os.map((o) => o.value));
    for (const m of metricas) {
      await pagina.select('[data-teste="metrica-dia"]', m);
      await pausa(150);
      sobre[`troca:dia:${m}`] = await retratoDe(pagina, '[data-teste="dia-a-dia"]');
    }
    if (await pagina.$('[data-teste="gasto-manual"]')) {
      await pagina.click('[data-teste="gasto-manual"]');
      await pagina.waitForSelector('[data-teste="salvar-gasto"]');
      sobre['modal:gasto-manual'] = await retratoDoModal(pagina);
      await fecharTudo(pagina);
    }
  },
  '/metricas': async (pagina, sobre) => {
    const ids = await pagina.$$eval('[data-teste^="metrica-"]', (bs) => bs.map((b) => b.dataset.teste.replace('metrica-', '')));
    for (const id of ids) {
      await pagina.click(`[data-teste="metrica-${id}"]`);
      await pagina.waitForSelector('[data-teste="ficha-metrica"]');
      sobre[`ficha:${id}`] = await retratoDe(pagina, '[data-teste="ficha-metrica"]');
      await fecharTudo(pagina);
    }
  },
};

async function capturar() {
  const navegador = await puppeteer.launch({
    executablePath: process.env.CHROME ?? '/usr/bin/google-chrome', headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--no-proxy-server'],
  });
  const demo = { telas: {}, rotas: {}, sobre: {}, inicio: {}, papeis: PAPEIS.map(({ id, nome }) => ({ id, nome })) };
  let css = ''; let classeHtml = ''; let classeCorpo = '';
  try {
    for (const papel of PAPEIS) {
      const contexto = await navegador.createBrowserContext();
      const pagina = await contexto.newPage();
      await pagina.setViewport({ width: 1360, height: 900 });
      await pagina.goto(`${WEB}/login`, { waitUntil: 'networkidle0' });
      if (!demo.telas.entrada) {
        demo.telas.entrada = await retratoDoCorpo(pagina);
        classeHtml = await pagina.evaluate(() => document.documentElement.className);
        classeCorpo = await pagina.evaluate(() => document.body.className);
        const folhas = await pagina.$$eval('link[rel="stylesheet"]', (ls) => ls.map((l) => l.href));
        for (const folha of folhas) css += `${await (await fetch(folha)).text()}\n`;
      }
      await pagina.type('input[name=email]', `${papel.id}@avulte.teste`);
      await pagina.type('input[name=senha]', SENHA);
      await Promise.all([pagina.waitForNavigation({ waitUntil: 'networkidle0' }), pagina.click('button[type=submit]')]);

      const rotas = await pagina.$$eval('[data-teste="menu-item"]', (as) => as.map((a) => a.getAttribute('href')));
      if (papel.id === 'socio') rotas.push('/componentes');
      // Sub-abas do Painel: cada uma vira uma tela da demonstração.
      if (rotas.includes('/painel')) rotas.push('/painel?sub=painel', '/painel?sub=daily', '/painel?sub=daily&modo=EQUIPE');
      demo.rotas[papel.id] = {}; demo.sobre[papel.id] = {};
      for (const rota of rotas) {
        const id = `${papel.id}-${rota.slice(1).replace(/[^a-z0-9]+/g, '-')}`;
        await pagina.goto(`${WEB}${rota}`, { waitUntil: 'networkidle0' });
        demo.telas[id] = await retratoDoCorpo(pagina);
        demo.rotas[papel.id][rota] = id;
        if (EXTRAS[rota]) await EXTRAS[rota](pagina, demo.sobre[papel.id]);
        console.log(`retrato  ${id}`);
      }
      demo.inicio[papel.id] = demo.rotas[papel.id][papel.inicio] ?? Object.values(demo.rotas[papel.id])[0];
      await contexto.close();
    }
  } finally {
    await navegador.close();
  }
  // As fontes vão dentro da página (a demonstração não pode buscar arquivos de fora).
  for (const [trecho, caminho] of [...css.matchAll(/url\((\/_next\/static\/media\/[^)]+\.woff2)\)/g)].map((m) => [m[0], m[1]])) {
    const dados = Buffer.from(await (await fetch(`${WEB}${caminho}`)).arrayBuffer()).toString('base64');
    css = css.split(trecho).join(`url(data:font/woff2;base64,${dados})`);
  }
  return { demo, css, classeHtml, classeCorpo };
}

// ------------------------------------------------------------------ 3. A página da demonstração
function montar({ demo, css, classeHtml, classeCorpo }) {
  const dados = JSON.stringify(demo).replace(/</g, '\\u003c');
  const motor = readFileSync(join(AQUI, 'motor.js'), 'utf8');
  return `<!DOCTYPE html>
<html lang="pt-BR" class="${classeHtml}" data-tema="claro">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Avulte Wear — demonstração do sistema</title>
<style>${css}</style>
<style>
#demo-barra { position: fixed; right: 12px; bottom: 12px; z-index: 200; display: flex; align-items: center; gap: 8px; padding: 6px 8px 6px 12px;
  border-radius: 999px; background: var(--destaque-fundo); color: var(--destaque-texto); box-shadow: var(--sombra); font-size: 12px; max-width: calc(100vw - 24px); }
#demo-barra select { height: 26px; border-radius: 999px; border: 0; padding: 0 8px; font: inherit; background: var(--fundo); color: var(--tinta-1); }
#demo-barra b { font-weight: 600; white-space: nowrap; }
#demo-aviso { position: fixed; left: 12px; right: 12px; bottom: 60px; z-index: 210; margin: 0 auto; width: fit-content; max-width: min(520px, calc(100vw - 24px));
  padding: 10px 14px; border-radius: 10px; background: var(--destaque-fundo); color: var(--destaque-texto); box-shadow: var(--sombra); font-size: 13px; }
#demo-aviso[hidden] { display: none; }
@media (max-width: 520px) { #demo-barra b span { display: none; } }
</style>
</head>
<body class="${classeCorpo}">
<div id="demo-palco"></div>
<div id="demo-barra"><b>Demonstração<span> · dados fictícios</span></b><label>Ver como <select id="demo-papel" aria-label="Ver como"></select></label></div>
<div id="demo-aviso" role="status" hidden></div>
<script>window.DEMO = ${dados};</script>
<script>${motor}</script>
</body>
</html>
`;
}

await semearDemo();
const resultado = await capturar();
mkdirSync(join(AQUI, 'saida'), { recursive: true });
const pagina = montar(resultado);
writeFileSync(join(AQUI, 'saida', 'index.html'), pagina);
console.log(`\n${Object.keys(resultado.demo.telas).length} telas, ${Object.values(resultado.demo.sobre).reduce((s, o) => s + Object.keys(o).length, 0)} painéis e modais, ${(pagina.length / 1024).toFixed(0)} KB → demo/saida/index.html`);
