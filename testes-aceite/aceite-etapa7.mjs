// Teste de aceite da etapa 7 (Tráfego), num navegador de verdade.
// Pré-requisitos: API em :4000, web em :3000 e o banco usado pelos aceites anteriores (roda depois do aceite 6).
// A conta da Meta ainda não existe e a rede deste ambiente não alcança a Meta. Por isso os números de anúncio entram
// direto no banco, nas mesmas tabelas e no mesmo formato que a sincronização grava (a sincronização em si é testada
// na API contra respostas simuladas da Graph API). Todos os dados são fictícios.
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import puppeteer from 'puppeteer-core';

const AQUI = dirname(fileURLToPath(import.meta.url));
const WEB = process.env.WEB_URL ?? 'http://localhost:3000';
const CAPTURAS = join(AQUI, 'capturas');
const ENV = readFileSync(join(AQUI, '..', 'apps', 'api', '.env'), 'utf8');
const SENHA = process.env.SEMENTE_SENHA ?? ENV.match(/SEMENTE_SENHA="?([^"\n]+)/)[1];
const URL_BANCO = ENV.match(/DATABASE_URL="?([^"\n]+)/)[1];
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
const limpo = (t) => t.replace(/\s+/g, ' ').trim();
const texto = async (pagina, seletor) => limpo(await pagina.$eval(seletor, (e) => e.textContent).catch(() => ''));
const semRolagemLateral = (pagina) => pagina.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const barrado = async (pagina) => (await pagina.$('[data-teste="sem-acesso"]')) !== null;
const fechouModal = (pagina) => pagina.waitForSelector('.modal', { hidden: true, timeout: 6000 }).then(() => true).catch(() => false);
const indicador = (pagina, metrica) => texto(pagina, `[data-teste="indicador"][data-metrica="${metrica}"] .valor`);
const reais = (v) => limpo(new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v));
const api = (pagina, metodo, caminho, corpo) => pagina.evaluate(async (m, c, b) => {
  const r = await fetch(`/api/px${c}`, { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined });
  return { status: r.status, corpo: await r.json().catch(() => ({})) };
}, metodo, caminho, corpo);
// Dia de hoje e de ontem no fuso de São Paulo (o mesmo da API).
const diaSP = (n = 0) => new Date(Date.now() - 3 * 3_600_000 - n * 86_400_000).toISOString().slice(0, 10);

const banco = new pg.Client({ connectionString: URL_BANCO });
await banco.connect();

