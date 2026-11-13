// Teste de aceite da etapa 6 (Painel, Daily, Reuniões e lucro), num navegador de verdade.
// Pré-requisitos: API em :4000, web em :3000 e o banco recém-criado pelo `npm run semear`
// Roda depois dos aceites das etapas 5 e 4, no mesmo banco (usa as vendas fictícias criadas lá).
// Todos os dados são fictícios; os CPFs são números de teste com dígitos válidos.
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import puppeteer from 'puppeteer-core';

const AQUI = dirname(fileURLToPath(import.meta.url));
const WEB = process.env.WEB_URL ?? 'http://localhost:3000';
const CAPTURAS = join(AQUI, 'capturas');
const SENHA = process.env.SEMENTE_SENHA
  ?? readFileSync(join(AQUI, '..', 'apps', 'api', '.env'), 'utf8').match(/SEMENTE_SENHA="?([^"\n]+)/)[1];
mkdirSync(CAPTURAS, { recursive: true });

const resultados = [];
function registrar(item, passou, detalhe = '') {
  resultados.push({ item, passou });
  console.log(`${passou ? 'PASSOU    ' : 'NÃO PASSOU'}  ${item}${detalhe ? `  (${detalhe})` : ''}`);
}

const navegador = await puppeteer.launch({
  executablePath: process.env.CHROME ?? '/usr/bin/google-chrome', headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--no-proxy-server'],
});
async function abrir(largura = 1360, altura = 900) {
  const contexto = await navegador.createBrowserContext();
  const pagina = await contexto.newPage();
  await pagina.setViewport({ width: largura, height: altura });
  return { contexto, pagina };
}
async function entrar(pagina, papel) {
  await pagina.goto(`${WEB}/login`, { waitUntil: 'networkidle0' });
  await pagina.type('input[name=email]', `${papel}@avulte.teste`);
  await pagina.type('input[name=senha]', SENHA);
  await Promise.all([pagina.waitForNavigation({ waitUntil: 'networkidle0' }), pagina.click('button[type=submit]')]);
}
const ir = (pagina, rota) => pagina.goto(`${WEB}${rota}`, { waitUntil: 'networkidle0' });
const foto = (pagina, nome) => pagina.screenshot({ path: join(CAPTURAS, `${nome}.png`), fullPage: true });
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
// Espaços não separáveis (do formato de moeda) viram espaço comum, para comparar "R$ 36,00".
const limpo = (t) => t.replace(/\s+/g, ' ').trim();
const texto = async (pagina, seletor) => limpo(await pagina.$eval(seletor, (e) => e.textContent).catch(() => ''));
const semRolagemLateral = (pagina) => pagina.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const barrado = async (pagina) => (await pagina.$('[data-teste="sem-acesso"]')) !== null;
const esperarTexto = (pagina, seletor, trecho) =>
  pagina.waitForFunction((s, t) => [...document.querySelectorAll(s)].some((e) => e.textContent.replace(/\s+/g, ' ').includes(t)), { timeout: 6000 }, seletor, trecho)
    .then(() => true).catch(() => false);
