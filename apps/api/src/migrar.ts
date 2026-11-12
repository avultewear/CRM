import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';

const PASTA = join(dirname(fileURLToPath(import.meta.url)), '..', 'migracoes');

/** Aplica, em ordem, os arquivos .sql ainda não aplicados. Cada arquivo roda numa transação. */
export async function migrar(url: string): Promise<string[]> {
  const cliente = new pg.Client({ connectionString: url });
  await cliente.connect();
  const aplicadas: string[] = [];
  try {
    await cliente.query(
      'CREATE TABLE IF NOT EXISTS _migracao (arquivo text PRIMARY KEY, aplicada_em timestamptz NOT NULL DEFAULT now())',
    );
    const feitas = new Set((await cliente.query('SELECT arquivo FROM _migracao')).rows.map((l) => l.arquivo));
    for (const arquivo of readdirSync(PASTA).filter((a) => a.endsWith('.sql')).sort()) {
      if (feitas.has(arquivo)) continue;
      await cliente.query('BEGIN');
      try {
        await cliente.query(readFileSync(join(PASTA, arquivo), 'utf8'));
        await cliente.query('INSERT INTO _migracao (arquivo) VALUES ($1)', [arquivo]);
        await cliente.query('COMMIT');
        aplicadas.push(arquivo);
      } catch (erro) {
        await cliente.query('ROLLBACK');
        throw erro;
      }
    }
  } finally {
    await cliente.end();
  }
  return aplicadas;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { env } = await import('./env.js');
  const aplicadas = await migrar(env.DATABASE_URL);
  console.log(aplicadas.length ? `Migrações aplicadas: ${aplicadas.join(', ')}` : 'Nada a migrar.');
}
