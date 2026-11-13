# Relatório da etapa 4 (Clientes, pós-venda e recompra)

Data: 13/11/2026. Resultado: os cinco critérios de aceite do prompt passaram. Avaliações com foto,
o avise-me, o aviso de lançamento e as baixas de estoque (troca, brinde) ficaram como não executados,
porque dependem da loja na Hostinger (etapa 2).

Como na etapa 5, a fonte das compras é a **venda direta** confirmada por um Sócio. Quando os pedidos
da loja entrarem, eles alimentam as mesmas regras. Todos os testes usaram dados fictícios.

Junto com esta etapa: **o Sócio agora edita os cupons** (código, desconto, comissão e "válido até").
O cupom vale até o fim do dia escolhido; sem data, não acaba. Cupom vencido aparece como "Vencido" e
deixa de valer na venda.

## O que foi entregue

- **Clientes**: lista com segmento, compras, total gasto, última compra, etiquetas e vendedor; filtros
  por segmento e por etiqueta. Cada vendedor vê só os próprios clientes.
- **Agora**: clientes ativos, taxa de recompra, clientes em risco, tempo entre compras (mediana) e
  valor do cliente (LTV).
- **Segmentos**: Novo (1 compra), Recorrente (2 ou mais), VIP, Em risco e Inativo. Os três últimos só
  aparecem depois que os Sócios definem os limites em Metas; enquanto isso, a tela avisa.
- **Ficha do cliente**: compras, trocas, indicações, brindes, atendimentos, etiquetas de comunidade
  (Corre, Treina, Grupo ou assessoria, Divulgador), aceite de mensagens, código de indicação e CPF mascarado.
- **Código de indicação**: cada cliente ganha o seu na primeira compra. O vendedor digita o código na
  venda direta, e a venda aparece na ficha de quem indicou.
- **Sequências como tarefa**: pós-compra (24 h depois da confirmação), recompra (quando passam os dias
  de Metas) e em risco (quando o cliente entra no segmento). Cada passo vira tarefa no Atendimento, com
  a mensagem pronta e o botão do WhatsApp. Quem não aceitou mensagens ou pediu bloqueio não entra.
- **Trocas e devoluções**: solicitada → peça recebida → resolvida (nova peça ou valor devolvido).
  O vendedor só abre a troca; o Gerente recebe a peça e resolve com nova peça; **devolver o valor é do
  Sócio** e cancela o pró-labore e as comissões daquela venda que ainda não foram pagos.
- **Brindes**: o Gerente ou o Sócio registram o quê e por quê; só o Sócio informa e vê o custo.
- **Rotina do dia**: além de liberar comissões, cria as tarefas de recompra e de em risco.

## Critérios de aceite do prompt

| Critério | Resultado | Observação |
| --- | --- | --- |
| Cliente com duas compras vira Recorrente | Passou | |
| Quem não aceitou mensagens não entra em sequência | Passou | Bloqueado também não, mesmo com aceite anterior |
| A devolução cancela comissão e pró-labore | Passou | Conferido no Financeiro: R$ 10,00 a menos de pró-labore e a comissão some |
| A comissão só é liberada depois do prazo de troca | Passou | Já testado na etapa 5; troca por tamanho não mexe na comissão |
| Venda com código de indicação aparece na ficha de quem indicou | Passou | |

## Testes

- Aceite no navegador da etapa 4: **38 de 38** passaram.
- Aceites repetidos no mesmo banco: etapa 1, 42 de 42; etapa 3, 33 de 33; etapa 5, 46 de 46 (um item
  novo: editar o cupom e definir até quando vale).
- Testes automáticos da API: **199 de 199** (24 novos: segmentos, lista e ficha, indicação, sequências,
  trocas, brindes, taxa de troca e edição de cupom).

## Não executado nesta etapa

| Item do prompt | Por quê |
| --- | --- |
| Avaliações com nota, comentário e foto | O cliente avalia depois da entrega, pelo site (etapa 2) |
| Sequências de lançamento e avise-me | Dependem dos modelos e do estoque da loja (etapa 2) |
| Peça trocada volta ao estoque; brinde sai do estoque | O estoque vive na loja (etapa 2) |
| Taxa de troca por modelo e tamanho | Hoje é por peça, como foi escrita na venda; modelo e tamanho vêm do estoque (etapa 2) |
| CAC e LTV ÷ CAC | Dependem do gasto com anúncios (etapa 7) |

## Decisões que tomei e que os Sócios precisam confirmar

1. **VIP** = cliente com 2 ou mais compras entre os que mais gastaram, na parte definida em Metas.
   Quem comprou uma vez só não é VIP, mesmo gastando muito.
2. **Quem está sumindo aparece primeiro**: um VIP sem comprar há mais dias que o limite aparece como Em risco.
3. **Troca por tamanho não cancela comissão**; só a devolução do dinheiro cancela.
4. **Devolver o valor é decisão do Sócio**, porque mexe no pró-labore e nas comissões.
5. **A venda devolvida deixa de contar como compra** do cliente (segmento, LTV, recompra).
6. **O pós-compra sai 24 h depois da confirmação**, com o vendedor da venda; sem vendedor, vai para o Gerente.
7. **Mensagens fixas das sequências** (podem ser trocadas depois).
8. **Indicação**: o código não dá desconto por enquanto; só liga a venda a quem indicou. O prêmio de
   quem indica é registrado como brinde.