/** Valor de um cartão de indicador, achado pelo rótulo. */
const cartao = async (pagina, rotulo, dentro = '') => limpo(await pagina.evaluate((r, d) => {
  const c = [...document.querySelectorAll(`${d} .indicador`)].find((e) => e.querySelector('.rotulo')?.textContent.includes(r));
  return c?.querySelector('.valor')?.textContent ?? '';
}, rotulo, dentro));
const fechouModal = (pagina) => pagina.waitForSelector('.modal', { hidden: true, timeout: 6000 }).then(() => true).catch(() => false);
/** Parâmetro de Metas, gravado pelo Sócio logado (passa pela mesma rota da tela de Metas). */
const definir = (pagina, chave, valor) => pagina.evaluate(async (c, v) => {
  const r = await fetch(`/api/px/parametros/${c}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ valor: v, justificativa: 'Valor fictício do teste de aceite da etapa 6' }),
  });
  return r.status;
}, chave, valor);


const URL_BANCO = readFileSync(join(AQUI, '..', 'apps', 'api', '.env'), 'utf8').match(/DATABASE_URL="?([^"\n]+)/)[1];
const banco = new pg.Client({ connectionString: URL_BANCO });
await banco.connect();
const reais = (t) => Number(String(t).replace(/[^\d,-]/g, '').replace(',', '.'));
const emReais = (v) => `R$ ${v.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
const metrica = (pagina, id) => pagina.$eval(`[data-teste="indicador"][data-metrica="${id}"] .valor`, (e) => e.textContent.replace(/\s+/g, ' ').trim()).catch(() => null);
/** CPF fictício com dígitos verificadores válidos, diferente a cada execução. */
function cpfFicticio() {
  const base = String(600000000 + Math.floor(Math.random() * 99_999_999)).slice(0, 9).split('').map(Number);
  const digito = (ds) => { const r = (ds.reduce((s, d, i) => s + d * (ds.length + 1 - i), 0) * 10) % 11; return r === 10 ? 0 : r; };
  const d1 = digito(base);
  return [...base, d1, digito([...base, d1])].join('');
}
const mesAtual = new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 7);

try {
  const { contexto: cSocio, pagina: socio } = await abrir();
  await entrar(socio, 'socio');

  // ---------- Sub-abas
  await ir(socio, '/painel');
  registrar('O Painel tem as sub-abas Hoje · Daily · Painel, e abre em Hoje', (await socio.$$eval('[data-teste="sub-abas"] a', (as) => as.map((a) => a.textContent))).join() === 'Hoje,Daily,Painel'
    && (await texto(socio, '[data-teste="sub-abas"] a[aria-current="page"]')) === 'Hoje');
  await Promise.all([socio.waitForNavigation({ waitUntil: 'networkidle0' }), socio.click('[data-teste="sub-painel"]')]);
  registrar('A sub-aba escolhida fica na URL (?sub=painel)', socio.url().includes('sub=painel'));

  // ---------- Os números batem com o banco
  const { rows: [r] } = await banco.query(`SELECT coalesce(sum(valor), 0)::numeric AS receita, count(*)::int AS vendas FROM venda_direta
    WHERE situacao = 'CONFIRMADA' AND devolvida_em IS NULL AND decidida_em >= ($1 || '-01T00:00:00-03:00')::timestamptz`, [mesAtual]);
  const { rows: [g] } = await banco.query(`SELECT coalesce(sum(valor) FILTER (WHERE tipo = 'PRO_LABORE'), 0)::numeric AS pl,
    coalesce(sum(valor) FILTER (WHERE tipo <> 'PRO_LABORE'), 0)::numeric AS com FROM ganho
    WHERE situacao <> 'CANCELADA' AND criado_em >= ($1 || '-01T00:00:00-03:00')::timestamptz`, [mesAtual]);
  const receita = await metrica(socio, 'receita');
  registrar('Receita do mês no Painel = soma das vendas confirmadas no banco', reais(receita) === Number(r.receita), `${receita} × ${emReais(Number(r.receita))}`);
  registrar('Ticket médio = receita ÷ vendas do banco', reais(await metrica(socio, 'ticket_medio')) === Math.round((Number(r.receita) / r.vendas) * 100) / 100);
  registrar('Pró-labore e comissão do mês = soma dos ganhos no banco',
    reais(await metrica(socio, 'pro_labore')) === Number(g.pl) && reais(await metrica(socio, 'comissao_mes')) === Number(g.com), `${Number(g.pl)} e ${Number(g.com)}`);
  const lucroAntes = reais(await metrica(socio, 'lucro'));
  registrar('Lucro = receita − comissões − custos do mês', lucroAntes === Math.round((Number(r.receita) - Number(g.com)) * 100) / 100, String(lucroAntes));
  registrar('O lucro avisa o que ainda falta na conta', (await texto(socio, '[data-teste="obs-lucro"]')).includes('custo das peças'));
  registrar('Indicadores de tráfego aparecem com "—" e o aviso da etapa 7', (await metrica(socio, 'roas')) === '—'
    && (await texto(socio, '[data-teste="indicador"][data-metrica="roas"]')).includes('etapa 7'));
  const pagina = await socio.content();
  registrar('Nenhum "−100%" no Painel', !/[−-]100(,0)?%/.test(pagina));
  await foto(socio, '50-painel-graficos');

  // ---------- Início de mês sem dado: "—", nunca −100%
  await Promise.all([socio.waitForNavigation({ waitUntil: 'networkidle0' }), socio.click(`[data-mes="${mesAtual.slice(0, 4)}-01"]`)]).catch(() => {});
  const vazio = await socio.$$eval('[data-teste="indicador"] .variacao b', (bs) => bs.map((b) => b.textContent.trim()));
  registrar('Mês sem vendas: todas as variações são "—" (nunca −100%)', socio.url().includes(`mes=${mesAtual.slice(0, 4)}-01`) && vazio.every((v) => v === '—' || v === ''), vazio.slice(0, 4).join(' '));
  await ir(socio, '/painel?sub=painel');

  // ---------- Gráficos, tabela e jornada
  registrar('Visão anual com o acumulado do ano', reais(await texto(socio, '[data-teste="acumulado-ano"]')) >= Number(r.receita));
  await socio.click('[data-teste="grafico-receita"] [data-teste="ver-tabela"]');
  registrar('Todo gráfico tem "Ver tabela"', await esperarTexto(socio, '[data-teste="grafico-receita"] table', emReais(Number(r.receita))));
  await socio.click('[data-teste="grafico-receita"] [data-teste="ver-tabela"]');
  registrar('Sócio vê os gráficos de pró-labore e de comissões pagas', (await socio.$('[data-teste="grafico-prolabore"]')) !== null && (await socio.$('[data-teste="grafico-comissoes"]')) !== null);
  const etapas = await socio.$$eval('[data-teste="etapa-jornada"]', (es) => es.map((e) => e.dataset.etapa));
  registrar('Jornada com as 6 etapas, na ordem, e o funil em faixa', etapas.join() === 'LEAD,ABORDADO,LEVANTAMENTO,NEGOCIACAO,VENDA,RECUPERACAO'
    && (await socio.$$('[data-teste="faixa-etapa"]')).length === 6);
  registrar('Sócio vê o R$ por etapa (oportunidade, pró-labore e comissão prevista)', (await socio.$$('[data-teste="reais-etapa"]')).length === 6);
  const { rows: [h] } = await banco.query(`SELECT count(DISTINCT h.oportunidade_id)::int AS n FROM historico_etapa h JOIN oportunidade o ON o.id = h.oportunidade_id
    WHERE h.etapa_nova = 'LEAD' AND o.situacao <> 'DESCARTADA' AND h.entrou_em >= ($1 || '-01T00:00:00-03:00')::timestamptz`, [mesAtual]);
  const leadsJornada = Number(await socio.$eval('[data-teste="etapa-jornada"][data-etapa="LEAD"] .volume', (e) => e.textContent));
  registrar('O volume de Lead na jornada bate com a contagem no histórico do banco', leadsJornada === h.n, `${leadsJornada} × ${h.n}`);
  // Metas por etapa: cor e gargalo
  await definir(socio, 'metas_por_etapa', { LEAD: 99, ABORDADO: 10, LEVANTAMENTO: 10, NEGOCIACAO: 10 });
  await ir(socio, '/painel?sub=painel');
  const situacoes = await socio.$$eval('[data-teste="etapa-jornada"]', (es) => es.map((e) => `${e.dataset.etapa}:${e.querySelector('.estado').textContent}`));
  registrar('Com metas por etapa, cada etapa ganha a cor da situação e a mais fora da meta ganha o selo "gargalo"',
    situacoes.includes('ABORDADO:Na meta') && /LEAD:(Atenção|Fora da meta)/.test(situacoes.join()) && (await socio.$$('[data-teste="gargalo"]')).length === 1, situacoes.join(' '));
  await socio.select('[data-teste="filtro-canal"]', 'SITE');
  await socio.waitForFunction(() => location.search.includes('jcanal=SITE'), { timeout: 6000 }).catch(() => {});
  await socio.waitForNetworkIdle().catch(() => {});
  registrar('O filtro de canal da jornada vale só para ela', socio.url().includes('jcanal=SITE') && (await socio.$eval('[data-teste="etapa-jornada"][data-etapa="LEAD"] .volume', (e) => e.textContent)) === '0'
    && reais(await metrica(socio, 'receita')) === Number(r.receita));
  await ir(socio, '/painel?sub=painel');
  await socio.click('[data-teste="painel-detalhado"] summary');
  registrar('O Painel detalhado abre recolhido, com o ranking de influenciadores', await esperarTexto(socio, '[data-teste="painel-detalhado"]', 'Bia Corre'));

  // ---------- Hoje
  await definir(socio, 'frase_motivacional', 'Cada treino conta.');
  await definir(socio, 'meta_faturamento_mensal', 5000);
  const { contexto: cVend, pagina: vend } = await abrir();
  await entrar(vend, 'vendedor');
  const lancou = await vend.evaluate(async (cpf) => {
    const lead = await (await fetch('/api/px/oportunidades', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: 'Gabi Teste', telefone: '(11) 96666-0009', canal: 'WHATSAPP', origem: 'ANUNCIO' }) })).json();
    const v = await fetch(`/api/px/oportunidades/${lead.oportunidade.id}/venda-direta`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itens: [{ descricao: 'Regata Running G', quantidade: 1, precoTabela: 90, preco: 90 }], formaPagamento: 'PIX', cpf }) });
    return v.status;
  }, cpfFicticio());
  await ir(socio, '/painel');
  registrar('Hoje: a frase motivacional no topo', (await texto(socio, '[data-teste="frase"]')).includes('Cada treino conta.'));
  const previsao = await texto(socio, '[data-teste="agora-hoje"]');
  registrar('Hoje: previsão de fechamento contra a meta, pró-labore e decisões aguardando', previsao.includes('meta R$ 5.000,00') && (await texto(socio, '[data-teste="pro-labore-hoje"]')).startsWith('R$'));
  const fila = await socio.$$eval('[data-teste="decisao"]', (ds) => ds.map((d) => d.dataset.tipo));
  registrar('A fila de decisões começa pela venda direta a confirmar', lancou === 201 && fila[0] === 'VENDA_DIRETA' && Number(await texto(socio, '[data-teste="decisoes"]')) === fila.length, fila.join(','));
  await foto(socio, '51-painel-hoje');

  // ---------- Financeiro: custos e lucro
  await ir(socio, '/financeiro');
  const lucroFin = reais(await texto(socio, '[data-teste="lucro"]'));
  await socio.click('[data-teste="novo-custo"]');
  await socio.waitForSelector('[data-teste="salvar-custo"]');
  await socio.select('.modal select[name=categoria]', 'PRODUCAO');
  await socio.type('.modal input[name=descricao]', 'Lote de regatas');
  await socio.type('.modal input[name=valor]', '150');
  await socio.click('[data-teste="salvar-custo"]');
  await fechouModal(socio);
  await esperarTexto(socio, '[data-teste="custo"]', 'Lote de regatas');
  const lucroDepois = reais(await texto(socio, '[data-teste="lucro"]'));
  registrar('Lançar um custo do mês tira o valor do lucro', Math.abs(lucroFin - 150 - lucroDepois) < 0.005, `${lucroFin} → ${lucroDepois}`);
  await socio.click('[data-teste="anular-custo"]');
  await socio.waitForSelector('[data-teste="confirmar-anulacao"]');
  await socio.type('[data-teste="motivo-anulacao"]', 'Lançado no mês errado');
  await socio.click('[data-teste="confirmar-anulacao"]');
  await fechouModal(socio);
  await esperarTexto(socio, '[data-teste="custo"]', 'Anulado');
  registrar('Anular o lançamento devolve o lucro, e ele continua na lista, riscado', reais(await texto(socio, '[data-teste="lucro"]')) === lucroFin && (await texto(socio, '[data-teste="custo"]')).includes('Lançado no mês errado'));
  await foto(socio, '52-financeiro-custos');

  // ---------- Gerente: sem as cifras dos Sócios
  const { contexto: cGer, pagina: ger } = await abrir();
  await entrar(ger, 'gerente');
  await ir(ger, '/painel?sub=painel');
  const idsGerente = await ger.$$eval('[data-teste="indicador"]', (is) => is.map((i) => i.dataset.metrica));
  const htmlGer = await ger.content();
  registrar('O Gerente não vê pró-labore, comissões somadas, gasto, custos nem lucro', ['pro_labore', 'lucro', 'comissao_mes', 'comissoes_pagas', 'gasto_anuncios', 'cac', 'roas'].every((m) => !idsGerente.includes(m))
    && (await ger.$('[data-teste="grafico-prolabore"]')) === null && (await ger.$('[data-teste="grafico-comissoes"]')) === null
    && (await ger.$('[data-teste="reais-etapa"]')) === null && !htmlGer.includes('Pró-labore') && !htmlGer.includes('Lucro'), idsGerente.join(','));
  registrar('O Gerente vê receita, ticket, conversões e a jornada', ['receita', 'ticket_medio', 'conversao_lead_venda'].every((m) => idsGerente.includes(m)) && (await ger.$$('[data-teste="etapa-jornada"]')).length === 6);
  await ir(ger, '/painel');
  const hojeGer = await ger.content();
  registrar('Na sub-aba Hoje, o Gerente não vê pró-labore, lucro nem a fila de comissões', !hojeGer.includes('Pró-labore') && !hojeGer.includes('Lucro') && (await ger.$('[data-tipo="COMISSOES_PAGAR"]')) === null
    && (await ger.$('[data-tipo="VENDA_DIRETA"]')) === null);
  await ir(ger, '/financeiro');
  registrar('O Gerente não entra no Financeiro', await barrado(ger));
  await foto(ger, '53-painel-gerente');

  // ---------- Daily: Decidido vira tarefa e a ata vai para Reuniões
  await ir(ger, '/painel?sub=daily');
  const blocos = await ger.$$eval('[data-teste="bloco-daily"]', (bs) => bs.map((b) => b.dataset.bloco));
  registrar('O Daily tem os 7 blocos na ordem', blocos.join() === 'RESULTADO,ATENDIMENTO,VENDEDORES,TRAFEGO,SOCIAL,CLIENTES,GESTAO');
  await ger.click('[data-teste="comecar-daily"]');
  await ger.waitForSelector('[data-teste="encerrar-daily"]', { timeout: 6000 });
  registrar('Começar o Daily abre a reunião', (await ger.$('[data-teste="daily-aberto"]')) !== null);
  await ger.click('[data-bloco="GESTAO"] [data-teste="tratado"]');
  await ger.waitForSelector('[data-bloco="GESTAO"] .estado.bom', { timeout: 6000 });
  registrar('"Tratado" marca o item do bloco', (await texto(ger, '[data-bloco="GESTAO"]')).includes('Tratado'));
  await ger.click('[data-bloco="SOCIAL"] [data-teste="pular-bloco"]');
  await ger.click('[data-bloco="VENDEDORES"] [data-teste="decidido"]');
  await ger.waitForSelector('[data-teste="salvar-decisao"]');
  await ger.type('[data-teste="texto-decisao"]', 'Ligar para os links enviados sem compra');
  const idAna = await ger.$$eval('[data-teste="responsavel-decisao"] option', (os) => os.find((o) => o.textContent.includes('Vendedora'))?.value);
  await ger.select('[data-teste="responsavel-decisao"]', idAna);
  await foto(ger, '54-daily-decidido');
  await ger.click('[data-teste="salvar-decisao"]');
  await fechouModal(ger);
  registrar('"Decidido" registra a decisão no bloco', await esperarTexto(ger, '[data-bloco="VENDEDORES"] [data-teste="decisao-registrada"]', 'Ligar para os links'));
  await ir(vend, '/atendimento');
  registrar('A decisão vira tarefa da vendedora, no Atendimento', await esperarTexto(vend, '[data-teste="tarefa"]', 'Decidido no Daily (Vendedores): Ligar para os links'));
  await ir(ger, '/painel?sub=daily');
  registrar('Recarregar a página mantém o Daily aberto', (await ger.$('[data-teste="encerrar-daily"]')) !== null);
  await ger.click('[data-bloco="SOCIAL"] [data-teste="pular-bloco"]');
  await Promise.all([ger.waitForNavigation({ waitUntil: 'networkidle0' }), ger.click('[data-teste="encerrar-daily"]')]);
  registrar('Encerrar leva a Reuniões, com a ata', ger.url().endsWith('/reunioes') && (await ger.$$('[data-teste="reuniao"]')).length === 1);
  const ata = await texto(ger, '[data-teste="reuniao"]');
  registrar('A ata mostra a decisão, o responsável, o tratado e o bloco pulado', ata.includes('Ligar para os links') && ata.includes('Vendedora') && ata.includes('Gestão:') && ata.includes('Blocos pulados: Social media'), ata.slice(0, 120));
  await foto(ger, '55-reunioes');
  // A vendedora conclui; a ata mostra a tarefa feita.
  await ir(vend, '/atendimento');
  await vend.evaluate(() => [...document.querySelectorAll('[data-teste="tarefa"]')].find((t) => t.textContent.includes('Decidido no Daily'))
    .querySelector('button.botao.pequeno:not(.fantasma)').click());
  await pausa(800);
  await ir(ger, '/reunioes');
  registrar('Quando a vendedora conclui, a tarefa aparece como Feita em Reuniões', await esperarTexto(ger, '[data-teste="tarefa-reuniao"]', 'Feita'));

  await ir(ger, '/painel?sub=daily&modo=EQUIPE');
  const equipe = await texto(ger, 'main');
  registrar('Modo Equipe: só totais, sem nomes de pessoas', !equipe.includes('Vendedora (teste)') && !equipe.includes('Vendedor Lucas') && equipe.includes('Leads sem resposta agora'));

  // ---------- Quem não entra
  for (const rota of ['/painel', '/reunioes']) {
    await ir(vend, rota);
    registrar(`Vendedor: ${rota} é barrado`, await barrado(vend));
  }

  // ---------- 390 px e modo escuro
  {
    const { contexto, pagina: pg } = await abrir(390, 844);
    await entrar(pg, 'socio');
    for (const rota of ['/painel', '/painel?sub=painel', '/painel?sub=daily', '/reunioes', '/financeiro']) {
      await ir(pg, rota);
      registrar(`390 px: ${rota} sem rolagem lateral`, await semRolagemLateral(pg));
    }
    await ir(pg, '/painel?sub=painel');
    await foto(pg, '56-celular-painel');
    await contexto.close();
  }
  await socio.click('[data-teste="alternar-tema"]');
  await ir(socio, '/painel?sub=painel');
  registrar('Modo escuro: o Painel abre com o tema escuro', (await socio.evaluate(() => document.documentElement.dataset.tema)) === 'escuro');
  await foto(socio, '57-painel-escuro');
  await socio.click('[data-teste="alternar-tema"]');
  await cGer.close(); await cVend.close(); await cSocio.close();
} catch (erro) {
  registrar(`Erro inesperado: ${erro.message}`, false);
} finally {
  await banco.end();
  await navegador.close();
}

const falhas = resultados.filter((r) => !r.passou);
console.log(`\n${resultados.length - falhas.length} de ${resultados.length} itens passaram.`);
process.exit(falhas.length ? 1 : 0);
