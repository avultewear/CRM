// Teste de aceite da etapa 3 (Atendimento), num navegador de verdade.
// Pré-requisitos: API em :4000, web em :3000 e o banco recém-criado pelo `npm run semear` (sem leads).
// Todos os dados são fictícios; o CPF é um número de teste com dígitos válidos.
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
const foto = (pagina, nome) => pagina.screenshot({ path: join(CAPTURAS, `${nome}.png`) });
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const texto = (pagina, seletor) => pagina.$eval(seletor, (e) => e.textContent.trim()).catch(() => '');
const semRolagemLateral = (pagina) => pagina.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const card = (nome) => `[data-teste="card"][data-nome="${nome}"]`;
const naColuna = (pagina, etapa, nome) =>
  pagina.waitForSelector(`[data-teste="coluna-${etapa}"] ${card(nome)}`, { timeout: 6000 }).then(() => true).catch(() => false);
const etapaNoPainel = (pagina, nome) =>
  pagina.waitForFunction((n) => document.querySelector('[data-teste="etapa-atual"]')?.textContent.trim() === n, { timeout: 6000 }, nome)
    .then(() => true).catch(() => false);
const aviso = async (pagina, trecho) =>
  pagina.waitForFunction((t) => document.querySelector('[data-teste="aviso"]')?.textContent.includes(t), { timeout: 6000 }, trecho)
    .then(() => true).catch(() => false);
async function preencher(pagina, seletor, valor) {
  await pagina.click(seletor, { clickCount: 3 });
  await pagina.keyboard.press('Backspace');
  await pagina.type(seletor, valor);
}
async function novoLead(pagina, nome, telefone) {
  await pagina.click('[data-teste="novo-lead"]');
  await pagina.waitForSelector('[data-teste="salvar-lead"]');
  await pagina.type('.modal input[name=nome]', nome);
  await pagina.type('.modal input[name=telefone]', telefone);
  await pagina.select('.modal select[name=origem]', 'ANUNCIO');
  await pagina.click('[data-teste="salvar-lead"]');
  await pagina.waitForSelector('[data-teste="salvar-lead"]', { hidden: true, timeout: 6000 });
}
async function abrirLead(pagina, nome) {
  await pagina.click(card(nome));
  await pagina.waitForSelector('[data-teste="painel-lead"] [data-teste="etapa-atual"]', { timeout: 6000 });
}
const fecharPainel = async (pagina) => { await pagina.keyboard.press('Escape'); await pausa(200); };

