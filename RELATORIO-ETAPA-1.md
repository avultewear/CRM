# Relatório da etapa 1 (Base)

Data: 12/11/2026. Resultado: os três critérios de aceite passaram. A publicação num endereço
próprio não foi executada, porque ainda não há conta de hospedagem.

Todos os testes usaram dados fictícios. Nenhum dado real de cliente ou de pessoa foi usado.

## Critérios de aceite do prompt

| Critério | Resultado | Como foi testado |
| --- | --- | --- |
| Cada papel vê só o que deve | Passou | 6 papéis × 15 abas no navegador, mais as rotas da API, uma a uma |
| Claro e escuro funcionam | Passou | Cores medidas no navegador contra os tokens do prompt |
| Nenhuma tela com rolagem lateral em 390 px | Passou | Todas as telas de todos os papéis a 390 px de largura |

## Teste de aceite no navegador: 42 de 42 passaram

| Item | Resultado |
| --- | --- |
| Sem login, o sistema leva para a tela de entrada | Passou |
| Senha errada mostra o erro e não entra | Passou |
| Sócio: o menu mostra exatamente as 14 abas do papel | Passou |
| Sócio: toda aba do papel abre; a de fora (Meu espaço) é barrada | Passou |
| Gerente: menu sem Metas, Financeiro, Tráfego e Auditoria | Passou |
| Gerente: toda aba do papel abre; as de fora são barradas, mesmo pelo endereço | Passou |
| Vendedor: menu só com Atendimento, Pedidos, Clientes, Estoque e Métricas | Passou |
| Vendedor: abas de fora barradas, mesmo pelo endereço | Passou |
| Gestor de tráfego: menu só com Tráfego e Métricas; o resto é barrado | Passou |
| Social media: menu só com Estoque, Social Media e Métricas; o resto é barrado | Passou |
| Influenciador: menu só com Meu espaço; o resto é barrado | Passou |
| Gerente: a tela Equipe não mostra comissão, teto nem limite de desconto | Passou |
| Tema claro: fundo #ffffff | Passou |
| Tema escuro: fundo #101525 e texto #f4f5f7 | Passou |
| O tema escolhido continua depois de recarregar a página | Passou |
| O botão volta para o tema claro | Passou |
| 390 px: tela de entrada sem rolagem lateral | Passou |
| 390 px: nenhuma tela com rolagem lateral, para cada um dos 6 papéis | Passou |
| 390 px: o menu vira gaveta e abre pelo botão | Passou |
| Metas: mudança sem justificativa é recusada | Passou |
| Metas: mudança com justificativa aparece na tela em R$ | Passou |
| Metas: o histórico mostra a justificativa e quem mudou | Passou |
| Equipe: a pessoa cadastrada aparece na lista | Passou |
| Auditoria: o cadastro e a mudança de meta aparecem com autor | Passou |
| Métricas: clicar numa métrica abre a ficha (definição, fórmula, fonte, faixas) | Passou |
| Busca (Ctrl+K): digitar e dar Enter leva para a aba | Passou |
| Sair encerra a sessão | Passou |

A tabela agrupa alguns itens; a lista completa, linha por linha, sai de `npm run aceite`.
As capturas de tela ficam em `testes-aceite/capturas`.

## Testes automáticos da API: 91 de 91 passaram

| Grupo | O que confere | Resultado |
| --- | --- | --- |
| Login | senha errada, e-mail inexistente, chamada sem token e token adulterado | Passou |
| Freio de tentativas | 8 senhas erradas seguidas travam aquele e-mail por 15 minutos | Passou |
| Acesso por papel | cada rota responde 200 só para os papéis certos e 403 para os outros | Passou |
| Equipe | cadastro, e-mail repetido, senha curta, limites do Gerente, código de vendedor único | Passou |
| Equipe | o Gerente vê a meta de cada pessoa, mas só um Sócio altera | Passou |
| Equipe | ninguém é apagado; pessoa desativada perde o acesso na hora | Passou |
| Auditoria | cada campo alterado guarda o valor de antes e o de depois; senha nunca é gravada | Passou |
| Metas | só Sócios; justificativa obrigatória; histórico de cada mudança | Passou |
| Registros imutáveis | o banco recusa alterar, apagar ou esvaziar a auditoria e o histórico | Passou |
| Dicionário de métricas | cada papel recebe só as suas fichas; toda ficha tem os campos obrigatórios | Passou |
| Cálculo | 1 a 10/nov compara com 1 a 10/out; sem dado mostra "—", nunca "−100%"; mediana | Passou |

## Regras do prompt nesta etapa

| Regra | Situação |
| --- | --- |
| 1. O código calcula, a IA explica | Dicionário com 31 fichas e um único ponto de cálculo. Os valores entram nas etapas que trazem os dados |
| 2. Comparação padrão | Funções prontas e testadas |
| 3. Mediana | Função pronta e testada |
| 4. A IA nunca recebe R$, custos ou CPF | Não se aplica ainda: a etapa 1 não chama a IA |
| 5. CPF mascarado | Não se aplica ainda: clientes entram na etapa 2 |
| 6. Auditoria imutável | Passou, com gatilho no banco |
| 7. Nada muda sem aprovação humana | Passou: parâmetros só pelos Sócios, com justificativa e histórico |
| 9. Chaves e senhas só no ambiente | Passou |
| 13. O sistema começa vazio | Passou: toda aba tem a tela vazia; nenhum parâmetro nasce com valor |

## Em toda entrega

| Item | Resultado |
| --- | --- |
| Testes com dados fictícios | Passou |
| Migrações que só acrescentam | Passou (1 migração) |
| Cópia de segurança antes de mudar o banco | Não executado: ainda não existe banco de produção |
| Publicação num endereço próprio | Não executado: falta a conta de hospedagem |

## Decisões tomadas na construção, para os Sócios confirmarem

1. **Kysely no lugar do Prisma.** Os binários do Prisma não puderam ser baixados no ambiente de
   construção. O banco é o mesmo PostgreSQL, com migrações em SQL.
2. **Auditoria visível só para os Sócios.** Ela guarda valores de comissão e de metas.
3. **Gerente e as cifras da equipe.** O Gerente vê a meta de cada pessoa, mas não altera. Ele não
   vê nem altera comissão, teto e limite de desconto.
4. **Influenciador sem a tela Métricas.** Ele vê só o próprio espaço.
5. **Senha.** Mínimo de 8 caracteres; 8 erros seguidos travam a entrada daquele e-mail por 15 minutos.
6. **Dois parâmetros adiados.** "Metas por etapa" e "Configuração do Daily" serão preenchidos nas
   próprias abas, nas etapas 3 e 6.
