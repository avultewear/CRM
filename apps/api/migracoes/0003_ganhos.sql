-- Etapa 5 (cupons, comissões e influenciadores). Migrações só acrescentam.

CREATE TABLE influenciador (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id    uuid UNIQUE REFERENCES usuario (id),  -- o login do influenciador, quando tiver acesso
  nome          text NOT NULL,
  arroba        text,                                 -- perfil no Instagram
  comissao_teto numeric(12, 2) CHECK (comissao_teto >= 0),  -- teto mensal próprio; sem ele vale o padrão de Metas
  ativo         boolean NOT NULL DEFAULT true,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE cupom (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo           text NOT NULL UNIQUE,              -- sempre em maiúsculas
  influenciador_id uuid NOT NULL REFERENCES influenciador (id),
  desconto_pct     numeric(5, 2) NOT NULL CHECK (desconto_pct BETWEEN 0 AND 100),
  comissao_pct     numeric(5, 2) CHECK (comissao_pct BETWEEN 0 AND 100),  -- sem ela vale o padrão de Metas
  validade         date,
  ativo            boolean NOT NULL DEFAULT true,
  criado_em        timestamptz NOT NULL DEFAULT now(),
  atualizado_em    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cupom_influenciador_idx ON cupom (influenciador_id);

ALTER TABLE venda_direta ADD COLUMN cupom_id uuid REFERENCES cupom (id);

-- Pró-labore e comissões gerados em cada venda confirmada.
CREATE TABLE ganho (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo             text NOT NULL CHECK (tipo IN ('PRO_LABORE', 'COMISSAO_VENDEDOR', 'COMISSAO_INFLUENCIADOR')),
  venda_direta_id  uuid REFERENCES venda_direta (id),  -- o pedido da loja entra na etapa 2
  usuario_id       uuid REFERENCES usuario (id),       -- o vendedor
  influenciador_id uuid REFERENCES influenciador (id),
  base             numeric(12, 2) NOT NULL,            -- valor da venda
  pct              numeric(5, 2) NOT NULL,
  valor_sem_teto   numeric(12, 2) NOT NULL,
  valor            numeric(12, 2) NOT NULL,            -- depois do teto mensal
  situacao         text NOT NULL DEFAULT 'AGUARDANDO' CHECK (situacao IN ('AGUARDANDO', 'LIBERADA', 'PAGA', 'CANCELADA')),
  competencia      text NOT NULL CHECK (competencia ~ '^\d{4}-\d{2}$'),  -- mês da venda, para o teto
  liberar_em       timestamptz,                        -- fim do prazo de troca; nulo se o prazo não foi definido
  liberada_em      timestamptz,
  paga_em          timestamptz,
  paga_por         uuid REFERENCES usuario (id),
  criado_em        timestamptz NOT NULL DEFAULT now(),
  atualizado_em    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ganho_usuario_idx ON ganho (usuario_id, competencia);
CREATE INDEX ganho_influenciador_idx ON ganho (influenciador_id, competencia);
CREATE INDEX ganho_situacao_idx ON ganho (situacao, liberar_em);
CREATE INDEX ganho_venda_idx ON ganho (venda_direta_id);

-- Peças enviadas a influenciadores. A baixa no estoque entra com a etapa 2.
CREATE TABLE peca_enviada (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  influenciador_id uuid NOT NULL REFERENCES influenciador (id),
  descricao        text NOT NULL,
  quantidade       integer NOT NULL CHECK (quantidade > 0),
  custo            numeric(12, 2) CHECK (custo >= 0),  -- só os Sócios veem e informam
  enviada_em       date NOT NULL,
  registrada_por   uuid NOT NULL REFERENCES usuario (id),
  criado_em        timestamptz NOT NULL DEFAULT now(),
  atualizado_em    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX peca_enviada_influenciador_idx ON peca_enviada (influenciador_id);

-- Posts combinados e posts feitos, por mês.
CREATE TABLE combinado_posts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  influenciador_id uuid NOT NULL REFERENCES influenciador (id),
  mes              text NOT NULL CHECK (mes ~ '^\d{4}-\d{2}$'),
  combinados       integer NOT NULL CHECK (combinados >= 0),
  feitos           integer NOT NULL CHECK (feitos >= 0),
  criado_em        timestamptz NOT NULL DEFAULT now(),
  atualizado_em    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (influenciador_id, mes)
);