try {
  // Ponto de partida: nenhuma conta, nenhum anúncio, nenhum gasto digitado.
  await banco.query(`DELETE FROM anuncio_dia; DELETE FROM anuncio_publico_dia; DELETE FROM anuncio; DELETE FROM anuncio_conjunto; DELETE FROM anuncio_campanha`);
  const { rows: [{ n: conexoes }] } = await banco.query(`SELECT count(*)::int AS n FROM meta_conexao WHERE ativa`);
  const { rows: [{ n: gastos }] } = await banco.query(`SELECT count(*)::int AS n FROM gasto_manual WHERE substituido_em IS NULL`);

  const { contexto: cSocio, pagina: socio } = await abrir();
  const { contexto: cTraf, pagina: trafego } = await abrir();
  const { contexto: cGer, pagina: gerente } = await abrir();
  const { contexto: cVend, pagina: vendedor } = await abrir();
  await entrar(socio, 'socio'); await entrar(trafego, 'trafego'); await entrar(gerente, 'gerente'); await entrar(vendedor, 'vendedor');

  // ---------------------------------------------------------------- Acesso
  await ir(trafego, '/trafego');
  registrar('Gestor de tráfego abre a aba Tráfego', !(await barrado(trafego)) && (await trafego.$('[data-teste="conexao"]')) !== null);
  registrar('Sem conta e sem gasto, a aba explica o que falta (sem números inventados)',
    conexoes > 0 || gastos > 0 || (await texto(trafego, 'main')).includes('Ainda sem dados de anúncio'));
  registrar('Gestor de tráfego não conecta a conta nem digita o gasto (só Sócio)',
    (await trafego.$('[data-teste="conectar"]')) === null && (await trafego.$('[data-teste="gasto-manual"]')) === null);
  await ir(gerente, '/trafego');
  registrar('Gerente não abre a aba Tráfego', await barrado(gerente));
  await ir(vendedor, '/trafego');
  registrar('Vendedor não abre a aba Tráfego', await barrado(vendedor));
  const rGer = await api(gerente, 'GET', '/trafego?dias=7');
  registrar('A API também barra o Gerente', rGer.status === 403);
  await foto(trafego, '60-trafego-vazio');

  // ---------------------------------------------------------------- Conexão (passo a passo; a Meta não é alcançável daqui)
  await ir(socio, '/trafego');
  await socio.click('[data-teste="conectar"]');
  await socio.waitForSelector('.passos-token');
  const passos = await texto(socio, '.passos-token');
  registrar('Conectar mostra o passo a passo do token (usuário do sistema, ads_read)', passos.includes('Usuários do sistema') && passos.includes('ads_read'));
  registrar('O campo do token é escondido (tipo senha)', (await socio.$eval('[data-teste="campo-token"]', (e) => e.type)) === 'password');
  await socio.type('[data-teste="campo-token"]', 'EAAtokenFicticioDoAceite0000000000000000');
  await foto(socio, '61-conectar-passo-a-passo');
  await socio.click('[data-teste="ver-contas"]');
  const erroConexao = await socio.waitForSelector('[data-teste="erro-formulario"]', { timeout: 20000 }).then((e) => e.evaluate((x) => x.textContent)).catch(() => '');
  registrar('Sem acesso à Meta, o erro aparece em português e nada é gravado', /Meta/.test(erroConexao)
    && (await banco.query(`SELECT count(*)::int AS n FROM meta_conexao WHERE ativa`)).rows[0].n === conexoes, limpo(erroConexao).slice(0, 80));
  const { rows: auditoriaToken } = await banco.query(`SELECT 1 FROM auditoria WHERE concat(de::text, para::text) LIKE '%EAAtokenFicticioDoAceite%'`);
  registrar('O token nunca vai para a auditoria', auditoriaToken.length === 0);
  await socio.keyboard.press('Escape');
  await fechouModal(socio);

  // ---------------------------------------------------------------- Gasto digitado (sem conexão)
  const mesPassado = (() => { const [a, m] = diaSP().split('-').map(Number); return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`; })();
  await socio.click('[data-teste="gasto-manual"]');
  await socio.waitForSelector('[data-teste="valor-gasto"]');
  await socio.$eval('input[name=competencia]', (e, v) => { e.value = v; }, mesPassado);
  await socio.type('[data-teste="valor-gasto"]', '930');
  await socio.click('[data-teste="salvar-gasto"]');
  registrar('Sócio digita o gasto de um mês sem conexão', await fechouModal(socio));
  await pausa(500);
  const [ano, mes] = mesPassado.split('-').map(Number);
  const diasMes = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  await ir(socio, `/trafego?desde=${mesPassado}-01&ate=${mesPassado}-10`);
  registrar('O gasto digitado vira investimento por dia (valor do mês ÷ dias do mês)',
    (await indicador(socio, 'investimento_trafego')) === reais(Math.round((930 / diasMes) * 10 * 100) / 100), await indicador(socio, 'investimento_trafego'));
  registrar('A tela diz de onde vem o número (gasto digitado)', (await texto(socio, '[data-teste="filtro-periodo"]')).includes('gasto digitado'));
  registrar('Sem a Meta, impressões e cliques ficam em "—" ou zero, nunca inventados',
    ['—', '0'].includes(await indicador(socio, 'impressoes')) && ['—', '0'].includes(await indicador(socio, 'cliques_link')));

  // ---------------------------------------------------------------- Números de anúncio (no formato da sincronização)
  await banco.query(`INSERT INTO anuncio_campanha (id, nome, objetivo, status, orcamento_diario) VALUES
    ('710000001', 'Aceite · Conversas', 'OUTCOME_ENGAGEMENT', 'ACTIVE', 50), ('710000002', 'Aceite · Remarketing', 'OUTCOME_ENGAGEMENT', 'ACTIVE', 20)`);
  await banco.query(`INSERT INTO anuncio_conjunto (id, campanha_id, nome, status, otimizacao, fase_aprendizado, publico) VALUES
    ('720000001', '710000001', 'Mulheres 25-34', 'ACTIVE', 'CONVERSATIONS', 'SUCCESS', '{"idadeMin":25,"idadeMax":34,"generos":[2]}'),
    ('720000002', '710000002', 'Engajou 30 dias', 'ACTIVE', 'CONVERSATIONS', 'FAIL', null)`);
  await banco.query(`INSERT INTO anuncio (id, conjunto_id, nome, titulo, status, formato, ranking_qualidade) VALUES
    ('730000001', '720000001', 'Regata · vídeo', 'Regata do aceite', 'ACTIVE', 'VIDEO', 'ABOVE_AVERAGE'),
    ('730000002', '720000001', 'Short · foto', 'Short do aceite', 'ACTIVE', 'IMAGEM', 'AVERAGE'),
    ('730000003', '720000002', 'Depoimento · vídeo', 'Depoimento do aceite', 'ACTIVE', 'VIDEO', 'BELOW_AVERAGE_20')`);
  // Números de "ontem", como o Gerenciador mostraria: 3 anúncios.
  const ontem = diaSP(1);
  const linhasOntem = [['730000001', 41.37, 2210, 31, 9], ['730000002', 18.9, 1120, 12, 3], ['730000003', 12.45, 600, 4, 0]];
  for (let d = 6; d >= 0; d -= 1) {
    for (const [i, [id, inv, imp, cli, conv]] of linhasOntem.entries()) {
      const fator = d === 1 ? 1 : 0.8 + 0.05 * ((d + i) % 5);
      await banco.query(`INSERT INTO anuncio_dia (anuncio_id, dia, investimento, impressoes, alcance, cliques_link, conversas, conversas_profundas, video_plays, video_p25, video_p50, video_p75, video_p100)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [id, diaSP(d), Math.round(inv * fator * 100) / 100, Math.round(imp * fator), Math.round(imp * fator * 0.8), Math.round(cli * fator), Math.round(conv * fator), Math.round(conv * fator * 0.6),
          id === '730000002' ? null : 500, id === '730000002' ? null : 260, id === '730000002' ? null : 150, id === '730000002' ? null : 90, id === '730000002' ? null : 40]);
    }
    for (const [dim, chave, inv, conv] of [['IDADE_GENERO', '25-34|female', 50, 10], ['IDADE_GENERO', '35-44|female', 22, 2], ['POSICIONAMENTO', 'instagram|story', 40, 9], ['POSICIONAMENTO', 'facebook|feed', 32, 3]]) {
      await banco.query(`INSERT INTO anuncio_publico_dia (dia, dimensao, chave, investimento, impressoes, cliques_link, conversas) VALUES ($1, $2, $3, $4, 1000, 10, $5)`, [diaSP(d), dim, chave, inv, conv]);
    }
  }

  // Critério 1: investimento e cliques de um dia batem com o Gerenciador (aqui, com os números gravados como a Meta entrega).
  await ir(socio, `/trafego?desde=${ontem}&ate=${ontem}`);
  const invOntem = linhasOntem.reduce((s, l) => s + l[1], 0);
  const cliOntem = linhasOntem.reduce((s, l) => s + l[3], 0);
  registrar('Investimento de um dia bate com o Gerenciador (dados simulados)', (await indicador(socio, 'investimento_trafego')) === reais(invOntem), `${await indicador(socio, 'investimento_trafego')} = ${reais(invOntem)}`);
  registrar('Cliques no link de um dia batem com o Gerenciador (dados simulados)', (await indicador(socio, 'cliques_link')) === cliOntem.toLocaleString('pt-BR'), `${await indicador(socio, 'cliques_link')} = ${cliOntem}`);
  registrar('Num mês com dados da Meta, vale o número da Meta (a fonte diz "Meta")', (await texto(socio, '[data-teste="filtro-periodo"]')).includes(': Meta'));
  await foto(socio, '62-trafego-um-dia');

  // ---------------------------------------------------------------- Lead com o anúncio de origem (tela do Atendimento)
  await ir(gerente, '/atendimento');
  await gerente.click('[data-teste="novo-lead"]');
  await gerente.waitForSelector('input[name=nome]');
  await gerente.type('input[name=nome]', 'Lead Anúncio Aceite7 (teste)');
  await gerente.type('input[name=telefone]', `1197${String(Date.now()).slice(-7)}`);
  await gerente.select('[data-teste="origem-lead"]', 'ANUNCIO');
  await gerente.waitForSelector('[data-teste="anuncio-lead"] option[value="730000001"]', { timeout: 6000 }).catch(() => null);
  registrar('Com origem Anúncio, o cadastro lista os anúncios sincronizados', (await gerente.$('[data-teste="anuncio-lead"] option[value="730000001"]')) !== null);
  await gerente.select('[data-teste="anuncio-lead"]', '730000001');
  await gerente.select('select[name=vendedorId]', await gerente.$eval('select[name=vendedorId] option:nth-child(2)', (o) => o.value)).catch(() => {});
  await gerente.click('.modal button[type=submit]');
  await fechouModal(gerente);
  const { rows: [novo] } = await banco.query(`SELECT id, anuncio_id, conjunto_id, campanha_id, anuncio_titulo FROM oportunidade WHERE cliente_id IN (SELECT id FROM cliente WHERE nome = 'Lead Anúncio Aceite7 (teste)')`);
  registrar('O lead guarda anúncio, conjunto, campanha e título', novo?.anuncio_id === '730000001' && novo.conjunto_id === '720000001' && novo.campanha_id === '710000001' && novo.anuncio_titulo === 'Regata do aceite');
  await ir(gerente, '/atendimento');
  await gerente.click('[data-teste="card"][data-nome="Lead Anúncio Aceite7 (teste)"]');
  const origemLead = await gerente.waitForSelector('[data-teste="origem-do-lead"]', { timeout: 6000 }).then((e) => e.evaluate((x) => x.textContent)).catch(() => '');
  registrar('A ficha do lead mostra o anúncio de origem', origemLead.includes('Regata do aceite'), limpo(origemLead));
  await foto(gerente, '63-lead-com-anuncio');

  // Mais leads de hoje: dois de anúncio, dois de outras origens e um de anúncio descartado.
  const criar = async (nome, origem) => (await api(gerente, 'POST', '/oportunidades', { nome, telefone: `1196${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`, canal: 'WHATSAPP', origem })).corpo.oportunidade;
  await criar('Anúncio Dois Aceite7 (teste)', 'ANUNCIO');
  await criar('Anúncio Três Aceite7 (teste)', 'ANUNCIO');
  await criar('Indicação Aceite7 (teste)', 'INDICACAO');
  await criar('Post Aceite7 (teste)', 'POST');
  const descartado = await criar('Anúncio Descartado Aceite7 (teste)', 'ANUNCIO');
  const desc = await api(gerente, 'POST', `/oportunidades/${descartado.id}/perder`, { motivo: 'NAO_ERA_CLIENTE' });
  registrar('Lead de anúncio marcado como "não era cliente" sai da conta', desc.corpo.destino === 'NAO_CONTA');

  // Critério 2: o custo por lead usa só os leads de tráfego pago.
  await ir(socio, '/trafego?dias=7');
  const periodo = await socio.evaluate(() => document.querySelector('[data-teste="filtro-periodo"] p')?.textContent ?? '');
  const { rows: [{ inv7 }] } = await banco.query(`SELECT coalesce(sum(investimento), 0)::float AS inv7 FROM anuncio_dia WHERE dia BETWEEN $1 AND $2`, [diaSP(6), diaSP(0)]);
  const contar = async (filtro) => (await banco.query(`SELECT count(*)::int AS n FROM oportunidade
    WHERE criado_em >= ($1::date + time '03:00') AT TIME ZONE 'UTC' AND criado_em < ($2::date + 1 + time '03:00') AT TIME ZONE 'UTC' ${filtro}`, [diaSP(6), diaSP(0)])).rows[0].n;
  const pagos = await contar(`AND origem = 'ANUNCIO' AND situacao <> 'DESCARTADA'`);
  const todos = await contar('');
  const cpl = await indicador(socio, 'custo_por_lead');
  registrar('Custo por lead = investimento ÷ leads de anúncio (sem outras origens e sem descartados)',
    cpl === reais(Math.round((inv7 / pagos) * 100) / 100) && pagos < todos, `${cpl}; ${reais(inv7)} ÷ ${pagos} leads pagos (${todos} leads no total)`);
  registrar('O cartão "Leads no CRM" conta só os leads de anúncio', (await indicador(socio, 'leads_trafego')) === String(pagos), `${await indicador(socio, 'leads_trafego')} = ${pagos}`);
  registrar('Período padrão comparado com o período anterior', periodo.includes('comparado com'));

  // ---------------------------------------------------------------- As seções da auditoria
  const nota = await texto(socio, '[data-teste="nota"]');
  registrar('Resumo mostra a nota da auditoria e as prioridades', /^\d+/.test(nota) && (await socio.$$('[data-teste="prioridade"]')).length > 0, nota);
  registrar('Jornada até o lead tem as 4 etapas, do anúncio ao CRM', (await socio.$$('[data-teste="etapa-trafego"]')).length === 4);
  registrar('Connect rate em destaque', /%/.test(await texto(socio, '[data-teste="connect-rate"] .valor')));
  const achados = await socio.$$eval('[data-teste="achado"]', (l) => l.map((a) => a.textContent));
  registrar('Onde melhorar aponta o conjunto em aprendizado limitado e o anúncio com qualidade abaixo da média',
    achados.some((a) => a.includes('aprendizado limitado')) && achados.some((a) => a.includes('qualidade abaixo da média')));
  registrar('Onde melhorar mostra o recorte de público com nome legível', achados.some((a) => a.includes('Facebook · feed')));
  registrar('Públicos: barras de % do investimento × % dos resultados', (await socio.$$('[data-teste="par-barras"]')).length >= 2);
  registrar('Criativos: um ponto por anúncio no gráfico de quadrantes', (await socio.$$('[data-teste="ponto-criativo"]')).length === 3);
  registrar('Criativos em vídeo mostram a retenção', (await socio.$$('[data-teste="retencao"]')).length === 2);
  registrar('Campanhas e conjuntos, com a fase de aprendizado', (await texto(socio, '[data-teste="conjuntos"]')).includes('Aprendizado limitado'));
  await socio.select('[data-teste="metrica-dia"]', 'cpc');
  await pausa(300);
  registrar('Dia a dia troca a métrica e tem calendário de calor', (await socio.$('[data-teste="dia-a-dia"] .calor')) !== null
    && (await texto(socio, '[data-teste="dia-a-dia"]')).includes('CPC'));
  registrar('Qualidade das conversas', (await texto(socio, '[data-teste="qualidade-conversas"]')).includes('Passaram da mensagem pronta'));
  await foto(socio, '64-trafego-auditoria');

  // ---------------------------------------------------------------- Referências em Metas (sugestão com fonte; os Sócios decidem)
  await ir(socio, '/metas');
  await socio.click('[data-teste="editar-referencias_trafego"]');
  await socio.waitForSelector('[data-teste="ref-ctrMin"]');
  const sugestoes = await socio.$$eval('[data-teste="sugestao-ref"]', (l) => l.map((e) => e.textContent));
  registrar('Metas mostra a sugestão de mercado com a fonte, sem aplicar sozinha',
    sugestoes.some((s) => s.includes('1,29%') && s.includes('WordStream')));
  for (const id of ['ctrMin', 'cplMax']) await socio.$eval(`[data-teste="ref-${id}"]`, (e) => { e.select(); });
  await foto(socio, '65-metas-referencias');
  await socio.click('[data-teste="ref-ctrMin"]', { clickCount: 3 }); await socio.type('[data-teste="ref-ctrMin"]', '1,29');
  await socio.click('[data-teste="ref-cplMax"]', { clickCount: 3 }); await socio.type('[data-teste="ref-cplMax"]', '15');
  await socio.type('[data-teste="campo-justificativa"]', 'Referências iniciais do tráfego, a rever com 30 dias de conta.');
  await socio.click('[data-teste="salvar-parametro"]');
  registrar('Sócio grava as referências do tráfego (com justificativa no histórico)', await fechouModal(socio));
  const { rows: [ref] } = await banco.query(`SELECT valor FROM parametro WHERE chave = 'referencias_trafego'`);
  registrar('As referências gravadas são as digitadas', ref?.valor?.ctrMin === 1.29 && ref?.valor?.cplMax === 15, JSON.stringify(ref?.valor));
  await ir(socio, '/trafego?dias=7');
  const checagens = await texto(socio, '[data-teste="resumo-trafego"] table');
  registrar('Com a referência, a checagem de CTR passa a contar na nota', /CTR do link.*(Ok|Fora)/.test(checagens));

  // ---------------------------------------------------------------- Painel e Daily
  await ir(socio, '/painel');
  registrar('Hoje (Sócio) mostra o gasto com anúncios do mês', (await texto(socio, 'main')).includes('Gasto com anúncios no mês'));
  await ir(gerente, '/painel?sub=daily');
  const dailyGer = await texto(gerente, 'main');
  registrar('Daily do Gerente mostra os leads de anúncio, sem o gasto', dailyGer.includes('Leads de anúncio ontem') && !dailyGer.includes(reais(invOntem)));

  // ---------------------------------------------------------------- Celular e tema escuro
  {
    const { contexto, pagina } = await abrir(390, 844);
    await entrar(pagina, 'trafego');
    await ir(pagina, '/trafego?dias=7');
    registrar('390 px: /trafego sem rolagem lateral', await semRolagemLateral(pagina));
    await foto(pagina, '66-celular-trafego');
    await contexto.close();
  }
  await trafego.click('[data-teste="alternar-tema"]');
  await ir(trafego, '/trafego?dias=7');
  registrar('Modo escuro: o Tráfego abre com o tema escuro', (await trafego.evaluate(() => document.documentElement.dataset.tema)) === 'escuro');
  await foto(trafego, '67-trafego-escuro');
  await trafego.click('[data-teste="alternar-tema"]');

  await cSocio.close(); await cTraf.close(); await cGer.close(); await cVend.close();
} catch (erro) {
  registrar(`Erro inesperado: ${erro.message}`, false);
} finally {
  await banco.end();
  await navegador.close();
}

const falhas = resultados.filter((r) => !r.passou);
console.log(`\n${resultados.length - falhas.length} de ${resultados.length} itens passaram.`);
process.exit(falhas.length ? 1 : 0);
