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
    // Segredo das rotinas automáticas (cron externo). Sem ele, as rotas de rotina ficam desligadas.
    ROTINA_SEGREDO: z.string().min(16).optional(),
    // Chave que cifra o token da Meta no banco. Sem ela, a conexão com a conta de anúncios fica desligada.
    META_CHAVE: z.string().min(32, 'META_CHAVE precisa de pelo menos 32 caracteres').optional(),
    META_API_VERSAO: z.string().regex(/^v\d+\.\d$/).optional(),
  })
  .parse(process.env);
