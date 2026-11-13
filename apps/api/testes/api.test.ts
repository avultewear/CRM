import bcrypt from 'bcryptjs';
import { sql } from 'kysely';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { criarApp } from '../src/app.js';
import { abrirBanco, type Banco } from '../src/banco.js';
import { PAPEIS, type Papel } from '../src/papeis.js';
import prepararBanco, { URL_TESTE } from './preparar-banco.js';

// Dados fictícios: nenhum cliente ou pessoa real.
const SENHA = 'senha-de-teste-123';
let db: Banco;
let app: ReturnType<typeof criarApp>;
const token = {} as Record<Papel, string>;
const id = {} as Record<Papel, string>;

async function entrar(email: string, senha = SENHA) {
  return request(app).post('/auth/login').send({ email, senha });
}
const como = (papel: Papel) => ({ Authorization: `Bearer ${token[papel]}` });

beforeAll(async () => {
  await prepararBanco(); // cada arquivo de teste começa com o banco de teste zerado
  db = abrirBanco(URL_TESTE);
  app = criarApp({ db, jwtSegredo: 'segredo-de-teste-com-32-caracteres!!', origemWeb: 'http://localhost:3000' });
  const senhaHash = await bcrypt.hash(SENHA, 4);
  for (const papel of PAPEIS) {
    const linha = await db
      .insertInto('usuario')
      .values({
        nome: `Pessoa ${papel}`, email: `${papel.toLowerCase()}@teste.local`, senhaHash, papel,
        funcao: null, metaMensal: null, comissaoPct: papel === 'VENDEDOR' ? 5 : null,
        comissaoTeto: papel === 'VENDEDOR' ? 800 : null, limiteDescontoPct: null, codigoVendedor: null,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    id[papel] = linha.id;
    token[papel] = (await entrar(`${papel.toLowerCase()}@teste.local`)).body.token;
  }
});

afterAll(async () => {
  await db.destroy();
});

describe('login', () => {
  test('senha certa devolve token e a pessoa, sem o hash da senha', async () => {
    const r = await entrar('socio@teste.local');
    expect(r.status).toBe(200);
    expect(r.body.token).toEqual(expect.any(String));
    expect(r.body.usuario).toMatchObject({ email: 'socio@teste.local', papel: 'SOCIO' });
    expect(JSON.stringify(r.body)).not.toContain('senhaHash');
    expect(JSON.stringify(r.body)).not.toContain('$2');
  });
  test('senha errada é recusada', async () => {
    expect((await entrar('socio@teste.local', 'errada')).status).toBe(401);
  });
  test('e-mail que não existe é recusado com a mesma resposta', async () => {
    const r = await entrar('ninguem@teste.local');
    expect(r.status).toBe(401);
    expect(r.body.erro).toBe('E-mail ou senha incorretos.');
  });
  test('rota protegida sem token é recusada', async () => {
    expect((await request(app).get('/auth/eu')).status).toBe(401);
  });
  test('token adulterado é recusado', async () => {
    const r = await request(app).get('/auth/eu').set({ Authorization: `Bearer ${token.SOCIO}x` });
    expect(r.status).toBe(401);
  });
  test('/auth/eu devolve a pessoa e as permissões do papel', async () => {
    const r = await request(app).get('/auth/eu').set(como('GERENTE'));
    expect(r.status).toBe(200);
    expect(r.body.usuario.papel).toBe('GERENTE');
    expect(r.body.permissoes).toContain('equipe.ver');
    expect(r.body.permissoes).not.toContain('cifras.ver');
  });
});

describe('freio de tentativas', () => {
  test('8 senhas erradas seguidas travam a entrada daquele e-mail', async () => {
    for (let i = 0; i < 8; i++) expect((await entrar('alvo@teste.local', 'errada')).status).toBe(401);
    const travada = await entrar('alvo@teste.local', 'errada');
    expect(travada.status).toBe(429);
    // Os outros e-mails continuam entrando normalmente.
    expect((await entrar('socio@teste.local')).status).toBe(200);
  });
});

describe('acesso por papel', () => {
  const rotas: Array<[string, Papel[]]> = [
    ['/parametros', ['SOCIO']],
    ['/auditoria', ['SOCIO']],
    ['/equipe', ['SOCIO', 'GERENTE']],
    ['/metricas', ['SOCIO', 'GERENTE', 'VENDEDOR', 'GESTOR_TRAFEGO', 'SOCIAL_MEDIA']],
  ];
  for (const [rota, permitidos] of rotas) {
    for (const papel of PAPEIS) {
      const esperado = permitidos.includes(papel) ? 200 : 403;
      test(`${papel} em GET ${rota} recebe ${esperado}`, async () => {
        expect((await request(app).get(rota).set(como(papel))).status).toBe(esperado);
      });
    }
  }
  test('o Gerente lista a equipe sem % nem teto de comissão', async () => {
    const r = await request(app).get('/equipe').set(como('GERENTE'));
    const vendedor = r.body.find((p: { papel: string }) => p.papel === 'VENDEDOR');
    expect(vendedor.nome).toBe('Pessoa VENDEDOR');
    expect(vendedor).not.toHaveProperty('comissaoPct');
    expect(vendedor).not.toHaveProperty('comissaoTeto');
  });
  test('o Sócio lista a equipe com % e teto de comissão, em número', async () => {
    const r = await request(app).get('/equipe').set(como('SOCIO'));
    const vendedor = r.body.find((p: { papel: string }) => p.papel === 'VENDEDOR');
    expect(vendedor.comissaoPct).toBe(5);
    expect(vendedor.comissaoTeto).toBe(800);
  });
  test('o vendedor vê a própria comissão em /auth/eu', async () => {
    const r = await request(app).get('/auth/eu').set(como('VENDEDOR'));
    expect(r.body.usuario.comissaoPct).toBe(5);
  });
  test('as métricas do Gerente não trazem pró-labore nem lucro', async () => {
    const ids = (await request(app).get('/metricas').set(como('GERENTE'))).body.map((m: { id: string }) => m.id);
    expect(ids).not.toContain('pro_labore');
    expect(ids).not.toContain('lucro');
    expect(ids).toContain('receita');
  });
});

describe('equipe', () => {
  test('o Sócio cadastra uma pessoa, que já consegue entrar', async () => {
    const r = await request(app).post('/equipe').set(como('SOCIO')).send({
      nome: 'Vendedora Fictícia', email: 'nova@teste.local', senha: 'outra-senha-123', papel: 'VENDEDOR', vende: true,
    });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ nome: 'Vendedora Fictícia', papel: 'VENDEDOR', vende: true, ativo: true });
    expect((await entrar('nova@teste.local', 'outra-senha-123')).status).toBe(200);
  });
  test('o cadastro fica na auditoria, sem a senha', async () => {
    const r = await request(app).post('/equipe').set(como('SOCIO')).send({
      nome: 'Auditada', email: 'auditada@teste.local', senha: 'segredo-que-nao-vaza', papel: 'SOCIAL_MEDIA',
    });
    const linhas = await db.selectFrom('auditoria').selectAll().where('entidadeId', '=', r.body.id).execute();
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({ entidade: 'usuario', acao: 'criar', autorId: id.SOCIO });
    expect(JSON.stringify(linhas)).not.toContain('segredo-que-nao-vaza');
    expect(JSON.stringify(linhas)).not.toContain('senha');
  });
  test('e-mail repetido é recusado', async () => {
    const r = await request(app).post('/equipe').set(como('SOCIO')).send({
      nome: 'Repetida', email: 'socio@teste.local', senha: 'outra-senha-123', papel: 'VENDEDOR',
    });
    expect(r.status).toBe(409);
  });
  test('senha curta é recusada', async () => {
    const r = await request(app).post('/equipe').set(como('SOCIO')).send({
      nome: 'Curta', email: 'curta@teste.local', senha: '123', papel: 'VENDEDOR',
    });
    expect(r.status).toBe(400);
  });
  test('o Gerente cadastra vendedor, mas não cadastra Sócio', async () => {
    const ok = await request(app).post('/equipe').set(como('GERENTE')).send({
      nome: 'Do Gerente', email: 'dogerente@teste.local', senha: 'outra-senha-123', papel: 'VENDEDOR',
    });
    expect(ok.status).toBe(201);
    const nao = await request(app).post('/equipe').set(como('GERENTE')).send({
      nome: 'Falso Sócio', email: 'falso@teste.local', senha: 'outra-senha-123', papel: 'SOCIO',
    });
    expect(nao.status).toBe(403);
  });
  test('o Gerente não altera um Sócio', async () => {
    const r = await request(app).patch(`/equipe/${id.SOCIO}`).set(como('GERENTE')).send({ nome: 'Trocado' });
    expect(r.status).toBe(403);
  });
  test('o Gerente não altera comissão, teto nem limite de desconto', async () => {
    for (const corpo of [{ comissaoPct: 50 }, { comissaoTeto: 99999 }, { limiteDescontoPct: 90 }]) {
      const r = await request(app).patch(`/equipe/${id.VENDEDOR}`).set(como('GERENTE')).send(corpo);
      expect(r.status, JSON.stringify(corpo)).toBe(403);
    }
  });
  test('o Gerente vê a meta de cada pessoa, mas só um Sócio altera (regra 7)', async () => {
    const nao = await request(app).patch(`/equipe/${id.VENDEDOR}`).set(como('GERENTE')).send({ metaMensal: 9000 });
    expect(nao.status).toBe(403);
    const sim = await request(app).patch(`/equipe/${id.VENDEDOR}`).set(como('SOCIO')).send({ metaMensal: 9000 });
    expect(sim.status).toBe(200);
    const lista = await request(app).get('/equipe').set(como('GERENTE'));
    expect(lista.body.find((p: { id: string }) => p.id === id.VENDEDOR).metaMensal).toBe(9000);
  });
  test('o código do vendedor é único e fica em maiúsculas', async () => {
    const r = await request(app).patch(`/equipe/${id.VENDEDOR}`).set(como('GERENTE')).send({ codigoVendedor: 'ana01' });
    expect(r.status).toBe(200);
    expect(r.body.codigoVendedor).toBe('ANA01');
    const repetido = await request(app).patch(`/equipe/${id.GERENTE}`).set(como('SOCIO')).send({ codigoVendedor: 'ANA01' });
    expect(repetido.status).toBe(409);
    const invalido = await request(app).patch(`/equipe/${id.VENDEDOR}`).set(como('SOCIO')).send({ codigoVendedor: 'a b' });
    expect(invalido.status).toBe(400);
  });
  test('cada campo alterado vai para a auditoria com o valor de antes e o de depois', async () => {
    const r = await request(app).patch(`/equipe/${id.VENDEDOR}`).set(como('SOCIO')).send({ comissaoPct: 6, funcao: 'Vendas' });
    expect(r.status).toBe(200);
    expect(r.body.comissaoPct).toBe(6);
    const linhas = await db.selectFrom('auditoria').selectAll()
      .where('entidadeId', '=', id.VENDEDOR).where('acao', '=', 'alterar').execute();
    expect(linhas.find((l) => l.campo === 'comissaoPct')).toMatchObject({ de: 5, para: 6, autorId: id.SOCIO });
    expect(linhas.find((l) => l.campo === 'funcao')).toMatchObject({ de: null, para: 'Vendas' });
  });
  test('alterar para o mesmo valor não gera linha de auditoria', async () => {
    const antes = await db.selectFrom('auditoria').select('id').where('entidadeId', '=', id.SOCIAL_MEDIA).execute();
    await request(app).patch(`/equipe/${id.SOCIAL_MEDIA}`).set(como('SOCIO')).send({ nome: 'Pessoa SOCIAL_MEDIA' });
    const depois = await db.selectFrom('auditoria').select('id').where('entidadeId', '=', id.SOCIAL_MEDIA).execute();
    expect(depois).toHaveLength(antes.length);
  });
  test('trocar a senha registra a troca sem guardar a senha nem o hash', async () => {
    await request(app).patch(`/equipe/${id.GESTOR_TRAFEGO}`).set(como('SOCIO')).send({ senha: 'nova-senha-secreta-9' });
    const linhas = await db.selectFrom('auditoria').selectAll().where('entidadeId', '=', id.GESTOR_TRAFEGO).execute();
    expect(linhas.some((l) => l.campo === 'senha')).toBe(true);
    expect(JSON.stringify(linhas)).not.toContain('nova-senha-secreta-9');
    expect(JSON.stringify(linhas)).not.toContain('$2');
    expect((await entrar('gestor_trafego@teste.local', 'nova-senha-secreta-9')).status).toBe(200);
  });
  test('ninguém é apagado: não existe rota de exclusão', async () => {
    const r = await request(app).delete(`/equipe/${id.INFLUENCIADOR}`).set(como('SOCIO'));
    expect(r.status).toBe(404);
    expect(await db.selectFrom('usuario').select('id').where('id', '=', id.INFLUENCIADOR).executeTakeFirst()).toBeTruthy();
  });
  test('pessoa desativada não entra e o token antigo para de valer', async () => {
    const criada = await request(app).post('/equipe').set(como('SOCIO')).send({
      nome: 'Vai Sair', email: 'sai@teste.local', senha: 'outra-senha-123', papel: 'VENDEDOR',
    });
    const tokenAntigo = (await entrar('sai@teste.local', 'outra-senha-123')).body.token;
    await request(app).patch(`/equipe/${criada.body.id}`).set(como('SOCIO')).send({ ativo: false });
    expect((await entrar('sai@teste.local', 'outra-senha-123')).status).toBe(401);
    expect((await request(app).get('/auth/eu').set({ Authorization: `Bearer ${tokenAntigo}` })).status).toBe(401);
  });
  test('o Sócio não desativa a si mesmo', async () => {
    const r = await request(app).patch(`/equipe/${id.SOCIO}`).set(como('SOCIO')).send({ ativo: false });
    expect(r.status).toBe(400);
  });
});

