# Relatório da etapa 5 (Cupons, comissões e influenciadores)

Data: 13/11/2026. Resultado: três dos quatro critérios de aceite passaram. O quarto (a peça enviada
sai do estoque) ficou como não executado, porque o estoque vive na loja da Hostinger (etapa 2), que
ainda não pôde começar.

A etapa 5 foi feita antes da 2 e da 4 por decisão dos Sócios. Enquanto a loja não está ligada, a
fonte das vendas é a **venda direta** confirmada por um Sócio. Quando os pedidos da loja entrarem
(etapa 2), eles passam pela mesma regra de pró-labore, comissão, teto e liberação. Todos os testes
usaram dados fictícios.

## O que foi entregue

- **Influenciadores** (Sócios e Gerente): cadastro, ligação com o login do influenciador, cupons,
  posts combinados × feitos no mês, peças enviadas, vendas com cupom, valor vendido, clientes novos
  trazidos e quantos voltaram a comprar. Só os Sócios veem comissão, teto, custo das peças e retorno
  (vendas − comissão − peças) e só eles criam ou desativam cupom.
- **Cupom na venda direta**: o vendedor digita o cupom; a venda fica ligada ao influenciador.
- **Pró-labore e comissões**: nascem quando o Sócio confirma a venda. Vendedor e influenciador
  recebem na mesma venda, cada um até o seu teto do mês. A comissão passa por aguardando → liberada
  → paga (ou cancelada).
- **Financeiro** (Sócios): pró-labore do mês, comissões geradas e pagas, divisão entre os Sócios,
  lista do que aguarda o prazo de troca (com "Liberar agora") e do que está a pagar ("Marcar como paga").
- **Meu espaço** (influenciador): vendas do período, comissão, quanto falta para o teto, projeção,
  vendas por dia e por cupom, pagamentos e os cupons com botão de copiar. Nenhum dado de cliente.
- **Minha comissão no mês**: cartão no Atendimento, para cada vendedor e para o Gerente ver só a própria.
- **Rotina do dia**: rota protegida por segredo que libera as comissões cujo prazo de troca venceu.
  Precisa de um agendador chamando uma vez por dia quando o sistema for publicado.

## Critérios de aceite do prompt

| Critério | Resultado | Observação |
| --- | --- | --- |
| Venda com cupom aparece no espaço do influenciador | Passou | Com a venda direta. A venda pelo site entra com a etapa 2 |
| A comissão para no teto | Passou | Do vendedor e do influenciador; a venda que estoura recebe só o que falta |
| O influenciador não vê dado de cliente | Passou | Nem nome, nem telefone, nem CPF; conferido na tela e na resposta da API |
| Peça enviada a influenciador sai do estoque | Não executado | A peça e o custo ficam registrados. A baixa no estoque depende da loja (etapa 2) |

## Teste de aceite no navegador: 45 de 45 passaram

| Item | Resultado |
| --- | --- |
| Sem influenciadores, a tela ensina o primeiro passo | Passou |
| O Sócio define em Metas o pró-labore, as comissões, o teto e o limite de desconto | Passou |
| O Sócio cadastra o influenciador e liga o cadastro ao login dele | Passou |
| Cupom com espaço no código é recusado | Passou |
| O Sócio cria o cupom BIA10 com 10% de desconto | Passou |
| A peça enviada fica registrada, com o custo que só os Sócios veem | Passou |
| Posts combinados × feitos do mês aparecem com o que falta | Passou |
| O vendedor vê o cartão "Minha comissão no mês", ainda zerado | Passou |
| Sem cupom, 10% de desconto passa do limite do vendedor (5%) e a venda é recusada | Passou |
| Cupom que não existe é recusado | Passou |
| Com o cupom BIA10, o desconto de 10% é aceito e a venda é lançada | Passou |
| Venda só lançada ainda não gera comissão | Passou |
| As duas vendas chegam ao Financeiro com o cupom usado | Passou |
| Sem prazo de troca em Metas, a tela avisa que a liberação é manual | Passou |
| Confirmar gera o pró-labore: 10% de R$ 360 = R$ 36,00 | Passou |
| Comissões do mês: vendedor R$ 18,00 + influenciador R$ 25,00 (teto) = R$ 43,00 | Passou |
| Vendedor e influenciador recebem na mesma venda (4 comissões aguardando) | Passou |
| A comissão do influenciador para no teto: a segunda fica em R$ 7,00, com o aviso | Passou |
| Nada pode ser pago antes de liberado | Passou |
| O Sócio libera a comissão de R$ 18,00 da influenciadora e ela passa para "a pagar" | Passou |
| Marcada como paga, ela entra em "Comissões pagas no mês" | Passou |
| Clientes novos trazidos pela influenciadora: 2 | Passou |
| Influenciadores (Sócio): 2 vendas, R$ 360,00 vendidos, R$ 25,00 de comissão e retorno de R$ 290,00 | Passou |
| A auditoria registra o cupom, a liberação e o pagamento da comissão | Passou |
| Depois da confirmação, o vendedor vê a própria comissão: 5% de R$ 360 = R$ 18,00 | Passou |
| O vendedor não entra em Influenciadores nem no espaço do influenciador (2 itens) | Passou |
| O Gerente vê o influenciador, as vendas e os cupons | Passou |
| O Gerente não vê comissão, custo das peças, retorno nem teto, e não cria cupom | Passou |
| O Gerente também tem o cartão da própria comissão | Passou |
| O menu do influenciador tem só o espaço dele | Passou |
| Meu espaço: 2 vendas com o cupom e R$ 25,00 de comissão | Passou |
| Meu espaço avisa que o teto do mês foi atingido | Passou |
| Vendas por dia, por cupom: BIA10, 2 vendas, R$ 360,00 | Passou |
| Pagamentos: R$ 7,00 aguardando o prazo de troca e R$ 18,00 já pagos | Passou |
| Nenhum dado de cliente chega ao influenciador (nome, telefone ou CPF) | Passou |
| Trocar o período muda os números; o atalho "Mês passado" funciona (2 itens) | Passou |
| Influenciador: Influenciadores, Financeiro e Atendimento são barrados (3 itens) | Passou |
| 390 px: Influenciadores, formulário de cupom, Financeiro e Meu espaço sem rolagem lateral (4 itens) | Passou |

