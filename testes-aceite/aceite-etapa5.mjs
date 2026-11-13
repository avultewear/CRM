// Teste de aceite da etapa 5 (Cupons, comissões e influenciadores), num navegador de verdade.
// Pré-requisitos: API em :4000, web em :3000 e o banco recém-criado pelo `npm run semear`
// (pode rodar depois dos aceites das etapas 1 e 3, no mesmo banco).
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
    body: JSON.stringify({ valor: v, justificativa: 'Valor fictício do teste de aceite da etapa 5' }),
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

try {
  // ---------- Sócio: parâmetros, influenciador, cupom, peça e posts
  const { contexto: cSocio, pagina: socio } = await abrir();
  await entrar(socio, 'socio');
  await ir(socio, '/influenciadores');
  registrar('Sem influenciadores, a tela ensina o primeiro passo', (await texto(socio, '.vazia')).includes('Nenhum influenciador ainda'));

  const gravados = [];
  for (const [chave, valor] of [['prolabore_pct', 10], ['comissao_vendedor_pct', 5], ['comissao_influenciador_pct', 10], ['comissao_influenciador_teto', 25], ['limite_desconto_pct', 5]]) {
    gravados.push(await definir(socio, chave, valor));
  }
  registrar('O Sócio define em Metas o pró-labore, as comissões, o teto e o limite de desconto', gravados.every((s) => s === 200), gravados.join(' '));

  await socio.click('[data-teste="novo-influenciador"]');
  await socio.waitForSelector('[data-teste="salvar-influenciador"]');
  await socio.type('.modal input[name=nome]', 'Bia Corre');
  await socio.type('.modal input[name=arroba]', '@biacorre.teste');
  const acesso = await socio.$$eval('.modal select[name=usuarioId] option', (os) => os.find((o) => o.textContent.includes('influenciador@avulte.teste'))?.value ?? '');
  await socio.select('.modal select[name=usuarioId]', acesso);
  await foto(socio, '30-influenciadores-novo');
  await socio.click('[data-teste="salvar-influenciador"]');
  registrar('O Sócio cadastra o influenciador e liga o cadastro ao login dele',
    await fechouModal(socio) && await esperarTexto(socio, '[data-teste="influenciador"]', 'Acesso: influenciador@avulte.teste'));

  await socio.click('[data-teste="novo-cupom"]');
  await socio.waitForSelector('[data-teste="salvar-cupom"]');
  await socio.type('.modal input[name=codigo]', 'bia 10');
  await socio.type('.modal input[name=descontoPct]', '10');
  await socio.click('[data-teste="salvar-cupom"]');
  registrar('Cupom com espaço no código é recusado', await erroDoModal(socio, 'sem espaço') || (await socio.$('.modal [data-teste="erro-formulario"]')) !== null,
    await texto(socio, '.modal [data-teste="erro-formulario"]'));
  await preencher(socio, '.modal input[name=codigo]', 'bia10');
  await socio.click('[data-teste="salvar-cupom"]');
  registrar('O Sócio cria o cupom BIA10 com 10% de desconto',
    await fechouModal(socio) && await esperarTexto(socio, '[data-teste="cupom"]', 'BIA10') && (await texto(socio, '[data-teste="cupom"]')).includes('10% de desconto'));

  await socio.click('[data-teste="editar-cupom"]');
  await socio.waitForSelector('[data-teste="salvar-cupom"]');
  await socio.$eval('[data-teste="validade-cupom"]', (campo) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(campo, '2099-12-31');
    campo.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await socio.click('[data-teste="salvar-cupom"]');
  registrar('O Sócio edita o cupom e define até quando ele vale',
    await fechouModal(socio) && await esperarTexto(socio, '[data-teste="cupom"]', 'vale até 31/12/2099') && (await texto(socio, '[data-teste="cupom"]')).includes('Ativo'));

  await socio.click('[data-teste="registrar-peca"]');
  await socio.waitForSelector('[data-teste="salvar-peca"]');
  await socio.type('.modal input[name=descricao]', 'Regata Running M preta');
  await socio.type('.modal input[name=custo]', '45');
  await socio.click('[data-teste="salvar-peca"]');
  registrar('A peça enviada fica registrada, com o custo que só os Sócios veem',
    await fechouModal(socio) && await esperarTexto(socio, '[data-teste="influenciador"]', '1× Regata Running M preta') && (await cartao(socio, 'Custo das peças')) === 'R$ 45,00');

  await socio.click('[data-teste="atualizar-posts"]');
  await socio.waitForSelector('[data-teste="salvar-posts"]');
  await preencher(socio, '.modal input[name=combinados]', '4');
  await preencher(socio, '.modal input[name=feitos]', '1');
  await socio.click('[data-teste="salvar-posts"]');
  registrar('Posts combinados × feitos do mês aparecem com o que falta',
    await fechouModal(socio) && await esperarTexto(socio, '[data-teste="posts-feitos"]', '1 de 4') && (await texto(socio, '[data-teste="influenciador"]')).includes('Faltam 3'));

  // ---------- Vendedor: venda direta com cupom
  const { contexto: cVend, pagina: vend } = await abrir();
  await entrar(vend, 'vendedor');
  await ir(vend, '/atendimento');
  registrar('O vendedor vê o cartão "Minha comissão no mês", ainda zerado', (await cartao(vend, 'Minha comissão no mês')) === 'R$ 0,00');

  await novoLead(vend, 'Carla Teste', '(11) 96666-0001');
  await abrirVenda(vend, 'Carla Teste');
  await vend.type('[data-teste="item-descricao"]', 'Regata Running M');
  await vend.type('[data-teste="item-tabela"]', '200');
  await vend.type('[data-teste="item-preco"]', '180');
  await vend.type('.modal input[name=cpf]', '111.444.777-35');
  await vend.click('[data-teste="salvar-venda"]');
  registrar('Sem cupom, 10% de desconto passa do limite do vendedor (5%) e a venda é recusada', await erroDoModal(vend, 'Desconto acima do limite'));
  await vend.type('[data-teste="cupom-venda"]', 'NAOEXISTE');
  await vend.click('[data-teste="salvar-venda"]');
  registrar('Cupom que não existe é recusado', await erroDoModal(vend, 'Cupom inválido'));
  await preencher(vend, '[data-teste="cupom-venda"]', 'bia10');
  await foto(vend, '31-venda-direta-com-cupom');
  await vend.click('[data-teste="salvar-venda"]');
  registrar('Com o cupom BIA10, o desconto de 10% é aceito e a venda é lançada',
    await fechouModal(vend) && await esperarTexto(vend, '[data-teste="venda-direta"]', 'Aguardando confirmação'));
  await vend.keyboard.press('Escape');
  await pausa(200);

  await novoLead(vend, 'Diego Teste', '(11) 96666-0002');
  await abrirVenda(vend, 'Diego Teste');
  await vend.type('[data-teste="item-descricao"]', 'Short Treino G');
  await vend.type('[data-teste="item-tabela"]', '200');
  await vend.type('[data-teste="item-preco"]', '180');
  await vend.type('.modal input[name=cpf]', '123.456.789-09');
  await vend.type('[data-teste="cupom-venda"]', 'BIA10');
  await vend.click('[data-teste="salvar-venda"]');
  await fechouModal(vend);
  await ir(vend, '/atendimento');
  registrar('Venda só lançada ainda não gera comissão', (await cartao(vend, 'Minha comissão no mês')) === 'R$ 0,00');

  // ---------- Sócio: confirma as vendas e acompanha pró-labore e comissões
  await ir(socio, '/financeiro');
  const aConfirmar = await socio.$$eval('[data-teste="venda-aguardando"]', (vs) => vs.map((v) => v.textContent));
  registrar('As duas vendas chegam ao Financeiro com o cupom usado', aConfirmar.length === 2 && aConfirmar.every((v) => v.includes('cupom BIA10')));
  registrar('Sem prazo de troca em Metas, a tela avisa que a liberação é manual', (await socio.$('[data-teste="sem-prazo-troca"]')) !== null);
  for (let n = 0; n < 2; n += 1) {
    await socio.click('[data-teste="confirmar-venda"]');
    await socio.waitForFunction((resto) => document.querySelectorAll('[data-teste="venda-aguardando"]').length === resto, { timeout: 6000 }, 1 - n);
  }
  await socio.waitForFunction(() => document.querySelectorAll('[data-teste="comissoes-aguardando"] [data-teste="comissao"]').length === 4, { timeout: 6000 }).catch(() => {});
  const resumo = '[data-teste="resumo-financeiro"]';
  const proLabore = await cartao(socio, 'Pró-labore do mês', resumo);
  registrar('Confirmar gera o pró-labore: 10% de R$ 360 = R$ 36,00', proLabore === 'R$ 36,00', proLabore);
  const geradas = await cartao(socio, 'Comissões geradas no mês', resumo);
  registrar('Comissões do mês: vendedor R$ 18,00 + influenciador R$ 25,00 (teto) = R$ 43,00', geradas === 'R$ 43,00', geradas);
  const linhas = await socio.$$eval('[data-teste="comissoes-aguardando"] [data-teste="comissao"]', (ls) => ls.map((l) => l.textContent.replace(/\s+/g, ' ')));
  const daBia = linhas.filter((l) => l.includes('Bia Corre'));
  registrar('Vendedor e influenciador recebem na mesma venda (4 comissões aguardando)',
    linhas.length === 4 && daBia.length === 2 && linhas.filter((l) => l.includes('Vendedor')).length === 2);
  registrar('A comissão do influenciador para no teto: a segunda fica em R$ 7,00, com o aviso',
    daBia.some((l) => l.includes('R$ 18,00')) && daBia.some((l) => l.includes('R$ 7,00') && l.includes('limitada pelo teto')), daBia.join(' | ').slice(0, 160));
  await foto(socio, '32-financeiro-comissoes');

  registrar('Nada pode ser pago antes de liberado', (await socio.$('[data-teste="pagar-comissao"]')) === null);
  // Libera a primeira comissão da influenciadora (R$ 18,00), para conferir depois no espaço dela.
  await socio.evaluate(() => {
    const linha = [...document.querySelectorAll('[data-teste="comissoes-aguardando"] [data-teste="comissao"][data-quem="Bia Corre"]')]
      .find((l) => l.querySelector('[data-teste="valor-comissao"]').textContent.replace(/\s+/g, ' ') === 'R$ 18,00');
    linha.querySelector('[data-teste="liberar-comissao"]').click();
  });
  await socio.waitForSelector('[data-teste="comissoes-a-pagar"] [data-teste="comissao"]', { timeout: 6000 }).catch(() => {});
  const liberada = await texto(socio, '[data-teste="comissoes-a-pagar"] [data-teste="valor-comissao"]');
  registrar('O Sócio libera a comissão de R$ 18,00 da influenciadora e ela passa para "a pagar"', liberada === 'R$ 18,00', liberada);
  await socio.click('[data-teste="pagar-comissao"]');
  await socio.waitForSelector('[data-teste="comissoes-a-pagar"] [data-teste="comissao"]', { hidden: true, timeout: 6000 }).catch(() => {});
  const pagas = await cartao(socio, 'Comissões pagas no mês', resumo);
  registrar('Marcada como paga, ela entra em "Comissões pagas no mês"', pagas === liberada, `${pagas} = ${liberada}`);

  await ir(socio, '/influenciadores');
  registrar('Clientes novos trazidos pela influenciadora: 2', (await texto(socio, '[data-teste="clientes-influenciador"]')) === '2');
  const numeros = { vendas: await texto(socio, '[data-teste="vendas-influenciador"]'), valor: await cartao(socio, 'Valor vendido'), comissao: await cartao(socio, 'Comissão gerada'), retorno: await cartao(socio, 'Retorno') };
  registrar('Influenciadores (Sócio): 2 vendas, R$ 360,00 vendidos, R$ 25,00 de comissão e retorno de R$ 290,00',
    numeros.vendas === '2' && numeros.valor === 'R$ 360,00' && numeros.comissao === 'R$ 25,00' && numeros.retorno === 'R$ 290,00', JSON.stringify(numeros));
  await foto(socio, '33-influenciadores-socio');

  await ir(socio, '/auditoria');
  const auditoria = await texto(socio, 'main');
  registrar('A auditoria registra o cupom, a liberação e o pagamento da comissão', auditoria.includes('cupom') && auditoria.includes('liberar') && auditoria.includes('pagar'));

  // ---------- Vendedor vê só a própria comissão
  await ir(vend, '/atendimento');
  const minha = await cartao(vend, 'Minha comissão no mês');
  registrar('Depois da confirmação, o vendedor vê a própria comissão: 5% de R$ 360 = R$ 18,00', minha === 'R$ 18,00', minha);
  await ir(vend, '/influenciadores');
  registrar('O vendedor não entra em Influenciadores', await barrado(vend));
  await ir(vend, '/meu-espaco');
  registrar('O vendedor não entra no espaço do influenciador', await barrado(vend));
  await cVend.close();

  // ---------- Gerente gere os influenciadores sem ver cifras
  {
    const { contexto, pagina: pg } = await abrir();
    await entrar(pg, 'gerente');
    await ir(pg, '/influenciadores');
    const html = limpo(await pg.content());
    registrar('O Gerente vê o influenciador, as vendas e os cupons',
      (await texto(pg, '[data-teste="vendas-influenciador"]')) === '2' && html.includes('BIA10') && html.includes('Regata Running M preta'));
    registrar('O Gerente não vê comissão, custo das peças, retorno nem teto, e não cria cupom',
      !html.includes('Comissão gerada') && !html.includes('Custo das peças') && !html.includes('Retorno') && !html.includes('R$ 45,00') && !html.includes('R$ 25,00')
      && (await pg.$('[data-teste="novo-cupom"]')) === null);
    await foto(pg, '34-influenciadores-gerente');
    await ir(pg, '/atendimento');
    registrar('O Gerente também tem o cartão da própria comissão', (await cartao(pg, 'Minha comissão no mês')) === 'R$ 0,00');
    await contexto.close();
  }

  // ---------- Influenciador: só os próprios números, sem dado de cliente
  {
    const { contexto, pagina: pg } = await abrir();
    await entrar(pg, 'influenciador');
    const menu = await pg.$$eval('[data-teste="menu-item"]', (is) => is.map((i) => i.textContent.trim()));
    registrar('O menu do influenciador tem só o espaço dele', JSON.stringify(menu) === JSON.stringify(['Meu espaço']), menu.join(', '));
    await ir(pg, '/meu-espaco');
    const vendas = await texto(pg, '[data-teste="espaco-vendas"]');
    const comissao = await texto(pg, '[data-teste="espaco-comissao"]');
    registrar('Meu espaço: 2 vendas com o cupom e R$ 25,00 de comissão', vendas === '2' && comissao === 'R$ 25,00', `${vendas} vendas, ${comissao}`);
    registrar('Meu espaço avisa que o teto do mês foi atingido', (await texto(pg, '[data-teste="espaco-teto"]')).includes('teto de R$ 25,00 atingido'));
    const porDia = await texto(pg, '[data-teste="vendas-por-dia"]');
    registrar('Vendas por dia, por cupom: BIA10, 2 vendas, R$ 360,00', porDia.includes('BIA10') && porDia.includes('R$ 360,00'));
    const pagamentos = await texto(pg, '[data-teste="pagamentos"]');
    registrar('Pagamentos: R$ 7,00 aguardando o prazo de troca e R$ 18,00 já pagos',
      /Aguardando o prazo de troca ?R\$ 7,00/.test(pagamentos) && /Liberada, a receber ?R\$ 0,00/.test(pagamentos) && /Já paga ?R\$ 18,00/.test(pagamentos), pagamentos.slice(0, 120));
    const html = await pg.content();
    registrar('Nenhum dado de cliente chega ao influenciador (nome, telefone ou CPF)',
      !html.includes('Carla') && !html.includes('Diego') && !html.includes('96666') && !html.includes('11144477735') && !html.includes('***.'));
    await foto(pg, '35-meu-espaco');
    await ir(pg, '/meu-espaco?inicio=2020-01-01&fim=2020-01-31');
    registrar('Trocar o período muda os números (janeiro de 2020: nenhuma venda)', (await texto(pg, '[data-teste="espaco-vendas"]')) === '0');
    await ir(pg, '/meu-espaco');
    await Promise.all([pg.waitForNavigation({ waitUntil: 'networkidle0' }), pg.evaluate(() => [...document.querySelectorAll('[data-teste="atalhos-periodo"] a')].find((a) => a.textContent === 'Mês passado').click())]);
    registrar('O atalho "Mês passado" troca o período', (await texto(pg, '[data-teste="espaco-vendas"]')) === '0' && pg.url().includes('inicio='));
    for (const rota of ['/influenciadores', '/financeiro', '/atendimento']) {
      await ir(pg, rota);
      registrar(`Influenciador: ${rota} é barrado`, await barrado(pg));
    }
    await contexto.close();
  }

  // ---------- 390 px
  {
    const { contexto, pagina: pg } = await abrir(390, 844);
    await entrar(pg, 'socio');
    await ir(pg, '/influenciadores');
    registrar('390 px: Influenciadores sem rolagem lateral', await semRolagemLateral(pg));
    await foto(pg, '36-celular-influenciadores');
    await pg.click('[data-teste="novo-cupom"]');
    await pg.waitForSelector('[data-teste="salvar-cupom"]');
    registrar('390 px: formulário de cupom sem rolagem lateral', await semRolagemLateral(pg));
    await ir(pg, '/financeiro');
    registrar('390 px: Financeiro com comissões sem rolagem lateral', await semRolagemLateral(pg));
    await foto(pg, '37-celular-financeiro');
    await contexto.close();
    const { contexto: c2, pagina: p2 } = await abrir(390, 844);
    await entrar(p2, 'influenciador');
    await ir(p2, '/meu-espaco');
    registrar('390 px: Meu espaço sem rolagem lateral', await semRolagemLateral(p2));
    await foto(p2, '38-celular-meu-espaco');
    await c2.close();
  }
  await cSocio.close();
} catch (erro) {
  registrar(`Erro inesperado: ${erro.message}`, false);
} finally {
  await navegador.close();
}

const falhas = resultados.filter((r) => !r.passou);
console.log(`\n${resultados.length - falhas.length} de ${resultados.length} itens passaram.`);
process.exit(falhas.length ? 1 : 0);
