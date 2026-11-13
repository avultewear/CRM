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
  for (const [chave, valor] of [['meta_faturamento_mensal', 20000], ['tempo_maximo_etapa_horas', 48], ['recuperacao_tentativas', 3], ['limite_desconto_pct', 10]]) {
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
  await banco.query(`UPDATE historico_etapa SET entrou_em = now() - interval '3 days' WHERE oportunidade_id = $1 AND saiu_em IS NULL`, [bruno.id]);
  await banco.query(`UPDATE atividade SET prazo = now() - interval '5 hours' WHERE oportunidade_id = $1 AND tipo = 'FOLLOW'`, [diego.id]);
  await banco.query(`UPDATE atividade SET prazo = now() + interval '2 hours' WHERE oportunidade_id = $1 AND tipo = 'FOLLOW'`, [helena.id]);
  await banco.end();
  console.log('Dados fictícios criados.');
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
