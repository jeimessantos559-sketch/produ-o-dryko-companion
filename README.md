# Produção Dryko Companion

## Documentação oficial

- [Prompt mestre e narrativa funcional](docs/PROMPT_MESTRE_APONTA_PRODUCAO.md)
- [Guia de migração, implantação e backup](docs/GUIA_MIGRACAO_E_BACKUP.md)
- [Auditoria e melhorias recomendadas](docs/AUDITORIA_E_MELHORIAS.md)

Valide a portabilidade com `bun run verify:portability` e o aplicativo com `bun run build`. As migrações SQL ficam em `drizzle/migrations` e devem ser executadas em ordem.

## Estado atual da aplicação

Esta aplicação replica o fluxo operacional mais recente validado no Floot, preservando os dados já existentes no projeto Lovable. Estão implementados: autenticação administrada, perfis e permissões, seleção de setor/turno, Corte, Fitas, Mantas, metas por OP e produto, controle de lançamento manual no Protheus, correções auditadas, fechamento/reabertura de turno, relatórios PDF, envio protegido por e-mail, problemas com fotografia e cadastros administrativos.

Observação de precedência: o prompt mestre acima e o código atual substituem o texto histórico abaixo quando houver divergência. No fluxo vigente, **Mantas não usa OP**: usa lote, produto, PLTs, metragem e rolos automáticos. Corte e Fitas usam OP. As regras de Asfox, Misturadores, Líquidos, Pós e Avulsos continuam aguardando definição.

O envio de e-mail usa o conector Gmail do Lovable quando disponível e aceita `APPS_SCRIPT_WEB_APP_URL` + `APPS_SCRIPT_API_TOKEN` como alternativa para relatórios. Não há integração automática com o Protheus nesta fase; a confirmação permanece manual e auditada.

## Especificação histórica

O conteúdo abaixo foi mantido como registro da evolução inicial. Para nova implantação ou alteração, use a documentação oficial no início deste arquivo.

# Prompt inicial — Projeto paralelo Aponta Produção DRYKO

Você será responsável por desenvolver uma **versão paralela e independente** do aplicativo **Aponta Produção — DRYKO** em uma nova plataforma. Este trabalho não pode alterar, excluir ou depender do projeto original que já está sendo construído em outra plataforma.

Trate todo o conteúdo abaixo como a fonte oficial de requisitos. Não simplifique regras confirmadas, não invente fórmulas e não declare funções como prontas sem testá-las.

## Protocolo de trabalho para este novo chat

1. Leia integralmente todos os requisitos antes de começar.
2. Resuma sua compreensão e apresente um plano de implementação em etapas curtas.
3. Identifique as capacidades e limitações da plataforma escolhida.
4. Construa primeiro a base funcional: banco, autenticação, usuários, setores e permissões.
5. Em seguida, implemente Corte, metas, pendências do Protheus, relatórios e fechamento do turno.
6. Implemente Fitas usando sua fórmula própria, sem reaproveitar a fórmula do Corte.
7. Deixe Asfox, Misturadores, Líquidos, Pós e Avulsos isolados e preparados para regras futuras, sem inventar campos.
8. Mostre uma prévia utilizável a cada etapa e teste o fluxo no celular.
9. Preserve um histórico objetivo das alterações e dos testes executados.
10. Quando algo não estiver definido, marque como **aguardando definição**, em vez de adivinhar.

## Regra para credenciais e e-mail

O Google Apps Script do projeto já foi preparado em outra etapa, mas nenhuma URL privada, chave ou credencial será escrita neste prompt. Configure no backend, por meio do mecanismo seguro da plataforma, estas variáveis:

- `APPS_SCRIPT_WEB_APP_URL`
- `APPS_SCRIPT_API_TOKEN`

Nunca peça que a chave seja colada no chat e nunca a exponha no frontend. Solicite a inclusão pelo cofre de segredos ou pelas variáveis protegidas da plataforma. Não envie e-mail real sem que o usuário indique um destinatário de teste.

---

# Especificação mestre — Aponta Produção DRYKO

