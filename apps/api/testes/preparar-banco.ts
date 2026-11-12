import pg from 'pg';
import { migrar } from '../src/migrar.js';

export const URL_TESTE =
  process.env.DATABASE_URL_TESTE ?? 'postgresql://avulte:avulte@localhost:5432/avulte_teste';

/** Zera o banco de TESTE e aplica as migrações. Nunca aponta para dados reais. */
export default async function prepararBanco() {
  if (!/teste/.test(URL_TESTE)) throw new Error('O banco de teste precisa ter "teste" no nome.');
  const cliente = new pg.Client({ connectionString: URL_TESTE });
  await cliente.connect();
  await cliente.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await cliente.end();
  await migrar(URL_TESTE);
}
