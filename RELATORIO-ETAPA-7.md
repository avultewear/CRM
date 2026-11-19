# Relatório da etapa 7 (Tráfego)

Data: 19/11/2026. Resultado: a aba está pronta e os dois critérios de aceite do prompt passaram com
**dados simulados**. A conta de anúncios da Meta ainda não existe, e a rede do ambiente de construção não
alcança a Meta. Por isso a conferência com o Gerenciador de Anúncios de verdade fica para quando a conta
for conectada (ver "Não executado"). Todos os testes usaram dados fictícios.

## O que foi entregue

**Conexão com a Meta** (só os Sócios conectam; o Gestor de tráfego vê a aba inteira).

- Passo a passo na própria tela para gerar o token: usuário do sistema no Gerenciador de Negócios,
  permissão `ads_read`, validade "Nunca".
- Colar o token → o sistema lista as contas que ele enxerga → escolher a conta.
- Antes de gravar, um **diagnóstico**: token válido, permissão de leitura, conta ativa. O resultado fica
  visível na conexão, e o botão "Diagnosticar conexão" refaz a conferência quando quiser.
- O token fica **cifrado no banco** (AES-256-GCM, com a chave `META_CHAVE` da variável de ambiente).
  Na tela aparecem só os 4 últimos caracteres. O token nunca vai para a auditoria nem para o código.
- Erros da Meta em português: token vencido, falta de permissão, limite de chamadas, sem internet.
- **Sincronização**: estrutura (campanhas, conjuntos, anúncios, públicos e fase de aprendizado), os
  números por anúncio e por dia, e os recortes de idade e gênero, região, posicionamento, dispositivo
  e horário. A primeira carga traz 90 dias, em blocos de 15 dias, para não estourar o limite da Meta.
  A rotina diária (`POST /rotinas/trafego`) puxa os últimos 3 dias (a Meta ainda ajusta os números dos
  dias recentes) e completa o histórico. Há também "Sincronizar agora".
- **Sem conexão**, um Sócio digita o gasto total do mês. O sistema divide por igual pelos dias do mês
  para calcular custo por lead, ROAS e lucro. Num mês com dados da Meta, vale o número da Meta.
  A tela sempre diz de onde vem o número de cada mês (Meta, gasto digitado ou sem gasto).

**A aba, na ordem de uma auditoria** (filtro 7, 30, 90 dias ou datas livres, sempre comparando com o
período anterior do mesmo tamanho):

1. **Resumo**: nota de 0 a 100 (a porcentagem das checagens que passam), as 3 prioridades do momento,
   investido no mês, projeção do mês contra o orçamento de Metas, orçamento diário ativo e custo por lead
   do mês. "Ver as checagens da nota" mostra cada uma, com valor, referência e situação.
2. **Jornada até o lead**: impressões → cliques no link → conversas iniciadas → leads no CRM, em
   silhueta (escala logarítmica), com conversão, perda, custo por etapa e a meta de cada passagem.
   O **connect rate** (conversas que passaram da mensagem pronta) fica em destaque.
3. **Indicadores**: investimento, impressões, alcance, frequência, cliques no link, CTR, CPC, CPM,
   conversas, connect rate, leads no CRM, custo por lead e ROAS, cada um com a variação.
4. **Onde melhorar**: os achados em Crítico, Atenção, Bom sinal e Informação, cada um com o porquê e
   o que fazer. Por baixo, **quanto cada meta batida renderia** em leads a mais.
5. **Públicos**: para cada recorte, % do investimento × % dos resultados. O pedaço que consome mais do
   que devolve aparece com a barra de cima maior que a de baixo.
6. **Criativos**: gráfico de quadrantes (investimento × custo por conversa, cortado pelas medianas):
   "Manter e escalar", "Dar mais verba", "Revisar já", "Pausar ou testar". Um cartão por anúncio, com
   os números, as notas de qualidade da Meta e a retenção dos vídeos (25%, 50%, 75%, 100%).
7. **Campanhas e conjuntos**: % da verba × % das conversas por campanha; conjuntos com público,
   otimização, orçamento e fase de aprendizado.
8. **Dia a dia**: escolhe a métrica (9 opções), gráfico de barras ou linha, tabela e calendário de calor.
9. **Qualidade das conversas**: quantas passaram da mensagem pronta e quantas viraram lead no CRM.

**No resto do sistema**

- **Atendimento**: com origem "Anúncio", o cadastro do lead lista os anúncios sincronizados. O lead
  guarda anúncio, conjunto, campanha e título, e a ficha mostra a origem.
- **Metas**: novo parâmetro "Referências do tráfego pago" com 8 campos (CTR, CPC, CPM, frequência,
  connect rate, custo por lead e as duas taxas do funil). Ao lado de cada um, a **sugestão de mercado
  com a fonte**, quando existe. Nada é aplicado sozinho: campo em branco = checagem fora da nota.