Crie ou evolua um aplicativo web responsivo chamado **Aponta Produção — DRYKO**, em português do Brasil, com foco principal no uso por celular dentro da fábrica. O sistema deve substituir a folha física usada no apontamento da produção, centralizar pendências de lançamento no Protheus, manter rastreabilidade das ações, permitir o fechamento dos turnos e gerar/enviar relatórios em PDF.

Se este prompt for aplicado a um projeto existente, primeiro analise a estrutura, o banco de dados e as funcionalidades já implementadas. Preserve os dados e tudo o que já estiver funcionando. Não recrie o projeto do zero, não apague registros e não troque regras confirmadas sem necessidade.

## 1. Objetivo e escopo

O aplicativo deve permitir:

- registrar a produção de maneira simples e rápida;
- calcular automaticamente quantidades e métricas conforme a regra de cada setor;
- acompanhar metas das OPs;
- separar apontamentos pendentes e lançados no Protheus;
- registrar quem apontou e quem confirmou o lançamento no Protheus;
- corrigir registros com controle de permissão e auditoria;
- realizar passagem e fechamento de turno;
- gerar, imprimir, baixar e compartilhar relatórios em PDF;
- enviar automaticamente o relatório do turno por e-mail;
- registrar problemas no aplicativo, inclusive com fotografia.

Esta é a **Fase 1**. O lançamento no Protheus continua manual. Não implementar integração automática com o Protheus nesta fase.

## 2. Usuários, autenticação e permissões

Implementar login individual com usuário e senha. Nunca permitir uso compartilhado sem identificação do responsável.

Perfis e permissões:

### Facilitador

- Pode acessar o aplicativo e registrar apontamentos.
- Pode consultar metas, contagens, histórico, pendências e relatórios de seu setor.
- Pode corrigir somente apontamentos que ainda estejam com situação **Pendente**.
- Não pode corrigir diretamente um registro já confirmado como lançado no Protheus.

### Usuário autorizado para Protheus

- Pode confirmar que determinado apontamento foi lançado manualmente no Protheus.
- A confirmação deve gravar usuário, data e hora no campo **Lançado por**.
- Quem apontou e quem confirmou o lançamento devem permanecer registrados separadamente.

### Administrador

- Pode gerenciar usuários e permissões.
- Pode consultar todos os setores.
- Pode corrigir apontamentos lançados, mas a correção deve devolver o registro para **Pendente**.
- Pode finalizar e reabrir OPs/metas.
- Pode executar ações administrativas de turno quando autorizado.
- Pode consultar os problemas reportados pelos usuários.

### Operador

- Operadores não devem ter acesso ao aplicativo nesta fase.
- Apenas facilitadores e usuários autorizados devem acessar as funções operacionais.

No primeiro acesso, solicitar a escolha do **setor** e do **turno**. Salvar essas escolhas no perfil, permitindo alteração posterior. Usar três turnos identificados como T1, T2 e T3, sem inventar horários caso eles ainda não tenham sido cadastrados.

## 3. Setores e isolamento dos dados

Cadastrar estes setores:

- Corte;
- Fitas;
- Mantas;
- Asfox;
- Misturadores;
- Líquidos;
- Pós;
- Avulsos.

Os dados devem permanecer separados por setor. Ao selecionar um setor, mostrar somente suas OPs, produtos, metas, apontamentos, pendências, passagem de turno e relatórios.

Cada setor deve possuir uma regra própria. **Nunca reutilizar automaticamente a lógica de Corte ou Fitas nos demais setores.** As regras operacionais de Asfox, Misturadores, Líquidos, Pós e Avulsos ainda precisam ser definidas. Preparar a arquitetura para módulos independentes, mas não inventar campos, unidades ou fórmulas para esses setores.

## 4. Identidade visual e experiência de uso

Criar uma interface enxuta, industrial, rápida e mobile-first, usando a identidade DRYKO:

