-- Etapa 3 (Atendimento). Migrações só acrescentam: nunca altere este arquivo depois de aplicado.

-- Cliente: o mesmo telefone nunca vira cadastro duplicado.
CREATE TABLE cliente (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome             text NOT NULL,
  telefone         text NOT NULL UNIQUE,   -- só dígitos, com o código do país
  email            text,
  cpf              text UNIQUE,            -- só dígitos; a API só devolve mascarado
  bloqueado        boolean NOT NULL DEFAULT false,  -- pediu para não ser contatado
  aceite_mensagens boolean NOT NULL DEFAULT false,  -- aceitou receber ofertas
  aceite_em        timestamptz,
  aceite_canal     text,
  vendedor_id      uuid REFERENCES usuario (id),    -- cliente que volta fica com o mesmo vendedor
  criado_em        timestamptz NOT NULL DEFAULT now(),
  atualizado_em    timestamptz NOT NULL DEFAULT now()
);

-- Oportunidade (lead): um cliente pode ter várias.
CREATE TABLE oportunidade (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id               uuid NOT NULL REFERENCES cliente (id),
  vendedor_id              uuid REFERENCES usuario (id),
  tipo                     text NOT NULL DEFAULT 'VAREJO' CHECK (tipo IN ('VAREJO', 'ATACADO', 'WHITE_LABEL')),
  etapa                    text NOT NULL DEFAULT 'LEAD'
                             CHECK (etapa IN ('LEAD', 'ABORDADO', 'LEVANTAMENTO', 'NEGOCIACAO', 'VENDA', 'RECUPERACAO')),
  situacao                 text NOT NULL DEFAULT 'ABERTA'
                             CHECK (situacao IN ('ABERTA', 'GANHA', 'ENCERRADA', 'DESCARTADA')),
  entrou_na_etapa_em       timestamptz NOT NULL DEFAULT now(),
  canal                    text NOT NULL CHECK (canal IN ('WHATSAPP', 'INSTAGRAM', 'SITE', 'MANUAL')),
  origem                   text NOT NULL
                             CHECK (origem IN ('ANUNCIO', 'POST', 'INFLUENCIADOR', 'INDICACAO', 'ORGANICO', 'OUTRO')),
  origem_detalhe           text,
  interesse                text,
  tamanho                  text,
  quantidade               integer CHECK (quantidade > 0),
  valor                    numeric(12, 2) CHECK (valor >= 0),
  cupom                    text,
  link_enviado_em          timestamptz,
  temperatura              text CHECK (temperatura IN ('FRIA', 'MORNA', 'QUENTE')),
  etiquetas                text[] NOT NULL DEFAULT '{}',
  primeira_resposta_em     timestamptz,   -- primeira resposta de uma pessoa da loja
  motivo_perda             text,
  destino_perda            text CHECK (destino_perda IN ('RECUPERACAO', 'ENCERRADA', 'NAO_CONTA')),
  perdida_em               timestamptz,
  etapa_da_perda           text,
  etapa_antes_recuperacao  text,
  tentativas_recuperacao   integer NOT NULL DEFAULT 0,
  criado_em                timestamptz NOT NULL DEFAULT now(),
  atualizado_em            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX oportunidade_cliente_idx ON oportunidade (cliente_id);
CREATE INDEX oportunidade_vendedor_idx ON oportunidade (vendedor_id);
CREATE INDEX oportunidade_abertas_idx ON oportunidade (etapa) WHERE situacao = 'ABERTA';

-- Histórico de etapas: uma linha por passagem. Conversões e tempos saem daqui.
CREATE TABLE historico_etapa (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  oportunidade_id uuid NOT NULL REFERENCES oportunidade (id),
  etapa_anterior  text,
  etapa_nova      text NOT NULL,
  entrou_em       timestamptz NOT NULL DEFAULT now(),
  saiu_em         timestamptz,
  autor_id        uuid REFERENCES usuario (id),
  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX historico_etapa_oportunidade_idx ON historico_etapa (oportunidade_id, entrou_em);
CREATE INDEX historico_etapa_entrada_idx ON historico_etapa (entrou_em);

-- Atividade (tarefa): follow, lembrete, primeiro contato.
CREATE TABLE atividade (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo            text NOT NULL CHECK (tipo IN ('FOLLOW', 'LEMBRETE', 'PRIMEIRO_CONTATO')),
  origem          text NOT NULL DEFAULT 'oportunidade',
  oportunidade_id uuid REFERENCES oportunidade (id),
  responsavel_id  uuid NOT NULL REFERENCES usuario (id),
  titulo          text NOT NULL,
  mensagem        text,                    -- mensagem pronta para o vendedor enviar
  prazo           timestamptz NOT NULL,
  status          text NOT NULL DEFAULT 'ABERTA' CHECK (status IN ('ABERTA', 'FEITA', 'CANCELADA')),
  resultado       text,
  concluida_em    timestamptz,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX atividade_abertas_idx ON atividade (responsavel_id, prazo) WHERE status = 'ABERTA';
CREATE INDEX atividade_oportunidade_idx ON atividade (oportunidade_id);

-- Notas da negociação: só da equipe, nunca vão para a IA.
CREATE TABLE nota (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  oportunidade_id uuid NOT NULL REFERENCES oportunidade (id),
  autor_id        uuid NOT NULL REFERENCES usuario (id),
  texto           text NOT NULL,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX nota_oportunidade_idx ON nota (oportunidade_id, criado_em);

-- Venda direta (Pix ou dinheiro, fora do site): lançada pelo vendedor, confirmada pelos Sócios.
CREATE TABLE venda_direta (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  oportunidade_id uuid NOT NULL REFERENCES oportunidade (id),
  cliente_id      uuid NOT NULL REFERENCES cliente (id),
  vendedor_id     uuid REFERENCES usuario (id),
  itens           jsonb NOT NULL,
  valor_tabela    numeric(12, 2) NOT NULL CHECK (valor_tabela >= 0),
  valor           numeric(12, 2) NOT NULL CHECK (valor >= 0),
  forma_pagamento text NOT NULL CHECK (forma_pagamento IN ('PIX', 'DINHEIRO')),
  situacao        text NOT NULL DEFAULT 'AGUARDANDO' CHECK (situacao IN ('AGUARDANDO', 'CONFIRMADA', 'CANCELADA')),
  lancada_por     uuid NOT NULL REFERENCES usuario (id),
  decidida_por    uuid REFERENCES usuario (id),
  decidida_em     timestamptz,
  motivo_recusa   text,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX venda_direta_situacao_idx ON venda_direta (situacao, criado_em);
CREATE UNIQUE INDEX venda_direta_uma_aguardando_idx ON venda_direta (oportunidade_id) WHERE situacao = 'AGUARDANDO';
