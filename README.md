# Avulte Wear — Sistema comercial

Entregue até aqui:

- **Etapa 1 (Base):** login, papéis, moldura e design system, dicionário de métricas, auditoria
  imutável, Metas e Equipe › Acessos. Relatório em `RELATORIO-ETAPA-1.md`.
- **Etapa 3 (Atendimento):** quadro com as 6 etapas, painel do lead, perdas com destino, rodízio,
  follow como tarefa e venda direta confirmada pelos Sócios. Relatório em `RELATORIO-ETAPA-3.md`.

- **Etapa 5 (Cupons, comissões e influenciadores):** gestão de influenciadores, cupom na venda
  direta, pró-labore e comissões com teto e liberação, Financeiro dos Sócios e o espaço do
  influenciador. Por enquanto a fonte das vendas é a venda direta. Relatório em `RELATORIO-ETAPA-5.md`.

A etapa 2 (loja ligada, Pedidos e Estoque) espera o plano da Hostinger e o código do site. As
demais abas já existem com cabeçalho, permissão e a tela vazia que ensina o primeiro passo.

## Estrutura

```
apps/api            API (Node.js + Express + TypeScript + Zod + JWT)
  migracoes/        Migrações SQL, só aditivas
  src/              papeis.ts (matriz de permissões), metricas.ts (dicionário),
                    parametros.ts (catálogo de Metas), calculo.ts (comparação e mediana), app.ts (rotas)
  testes/           Testes automáticos da API (Vitest)
apps/web            Telas (Next.js App Router + React + TypeScript, CSS próprio com tokens)
testes-aceite       Teste de aceite em navegador de verdade, com capturas de tela
```

## Rodar no computador

Precisa de Node.js 20 ou mais novo e de um PostgreSQL.

```bash
npm install

# 1. API
cp apps/api/.env.exemplo apps/api/.env      # preencha DATABASE_URL, JWT_SEGREDO e SEMENTE_SENHA
npm run migrar -w apps/api                  # cria as tabelas
npm run semear -w apps/api                  # cria uma pessoa FICTÍCIA por papel, para testar
npm run dev:api                             # http://localhost:4000

# 2. Telas (em outro terminal)
cp apps/web/.env.exemplo apps/web/.env.local
npm run dev:web                             # http://localhost:3000
```

As pessoas de teste entram com `socio@avulte.teste`, `gerente@avulte.teste`, `vendedor@avulte.teste`,
`trafego@avulte.teste`, `social@avulte.teste` e `influenciador@avulte.teste`, todas com a senha
definida em `SEMENTE_SENHA`. São dados fictícios: antes de usar de verdade, cadastre os Sócios reais
em Equipe e desative as pessoas de teste.

## Testes

```bash
npm test          # API: usa um banco de TESTE (o nome precisa conter "teste") e o zera a cada execução
npm run aceite    # navegador, etapa 1: precisa da API e das telas rodando e das pessoas do semear
npm run aceite:3  # navegador, etapa 3: precisa do banco recém-semeado, sem leads
npm run aceite:5  # navegador, etapa 5: banco recém-semeado; pode rodar logo depois dos outros dois
```

## Rotina do dia

`POST /rotinas/dia`, com o cabeçalho `x-rotina-segredo` igual a `ROTINA_SEGREDO`, libera as
comissões cujo prazo de troca venceu. Quando o sistema for publicado, um agendador chama essa rota
uma vez por dia. Sem `ROTINA_SEGREDO` definido, a rota recusa todas as chamadas.

## Demonstração clicável

`npm run demo` entra no sistema rodando, preenche o banco de desenvolvimento com dados fictícios,
retrata cada tela com quatro papéis (Sócio, Gerente, Vendedor e Influenciador) e monta uma página só, navegável, em
`demo/saida/index.html`. Ela serve para acompanhar o visual; nada é gravado nela.

## Decisões desta etapa

- **Banco sem Prisma.** O prompt pedia Prisma, mas os binários dele não puderam ser baixados no
  ambiente de construção. A API usa Kysely (consultas com tipos) e migrações em SQL puro, no mesmo
  PostgreSQL. As regras continuam as mesmas: migrações só aditivas e gatilho de imutabilidade.
- **Sessão.** O navegador nunca recebe o token: ele fica num cookie que só o servidor das telas lê,
  e o servidor repassa as chamadas para a API.
- **Nada é apagado.** Não existe rota de exclusão. Pessoa que sai fica inativa e perde o acesso na hora.
- **Auditoria só para os Sócios.** Ela guarda valores de comissão e de metas, que são cifras dos Sócios.

## Variáveis de ambiente

| Onde | Variável | Para quê |
| --- | --- | --- |
| API | `DATABASE_URL` | endereço do PostgreSQL |
| API | `JWT_SEGREDO` | segredo das sessões (16 caracteres ou mais, aleatório) |
| API | `ORIGEM_WEB` | endereço das telas |
| API | `PORTA` | porta da API (padrão 4000) |
| API | `SEMENTE_SENHA` | senha das pessoas fictícias do `semear` |
| API | `ROTINA_SEGREDO` | segredo da rotina do dia (16 caracteres ou mais, aleatório) |
| Telas | `API_URL` | endereço da API |

Chaves e senhas ficam só nas variáveis de ambiente, nunca no código.
