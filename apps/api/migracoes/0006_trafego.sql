-- Etapa 7: Tráfego. Só acrescenta.

-- Conexão com a conta de anúncios da Meta. O token fica cifrado (AES-256-GCM, chave em META_CHAVE).
CREATE TABLE meta_conexao (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_id           text NOT NULL,                 -- act_123...
  conta_nome         text,
  moeda              text,
  fuso               text,
  token_cifrado      text NOT NULL,
  conectada_por      uuid NOT NULL REFERENCES usuario (id),
  ativa              boolean NOT NULL DEFAULT true,
  ultimo_diagnostico jsonb,
  diagnosticada_em   timestamptz,
  sincronizada_em    timestamptz,                   -- última sincronização do dia
  historico_ate      date,                          -- até onde o histórico de 90 dias já desceu
  ultimo_erro        text,
  criado_em          timestamptz NOT NULL DEFAULT now(),
  atualizado_em      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX meta_conexao_uma_ativa_idx ON meta_conexao (ativa) WHERE ativa;

-- Estrutura: campanha → conjunto → anúncio (ids da Meta).
CREATE TABLE anuncio_campanha (
  id              text PRIMARY KEY,
  nome            text NOT NULL,
  objetivo        text,
  status          text,
  orcamento_diario numeric(12, 2),
  atualizado_em   timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE anuncio_conjunto (
  id               text PRIMARY KEY,
  campanha_id      text NOT NULL REFERENCES anuncio_campanha (id),
  nome             text NOT NULL,
  status           text,
  otimizacao       text,
  orcamento_diario numeric(12, 2),
  fase_aprendizado text,                       -- LEARNING, SUCCESS, FAIL (aprendizado limitado)
  publico          jsonb,                      -- idade, gênero, locais, interesses, Advantage+
  atualizado_em    timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE anuncio (
  id                  text PRIMARY KEY,
  conjunto_id         text NOT NULL REFERENCES anuncio_conjunto (id),
  nome                text NOT NULL,
  titulo              text,
  status              text,
  formato             text,                    -- IMAGEM, VIDEO, CARROSSEL
  miniatura_url       text,
  ranking_qualidade   text,                    -- ABOVE_AVERAGE, AVERAGE, BELOW_AVERAGE_10/20/35, UNKNOWN
  ranking_engajamento text,
  ranking_conversao   text,
  atualizado_em       timestamptz NOT NULL DEFAULT now()
);

-- Números por anúncio e por dia, como vêm da Meta.
CREATE TABLE anuncio_dia (
  anuncio_id     text NOT NULL REFERENCES anuncio (id),
  dia            date NOT NULL,
  investimento   numeric(12, 2) NOT NULL DEFAULT 0,
  impressoes     integer NOT NULL DEFAULT 0,
  alcance        integer,
  cliques_link   integer NOT NULL DEFAULT 0,
  conversas      integer NOT NULL DEFAULT 0,  -- conversas iniciadas
  conversas_profundas integer,                -- conversas com 2+ mensagens da pessoa (quando a Meta informa)
  video_plays    integer,
  video_p25      integer,
  video_p50      integer,
  video_p75      integer,
  video_p100     integer,
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (anuncio_id, dia)
);
CREATE INDEX anuncio_dia_dia_idx ON anuncio_dia (dia);

-- Públicos: a conta inteira, por dia e por recorte (idade × gênero, região, posicionamento, dispositivo, horário).
CREATE TABLE anuncio_publico_dia (
  dia           date NOT NULL,
  dimensao      text NOT NULL CHECK (dimensao IN ('IDADE_GENERO', 'REGIAO', 'POSICIONAMENTO', 'DISPOSITIVO', 'HORARIO')),
  chave         text NOT NULL,
  investimento  numeric(12, 2) NOT NULL DEFAULT 0,
  impressoes    integer NOT NULL DEFAULT 0,
  cliques_link  integer NOT NULL DEFAULT 0,
  conversas     integer NOT NULL DEFAULT 0,
  PRIMARY KEY (dia, dimensao, chave)
);

-- Gasto sem conexão: um Sócio digita o gasto do mês e o sistema distribui pelos dias.
CREATE TABLE gasto_manual (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competencia   text NOT NULL CHECK (competencia ~ '^\d{4}-\d{2}$'),
  valor         numeric(12, 2) NOT NULL CHECK (valor >= 0),
  criado_por    uuid NOT NULL REFERENCES usuario (id),
  substituido_em timestamptz,                -- um novo valor para o mesmo mês substitui o anterior
  criado_em     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX gasto_manual_vigente_idx ON gasto_manual (competencia) WHERE substituido_em IS NULL;

-- O lead que chega de anúncio guarda campanha, conjunto, anúncio e título.
ALTER TABLE oportunidade ADD COLUMN campanha_id text;
ALTER TABLE oportunidade ADD COLUMN conjunto_id text;
ALTER TABLE oportunidade ADD COLUMN anuncio_id text;
ALTER TABLE oportunidade ADD COLUMN anuncio_titulo text;
CREATE INDEX oportunidade_anuncio_idx ON oportunidade (anuncio_id) WHERE anuncio_id IS NOT NULL;
