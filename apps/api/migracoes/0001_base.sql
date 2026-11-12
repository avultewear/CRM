-- Etapa 1 (Base). Migrações só acrescentam: nunca altere este arquivo depois de aplicado.

CREATE TYPE papel AS ENUM (
  'SOCIO', 'GERENTE', 'VENDEDOR', 'GESTOR_TRAFEGO', 'SOCIAL_MEDIA', 'INFLUENCIADOR'
);

-- Pessoa da equipe (usuário do sistema)
CREATE TABLE usuario (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome                text NOT NULL,
  email               text NOT NULL UNIQUE,
  senha_hash          text NOT NULL,
  papel               papel NOT NULL,
  funcao              text,
  vende               boolean NOT NULL DEFAULT false,
  ativo               boolean NOT NULL DEFAULT true,
  meta_mensal         numeric(12, 2),
  comissao_pct        numeric(5, 2),
  comissao_teto       numeric(12, 2),
  limite_desconto_pct numeric(5, 2),
  codigo_vendedor     text UNIQUE,
  edita_estoque       boolean NOT NULL DEFAULT false,
  criado_em           timestamptz NOT NULL DEFAULT now(),
  atualizado_em       timestamptz NOT NULL DEFAULT now()
);

-- Valor atual de cada parâmetro dos Sócios (tela Metas)
CREATE TABLE parametro (
  chave         text PRIMARY KEY,
  valor         jsonb NOT NULL,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

-- Histórico de cada mudança de parâmetro, com justificativa
CREATE TABLE historico_parametro (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave          text NOT NULL,
  valor_anterior jsonb,
  valor_novo     jsonb NOT NULL,
  justificativa  text NOT NULL,
  autor_id       uuid NOT NULL REFERENCES usuario (id),
  criado_em      timestamptz NOT NULL DEFAULT now(),
  atualizado_em  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX historico_parametro_chave_idx ON historico_parametro (chave, criado_em DESC);

-- Auditoria: quem mudou, o quê, de qual valor para qual, quando
CREATE TABLE auditoria (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entidade      text NOT NULL,
  entidade_id   text NOT NULL,
  acao          text NOT NULL,
  campo         text,
  de            jsonb,
  para          jsonb,
  autor_id      uuid REFERENCES usuario (id),
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auditoria_entidade_idx ON auditoria (entidade, entidade_id);
CREATE INDEX auditoria_criado_em_idx ON auditoria (criado_em DESC);

-- Gatilho: auditoria e histórico de parâmetros não podem ser alterados nem apagados
CREATE FUNCTION impedir_alteracao() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'registro imutavel: a tabela % nao aceita alterar nem apagar', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auditoria_imutavel
  BEFORE UPDATE OR DELETE ON auditoria
  FOR EACH ROW EXECUTE FUNCTION impedir_alteracao();
CREATE TRIGGER auditoria_sem_truncate
  BEFORE TRUNCATE ON auditoria
  FOR EACH STATEMENT EXECUTE FUNCTION impedir_alteracao();

CREATE TRIGGER historico_parametro_imutavel
  BEFORE UPDATE OR DELETE ON historico_parametro
  FOR EACH ROW EXECUTE FUNCTION impedir_alteracao();
CREATE TRIGGER historico_parametro_sem_truncate
  BEFORE TRUNCATE ON historico_parametro
  FOR EACH STATEMENT EXECUTE FUNCTION impedir_alteracao();