Os aceites das etapas anteriores foram repetidos depois das mudanças, no mesmo banco: etapa 1,
42 de 42; etapa 3, 33 de 33.

## Testes automáticos da API: 174 de 174 passaram (26 novos)

| Grupo | O que confere | Resultado |
| --- | --- | --- |
| Cálculo | mês da venda no horário de Brasília; o teto corta o que passar dele | Passou |
| Geração | sem porcentagem em Metas nada é gerado; venda com cupom gera pró-labore, comissão do vendedor e do influenciador; venda só lançada não gera nada | Passou |
| Tetos e porcentagens | teto do vendedor e do influenciador; porcentagem própria da pessoa ou do cupom vale mais que o padrão; Sócio que vende não recebe comissão | Passou |
| Devolução | cancela o que não foi pago; o que já foi pago continua registrado | Passou |
| Liberação | com prazo de troca, o ganho nasce com a data; a rotina exige o segredo, não libera antes e libera depois; liberar antes do prazo é do Sócio e fica na auditoria | Passou |
| Pagamento | só um Sócio paga, e só o que está liberado | Passou |
| Cupons | só o Sócio cria; código único e sem espaço; cupom inexistente, inativo ou vencido não entra; o cupom autoriza o próprio desconto | Passou |
| Quem vê o quê | o vendedor confere o cupom sem ver a comissão; o Gerente não recebe comissão, custo nem retorno; o influenciador vê só o que é dele; o vendedor vê só a própria comissão; o resumo do Financeiro é só dos Sócios e bate com o banco | Passou |
| Clientes novos | o cliente é de quem trouxe a primeira compra; quem compra de novo conta como "voltou" | Passou |

## Não executado nesta etapa

| Item do prompt | Por quê |
| --- | --- |
| Leitura da loja, rota de eventos e códigos de origem | Etapa 2: precisa do plano da Hostinger e do código do site |
| Cupom valendo no checkout do site e link rastreado do influenciador | Dependem da loja (etapa 2) |
| Cupom de vendedor | Só faz sentido no checkout do site; na venda direta o vendedor já digita o preço dentro do limite dele |
| Alerta de cupom vazado | Falta definir a regra (ver "Perguntas") e depende do volume de pedidos da loja |
| Baixa no estoque da peça enviada | O estoque vive na loja (etapa 2) |
| Devolução pela tela | A regra já existe e está testada (cancela pró-labore e comissões); a tela de trocas e devoluções é da etapa 4 |
| Ranking de influenciadores e gráficos de comissões por mês | São do Painel (etapa 6) |

## Decisões que tomei e que os Sócios precisam confirmar

1. **O cupom autoriza o próprio desconto.** Um cupom de 10% vale mesmo que o limite do vendedor seja 5%.
2. **Sócio que vende não recebe comissão.** O ganho dele naquela venda é o pró-labore.
3. **O Gerente recebe comissão quando vende**, com a mesma regra do vendedor, e vê só a própria.
4. **A comissão é calculada sobre o valor cobrado**, já com o desconto.
5. **O teto é por mês da confirmação da venda**, no horário de Brasília. A venda que estoura o teto
   recebe só o que falta; as seguintes do mês ficam registradas com R$ 0,00, mostrando quanto seria sem o teto.
6. **Sem prazo de troca definido em Metas, a comissão espera a liberação manual de um Sócio.** Com
   o prazo definido, a rotina do dia libera sozinha depois dele. Pagar é sempre um clique do Sócio.
7. **O pró-labore é guardado por venda**; a divisão Fundador × Cofundador vem do parâmetro de Metas.
8. **"Cliente novo" do influenciador** é quem fez a primeira compra com um cupom dele.
9. **O custo da peça enviada é digitado pelo Sócio** enquanto o estoque não existe.

## Perguntas (o prompt não define; não inventei)

1. **Cupom vazado:** quantos usos do mesmo cupom, em quanto tempo, viram alerta para os Sócios?
2. **Comissão de venda com devolução depois de paga:** hoje ela continua registrada como paga. Deve
   virar um desconto no mês seguinte ou fica como está?
