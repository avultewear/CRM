# Prazo de troca e pagamento das comissões — análise e proposta

Data: 13/11/2026. Isto não é parecer jurídico: antes de publicar a política de trocas, vale validar
com um advogado ou contador.

## O que a lei exige (Código de Defesa do Consumidor)

| Situação | Prazo | Contado de | O que o cliente pode pedir |
| --- | --- | --- | --- |
| Arrependimento (compra pela internet, WhatsApp ou fora da loja) | 7 dias corridos | o recebimento da peça | devolução do valor pago, sem justificar (art. 49) |
| Defeito aparente em roupa | 90 dias (o STJ trata vestuário como bem durável) | a entrega | conserto ou troca; se a loja não resolver em 30 dias, troca, dinheiro de volta ou abatimento (art. 18 e 26) |
| Não serviu ou não gostou (sem defeito) | não existe prazo na lei | — | só o que a loja prometer; o que estiver anunciado vira obrigação |

## Como outras lojas fazem

- Centauro: troca por cor, modelo ou tamanho em até 30 dias do recebimento.
- Dafiti: 30 dias corridos para troca ou devolução gratuita.
- Nordweg: devolução sem custo em até 30 dias do recebimento.

Ou seja: 30 dias para troca é o padrão do mercado de moda esportiva, mas é cortesia, não lei.

## O ponto que resolve a dúvida

A comissão só precisa ser cancelada quando **o dinheiro volta para o cliente**. Troca por tamanho ou
por outra peça não devolve dinheiro, então não mexe na comissão (o sistema já funciona assim).

Por isso, o prazo que importa para a comissão não é o de 30 dias de troca, e sim o de **arrependimento
(7 dias da entrega)**, mais uns dias para a peça voltar.

## Proposta

1. **Política da loja**
   - Arrependimento: 7 dias do recebimento, com devolução do valor (obrigatório).
   - Troca por tamanho, cor ou modelo: até 30 dias do recebimento, **só como troca ou vale-compra**,
     sem devolução do dinheiro (escrever isso com clareza na página de trocas).
   - Defeito: 90 dias da entrega; a loja resolve com nova peça.
2. **Comissão**
   - Liberada **15 dias depois da entrega** (7 de arrependimento + margem para a peça chegar de volta).
     Em Metas: `prazo_troca_dias = 15`.
   - Paga em **duas datas fixas no mês** (por exemplo, dia 5 e dia 20): em cada data, paga-se tudo o
     que já estiver liberado. Assim, quem vende recebe entre 15 e 30 dias depois da entrega.
   - Caso raro de dinheiro devolvido depois de a comissão ser paga (defeito sem solução): descontar no
     pagamento seguinte. Isso precisa estar escrito no acordo com vendedores e influenciadores.

## O que muda no sistema quando os Sócios decidirem

- Definir `prazo_troca_dias` em Metas (já funciona).
- Na loja (etapa 2), o prazo passa a contar da **entrega** do pedido, não do pagamento. Na venda
  direta, a entrega é na hora, então conta da confirmação.
- Novo, a construir quando confirmado: datas de pagamento em Metas (ex.: 5 e 20), com a lista "a pagar"
  agrupada pela próxima data, e o desconto no pagamento seguinte para comissão já paga de venda devolvida.

## Fontes

- CDC, art. 49 (arrependimento): https://www.peticoesonline.com.br/art-49-cdc
- CDC, art. 26 (prazos de defeito): https://www.peticoesonline.com.br/art-26-cdc-comentado
- STJ, vestuário como bem durável: https://www.sedep.com.br/?p=56831
- Troca sem defeito e política anunciada: https://www.jb.com.br/editorias/?p=412
- Centauro: https://www.centauro.com.br/sc/condicoes
- Dafiti: https://marketplace.anymarket.com.br/como-funciona-troca-e-devolucao-na-dafiti/
- Nordweg: https://intercom.help/nordweg/pt-BR/articles/9534268-solicitar-a-troca-ou-a-devolucao-do-meu-pedido
