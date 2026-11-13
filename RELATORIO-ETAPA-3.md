# Relatório da etapa 3 (Atendimento)

Data: 12/11/2026. Resultado: os critérios de aceite que não dependem da loja passaram. Dois ficaram
como não executados, porque dependem da etapa 2 (loja na Hostinger), que ainda não pôde começar.

A etapa 3 foi feita antes da 2 por decisão dos Sócios: o plano da Hostinger e o código do site ainda
não existem. Todos os testes usaram dados fictícios.

## Critérios de aceite do prompt

| Critério | Resultado | Observação |
| --- | --- | --- |
| Não dá para pular etapa | Passou | Pelo botão, pelo arrasto do card e direto na API |
| Todo motivo de perda vai ao destino certo | Passou | Os 8 motivos, um a um |
| O mesmo telefone não duplica | Passou | O mesmo número escrito de três jeitos vira um cliente só |
| Pedido pago por link de vendedor leva o card para Venda e credita o vendedor | Não executado | Depende da loja (etapa 2). O registro do envio do link já funciona |
| Desconto acima do limite é bloqueado | Passou em parte | Vale na venda direta. O cupom do vendedor e o piso de margem dependem da loja e dos custos (etapa 2) |
| A conversão por etapa bate com uma contagem manual no histórico | Passou | Funil comparado com a contagem feita direto no banco |

## Teste de aceite no navegador: 33 de 33 passaram

| Item | Resultado |
| --- | --- |
| Quadro vazio ensina o primeiro passo | Passou |
| Novo lead entra na coluna Lead | Passou |
| O quadro tem as 6 etapas, na ordem da jornada | Passou |
| Avançar de Lead sem resposta é recusado, dizendo o que falta | Passou |
| Arrastar o card para pular etapas é recusado | Passou |
| O painel do lead mostra o que falta para a próxima etapa | Passou |
| Com a resposta registrada, o lead vai para Abordado | Passou |
| De Abordado não avança sem produto e tamanho | Passou |
| Com produto e tamanho, o lead vai para Levantamento | Passou |
| Enviar o link leva o lead para Negociação | Passou |
| O histórico do lead guarda cada etapa, na ordem | Passou |
| O link cria o follow como tarefa, com a mensagem pronta e o botão do WhatsApp | Passou |
| O botão abre a conversa do cliente com a mensagem preenchida | Passou |
| A lista de perdas tem os 8 motivos, cada um com o destino escrito | Passou |
| "Achou caro" manda o lead para a Recuperação | Passou |
| O mesmo telefone não duplica o cliente | Passou |
| Venda direta sem CPF não é lançada | Passou |
| Com CPF, a venda é lançada e o lead vai para Negociação | Passou |
| A venda fica aguardando a confirmação de um Sócio | Passou |
| O CPF aparece mascarado e o número inteiro não chega ao navegador | Passou |
| O vendedor e o Gerente não entram no Financeiro | Passou |
| O Gerente vê os leads dos vendedores | Passou |
| Tráfego, social media e influenciador: o Atendimento é barrado | Passou |
| A venda direta aparece para o Sócio confirmar | Passou |
| Confirmada pelo Sócio, a venda leva o card para Venda | Passou |
| A auditoria registra a perda, a venda e a confirmação, sem o número do CPF | Passou |
| 390 px: Atendimento, painel do lead, novo lead e Financeiro sem rolagem lateral | Passou |

O teste de aceite da etapa 1 foi repetido depois das mudanças: 42 de 42 passaram.

## Testes automáticos da API: 148 de 148 passaram (57 novos)

| Grupo | O que confere | Resultado |
| --- | --- | --- |
| Funções da jornada | telefone normalizado, CPF com dígitos conferidos e mascarado, lista do que falta por etapa | Passou |
| Novo lead | origem obrigatória, telefone inválido, cliente único, cliente que volta fica com o mesmo vendedor | Passou |
| Rodízio | leads sem dono alternam entre os vendedores; inativo sai do rodízio; a gestão pode escolher | Passou |
| Quem vê o quê | vendedor só vê os próprios leads; Gerente e Sócio veem todos; os outros papéis são barrados | Passou |
| Não se pula etapa | cada critério, um a um; ninguém leva um card para Venda à mão; histórico com entrada, saída e autor | Passou |
| Perdas | os 8 motivos e os 3 destinos; motivo fora da lista é recusado; bloqueio vale para sempre | Passou |
| Follow como tarefa | mensagem pronta sem valores em R$; respondeu, sem resposta, limite de tentativas; um vendedor não mexe na tarefa de outro | Passou |
| Venda direta | CPF obrigatório e válido; limite de desconto; só o Sócio confirma ou recusa | Passou |
| CPF | mascarado em toda resposta; completo só para o Sócio, com cada acesso na auditoria | Passou |
| Funil | conversão, perdas por etapa e período sem dados ("—", não zero) | Passou |
| Números do Agora | leads sem resposta, tarefas para hoje e leads parados | Passou |

## O que ficou para outras etapas

| Parte | Onde entra | Por quê |
| --- | --- | --- |
| Endereço do link de compra gerado pelo sistema | Etapa 2 | Precisa do catálogo e do checkout da loja |
| Venda confirmada pelo pedido pago no site | Etapa 2 | Precisa dos pedidos da loja |
| Carrinho abandonado entrando na Recuperação | Etapa 2 | Precisa dos eventos da loja |
| Baixa no estoque na confirmação da venda direta | Etapa 2 | Precisa do estoque |
| Piso de margem | Etapa 2 | Precisa da tabela de custos |
| Lista "avise-me" no motivo "Sem tamanho ou modelo" | Etapas 2 e 4 | Precisa do estoque |
| Pró-labore e comissões gerados na venda | Etapa 5 | Entram com as comissões |
| "Transformar em lead" a partir do Instagram | Etapa 8 | Entra com o Social Media |
| Tempo máximo pelo percentil 75 | Quando houver histórico | Até lá vale o tempo inicial de Metas |

## Decisões tomadas na construção, para os Sócios confirmarem

1. **Prazos do follow.** O primeiro follow vence 24 horas depois do link ou da perda; os seguintes,
   48 horas depois da tentativa anterior. O prompt não trazia esses números.
2. **Rodízio.** O lead sem dono vai para o vendedor ativo que está há mais tempo sem receber um.
3. **Quem fica com o lead.** Nesta ordem: a escolha da gestão; o vendedor que já atende aquele cliente;
   quem cadastrou, se vende; o rodízio.
4. **Sem parâmetro, sem palpite.** Enquanto os Sócios não definirem em Metas o número de tentativas
   da Recuperação e o tempo máximo por etapa, a sequência não encerra sozinha e nenhum lead aparece
   como parado.
5. **Venda direta acima do limite.** Um Sócio pode lançar com desconto acima do limite do vendedor.
6. **Mensagens do follow.** São cinco textos fixos, preenchidos com o primeiro nome e o produto. Posso
   trocar a redação quando vocês quiserem.