- vermelho, preto e branco como cores principais;
- fundos claros e alto contraste;
- logotipo DRYKO na tela de login e no menu;
- verde para situações concluídas/lançadas;
- amarelo para pendências e alertas;
- vermelho para erros, bloqueios e ações críticas;
- botões grandes e adequados para toque;
- textos legíveis e navegação simples em telas pequenas.

O botão **Apontar** deve permanecer sempre visível no fluxo principal. A tela deve ser funcional também em computador, sem perder a prioridade do celular.

Menu lateral:

- Painel do turno;
- Metas das OPs;
- Contagem por produto;
- Histórico;
- Passagem de turno;
- Relatórios;
- Reportar problema;
- Produtos, visível somente ao administrador;
- Usuários, visível somente ao administrador.

Não mostrar no menu as opções **Backup** ou **Padrão por PLT**. Os padrões continuam armazenados internamente e são aplicados automaticamente.

## 5. Painel do turno

Exibir no topo:

- setor atual;
- turno atual;
- data;
- usuário conectado.

Exibir indicadores rápidos compatíveis com o setor, incluindo:

- quantidade de apontamentos pendentes;
- quantidade de apontamentos lançados;
- PLTs fechados, quando aplicável;
- total de rolos e metragem, quando aplicável;
- total produzido em m² para Fitas;
- progresso das metas ativas.

Apresentar apontamentos agrupados, evitando um cartão isolado para cada PLT. Permitir busca e filtro por OP, produto, situação, data e turno. Agrupar as pendências por OP e produto.

Incluir um sino/alerta para pendências deixadas por turnos anteriores.

## 6. Catálogo de produtos e padrões

Manter um catálogo de produtos separado por setor. Cada produto pode guardar os padrões necessários para sua própria regra.

Para Corte, armazenar pelo menos:

- produto;
- largura;
- rolos padrão por PLT;
- padrão/classificação FVD ou DRYKO, quando aplicável.

Os padrões devem preencher o formulário automaticamente, mas os valores permitidos no apontamento podem ser ajustados quando a produção real for diferente. Não inventar valores de catálogo.

Cadastrar inicialmente estes padrões confirmados de rolos por PLT:

| Produto  | Rolos por PLT |
| -------- | ------------: |
| FVD 5    |          1280 |
| FVD 10   |           640 |
| FVD 15   |           432 |
| FVD 20   |           320 |
| FVD 30   |           216 |
| FVD 45   |           144 |
| FVD 60   |            72 |
| FVD 90   |            72 |
| DRYKO 5  |           960 |
| DRYKO 10 |           480 |
| DRYKO 15 |           288 |
| DRYKO 20 |           240 |
| DRYKO 30 |           168 |
| DRYKO 45 |           112 |
| DRYKO 60 |            56 |
| DRYKO 90 |            56 |

Manter esses valores editáveis somente no cadastro administrativo do produto. No momento do apontamento, carregar o padrão automaticamente e permitir o ajuste operacional necessário para representar um PLT picado, sem alterar o padrão permanente do catálogo.

## 7. Apontamento do setor Corte

O formulário de Corte deve ser simples e conter somente:

- número da OP;
- produto selecionado no catálogo;
- quantidade de PLTs fechados agora, entre 1 e 20;
- rolos por PLT, preenchidos pelo padrão do produto e ajustáveis no registro.

Não incluir máquina, caixas/CX ou campo de observação nesse formulário.

Regras:

- Um envio do formulário cria um único apontamento, mesmo quando tiver vários PLTs.
- Total de rolos = quantidade de PLTs × rolos por PLT.
- Metragem = largura × total de rolos ÷ 10.
- Mostrar os cálculos antes da confirmação.
- Gerar a sequência dos PLTs de forma independente por produto, data e turno.
- Exemplo de chave de sequência: `2026-09-14-T2`.
- Manter os PLTs agrupados no apontamento.
- Permitir **PLT picado**, com quantidade de rolos inferior ao padrão.
- Quando os PLTs do mesmo momento tiverem quantidades diferentes de rolos, separar os grupos necessários para representar corretamente as quantidades, sem perder a ligação com o apontamento.

