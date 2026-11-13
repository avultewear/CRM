-- Etapa 6: Painel, Daily, Reuniões e custos do mês. Só acrescenta.

-- Custos lançados à mão pelos Sócios, por mês. Nada é apagado: um lançamento errado é anulado.
CREATE TABLE custo_mes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competencia  text NOT NULL CHECK (competencia ~ '^\d{4}-\d{2}$'),
  categoria    text NOT NULL CHECK (categoria IN ('PRODUCAO', 'EMBALAGEM', 'FRETE', 'MARKETING', 'FERRAMENTAS', 'PESSOAL', 'IMPOSTOS', 'OUTROS')),
  descricao    text NOT NULL,
  valor        numeric(12, 2) NOT NULL CHECK (valor > 0),
  criado_por   uuid NOT NULL REFERENCES usuario (id),
  anulado_em   timestamptz,
  anulado_por  uuid REFERENCES usuario (id),
  motivo_anulacao text,
  criado_em    timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX custo_mes_competencia_idx ON custo_mes (competencia) WHERE anulado_em IS NULL;

-- Reunião (Daily): a ata guarda os números do momento, os blocos pulados e o que foi tratado.
CREATE TABLE reuniao (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo          text NOT NULL DEFAULT 'DAILY' CHECK (tipo IN ('DAILY')),
  modo          text NOT NULL CHECK (modo IN ('GESTAO', 'EQUIPE')),
  aberta_por    uuid NOT NULL REFERENCES usuario (id),
  iniciada_em   timestamptz NOT NULL DEFAULT now(),
  encerrada_em  timestamptz,
  ata           jsonb,              -- preenchida no encerramento
  tratados      jsonb NOT NULL DEFAULT '[]',
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX reuniao_uma_aberta_idx ON reuniao (tipo) WHERE encerrada_em IS NULL;

-- "Decidido" no Daily cria uma tarefa ligada à reunião.
ALTER TABLE atividade ADD COLUMN reuniao_id uuid REFERENCES reuniao (id);
ALTER TABLE atividade ADD COLUMN bloco text;
ALTER TABLE atividade DROP CONSTRAINT atividade_tipo_check;
ALTER TABLE atividade ADD CONSTRAINT atividade_tipo_check CHECK (tipo IN ('FOLLOW', 'LEMBRETE', 'PRIMEIRO_CONTATO', 'SEQUENCIA', 'DECISAO'));
CREATE INDEX atividade_reuniao_idx ON atividade (reuniao_id) WHERE reuniao_id IS NOT NULL;