- **Painel**: gasto com anúncios, ROAS, custo por lead, custo por lead qualificado e CAC deixaram de
  ser "—" com o aviso da etapa 7. O lucro passa a descontar os anúncios.
- **Hoje** (Sócio): gasto com anúncios no mês contra o orçamento e leads de anúncio.
- **Daily**, bloco Tráfego: para os Sócios, gasto de ontem contra o planejado, custo por lead e ROAS do
  mês. Para o Gerente, só os leads de anúncio de ontem.

## Critérios de aceite do prompt

| Critério | Resultado | Observação |
| --- | --- | --- |
| Investimento e cliques de um dia batem com o Gerenciador | Passou com dados simulados | Os números de um dia, gravados no mesmo formato que a sincronização grava, aparecem iguais na tela (R$ 72,72 e 47 cliques). A sincronização foi testada contra respostas simuladas da Graph API (paginação, os 5 recortes, histórico em blocos, limite de chamadas). Com a conta real: não executado |
| O custo por lead usa só os leads de tráfego pago | Passou | R$ 460,34 ÷ 7 leads de anúncio = R$ 65,76. No mesmo período havia 15 leads no total; os de indicação, post e o descartado ficaram fora |

## Testes

- Aceite no navegador da etapa 7: **43 de 43** passaram.
- Aceites repetidos no mesmo banco: etapa 1, 42 de 42; etapa 3, 33 de 33; etapa 5, 46 de 46;
  etapa 4, 38 de 38; etapa 6, 46 de 46 (um item mudou: o ROAS não tem mais o aviso "etapa 7").
- Testes automáticos da API: **243 de 243** (26 novos: cifra do token, conexão e quem pode, diagnóstico,
  sincronização e paginação, histórico em blocos, limite de chamadas, rotina, lead com anúncio,
  indicadores, jornada, quadrantes, públicos, nota e simulações, orçamento, gasto digitado, Painel e
  Daily, desconectar).
- Demonstração clicável: 39 de 39 verificações. Ela ganhou o papel **Gestor de tráfego** e uma conta de
  anúncios fictícia (2 campanhas, 3 conjuntos, 5 anúncios, 45 dias).
- Celular (390 px) sem rolagem lateral e modo escuro conferidos.

## Não executado nesta etapa

| Item do prompt | Por quê |
| --- | --- |
| Conectar a conta real e comparar um dia com o Gerenciador | A conta ainda não tem campanhas, e a rede da construção não alcança a Meta. Quando conectarem, eu refaço a conferência de um dia |
| Miniaturas dos criativos | Vêm da Meta com a conta conectada; até lá, o cartão mostra o formato (vídeo, imagem, carrossel) |
| Link rastreado do site (anúncio → site → pedido) | Depende da loja (etapa 2). Por enquanto, o anúncio de origem é escolhido no cadastro do lead |
| ROAS com as vendas do site | Etapa 2. Hoje o ROAS usa as vendas diretas confirmadas de leads de anúncio |

## Decisões que tomei e que os Sócios precisam confirmar

1. **Gasto digitado** é dividido por igual entre todos os dias do mês.
2. **Quadrantes dos criativos** cortados pela mediana dos anúncios do período (investimento e custo por
   conversa). Anúncio sem nenhuma conversa aparece como ponto vazado no topo.
3. **Nota da auditoria** = % das checagens que passam. Checagem sem referência em Metas, ou sem dado,
   não entra na conta.
4. **Ritmo do orçamento** passa até 105% do orçamento do mês.
5. **Lead pago** = lead com origem "Anúncio", sem os descartados ("não era cliente").
6. **ROAS** = vendas confirmadas (não devolvidas) de leads com origem Anúncio ÷ investimento.
7. **Alcance do período** = soma do alcance dos dias (a Meta não soma pessoas únicas entre dias; a tela
   avisa que a mesma pessoa pode contar mais de uma vez).
8. **CAC** = (comissões de influenciadores + peças enviadas + anúncios) ÷ clientes novos, como na ficha da métrica.
9. **O Gerente não vê o gasto** no Daily nem no Hoje (é cifra dos Sócios); vê os leads de anúncio.
10. **Sugestões em Metas**: CTR de moda 1,29% (WordStream/LocalIQ 2025), CPC de e-commerce no Brasil
    de R$ 0,50 a R$ 1,50 (Trafius 2026), frequência de 3 a 4 (Influee). Para CPM, connect rate, custo
    por lead e as taxas do funil não achei referência pública confiável; o melhor é usar os números da
    própria conta depois de 30 dias.

## Perguntas (o prompt não define; não inventei)

1. **Orçamento de anúncios do mês**: já existe o parâmetro em Metas; qual valor querem para começar?
2. As perguntas das etapas anteriores continuam abertas: cupom vazado; comissão de venda devolvida
   depois de paga; "mudanças de regra" e "metas sugeridas" na fila de decisões; "Enviar relatório" da
   jornada (para quem e por onde).
