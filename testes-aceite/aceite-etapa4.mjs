// Teste de aceite da etapa 4 (Clientes, pós-venda e recompra), num navegador de verdade.
// Pré-requisitos: API em :4000, web em :3000 e o banco recém-criado pelo `npm run semear`
// Roda DEPOIS do aceite da etapa 5, no mesmo banco: usa os clientes Carla Teste e Diego Teste criados lá.
// Todos os dados são fictícios; os CPFs são números de teste com dígitos válidos.
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
    body: JSON.stringify({ valor: v, justificativa: 'Valor fictício do teste de aceite da etapa 4' }),
  });
  return r.status;
}, chave, valor);

const card = (nome) => `[data-teste="card"][data-nome="${nome}"]`;
async function novoLead(pagina, nome, telefone) {
  await pagina.click('[data-teste="novo-lead"]');
  await pagina.waitForSelector('[data-teste="salvar-lead"]');
  await pagina.type('.modal input[name=nome]', nome);
  await pagina.type('.modal input[name=telefone]', telefone);
  await pagina.select('.modal select[name=origem]', 'INDICACAO');
  await pagina.click('[data-teste="salvar-lead"]');
  await pagina.waitForSelector('[data-teste="salvar-lead"]', { hidden: true, timeout: 6000 });
  await pagina.waitForSelector(card(nome), { timeout: 6000 });
}
async function abrirVenda(pagina, nome) {
  await pagina.click(card(nome));
  await pagina.waitForSelector('[data-teste="painel-lead"] [data-teste="acao-venda"]', { timeout: 6000 });
  await pagina.click('[data-teste="acao-venda"]');
  await pagina.waitForSelector('[data-teste="salvar-venda"]');
}
async function preencher(pagina, seletor, valor) {
  await pagina.focus(seletor);
  await pagina.$eval(seletor, (campo) => campo.select());
  await pagina.keyboard.press('Backspace');
  if (valor) await pagina.type(seletor, valor);
}
const erroDoModal = (pagina, trecho) => esperarTexto(pagina, '.modal [data-teste="erro-formulario"]', trecho);


/** CPF fictício com dígitos verificadores válidos. */
function cpfFicticio(n) {
  const base = String(400000000 + n * 7919).slice(0, 9).split('').map(Number);
  const digito = (ds) => { const r = (ds.reduce((s, d, i) => s + d * (ds.length + 1 - i), 0) * 10) % 11; return r === 10 ? 0 : r; };
  const d1 = digito(base);
  return [...base, d1, digito([...base, d1])].join('');
}
const linha = (nome) => `[data-teste="cliente"][data-nome="${nome}"]`;
const daLinha = (pagina, nome) => texto(pagina, linha(nome));
async function abrirFicha(pagina, nome) {
  await pagina.click(linha(nome));
  await pagina.waitForFunction((n) => document.querySelector('[data-teste="ficha-cliente"] h2')?.textContent === n, { timeout: 6000 }, nome);
}
async function vender(pagina, nome, telefone, peca, valor, extra = {}) {
  await ir(pagina, '/atendimento');
  // O cliente que volta já tem um card em Venda: espero o card novo aparecer antes de abrir.
  const antes = (await pagina.$$(card(nome))).length;
  await novoLead(pagina, nome, telefone);
  await pagina.waitForFunction((s, q) => document.querySelectorAll(s).length === q + 1, { timeout: 6000 }, card(nome), antes);
  // Abre o card novo, na coluna Lead (o antigo continua em Venda).
  await pagina.$eval(`[data-teste="coluna-LEAD"] ${card(nome)}`, (c) => { c.scrollIntoView({ block: 'center' }); c.click(); });
  await pagina.waitForSelector('[data-teste="painel-lead"] [data-teste="acao-venda"]', { timeout: 6000 });
  await pagina.click('[data-teste="acao-venda"]');
  await pagina.waitForSelector('[data-teste="salvar-venda"]');
  await pagina.type('[data-teste="item-descricao"]', peca);
  await pagina.type('[data-teste="item-tabela"]', valor);
  await pagina.type('[data-teste="item-preco"]', valor);
  if (extra.cpf) await pagina.type('.modal input[name=cpf]', extra.cpf);
  if (extra.indicacao) await pagina.type('[data-teste="indicacao-venda"]', extra.indicacao);
  await pagina.click('[data-teste="salvar-venda"]');
  return extra.esperaErro ? erroDoModal(pagina, extra.esperaErro) : fechouModal(pagina);
}
async function confirmarTudo(pagina) {
  await ir(pagina, '/financeiro');
  for (;;) {
    const quantas = (await pagina.$$('[data-teste="confirmar-venda"]')).length;
    if (!quantas) break;
    await pagina.click('[data-teste="confirmar-venda"]');
    await pagina.waitForFunction((q) => document.querySelectorAll('[data-teste="confirmar-venda"]').length === q - 1, { timeout: 6000 }, quantas);
  }
}
const resumo = '[data-teste="resumo-financeiro"]';