try {
  // ---------- Vendedor: jornada de um lead
  const { contexto: cVend, pagina } = await abrir();
  await entrar(pagina, 'vendedor');
  await pagina.goto(`${WEB}/atendimento`, { waitUntil: 'networkidle0' });
  registrar('Quadro vazio ensina o primeiro passo', (await texto(pagina, '.vazia')).includes('Nenhum atendimento ainda'));

  await novoLead(pagina, 'Marina Teste', '(11) 97777-0001');
  registrar('Novo lead entra na coluna Lead', await naColuna(pagina, 'LEAD', 'Marina Teste'));
  const colunas = await pagina.$$eval('[data-teste^="coluna-"]', (cs) => cs.map((c) => c.getAttribute('data-teste').replace('coluna-', '')));
  registrar('O quadro tem as 6 etapas, na ordem da jornada',
    JSON.stringify(colunas) === JSON.stringify(['LEAD', 'ABORDADO', 'LEVANTAMENTO', 'NEGOCIACAO', 'VENDA', 'RECUPERACAO']), colunas.join(' › '));

  await pagina.click(`${card('Marina Teste')} [data-teste="card-avancar"]`);
  registrar('Avançar de Lead sem resposta é recusado, dizendo o que falta',
    await aviso(pagina, 'respondeu') && await naColuna(pagina, 'LEAD', 'Marina Teste'));

  // Arrastar o card duas etapas à frente: não se pula etapa.
  await pagina.evaluate((seletor) => {
    const dt = new DataTransfer();
    document.querySelector(seletor).dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true }));
    document.querySelector('[data-teste="coluna-NEGOCIACAO"]').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }));
  }, card('Marina Teste'));
  registrar('Arrastar o card para pular etapas é recusado',
    await aviso(pagina, 'Não se pula etapa') && await naColuna(pagina, 'LEAD', 'Marina Teste'));

  await abrirLead(pagina, 'Marina Teste');
  registrar('O painel do lead mostra o que falta para a próxima etapa', (await texto(pagina, '[data-teste="falta"]')).includes('respondeu'));
  await pagina.click('[data-teste="acao-resposta"]');
  await pagina.waitForSelector('[data-teste="acao-resposta"]', { hidden: true, timeout: 6000 });
  await pagina.click('[data-teste="acao-avancar"]');
  registrar('Com a resposta registrada, o lead vai para Abordado', await etapaNoPainel(pagina, 'Abordado'));

  await pagina.click('[data-teste="acao-avancar"]');
  registrar('De Abordado não avança sem produto e tamanho', await aviso(pagina, 'produto de interesse') && await etapaNoPainel(pagina, 'Abordado'));
  await preencher(pagina, '[data-teste="painel-lead"] input[name=interesse]', 'Regata Running');
  await preencher(pagina, '[data-teste="painel-lead"] input[name=tamanho]', 'M');
  await pagina.click('[data-teste="salvar-levantamento"]');
  await aviso(pagina, 'Levantamento salvo');
  await pagina.click('[data-teste="acao-avancar"]');
  registrar('Com produto e tamanho, o lead vai para Levantamento', await etapaNoPainel(pagina, 'Levantamento'));

  await pagina.click('[data-teste="acao-link"]');
  await pagina.waitForSelector('[data-teste="salvar-link"]');
  await foto(pagina, '20-atendimento-enviar-link');
  await pagina.click('[data-teste="salvar-link"]');
  registrar('Enviar o link leva o lead para Negociação', await etapaNoPainel(pagina, 'Negociação'));
  const historico = await pagina.$$eval('[data-teste="linha-historico-etapa"] strong', (ls) => ls.map((l) => l.textContent.trim()));
  registrar('O histórico do lead guarda cada etapa, na ordem',
    JSON.stringify(historico) === JSON.stringify(['Lead', 'Abordado', 'Levantamento', 'Negociação']), historico.join(' › '));
  await foto(pagina, '21-atendimento-painel-lead');
  await fecharPainel(pagina);
  const tarefa = await texto(pagina, '[data-teste="tarefa"]');
  registrar('O link cria o follow como tarefa, com a mensagem pronta e o botão do WhatsApp',
    tarefa.includes('Oi, Marina!') && tarefa.includes('Abrir WhatsApp') && !tarefa.includes('R$'));
  const wa = await pagina.$eval('[data-teste="tarefa"] a', (a) => a.href).catch(() => '');
  registrar('O botão abre a conversa do cliente com a mensagem preenchida', wa.startsWith('https://wa.me/5511977770001?text=Oi%2C%20Marina'), wa.slice(0, 60));

  await abrirLead(pagina, 'Marina Teste');
  await pagina.click('[data-teste="acao-perdido"]');
  await pagina.waitForSelector('[data-teste="motivo-ACHOU_CARO"]');
  const motivos = await pagina.$$eval('.opcao-motivo', (ms) => ms.length);
  registrar('A lista de perdas tem os 8 motivos, cada um com o destino escrito', motivos === 8);
  await foto(pagina, '22-atendimento-perdido');
  await pagina.click('[data-teste="motivo-ACHOU_CARO"]');
  await pagina.click('[data-teste="salvar-perdido"]');
  await fecharPainel(pagina);
  registrar('"Achou caro" manda o lead para a Recuperação', await naColuna(pagina, 'RECUPERACAO', 'Marina Teste'));

  await novoLead(pagina, 'Marina Teste', '11 97777 0001');
  registrar('O mesmo telefone não duplica o cliente: a tela avisa que entrou no cadastro dele', await aviso(pagina, 'já era de um cliente'));

  // ---------- Venda direta
  await novoLead(pagina, 'Paulo Teste', '(11) 97777-0002');
  await naColuna(pagina, 'LEAD', 'Paulo Teste');
  await abrirLead(pagina, 'Paulo Teste');
  await pagina.click('[data-teste="acao-venda"]');
  await pagina.waitForSelector('[data-teste="salvar-venda"]');
  await pagina.type('[data-teste="item-descricao"]', 'Regata Running M');
  await pagina.type('[data-teste="item-tabela"]', '90');
  await pagina.type('[data-teste="item-preco"]', '90');
  await pagina.click('[data-teste="salvar-venda"]');
  await pausa(600);
  registrar('Venda direta sem CPF não é lançada', (await pagina.$('[data-teste="salvar-venda"]')) !== null);
  await pagina.type('.modal input[name=cpf]', '529.982.247-25');
  await foto(pagina, '23-atendimento-venda-direta');
  await pagina.click('[data-teste="salvar-venda"]');
  registrar('Com CPF, a venda é lançada e o lead vai para Negociação', await etapaNoPainel(pagina, 'Negociação'));
  registrar('A venda fica aguardando a confirmação de um Sócio', (await texto(pagina, '[data-teste="venda-direta"]')).includes('Aguardando confirmação'));
  const cpf = await texto(pagina, '[data-teste="cpf-mascarado"]');
  const pagHtml = await pagina.content();
  registrar('O CPF aparece mascarado e o número inteiro não chega ao navegador', cpf === '***.***.***-25' && !pagHtml.includes('52998224725') && !pagHtml.includes('529.982.247-25'), cpf);
  await fecharPainel(pagina);
  await foto(pagina, '24-atendimento-quadro');

  await pagina.goto(`${WEB}/financeiro`, { waitUntil: 'networkidle0' });
  registrar('O vendedor não entra no Financeiro', (await pagina.$('[data-teste="sem-acesso"]')) !== null);
  await cVend.close();

  // ---------- Gerente vê os leads de todos, mas não confirma venda
  {
    const { contexto, pagina: pg } = await abrir();
    await entrar(pg, 'gerente');
    await pg.goto(`${WEB}/atendimento`, { waitUntil: 'networkidle0' });
    registrar('O Gerente vê os leads dos vendedores', await naColuna(pg, 'NEGOCIACAO', 'Paulo Teste'));
    await pg.goto(`${WEB}/financeiro`, { waitUntil: 'networkidle0' });
    registrar('O Gerente não entra no Financeiro', (await pg.$('[data-teste="sem-acesso"]')) !== null);
    await contexto.close();
  }
  // ---------- Quem não é do comercial não entra
  for (const papel of ['trafego', 'social', 'influenciador']) {
    const { contexto, pagina: pg } = await abrir();
    await entrar(pg, papel);
    await pg.goto(`${WEB}/atendimento`, { waitUntil: 'networkidle0' });
    registrar(`${papel}: o Atendimento é barrado`, (await pg.$('[data-teste="sem-acesso"]')) !== null);
    await contexto.close();
  }

  // ---------- Sócio confirma a venda direta
  {
    const { contexto, pagina: pg } = await abrir();
    await entrar(pg, 'socio');
    await pg.goto(`${WEB}/financeiro`, { waitUntil: 'networkidle0' });
    registrar('A venda direta aparece para o Sócio confirmar', (await texto(pg, '[data-teste="venda-aguardando"]')).includes('Paulo Teste'));
    await foto(pg, '25-financeiro-venda-a-confirmar');
    await pg.click('[data-teste="confirmar-venda"]');
    await pg.waitForSelector('[data-teste="venda-aguardando"]', { hidden: true, timeout: 6000 });
    await pg.goto(`${WEB}/atendimento`, { waitUntil: 'networkidle0' });
    registrar('Confirmada pelo Sócio, a venda leva o card para Venda', await naColuna(pg, 'VENDA', 'Paulo Teste'));
    await pg.goto(`${WEB}/auditoria`, { waitUntil: 'networkidle0' });
    const aud = await pg.evaluate(() => document.body.innerText);
    registrar('A auditoria registra a perda, a venda e a confirmação, sem o número do CPF',
      aud.includes('perder') && aud.includes('confirmar') && !aud.includes('52998224725'));
    // Tema escuro no quadro
    await pg.goto(`${WEB}/atendimento`, { waitUntil: 'networkidle0' });
    await pg.click('[data-teste="alternar-tema"]');
    await foto(pg, '26-atendimento-quadro-escuro');
    await pg.click('[data-teste="alternar-tema"]');
    await contexto.close();
  }

  // ---------- 390 px
  {
    const { contexto, pagina: pg } = await abrir(390, 844);
    await entrar(pg, 'socio');
    await pg.goto(`${WEB}/atendimento`, { waitUntil: 'networkidle0' });
    registrar('390 px: Atendimento sem rolagem lateral (o quadro rola dentro do cartão)', await semRolagemLateral(pg));
    await foto(pg, '27-celular-atendimento');
    await abrirLead(pg, 'Marina Teste');
    registrar('390 px: painel do lead sem rolagem lateral', await semRolagemLateral(pg));
    await foto(pg, '28-celular-painel-lead');
    await fecharPainel(pg);
    await pg.click('[data-teste="novo-lead"]');
    await pg.waitForSelector('[data-teste="salvar-lead"]');
    registrar('390 px: formulário de novo lead sem rolagem lateral', await semRolagemLateral(pg));
    await pg.goto(`${WEB}/financeiro`, { waitUntil: 'networkidle0' });
    registrar('390 px: Financeiro sem rolagem lateral', await semRolagemLateral(pg));
    await contexto.close();
  }
} catch (erro) {
  registrar(`Erro inesperado: ${erro.message}`, false);
} finally {
  await navegador.close();
}

const falhas = resultados.filter((r) => !r.passou);
console.log(`\n${resultados.length - falhas.length} de ${resultados.length} itens passaram.`);
process.exit(falhas.length ? 1 : 0);