describe('parâmetros (Metas)', () => {
  test('a lista traz o catálogo inteiro, com valor vazio para o que ainda não foi definido', async () => {
    const r = await request(app).get('/parametros').set(como('SOCIO'));
    const meta = r.body.find((p: { chave: string }) => p.chave === 'meta_faturamento_anual');
    expect(meta).toMatchObject({ rotulo: expect.any(String), grupo: expect.any(String), tipo: 'moeda', valor: null });
  });
  test('mudança sem justificativa é recusada', async () => {
    const r = await request(app).put('/parametros/prolabore_pct').set(como('SOCIO')).send({ valor: 10 });
    expect(r.status).toBe(400);
    const atual = await db.selectFrom('parametro').selectAll().where('chave', '=', 'prolabore_pct').executeTakeFirst();
    expect(atual).toBeUndefined();
  });
  test('mudança com justificativa grava o valor, o histórico e a auditoria', async () => {
    const um = await request(app).put('/parametros/prolabore_pct').set(como('SOCIO'))
      .send({ valor: 10, justificativa: 'Acordo inicial entre os sócios' });
    expect(um.status).toBe(200);
    await request(app).put('/parametros/prolabore_pct').set(como('SOCIO'))
      .send({ valor: 12, justificativa: 'Revisão depois do primeiro mês' });

    const lista = await request(app).get('/parametros').set(como('SOCIO'));
    expect(lista.body.find((p: { chave: string }) => p.chave === 'prolabore_pct').valor).toBe(12);

    const hist = await request(app).get('/parametros/prolabore_pct/historico').set(como('SOCIO'));
    expect(hist.body).toHaveLength(2);
    expect(hist.body[0]).toMatchObject({ valorAnterior: 10, valorNovo: 12, justificativa: 'Revisão depois do primeiro mês', autor: 'Pessoa SOCIO' });
    expect(hist.body[1]).toMatchObject({ valorAnterior: null, valorNovo: 10 });

    const aud = await db.selectFrom('auditoria').selectAll().where('entidade', '=', 'parametro').where('entidadeId', '=', 'prolabore_pct').execute();
    expect(aud).toHaveLength(2);
  });
  test('valor fora do tipo é recusado', async () => {
    const r = await request(app).put('/parametros/prolabore_pct').set(como('SOCIO'))
      .send({ valor: 150, justificativa: 'Tentativa inválida de teste' });
    expect(r.status).toBe(400);
  });
  test('parâmetro fora do catálogo não existe', async () => {
    const r = await request(app).put('/parametros/inventado').set(como('SOCIO'))
      .send({ valor: 1, justificativa: 'Tentativa inválida de teste' });
    expect(r.status).toBe(404);
  });
  test('o Gerente não muda parâmetro', async () => {
    const r = await request(app).put('/parametros/prolabore_pct').set(como('GERENTE'))
      .send({ valor: 99, justificativa: 'Tentativa sem permissão' });
    expect(r.status).toBe(403);
  });
});

