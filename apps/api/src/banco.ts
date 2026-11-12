import { CamelCasePlugin, Kysely, PostgresDialect, type Generated } from 'kysely';
import pg from 'pg';
import type { Papel } from './papeis.js';

// numeric volta do Postgres como texto; a API converte para número na saída.
type Numerico = string | number | null;

export interface TabelaUsuario {
  id: Generated<string>;
  nome: string;
  email: string;
  senhaHash: string;
  papel: Papel;
  funcao: string | null;
  vende: Generated<boolean>;
  ativo: Generated<boolean>;
  metaMensal: Numerico;
  comissaoPct: Numerico;
  comissaoTeto: Numerico;
  limiteDescontoPct: Numerico;
  codigoVendedor: string | null;
  editaEstoque: Generated<boolean>;
  criadoEm: Generated<Date>;
  atualizadoEm: Generated<Date>;
}

export interface TabelaParametro {
  chave: string;
  valor: unknown;
  criadoEm: Generated<Date>;
  atualizadoEm: Generated<Date>;
}

export interface TabelaHistoricoParametro {
  id: Generated<string>;
  chave: string;
  valorAnterior: unknown | null;
  valorNovo: unknown;
  justificativa: string;
  autorId: string;
  criadoEm: Generated<Date>;
  atualizadoEm: Generated<Date>;
}

export interface TabelaAuditoria {
  id: Generated<string>;
  entidade: string;
  entidadeId: string;
  acao: string;
  campo: string | null;
  de: unknown | null;
  para: unknown | null;
  autorId: string | null;
  criadoEm: Generated<Date>;
  atualizadoEm: Generated<Date>;
}

export interface Tabelas {
  usuario: TabelaUsuario;
  parametro: TabelaParametro;
  historicoParametro: TabelaHistoricoParametro;
  auditoria: TabelaAuditoria;
}

export type Banco = Kysely<Tabelas>;

export function abrirBanco(url: string): Banco {
  return new Kysely<Tabelas>({
    dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: url, max: 5 }) }),
    plugins: [new CamelCasePlugin()],
  });
}

/** Valores jsonb precisam ir como texto JSON (inclusive números e textos soltos). */
export const comoJson = (valor: unknown) => JSON.stringify(valor);