O botão **Apontar** sempre abre o formulário vazio. Criar separadamente o botão **Repetir último**, que apenas copia os dados do último apontamento para edição; copiar nunca deve salvar automaticamente.

## 8. Apontamento do setor Fitas

Fitas deve utilizar sua própria tela e sua própria fórmula.

Campos:

- número da OP;
- produto do catálogo de Fitas;
- tempo produzido em minutos;
- velocidade em metros por minuto;
- largura em metros.

Usar largura padrão de **0,93 m** quando definida para o produto, permitindo ajuste antes de salvar.

Fórmula:

`produção em m² = tempo × velocidade × largura`

Exemplo: `60 × 25 × 0,93 = 1.395 m²`.

Antes da confirmação, mostrar tempo, velocidade, largura e total calculado em m². Não utilizar PLTs, rolos ou a fórmula do Corte nessa tela, salvo se uma futura regra validada determinar isso.

## 8.1. Apontamento do setor Mantas

Mantas utiliza formulário próprio, sem OP e sem reaproveitar a fórmula de Corte ou Fitas.

Campos:

- produto do catálogo de Mantas;
- lote;
- metragem;
- quantidade de PLTs;
- rolos de manta, calculados automaticamente.

Cada rolo corresponde a **10 m**. Portanto, `250 m = 25 rolos` e `200 m = 20 rolos`. Produtos com **4** no nome usam o padrão de **200 m e 20 rolos por PLT**; produtos com **3** no nome usam **250 m e 25 rolos por PLT**. A metragem permanece editável no apontamento e deve resultar em uma quantidade inteira de rolos.

## 9. Metas das OPs

Permitir informar uma meta quando uma nova combinação de OP e produto começar. A meta pode não existir; nesse caso, o apontamento continua permitido.

Depois de cadastrada, guardar a meta e não perguntar novamente em todos os apontamentos. Exibir:

- quantidade programada;
- quantidade apontada;
- quantidade restante;
- percentual de avanço;
- situação da OP.

A meta deve permanecer visível durante os três turnos até ser finalizada por usuário autorizado ou administrador.

Se um novo apontamento ultrapassar a meta, mostrar um aviso claro e solicitar confirmação. O excesso não deve bloquear o registro.

Permitir finalização e reabertura da OP somente para usuário autorizado ou administrador, preservando o histórico da ação.

## 10. Pendências e confirmação no Protheus

Todo novo apontamento começa com situação **Pendente**.

Na fila de pendências:

- agrupar por OP e produto;
- exibir data, turno, setor, sequência, quantidade e responsável pelo apontamento;
- permitir seleção e confirmação do lançamento manual no Protheus;
- ao confirmar, alterar para **Lançado**;
- gravar quem confirmou e a data/hora exata.

O sistema deve impedir confirmações duplicadas e tratar duas tentativas simultâneas com segurança.

Correções:

- facilitador corrige somente registros pendentes;
- administrador pode corrigir registros lançados, mas deve devolvê-los para pendente;
- toda correção exige justificativa;
- guardar os valores anteriores e os novos;
- registrar usuário, data e hora;
- nunca apagar silenciosamente o histórico original.

## 11. Histórico, contagem e passagem de turno

O Histórico deve permitir consulta por setor, data, turno, OP, produto, responsável e situação no Protheus.

A Contagem por produto deve consolidar a produção respeitando a unidade do setor e os filtros selecionados.

A Passagem de turno deve mostrar:

- produção registrada no turno;
- OPs/metas ainda ativas;
- pendências não lançadas no Protheus;
- alertas relevantes para o próximo turno;
- responsável e horário do encerramento.

## 12. Revisão e fechamento do turno

No final da página do turno, exibir o botão **Encerrar turno**.

Antes de encerrar, abrir uma tela de revisão com:

- setor, data e turno;
- OPs e produtos trabalhados;
- totais produzidos;
- PLTs, rolos e metragem para Corte e setores que futuramente utilizarem essa regra;
- tempo, velocidade, largura e m² para Fitas;
- apontamentos pendentes e lançados;
- responsáveis;
- alertas e inconsistências.

