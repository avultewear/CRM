import { criarApp } from './app.js';
import { abrirBanco } from './banco.js';
import { env } from './env.js';

const app = criarApp({ db: abrirBanco(env.DATABASE_URL), jwtSegredo: env.JWT_SEGREDO, origemWeb: env.ORIGEM_WEB, rotinaSegredo: env.ROTINA_SEGREDO, metaChave: env.META_CHAVE, metaVersao: env.META_API_VERSAO });

// Em hospedagem serverless o app é exportado; fora dela, escuta a porta.
if (!process.env.VERCEL) {
  app.listen(env.PORTA, () => console.log(`API da Avulte na porta ${env.PORTA}`));
}

export default app;
