-- Etapa 4: Clientes, pós-venda e recompra. Só acrescenta.

ALTER TABLE cliente ADD COLUMN etiquetas text[] NOT NULL DEFAULT '{}';     -- comunidade: CORRE, TREINA, GRUPO, DIVULGADOR
ALTER TABLE cliente ADD COLUMN codigo_indicacao text UNIQUE;               -- cada cliente tem o seu

ALTER TABLE venda_direta ADD COLUMN indicado_por_id uuid REFERENCES cliente (id);  -- venda que chegou com o código de alguém
ALTER TABLE venda_direta ADD COLUMN devolvida_em timestamptz;                      -- valor devolvido: deixa de contar como compra
CREATE INDEX venda_direta_cliente_idx ON venda_direta (cliente_id) WHERE situacao = 'CONFIRMADA';

-- Tarefas de sequência (pós-compra, recompra, em risco) são do cliente, não de uma oportunidade.
ALTER TABLE atividade ADD COLUMN cliente_id uuid REFERENCES cliente (id);
ALTER TABLE atividade ADD COLUMN sequencia text CHECK (sequencia IN ('POS_COMPRA', 'RECOMPRA', 'EM_RISCO'));
ALTER TABLE atividade ADD COLUMN referencia text;   -- a compra que disparou o passo: o mesmo passo não se repete
ALTER TABLE atividade DROP CONSTRAINT atividade_tipo_check;
ALTER TABLE atividade ADD CONSTRAINT atividade_tipo_check CHECK (tipo IN ('FOLLOW', 'LEMBRETE', 'PRIMEIRO_CONTATO', 'SEQUENCIA'));
CREATE UNIQUE INDEX atividade_sequencia_idx ON atividade (cliente_id, sequencia, referencia) WHERE sequencia IS NOT NULL;

-- Troca ou devolução: solicitada → peça recebida → resolvida (nova peça enviada ou valor devolvido).
CREATE TABLE troca (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venda_direta_id uuid NOT NULL REFERENCES venda_direta (id),
  cliente_id      uuid NOT NULL REFERENCES cliente (id),
  item            text NOT NULL,                 -- a peça que volta, como está na venda
  quantidade      integer NOT NULL DEFAULT 1 CHECK (quantidade > 0),
  motivo          text NOT NULL CHECK (motivo IN ('TAMANHO', 'DEFEITO', 'NAO_GOSTOU', 'ARREPENDIMENTO')),
  situacao        text NOT NULL DEFAULT 'SOLICITADA' CHECK (situacao IN ('SOLICITADA', 'PECA_RECEBIDA', 'RESOLVIDA')),
  estado_da_peca  text CHECK (estado_da_peca IN ('BOM', 'DEFEITO')),
  resolucao       text CHECK (resolucao IN ('NOVA_PECA', 'VALOR_DEVOLVIDO')),
  observacao      text,
  aberta_por      uuid NOT NULL REFERENCES usuario (id),
  recebida_em     timestamptz,
  resolvida_por   uuid REFERENCES usuario (id),
  resolvida_em    timestamptz,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX troca_venda_idx ON troca (venda_direta_id);
CREATE INDEX troca_abertas_idx ON troca (criado_em) WHERE situacao <> 'RESOLVIDA';

-- Brindes e premiações: quem recebeu, o quê e por quê. O custo é cifra dos Sócios.
CREATE TABLE brinde (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id    uuid NOT NULL REFERENCES cliente (id),
  descricao     text NOT NULL,
  motivo        text NOT NULL,
  custo         numeric(12, 2) CHECK (custo >= 0),
  entregue_em   date NOT NULL,
  criado_por    uuid NOT NULL REFERENCES usuario (id),
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX brinde_cliente_idx ON brinde (cliente_id);
