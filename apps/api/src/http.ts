import type { Request, RequestHandler, Response } from 'express';
import type { Selectable } from 'kysely';
import type { Banco, TabelaUsuario } from './banco.js';

export type Usuario = Selectable<TabelaUsuario>;
export type Pedido = Request & { usuario: Usuario };

export class ErroHttp extends Error {
  constructor(public status: number, mensagem: string, public extra?: Record<string, unknown>) {
    super(mensagem);
  }
}

export interface LinhaAuditoria {
  entidade: string;
  entidadeId: string;
  acao: string;
  campo?: string;
  de?: unknown;
  para?: unknown;
  autorId: string | null;
}

/** O que cada módulo de rotas recebe do app: banco, login, permissão e auditoria. */
export interface Ferramentas {
  db: Banco;
  rota: (fn: (req: Pedido, res: Response) => Promise<unknown>) => RequestHandler;
  autenticar: RequestHandler;
  exigir: (permissao: string) => RequestHandler;
  auditar: (banco: Banco, linhas: LinhaAuditoria[]) => Promise<void>;
}