O botão de confirmação deve se chamar **Encerrar e gerar relatório**.

Depois da confirmação:

- bloquear novos apontamentos e alterações comuns naquele turno;
- manter os dados disponíveis para consulta;
- gerar automaticamente o PDF completo do mesmo setor, data e turno;
- abrir ou disponibilizar imediatamente o relatório;
- manter o botão **Gerar relatório** disponível no turno encerrado;
- impedir fechamentos e gerações duplicadas por cliques repetidos.

## 13. Relatórios e PDF

Criar uma Central de Relatórios com filtros por setor, período, turno, OP, produto e situação.

O PDF deve ter identidade DRYKO e conter resumo e detalhamento.

Informações gerais:

- setor;
- data e turno;
- horário de geração;
- OP e produto;
- quantidade programada, apontada e restante, quando houver meta;
- situação Pendente/Lançado no Protheus;
- quem apontou;
- quem confirmou o lançamento;
- data e horário das ações.

Para Corte e setores que utilizarem PLT no futuro:

- grupos de PLTs;
- sequência;
- rolos por PLT;
- total de rolos;
- metragem.

Para Fitas:

- tempo em minutos;
- velocidade em m/min;
- largura em metros;
- produção total em m².

Permitir imprimir, baixar e compartilhar o PDF. Separar sempre os dados por setor; nunca misturar produções de setores diferentes no relatório de um turno.

## 14. Envio automático por Gmail e Google Apps Script

Ao confirmar **Encerrar e gerar relatório**, o aplicativo deve gerar o PDF e iniciar automaticamente o envio por e-mail.

No aplicativo, criar uma configuração administrativa de destinatários. Permitir alterar os destinatários sem editar o Apps Script. O serviço atual aceita até 10 destinatários por envio.

Fluxo obrigatório:

1. O aplicativo fecha o turno e gera o PDF.
2. O backend do aplicativo envia ao Google Apps Script o identificador único do relatório, destinatários, assunto, corpo da mensagem, nome do arquivo e PDF.
3. O Apps Script valida uma chave secreta.
4. O Gmail autorizado envia a mensagem com o PDF anexado.
5. O aplicativo registra o resultado do envio.

Usar inicialmente um Gmail exclusivo de testes do aplicativo. Quando a empresa disponibilizar um endereço corporativo, permitir a substituição do serviço/remetente sem mudar o fluxo das telas nem os destinatários cadastrados.

Segurança:

- guardar a URL do serviço e a chave do Apps Script somente no backend/ambiente seguro;
- nunca colocar a chave secreta no navegador, no código público ou no banco acessível ao usuário;
- toda requisição deve usar HTTPS;
- rejeitar requisição sem chave válida;
- limitar o PDF a 20 MB;
- usar o identificador único do relatório para impedir envios duplicados;
- não bloquear nem perder o fechamento do turno caso o Gmail falhe.

Status visíveis no relatório/turno:

- **Aguardando envio**;
- **Enviando**;
- **Enviado**, com data e hora;
- **Falhou**, com mensagem compreensível;
- botão **Reenviar** quando houver falha.

O reenvio deve utilizar o mesmo relatório e manter o histórico das tentativas. Não permitir que cliques repetidos disparem múltiplos e-mails simultâneos.

Sugestão de assunto:

`Relatório de Produção | [Setor] | [Data] | [Turno]`

Sugestão de mensagem:

`Segue em anexo o relatório de produção do setor [Setor], referente ao turno [Turno] de [Data].`

## 15. Reportar problema com fotografia

Criar a opção **Reportar problema** para o usuário registrar:

- descrição do problema;
- tela ou área afetada;
- fotografia ou captura de tela da ocorrência.

Permitir selecionar uma imagem no celular, mostrar uma prévia antes do envio e registrar usuário, data e hora. O problema deve ficar disponível para consulta do administrador. Não inventar permissões de exclusão até que elas sejam definidas.

