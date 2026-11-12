// Teste de aceite da etapa 1 (Base), num navegador de verdade.
// Pré-requisitos: API em :4000, web em :3000 e as pessoas fictícias do `npm run semear`.
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const AQUI = dirname(fileURLToPath(import.meta.url));
const WEB = process.env.WEB_URL ?? 'http://localhost:3000';
const CAPTURAS = join(AQUI, 'capturas');
const SENHA = process.env.SEMENTE_SENHA
  ?? readFileSync(join(AQUI, '..', 'apps', 'api', '.env'), 'utf8').match(/SEMENTE_SENHA="?([^"\n]+)/)[1];
mkdirSync(CAPTURAS, { recursive: true });

// O que cada papel deve ver no menu. Qualquer outra rota deve dar "sem acesso".
const ROTAS = {
  Painel: '/painel', Atendimento: '/atendimento', Pedidos: '/pedidos', Clientes: '/clientes', Estoque: '/estoque',
  'Tráfego': '/trafego', 'Social Media': '/social', Influenciadores: '/influenciadores', Metas: '/metas',
  Equipe: '/equipe', 'Reuniões': '/reunioes', Financeiro: '/financeiro', 'Métricas': '/metricas',
  Auditoria: '/auditoria', 'Meu espaço': '/meu-espaco',
};
const ESPERADO = {
  socio: ['Painel', 'Atendimento', 'Pedidos', 'Clientes', 'Estoque', 'Tráfego', 'Social Media', 'Influenciadores', 'Metas', 'Equipe', 'Reuniões', 'Financeiro', 'Métricas', 'Auditoria'],
  gerente: ['Painel', 'Atendimento', 'Pedidos', 'Clientes', 'Estoque', 'Social Media', 'Influenciadores', 'Equipe', 'Reuniões', 'Métricas'],
  vendedor: ['Atendimento', 'Pedidos', 'Clientes', 'Estoque', 'Métricas'],
  trafego: ['Tráfego', 'Métricas'],
  social: ['Estoque', 'Social Media', 'Métricas'],
  influenciador: ['Meu espaço'],
};

const resultados = [];
function registrar(item, passou, detalhe = '') {
  resultados.push({ item, passou });
  console.log(`${passou ? 'PASSOU    ' : 'NÃO PASSOU'}  ${item}${detalhe ? `  (${detalhe})` : ''}`);
}

const navegador = await puppeteer.launch({
  executablePath: process.env.CHROME ?? '/usr/bin/google-chrome', headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--no-proxy-server'],
});