try {
  const { contexto: cSocio, pagina: socio } = await abrir();
  await entrar(socio, 'socio');
  const { contexto: cVend, pagina: vend } = await abrir();
  await entrar(vend, 'vendedor');

  // ---------- Lista, segmentos e ficha
  await ir(vend, '/clientes');
  registrar('Quem já comprou aparece em Clientes como Novo, com 1 compra', (await daLinha(vend, 'Carla Teste')).includes('Novo') && (await daLinha(vend, 'Diego Teste')).includes('Novo'));
  registrar('Sem limites em Metas, a tela avisa quais segmentos ainda não aparecem', (await texto(vend, '[data-teste="sem-limites"]')).includes('Em risco, Inativo, VIP'));
  registrar('O "Agora" mostra clientes ativos e taxa de recompra; em risco fica "—" sem o limite',
    (await cartao(vend, 'Clientes ativos')) !== '' && (await cartao(vend, 'Taxa de recompra')).endsWith('%') && (await cartao(vend, 'Clientes em risco')) === '—');

  await abrirFicha(vend, 'Diego Teste');
  const cpf = await texto(vend, '[data-teste="cpf-mascarado"]');
  registrar('Na ficha, o CPF aparece mascarado', /^\*\*\*\.\*\*\*\.\*\*\*-\d{2}$/.test(cpf) && !(await vend.content()).includes('12345678909'), cpf);
  await vend.click('[data-teste="aceite-mensagens"]');
  registrar('O vendedor registra na ficha que o cliente aceitou receber mensagens', await esperarTexto(vend, '[data-teste="aviso-clientes"]', 'Aceite registrado'));
  await vend.click('[data-teste="etiqueta-CORRE"]');
  await esperarTexto(vend, '[data-teste="aviso-clientes"]', 'Etiquetas atualizadas');
  await vend.keyboard.press('Escape');
  registrar('A etiqueta de comunidade "Corre" aparece na lista e vira filtro', (await daLinha(vend, 'Diego Teste')).includes('Corre') && (await vend.$('[data-filtro="E:CORRE"]')) !== null);
  await abrirFicha(vend, 'Carla Teste');
  const codigo = await texto(vend, '[data-teste="codigo-indicacao"]');
  registrar('Cada cliente tem o seu código de indicação', /^AV[A-Z2-9]{5}$/.test(codigo), codigo);
  await foto(vend, '40-clientes-ficha');

  // ---------- Recompra, indicação e sequência
  const compra2 = await vender(vend, 'Carla Teste', '(11) 96666-0001', 'Short Treino M', '100');
  const semErro = await vender(vend, 'Elisa Teste', '(11) 96666-0003', 'Regata Running P', '90', { cpf: cpfFicticio(1), indicacao: 'AVXXXXX', esperaErro: 'Código de indicação não encontrado' });
  registrar('Código de indicação que não existe é recusado', semErro);
  await preencher(vend, '[data-teste="indicacao-venda"]', codigo.toLowerCase());
  await vend.click('[data-teste="salvar-venda"]');
  const comIndicacao = await fechouModal(vend);
  const compraDiego = await vender(vend, 'Diego Teste', '(11) 96666-0002', 'Camiseta Técnica G', '120');
  registrar('O vendedor lança a segunda compra da Carla, a compra indicada da Elisa e a segunda do Diego', compra2 && comIndicacao && compraDiego);
  await ir(socio, '/financeiro');
  const proLaboreAntesDeConfirmar = await cartao(socio, 'Pró-labore do mês', resumo);
  await confirmarTudo(socio);

  await ir(vend, '/clientes');
  const carla = await daLinha(vend, 'Carla Teste');
  registrar('Cliente com duas compras vira Recorrente', carla.includes('Recorrente') && carla.includes('R$ 280,00'), carla.slice(0, 80));
  registrar('A cliente nova (Elisa) entra como Novo', (await daLinha(vend, 'Elisa Teste')).includes('Novo'));
  await abrirFicha(vend, 'Carla Teste');
  const indicacoes = await texto(vend, '[data-teste="indicacoes-cliente"]');
  registrar('Venda com código de indicação aparece na ficha de quem indicou', indicacoes.includes('Elisa comprou') && indicacoes.includes('R$ 90,00'), indicacoes.slice(0, 80));
  await vend.keyboard.press('Escape');

  await ir(vend, '/atendimento');
  const tarefas = await vend.$$eval('[data-teste="tarefa"]', (ts) => ts.map((t) => t.textContent.replace(/\s+/g, ' ')));
  const doDiego = tarefas.find((t) => t.includes('Pós-compra') && t.includes('Diego Teste'));
  registrar('Quem aceitou mensagens ganha a tarefa de pós-compra, com a mensagem pronta e o botão do WhatsApp',
    Boolean(doDiego) && doDiego.includes('Oi, Diego') && doDiego.includes('Abrir WhatsApp'), (doDiego ?? '').slice(0, 90));
  registrar('Quem não aceitou mensagens não entra em sequência (Carla e Elisa)', !tarefas.some((t) => t.includes('Pós-compra') && (t.includes('Carla') || t.includes('Elisa'))));
  await foto(vend, '41-tarefa-pos-compra');

  // ---------- Troca e devolução
  await ir(vend, '/clientes');
  await abrirFicha(vend, 'Carla Teste');
  await vend.click('[data-teste="compras-cliente"] [data-teste="abrir-troca"]');   // a compra mais recente (R$ 100)
  await vend.waitForSelector('[data-teste="salvar-troca"]');
  await vend.click('[data-teste="salvar-troca"]');
  registrar('Troca sem motivo não é aberta', (await vend.$('[data-teste="salvar-troca"]')) !== null);
  const motivos = await vend.$$eval('.modal input[name=motivo]', (ms) => ms.map((m) => m.value));
  registrar('Os motivos são uma lista fechada: tamanho, defeito, não gostou, arrependimento', motivos.join() === 'TAMANHO,DEFEITO,NAO_GOSTOU,ARREPENDIMENTO');
  await vend.click('[data-teste="motivo-ARREPENDIMENTO"]');
  await foto(vend, '42-abrir-troca');
  await vend.click('[data-teste="salvar-troca"]');
  await fechouModal(vend);
  await vend.keyboard.press('Escape');
  registrar('A troca aberta aparece em "Trocas e devoluções em andamento", aguardando a peça',
    await esperarTexto(vend, '[data-teste="troca-aberta"]', 'Carla Teste') && (await texto(vend, '[data-teste="troca-aberta"]')).includes('Aguardando a peça'));
  registrar('O vendedor só solicita: não recebe a peça nem resolve', (await vend.$('[data-teste="receber-troca"]')) === null && (await vend.$('[data-teste="resolver-troca"]')) === null);

  const { contexto: cGer, pagina: ger } = await abrir();
  await entrar(ger, 'gerente');
  await ir(ger, '/clientes');
  registrar('O Gerente vê os clientes de todos, com a coluna do vendedor', (await texto(ger, '[data-teste="lista-clientes"] thead')).includes('Vendedor') && (await daLinha(ger, 'Carla Teste')) !== '');
  await ger.click('[data-teste="receber-troca"]');
  await ger.waitForSelector('[data-teste="estado-bom"]');
  await ger.click('[data-teste="estado-bom"]');
  await fechouModal(ger);
  registrar('O Gerente registra que a peça chegou em bom estado', await esperarTexto(ger, '[data-teste="troca-aberta"]', 'Peça recebida'));
  await ger.click('[data-teste="resolver-troca"]');
  await ger.waitForSelector('[data-teste="resolver-peca"]');
  registrar('Devolver o valor não é opção para o Gerente: é decisão de um Sócio', (await ger.$('[data-teste="resolver-valor"]')) === null && (await texto(ger, '.modal')).includes('confirmada por um Sócio'));
  await ger.keyboard.press('Escape');

  await ir(socio, '/financeiro');
  const proLaboreAntes = await cartao(socio, 'Pró-labore do mês', resumo);
  const daCarlaAntes = await socio.$$eval('[data-teste="comissao"]', (ls) => ls.filter((l) => l.textContent.includes('Carla Teste') && l.textContent.replace(/\s+/g, ' ').includes('de R$ 100,00')).length);
  await ir(socio, '/clientes');
  await socio.click('[data-teste="resolver-troca"]');
  await socio.waitForSelector('[data-teste="resolver-valor"]');
  await foto(socio, '43-resolver-troca');
  await socio.click('[data-teste="resolver-valor"]');
  await fechouModal(socio);
  registrar('O Sócio devolve o valor e a troca sai da lista em andamento', (await socio.$('[data-teste="troca-aberta"]')) === null);
  const carlaDepois = await daLinha(socio, 'Carla Teste');
  registrar('A venda devolvida deixa de contar: a Carla volta a ter 1 compra (Novo)', carlaDepois.includes('Novo') && carlaDepois.includes('R$ 180,00'), carlaDepois.slice(0, 80));
  await ir(socio, '/financeiro');
  const proLaboreDepois = await cartao(socio, 'Pró-labore do mês', resumo);
  const daCarlaDepois = await socio.$$eval('[data-teste="comissao"]', (ls) => ls.filter((l) => l.textContent.includes('Carla Teste') && l.textContent.replace(/\s+/g, ' ').includes('de R$ 100,00')).length);
  const numero = (t) => Number(t.replace(/[^\d,]/g, '').replace(',', '.'));
  registrar('A devolução cancela o pró-labore daquela venda (10% de R$ 100 = R$ 10,00 a menos)',
    Math.abs(numero(proLaboreAntes) - numero(proLaboreDepois) - 10) < 0.005, `${proLaboreAntes} → ${proLaboreDepois}`);
  registrar('A devolução cancela a comissão do vendedor daquela venda', daCarlaAntes === 1 && daCarlaDepois === 0, `${daCarlaAntes} → ${daCarlaDepois}`);
  registrar('As três compras confirmadas tinham gerado R$ 31,00 de pró-labore (10% de R$ 310)', Math.abs(numero(proLaboreAntes) - numero(proLaboreAntesDeConfirmar) - 31) < 0.005, `${proLaboreAntesDeConfirmar} → ${proLaboreAntes}`);
  await ir(socio, '/clientes');
  await abrirFicha(socio, 'Carla Teste');
  registrar('A ficha guarda a compra devolvida e a troca resolvida',
    (await texto(socio, '[data-teste="compras-cliente"]')).includes('Valor devolvido') && (await texto(socio, '[data-teste="trocas-cliente"]')).includes('Resolvida: valor devolvido'));
  await socio.keyboard.press('Escape');

  // ---------- Brindes
  await abrirFicha(ger, 'Diego Teste');
  await ger.click('[data-teste="novo-brinde"]');
  await ger.waitForSelector('[data-teste="salvar-brinde"]');
  registrar('O Gerente registra o brinde sem ver o campo de custo', (await ger.$('.modal input[name=custo]')) === null);
  await ger.type('.modal input[name=descricao]', 'Squeeze Avulte');
  await ger.type('.modal input[name=motivo]', 'Segunda compra');
  await ger.click('[data-teste="salvar-brinde"]');
  await fechouModal(ger);
  registrar('O brinde aparece na ficha: o quê e por quê', (await texto(ger, '[data-teste="brindes-cliente"]')).includes('Squeeze Avulte · Segunda compra'));
  registrar('O vendedor vê os brindes, mas não registra', await (async () => {
    await ir(vend, '/clientes'); await abrirFicha(vend, 'Diego Teste');
    return (await texto(vend, '[data-teste="brindes-cliente"]')).includes('Squeeze Avulte') && (await vend.$('[data-teste="novo-brinde"]')) === null;
  })());
  await abrirFicha(socio, 'Diego Teste');
  registrar('Só o Sócio vê o custo do brinde', (await texto(socio, '[data-teste="brindes-cliente"]')).includes('sem custo informado') && !(await texto(ger, '[data-teste="brindes-cliente"]')).includes('custo'));
  await foto(socio, '44-ficha-socio');

  // ---------- Auditoria e acessos
  await ir(socio, '/auditoria');
  const auditoria = await texto(socio, 'main');
  registrar('A auditoria registra a troca, a devolução, as etiquetas e o brinde', auditoria.includes('troca') && auditoria.includes('resolver') && auditoria.includes('etiquetas') && auditoria.includes('brinde'));
  for (const papel of ['influenciador', 'social', 'trafego']) {
    const { contexto, pagina: pg } = await abrir();
    await entrar(pg, papel);
    await ir(pg, '/clientes');
    registrar(`${papel}: Clientes é barrado`, await barrado(pg));
    await contexto.close();
  }

  // ---------- 390 px
  {
    const { contexto, pagina: pg } = await abrir(390, 844);
    await entrar(pg, 'socio');
    await ir(pg, '/clientes');
    registrar('390 px: Clientes sem rolagem lateral', await semRolagemLateral(pg));
    await foto(pg, '45-celular-clientes');
    await abrirFicha(pg, 'Carla Teste');
    registrar('390 px: ficha do cliente sem rolagem lateral', await semRolagemLateral(pg));
    await pg.click('[data-teste="ficha-cliente"] [data-teste="abrir-troca"]');
    await pg.waitForSelector('[data-teste="salvar-troca"]');
    registrar('390 px: formulário de troca sem rolagem lateral', await semRolagemLateral(pg));
    await foto(pg, '46-celular-troca');
    await contexto.close();
  }
  await cGer.close(); await cVend.close(); await cSocio.close();
} catch (erro) {
  for (const pg of await Promise.all((await navegador.browserContexts()).map((c) => c.pages())).then((ps) => ps.flat())) await pg.screenshot({ path: join(CAPTURAS, `erro-${Date.now()}.png`) }).catch(() => {});
  registrar(`Erro inesperado: ${erro.message}`, false);
} finally {
  await navegador.close();
}

const falhas = resultados.filter((r) => !r.passou);
console.log(`\n${resultados.length - falhas.length} de ${resultados.length} itens passaram.`);
process.exit(falhas.length ? 1 : 0);