describe('registros imutáveis', () => {
  test('a auditoria não aceita alteração', async () => {
    await expect(db.updateTable('auditoria').set({ acao: 'adulterado' }).execute()).rejects.toThrow(/imutavel/);
  });
  test('a auditoria não aceita exclusão', async () => {
    await expect(db.deleteFrom('auditoria').execute()).rejects.toThrow(/imutavel/);
  });
  test('a auditoria e o histórico não aceitam ser esvaziados (TRUNCATE)', async () => {
    await expect(sql`TRUNCATE auditoria`.execute(db)).rejects.toThrow(/imutavel/);
    await expect(sql`TRUNCATE historico_parametro`.execute(db)).rejects.toThrow(/imutavel/);
  });
  test('o histórico de parâmetros não aceita alteração nem exclusão', async () => {
    await expect(db.updateTable('historicoParametro').set({ justificativa: 'x' }).execute()).rejects.toThrow(/imutavel/);
    await expect(db.deleteFrom('historicoParametro').execute()).rejects.toThrow(/imutavel/);
  });
});

describe('auditoria (consulta)', () => {
  test('o Sócio consulta a auditoria com o nome de quem mudou, do mais novo para o mais antigo', async () => {
    const r = await request(app).get('/auditoria?limite=5').set(como('SOCIO'));
    expect(r.status).toBe(200);
    expect(r.body.length).toBeGreaterThan(0);
    expect(r.body.length).toBeLessThanOrEqual(5);
    expect(r.body[0]).toMatchObject({ entidade: expect.any(String), acao: expect.any(String), autor: expect.any(String) });
    const datas = r.body.map((l: { criadoEm: string }) => l.criadoEm);
    expect([...datas].sort().reverse()).toEqual(datas);
  });
});
