# Relatório da etapa 6 (Painel, Daily, Reuniões e lucro)

Data: 13/11/2026. Resultado: os quatro critérios de aceite do prompt passaram. Os números que dependem
da loja (etapa 2), do Tráfego (etapa 7) e do Social Media (etapa 8) aparecem com "—" e o aviso de
quando entram. Todos os testes usaram dados fictícios.

## O que foi entregue

**Painel, com três sub-abas** (a escolhida fica na URL: `?sub=hoje`, `?sub=daily`, `?sub=painel`).

- **Hoje**
  - A frase motivacional e três números: previsão de fechamento contra a meta, pró-labore do mês
    (só Sócios) e decisões aguardando.
  - A fila de decisões, na ordem do prompt: vendas diretas a confirmar, comissões a liberar e a pagar,
    trocas aguardando. Cada papel vê só o que pode decidir.
  - O painel por área: Comercial, Clientes e recompra, Marketing, Financeiro (só Sócios) e
    faturamento por origem.
- **Painel (os gráficos)**
  - Chips dos meses e filtro de vendedor.
  - 16 cartões de indicador, cada um com a seta, a % contra o mesmo intervalo do mês anterior e a
    projeção de fechamento.
  - A visão anual contra a meta do ano.
  - Os gráficos: receita mês a mês (clicar num mês mostra os números dele), comissões pagas por mês
    (vendedores × influenciadores), pró-labore mês a mês, clientes novos × recorrentes.
  - A **Jornada de atendimento**: 6 colunas em 4 fases, R$ por etapa só para os Sócios, o funil em
    faixa colorida pela situação, conversão, perdas com os 3 motivos, tempo mediano contra o máximo,
    meta com selo ok/fora e o selo "gargalo".
  - "Onde e por que perdemos", o ranking de vendedores e o Painel detalhado (ranking de
    influenciadores, faturamento por origem, ticket mês a mês).
  - Todo gráfico tem "Ver tabela".
- **Daily**
  - Os 7 blocos com os números do momento e as tarefas atrasadas ou de hoje.
  - "Tratado", "Pular" e **"Decidido"**: vira tarefa com responsável e prazo.
  - Modo Gestão (por pessoa) e modo Equipe (só totais, para projetar na sala).
  - Encerrar salva a ata em Reuniões.
  - A ordem e o tempo dos blocos vêm do parâmetro `daily_config` em Metas; sem ele, vale o roteiro do prompt.

**Reuniões**: cada Daily com as decisões (e se a tarefa já foi feita), o que foi tratado, os blocos
pulados e os números do momento.

**Financeiro**: custos do mês lançados à mão (por categoria) e a conta do lucro. Lançamento errado
é anulado, com motivo; ele continua na lista, riscado, e sai da conta.

**Metas**: `metas_por_etapa` e `daily_config` passaram a ser conferidos ao salvar.

## Critérios de aceite do prompt

| Critério | Resultado | Observação |
| --- | --- | --- |
| Os números de um dia batem com o banco | Passou | Receita, ticket, pró-labore, comissões e o volume de Lead da jornada, conferidos com consultas diretas no banco |
| Nenhum "−100%" no início do mês | Passou | Mês sem dado mostra "—" em todas as variações |
| O Gerente não vê pró-labore, comissões somadas, gasto, custos nem lucro | Passou | Nem nos cartões, nem nos gráficos, nem na jornada, nem na sub-aba Hoje; o Financeiro é barrado |
| "Decidido" cria uma tarefa e a ata aparece em Reuniões | Passou | A tarefa aparece no Atendimento do responsável; quando ele conclui, Reuniões mostra "Feita" |

## Testes

- Aceite no navegador da etapa 6: **46 de 46** passaram.
- Aceites repetidos no mesmo banco: etapa 1, 42 de 42; etapa 3, 33 de 33; etapa 5, 46 de 46;
  etapa 4, 38 de 38.
- Testes automáticos da API: **217 de 217** (18 novos: período e comparação, quem vê, indicadores,
  custos e lucro, séries, ranking, jornada, Hoje, Daily e Reuniões).
- Demonstração clicável: 33 de 33 verificações.

## Não executado nesta etapa

| Item do prompt | Por quê |
| --- | --- |
| Gasto com anúncios, ROAS, custo por lead, CAC, custo por etapa; bloco Tráfego do Daily | Tráfego (etapa 7) |
| Bloco Social media do Daily | Social Media (etapa 8) |
| Custo das peças por venda no lucro; funil do site; carrinhos abandonados | Loja e estoque (etapa 2). Até lá, a produção entra como custo do mês |
| "Enviar relatório" da jornada | Não há canal de envio (WhatsApp ou e-mail). Por enquanto há "Copiar relatório" |
| Gráfico "Receita e pró-labore detalhados" por hora/dia | Fica para quando houver volume de vendas por dia que justifique |
| "Mudanças de regra" e "metas sugeridas" na fila de decisões | O prompt não diz o que são; ver Perguntas |
| Filtros por influenciador, origem e canal valendo para o Painel inteiro | Entram com a loja (canal site e link de vendedor) |
| Retrato diário das métricas na rotina do dia | Fica para a publicação, quando a rotina rodar todo dia |

## Decisões que tomei e que os Sócios precisam confirmar

1. **Cor da etapa na jornada**: verde se bate a meta; âmbar se está a 80% da meta ou acima do tempo
   máximo; vermelho abaixo de 80%; sem meta, neutro.
2. **Gargalo** = a etapa mais distante da meta, em pontos percentuais.
3. **R$ por etapa**: "oportunidade" é a soma do valor dos leads abertos na etapa; pró-labore e
   comissão previstos usam as % padrão de Metas; "comissão perdida" usa o valor dos leads perdidos no mês.
4. **Lucro** = receita − comissões − custos do mês, por enquanto sem o custo das peças e os anúncios
   (o cartão avisa).
5. **Categorias de custo**: produção e peças, embalagem, frete, marketing (fora os anúncios),
   sistemas e ferramentas, pessoal, impostos e taxas, outros.
6. **Vendas por dia necessárias** = (meta − receita do mês) ÷ ticket médio ÷ dias que faltam.
7. **Negociação sem follow** e **levantamento sem contato** = lead na etapa sem nenhuma tarefa aberta.
8. **Um Daily aberto por vez**; quem abrir de novo entra no que já está aberto.
9. **Taxa de recompra e LTV** olham a base inteira de clientes, não só o mês (por isso não têm comparação).

## Perguntas (o prompt não define; não inventei)

1. **"Mudanças de regra"** e **"metas sugeridas"** na fila de decisões: quem sugere, e o quê?
   Por exemplo: o sistema sugere a meta do mês seguinte com base nos últimos meses?
2. **"Enviar relatório"** da jornada: para quem e por onde (WhatsApp, e-mail)?
