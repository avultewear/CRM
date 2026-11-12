import { existsSync, readFileSync } from 'node:fs';
import { z } from 'zod';

// Lê o .env local, se existir. Em produção as variáveis vêm do ambiente da hospedagem.
if (existsSync('.env')) {
  for (const linha of readFileSync('.env', 'utf8').split('\n')) {
    const m = linha.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?(.*?)"?\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

export const env = z
  .object({
    DATABASE_URL: z.string().min(1),
    JWT_SEGREDO: z.string().min(16, 'JWT_SEGREDO precisa de pelo menos 16 caracteres'),
    PORTA: z.coerce.number().default(4000),
    ORIGEM_WEB: z.string().default('http://localhost:3000'),
  })
  .parse(process.env);