async function abrir(largura = 1280, altura = 800) {
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
const menuDe = (pagina) => pagina.$$eval('[data-teste="menu-item"]', (itens) => itens.map((i) => i.textContent.trim()));
const semRolagemLateral = (pagina) => pagina.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const corDeFundo = (pagina) => pagina.evaluate(() => getComputedStyle(document.body).backgroundColor);
const foto = (pagina, nome) => pagina.screenshot({ path: join(CAPTURAS, `${nome}.png`) });

try {
  // ---------- 1. Cada papel vê só o que deve
  {
    const { contexto, pagina } = await abrir();
    await pagina.goto(`${WEB}/painel`, { waitUntil: 'networkidle0' });
    registrar('Sem login, o sistema leva para a tela de entrada', new URL(pagina.url()).pathname === '/login');
    await pagina.type('input[name=email]', 'socio@avulte.teste');
    await pagina.type('input[name=senha]', 'senha-errada');
    await pagina.click('button[type=submit]');
    await pagina.waitForSelector('[data-teste="erro-login"]', { timeout: 5000 }).catch(() => {});
    registrar('Senha errada mostra o erro e não entra', (await pagina.$('[data-teste="erro-login"]')) !== null && new URL(pagina.url()).pathname === '/login');
    await foto(pagina, '01-login');
    await contexto.close();
  }
  for (const [papel, esperado] of Object.entries(ESPERADO)) {
    const { contexto, pagina } = await abrir();
    await entrar(pagina, papel);
    const menu = await menuDe(pagina);
    registrar(`${papel}: o menu mostra exatamente as abas do papel`, JSON.stringify(menu) === JSON.stringify(esperado), menu.join(', '));
    let abre = true; let barra = true; const falhas = [];
    for (const [nome, rota] of Object.entries(ROTAS)) {
      await pagina.goto(`${WEB}${rota}`, { waitUntil: 'networkidle0' });
      const permitido = esperado.includes(nome);
      const viu = (await pagina.$('[data-teste="cabecalho-aba"]')) !== null;
      const negado = (await pagina.$('[data-teste="sem-acesso"]')) !== null;
      if (permitido && !viu) { abre = false; falhas.push(`${rota} não abriu`); }
      if (!permitido && !negado) { barra = false; falhas.push(`${rota} não foi barrada`); }
    }
    registrar(`${papel}: toda aba do papel abre`, abre, falhas.join('; '));
    registrar(`${papel}: toda aba fora do papel é barrada, mesmo pelo endereço`, barra, falhas.join('; '));
    await contexto.close();
  }
  {
    const { contexto, pagina } = await abrir();
    await entrar(pagina, 'gerente');
    await pagina.goto(`${WEB}/equipe`, { waitUntil: 'networkidle0' });
    const texto = await pagina.evaluate(() => document.body.innerText);
    registrar('gerente: a tela Equipe não mostra comissão, teto nem limite de desconto', !/comiss|teto|desconto/i.test(texto));
    await contexto.close();
  }

  // ---------- 2. Claro e escuro funcionam
  {
    const { contexto, pagina } = await abrir();
    await entrar(pagina, 'socio');
    await pagina.goto(`${WEB}/componentes`, { waitUntil: 'networkidle0' });
    await pagina.evaluate(() => { localStorage.setItem('tema', 'claro'); document.documentElement.dataset.tema = 'claro'; });
    registrar('Tema claro: fundo branco (#ffffff)', (await corDeFundo(pagina)) === 'rgb(255, 255, 255)', await corDeFundo(pagina));
    await foto(pagina, '02-componentes-claro');
    await pagina.click('[data-teste="alternar-tema"]');
    registrar('Tema escuro: fundo azul-marinho (#101525)', (await corDeFundo(pagina)) === 'rgb(16, 21, 37)', await corDeFundo(pagina));
    const tinta = await pagina.evaluate(() => getComputedStyle(document.body).color);
    registrar('Tema escuro: texto claro (#f4f5f7)', tinta === 'rgb(244, 245, 247)', tinta);
    await foto(pagina, '03-componentes-escuro');
    await pagina.reload({ waitUntil: 'networkidle0' });
    registrar('O tema escolhido continua depois de recarregar a página', (await corDeFundo(pagina)) === 'rgb(16, 21, 37)');
    await pagina.goto(`${WEB}/metas`, { waitUntil: 'networkidle0' });
    await foto(pagina, '04-metas-escuro');
    await pagina.click('[data-teste="alternar-tema"]');
    registrar('O botão volta para o tema claro', (await corDeFundo(pagina)) === 'rgb(255, 255, 255)');
    await contexto.close();
  }

  // ---------- 3. Nenhuma tela com rolagem lateral em 390 px
  {
    const { contexto, pagina } = await abrir(390, 844);
    await pagina.goto(`${WEB}/login`, { waitUntil: 'networkidle0' });
    registrar('390 px: tela de entrada sem rolagem lateral', await semRolagemLateral(pagina));
    await contexto.close();
  }
  for (const [papel, esperado] of Object.entries(ESPERADO)) {
    const { contexto, pagina } = await abrir(390, 844);
    await entrar(pagina, papel);
    const estouradas = [];
    for (const rota of [...esperado.map((n) => ROTAS[n]), ...(papel === 'socio' ? ['/componentes'] : []), '/financeiro']) {
      await pagina.goto(`${WEB}${rota}`, { waitUntil: 'networkidle0' });
      if (!(await semRolagemLateral(pagina))) estouradas.push(rota);
    }
    registrar(`390 px, ${papel}: nenhuma tela com rolagem lateral`, estouradas.length === 0, estouradas.join(', '));
    if (papel === 'socio') {
      await pagina.goto(`${WEB}/metas`, { waitUntil: 'networkidle0' });
      await foto(pagina, '05-celular-metas');
      await pagina.click('[data-teste="abrir-menu"]');
      await new Promise((r) => setTimeout(r, 400));
      await pagina.waitForSelector('[data-teste="menu-lateral"][data-aberto="true"]', { timeout: 3000 }).catch(() => {});
      const aberto = await pagina.$eval('[data-teste="menu-lateral"]', (m) => m.getBoundingClientRect().left >= 0 && m.dataset.aberto === 'true').catch(() => false);
      registrar('390 px: o menu vira gaveta e abre pelo botão', aberto && (await semRolagemLateral(pagina)));
      await foto(pagina, '06-celular-menu');
    }
    await contexto.close();
  }

  // ---------- 4. As telas da Base funcionam de ponta a ponta (dados fictícios)
  {
    const { contexto, pagina } = await abrir();
    await entrar(pagina, 'socio');
    await pagina.goto(`${WEB}/metas`, { waitUntil: 'networkidle0' });
    await pagina.click('[data-teste="editar-meta_faturamento_mensal"]');
    await pagina.waitForSelector('[data-teste="campo-valor"]');
    await pagina.type('[data-teste="campo-valor"]', '50000');
    await pagina.click('[data-teste="salvar-parametro"]');
    await pagina.waitForSelector('[data-teste="erro-formulario"]', { timeout: 5000 }).catch(() => {});
    registrar('Metas: mudança sem justificativa é recusada na tela', (await pagina.$('[data-teste="erro-formulario"]')) !== null);
    await pagina.type('[data-teste="campo-justificativa"]', `Meta de teste do aceite ${Date.now()}`);
    await pagina.click('[data-teste="salvar-parametro"]');
    await pagina.waitForFunction(() => /50\.000,00/.test(document.querySelector('[data-teste="valor-meta_faturamento_mensal"]')?.textContent ?? ''), { timeout: 8000 }).catch(() => {});
    const valor = await pagina.$eval('[data-teste="valor-meta_faturamento_mensal"]', (e) => e.textContent);
    registrar('Metas: mudança com justificativa aparece na tela em R$', /50\.000,00/.test(valor), valor);
    await pagina.click('[data-teste="historico-meta_faturamento_mensal"]');
    await pagina.waitForSelector('[data-teste="linha-historico"]', { timeout: 5000 }).catch(() => {});
    const hist = await pagina.$$eval('[data-teste="linha-historico"]', (l) => l[0]?.textContent ?? '');
    registrar('Metas: o histórico mostra a justificativa e quem mudou', /Meta de teste do aceite/.test(hist) && /Sócio Fundador/.test(hist));
    await foto(pagina, '07-metas-historico');

    const email = `aceite${Date.now()}@avulte.teste`;
    await pagina.goto(`${WEB}/equipe`, { waitUntil: 'networkidle0' });
    await pagina.click('[data-teste="adicionar-pessoa"]');
    await pagina.waitForSelector('input[name=nome]');
    await pagina.type('input[name=nome]', 'Pessoa do Aceite (teste)');
    await pagina.type('input[name=email]', email);
    await pagina.type('input[name=senha]', 'senha-do-aceite-1');
    await pagina.click('[data-teste="salvar-pessoa"]');
    await pagina.waitForFunction((e) => document.body.innerText.includes(e), { timeout: 8000 }, email).catch(() => {});
    registrar('Equipe: a pessoa cadastrada aparece na lista', (await pagina.evaluate(() => document.body.innerText)).includes(email));
    await foto(pagina, '08-equipe');

    await pagina.goto(`${WEB}/auditoria`, { waitUntil: 'networkidle0' });
    const aud = await pagina.evaluate(() => document.body.innerText);
    registrar('Auditoria: o cadastro e a mudança de meta aparecem com autor', aud.includes(email) && /meta_faturamento_mensal/.test(aud) && /Sócio Fundador/.test(aud));
    await foto(pagina, '09-auditoria');

    await pagina.goto(`${WEB}/metricas`, { waitUntil: 'networkidle0' });
    await pagina.click('[data-teste="metrica-pro_labore"]');
    await pagina.waitForSelector('[data-teste="ficha-metrica"]', { timeout: 5000 }).catch(() => {});
    const ficha = await pagina.$eval('[data-teste="ficha-metrica"]', (e) => e.innerText).catch(() => '');
    registrar('Métricas: clicar numa métrica abre a ficha (definição, fórmula, fonte, faixas)', /Fórmula/.test(ficha) && /Fonte/.test(ficha) && /Faixas/.test(ficha) && /Definição/.test(ficha));
    await foto(pagina, '10-metrica-ficha');

    await pagina.keyboard.press('Escape');
    await pagina.keyboard.down('Control'); await pagina.keyboard.press('k'); await pagina.keyboard.up('Control');
    await pagina.waitForSelector('[data-teste="busca"]', { timeout: 3000 }).catch(() => {});
    await pagina.type('[data-teste="busca"]', 'equi').catch(() => {});
    await Promise.all([pagina.waitForNavigation({ waitUntil: 'networkidle0', timeout: 8000 }).catch(() => {}), pagina.keyboard.press('Enter')]);
    registrar('Busca (Ctrl+K): digitar e dar Enter leva para a aba', new URL(pagina.url()).pathname === '/equipe');

    await pagina.goto(`${WEB}/painel`, { waitUntil: 'networkidle0' });
    await foto(pagina, '11-painel-vazio');
    await Promise.all([pagina.waitForNavigation({ waitUntil: 'networkidle0' }), pagina.click('[data-teste="sair"]')]);
    await pagina.goto(`${WEB}/painel`, { waitUntil: 'networkidle0' });
    registrar('Sair encerra a sessão', new URL(pagina.url()).pathname === '/login');
    await contexto.close();
  }
} catch (erro) {
  registrar(`O teste parou com erro: ${erro.message}`, false);
} finally {
  await navegador.close();
}

const falhas = resultados.filter((r) => !r.passou).length;
console.log(`\n${resultados.length - falhas} de ${resultados.length} itens passaram.`);
process.exit(falhas ? 1 : 0);
