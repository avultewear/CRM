// Cria uma pessoa FICTÍCIA por papel, para testes. Nunca use dados reais aqui.
import bcrypt from 'bcryptjs';
import { abrirBanco } from './banco.js';
import { env } from './env.js';
import { migrar } from './migrar.js';
import type { Papel } from './papeis.js';

const senha = process.env.SEMENTE_SENHA;
if (!senha || senha.length < 8) throw new Error('Defina SEMENTE_SENHA (8+ caracteres) no .env.');

const PESSOAS: Array<{ nome: string; email: string; papel: Papel; funcao: string; vende?: boolean }> = [
  { nome: 'Sócio Fundador (teste)', email: 'socio@avulte.teste', papel: 'SOCIO', funcao: 'Fundador' },
  { nome: 'Gerente (teste)', email: 'gerente@avulte.teste', papel: 'GERENTE', funcao: 'Gerente' },
  { nome: 'Vendedora (teste)', email: 'vendedor@avulte.teste', papel: 'VENDEDOR', funcao: 'Vendas', vende: true },
  { nome: 'Gestor de Tráfego (teste)', email: 'trafego@avulte.teste', papel: 'GESTOR_TRAFEGO', funcao: 'Tráfego pago' },
  { nome: 'Social Media (teste)', email: 'social@avulte.teste', papel: 'SOCIAL_MEDIA', funcao: 'Conteúdo' },
  { nome: 'Influenciadora (teste)', email: 'influenciador@avulte.teste', papel: 'INFLUENCIADOR', funcao: 'Parceira' },
];

await migrar(env.DATABASE_URL);
const db = abrirBanco(env.DATABASE_URL);
const senhaHash = await bcrypt.hash(senha, 10);
for (const pessoa of PESSOAS) {
  const existe = await db.selectFrom('usuario').select('id').where('email', '=', pessoa.email).executeTakeFirst();
  if (existe) continue;
  await db.insertInto('usuario').values({
    ...pessoa, senhaHash, metaMensal: null, comissaoPct: null, comissaoTeto: null, limiteDescontoPct: null, codigoVendedor: null,
  }).execute();
  console.log(`Criada: ${pessoa.email} (${pessoa.papel})`);
}
await db.destroy();