## 16. Integridade, auditoria e concorrência

Usar o fuso horário `America/Sao_Paulo` em registros e relatórios.

Todo registro operacional deve guardar:

- identificador único;
- setor;
- data e hora;
- turno;
- usuário responsável;
- situação atual;
- histórico das mudanças relevantes.

Implementar validações de campos obrigatórios, números positivos, limites permitidos e consistência das fórmulas. Proteger operações críticas com transações, bloqueios ou mecanismo equivalente para evitar duplicidade e conflitos simultâneos.

Não apagar dados de auditoria. A interface pode apresentar informações resumidas, mas o histórico deve permanecer disponível ao administrador.

## 17. Requisitos técnicos e de qualidade

- Aplicativo web responsivo em PT-BR.
- Persistência real em banco de dados; não usar somente dados simulados.
- Backend seguro para regras, e-mails, arquivos e operações críticas.
- Componentes reutilizáveis sem misturar as regras dos setores.
- Estados de carregamento, sucesso, vazio e erro em todas as telas relevantes.
- Mensagens de erro em linguagem simples.
- Nenhum botão decorativo: todas as ações exibidas devem funcionar.
- Não expor segredos, tokens ou credenciais no frontend.
- Preservar compatibilidade com celular e computador.
- Testar cálculos, permissões, fechamento, PDF, e-mail, duplicidade e concorrência.

## 18. Restrições obrigatórias

- Não dar acesso aos operadores nesta fase.
- Não integrar automaticamente com o Protheus na Fase 1.
- Não incluir máquina, caixas/CX ou observação no formulário de Corte.
- Não abrir o botão Apontar com dados do registro anterior.
- Não aplicar automaticamente a regra de Corte ou Fitas aos outros setores.
- Não misturar dados de setores diferentes.
- Não permitir correção de registro lançado por facilitador.
- Não perder o histórico anterior/depois das correções.
- Não fechar o turno sem revisão e confirmação.
- Não expor a chave do Apps Script.
- Não enviar o mesmo relatório duas vezes por cliques repetidos.
- Não inventar fórmulas para setores ainda não definidos.

## 19. Critérios de aceite

Considerar a implementação concluída somente quando for possível demonstrar:

1. Login e seleção de setor/turno funcionando.
2. Facilitador criando apontamento de Corte com 1–20 PLTs e cálculos corretos.
3. PLT picado e grupos com quantidades diferentes funcionando.
4. Apontamento de Fitas calculando corretamente `tempo × velocidade × largura`.
5. Meta exibindo programado, apontado, restante e percentual, inclusive aviso de excesso sem bloqueio.
6. Pendência sendo confirmada como lançada no Protheus por um usuário autorizado, com a identidade da confirmação registrada separadamente de quem apontou.
7. Permissões de correção respeitando Pendente/Lançado e mantendo auditoria.
8. Filtros e isolamento completo por setor.
9. Revisão e fechamento bloqueando o turno e gerando o PDF correto.
10. Envio automático pelo Apps Script registrando Enviado ou Falhou.
11. Reenvio funcionando sem duplicar mensagens.
12. Relatório permanecendo disponível após o fechamento.
13. Registro de problema aceitando descrição, tela afetada e imagem.
14. Layout funcionando corretamente em celular e computador.

Ao finalizar, apresente um resumo objetivo do que foi implementado, quais testes foram executados e quais regras dos setores continuam aguardando definição. Não declarar como concluída nenhuma regra operacional que ainda não tenha sido fornecida.

## Primeira resposta esperada neste novo chat

Antes de alterar ou construir qualquer coisa, responda com:

1. o nome da plataforma e o que ela suporta;
2. um resumo do aplicativo em até 10 tópicos;
3. a arquitetura proposta;
4. a ordem das etapas de implementação;
5. os pontos ainda aguardando definição;
6. a primeira etapa que será executada.

Depois disso, prossiga com a implementação sem modificar o projeto original mantido em outra plataforma.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/5b6aad8c-1fd1-4fa9-a5dd-d060a95ca778).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
