# Prompt mestre e narrativa funcional — Aponta Produção DRYKO

**Status:** especificação funcional portátil do aplicativo em produção

**Repositório oficial:** `jeimessantos559-sketch/produ-o-dryko-companion`

**Projeto Lovable:** `5b6aad8c-1fd1-4fa9-a5dd-d060a95ca778`

Este documento é a narrativa oficial para reconstruir, migrar ou continuar o aplicativo em outra plataforma. Ele descreve o comportamento atual do código e substitui requisitos históricos que entrarem em conflito com ele. A nova implementação deve preservar as regras abaixo; qualquer regra não descrita deve ser marcada como **aguardando definição**, nunca inventada.

## 1. Instrução para quem for reconstruir o sistema

Crie um aplicativo web responsivo chamado **Aponta Produção — DRYKO**, em português do Brasil, orientado ao uso por celular dentro da fábrica. O sistema registra produção por setor e turno, consolida lançamentos manuais no Protheus, acompanha programação e metas, registra ocorrências, fecha turnos e gera relatórios auditáveis.

Antes de alterar um projeto existente:

1. analise o código, o banco e as migrações atuais;
2. preserve registros e funções já operacionais;
3. aplique mudanças pequenas e versionadas;
4. mantenha cálculos críticos também no banco, não somente na interface;
5. valide o build, as permissões e os fluxos no celular;
6. não publique em produção sem autorização expressa;
7. não exponha chaves administrativas no navegador;
8. não trate o GitHub como backup dos registros de produção.

## 2. Objetivo do aplicativo

O aplicativo substitui controles manuais e planilhas dispersas por um fluxo rastreável para:

- apontar a produção no horário real em que ocorreu;
- calcular automaticamente PLTs, rolos, metragem ou área, conforme o setor;
- acompanhar a produção por hora, por produto e por turno;
- programar os produtos e quantidades do dia;
- distribuir automaticamente a meta do turno por hora produtiva;
- registrar paradas e ocorrências operacionais;
- separar apontamentos pendentes e lançados manualmente no Protheus;
- agrupar lançamentos compatíveis para reduzir digitação no Protheus;
- registrar separadamente quem apontou e quem confirmou o lançamento;
- fechar ou reabrir turnos com controle de permissão;
- gerar o relatório do turno e enviá-lo automaticamente por e-mail;
- manter histórico, auditoria e correção controlada;
- instalar o sistema como PWA no celular.

O lançamento no Protheus permanece manual. O aplicativo prepara, consolida e audita os valores, mas não transmite diretamente ao ERP nesta fase.

## 3. Arquitetura de referência

| Camada | Implementação atual | Regra de portabilidade |
| --- | --- | --- |
| Interface | React 19, TypeScript, TanStack Start/Router, Tailwind CSS | Manter interface mobile-first e validação no cliente |
| Backend web | Funções de servidor do TanStack Start | Operações administrativas e segredos somente no servidor |
| Banco/autenticação | Supabase/PostgreSQL, Auth, Storage e RLS | Recriar pelas migrações SQL versionadas |
| Cache/consultas | TanStack Query, RPC otimizada no painel e cache de produtos | Evitar uma consulta a cada tecla ou cartão |
| PWA | Manifesto, ícones e service worker gerado pelo projeto | Deve continuar instalável e atualizar com segurança |
| E-mail | Conector Gmail do Lovable; Apps Script como alternativa para relatórios | Configurar somente por variáveis secretas |
| PDF | Relatório gerado pelo aplicativo | Download manual no histórico; não forçar download no fechamento |

As migrações em `drizzle/migrations` e os tipos em `src/integrations/supabase/types.ts` formam a referência da estrutura do banco. O arquivo `drizzle/schema.ts` é intencionalmente vazio e não é a fonte do schema.

## 4. Identidade visual e padrão de uso

- Identidade DRYKO em vermelho, preto, branco e cinzas neutros.
- Verde representa concluído ou lançado; amarelo representa pendência ou alerta; vermelho representa erro, bloqueio ou ação crítica.
- Interface compacta, fluida e orientada a smartphone.
- Botões e campos devem ser confortáveis para toque, com área mínima adequada.
- A ação **Apontar** permanece visível no fluxo principal.
- Informações essenciais usam alto contraste; conteúdo secundário não deve competir com a produção.
- Modais em celular devem respeitar a altura visível, rolar internamente e manter a ação principal acessível.
- Tema claro e escuro disponível nas configurações do usuário.
- Evitar páginas longas, cartões excessivamente altos e repetição de dados.
- Acessibilidade mínima: rótulos de campo, foco visível, navegação por teclado e contraste verificável.

## 5. Setores

Setores cadastrados:

1. Corte;
2. Fitas;
3. Mantas;
4. Asfox;
5. Misturadores;
6. Líquidos;
7. Pós;
8. Avulsos.

Corte, Fitas e Mantas possuem regras de apontamento implementadas. Asfox, Misturadores, Líquidos, Pós e Avulsos permanecem preparados na arquitetura, mas com regras operacionais **aguardando definição**. Não copiar automaticamente campos ou fórmulas de outro setor.

Os dados são isolados por setor. Usuários comuns visualizam e operam o setor atual; o administrador possui visão ampliada conforme as políticas do banco.

## 6. Turnos e data operacional

| Turno | Horário oficial | Horas cheias usadas na programação |
| --- | --- | --- |
| T1 | 06:00–15:38 | 06:00 a 14:00 |
| T2 | 15:38–02:00 | 16:00 a 01:00, nesta ordem |
| T3 | 01:00–06:00 | 01:00 a 05:00 |

O fuso oficial é **America/Sao_Paulo**.

Regra não negociável de data operacional:

- em T1, usar a data civil do momento da produção;
- em T2 e T3, qualquer produção entre 00:00 e 05:59 pertence à data operacional do dia anterior;
- a mesma regra deve ser usada em apontamento, painel, contagem, programação, fechamento, relatório, pendência e auditoria;
- a ordem das horas em T2 atravessa a meia-noite sem voltar para o início da lista.

O usuário informa o horário real da produção. O sistema rejeita horário fora do turno e horário mais de cinco minutos no futuro. O banco calcula a data operacional e impede apontamento em turno fechado.

## 7. Autenticação, perfis e primeiro acesso

- Login operacional no padrão `Nome.Sobrenome`.
- Cada pessoa deve possuir conta individual; não usar conta compartilhada.
- Novos usuários são cadastrados pela rotina administrativa, nunca por manipulação direta insegura de `auth.users`.
- Senha inicial apresentada ao administrador: `123456`.
- No primeiro acesso, a troca de senha é obrigatória.
- O usuário escolhe setor e turno; a seleção fica salva no perfil e pode ser alterada depois.
- A recuperação de senha usa o e-mail de recuperação cadastrado no perfil.
- O perfil permite alterar nome, e-mail de recuperação, foto e tema.
- A foto fica em bucket privado e é exibida por URL temporária assinada.
- A biometria usa WebAuthn/passkeys com verificação no servidor; nenhuma chave privada biométrica é armazenada pelo aplicativo.
- A origem e o domínio fazem parte da validação WebAuthn. Após mudança de domínio, a credencial pode precisar ser registrada novamente.

## 8. Papéis e permissões

| Papel/permissão | Capacidades principais |
| --- | --- |
| Facilitador | Apontar, consultar o setor, acompanhar produção, registrar ocorrências e corrigir pendentes permitidos |
| Autorizado Protheus | Confirmar que um ou mais apontamentos foram lançados manualmente no Protheus |
| Administrador | Gerenciar usuários, papéis, produtos, marcas, permissões, relatórios, problemas e reabertura de turno |
| Programador de Produção | Alterar a programação diária de produção |
| `pode_gerenciar_produtos` | Acesso administrativo ao catálogo e à prioridade das marcas |
| `pode_confirmar_protheus` | Permissão granular para confirmar lançamentos no Protheus |
| `pode_finalizar_metas` | Permissão granular para finalizar metas |

Um usuário pode ter mais de um papel. O servidor e as políticas RLS devem validar a autorização; esconder um botão na interface não é controle de segurança suficiente.

Regras adicionais:

- somente administrador reabre turno;
- correção de apontamento lançado deve retornar o registro para **Pendente** e manter auditoria;
- quem apontou e quem lançou no Protheus são responsabilidades independentes;
- usuário inativo não pode operar nem entrar por biometria.

## 9. Navegação funcional

O menu atual oferece, conforme a permissão:

- Painel;
- Programação/Contagem;
- Histórico;
- Passagem de turno;
- Relatórios;
- Reportar problema;
- Controle Protheus;
- Administração;
- Setor e turno;
- Configurações.

O administrador acessa usuários, produtos, prioridade das marcas, grupos de e-mail e controle dos apontamentos a partir da área administrativa.

## 10. Catálogo e ordem das marcas

Produtos pertencem a um setor e podem possuir categoria/marca, largura, rolos por PLT, metragem por PLT e metros por rolo. Somente campos coerentes com o setor são utilizados.

A ordem das marcas definida na Administração deve ser respeitada no seletor de produto. Dentro de cada marca, ordenar os produtos por nome com comparação numérica natural. Marcas sem prioridade explícita aparecem depois das configuradas.

### 10.1 Corte

| Produto | Rolos por PLT |
| --- | ---: |
| FVD 5 | 1280 |
| FVD 10 | 640 |
| FVD 15 | 432 |
| FVD 20 | 320 |
| FVD 30 | 216 |
| FVD 45 | 144 |
| FVD 60 | 72 |
| FVD 90 | 72 |
| DRYKO 5 | 960 |
| DRYKO 10 | 480 |
| DRYKO 15 | 288 |
| DRYKO 20 | 240 |
| DRYKO 30 | 168 |
| DRYKO 45 | 112 |
| DRYKO 60 | 56 |
| DRYKO 90 | 56 |

A largura de cada produto deve permanecer visível no cadastro e no apontamento. Ela vem do catálogo, não do nome interpretado em tempo real.

### 10.2 Fitas

- FVDG;
- FITAG;
- FVDG TERRA;
- FITAG TERRA;
- FVDG CINZA;
- FITAG CINZA.

A largura inicial cadastrada é 0,93, mas deve continuar administrável e registrada no apontamento para preservar o cálculo histórico.

### 10.3 Mantas

**Marca Dryko:** P4top, P3top, Polialum3, Polialum4, Polialum3VF, Polialum4Vf, PR3PP e PR4PP.

**Marca Denver Suprema:** P4top-sop, P3top-sop, Polialum3-sop, Polialum4-sop, Pr3pp-sop e Pr4pp-sop.

Regras iniciais do catálogo:

- produtos de 3 mm: 250 m por PLT, 25 rolos;
- produtos de 4 mm: 200 m por PLT, 20 rolos;
- cada rolo possui 10 m;
- os valores ficam no catálogo e podem ser administrados sem mudar registros históricos.

## 11. Apontamento de Corte

Campos essenciais:

- horário real da produção;
- OP;
- produto;
- quantidade de PLTs fechados, de 0 a 20;
- rolos por PLT carregados do catálogo;
- quantidade opcional de rolos do PLT picado.

Regras:

1. um salvamento gera um apontamento, mesmo quando contém vários PLTs;
2. `PLTs fechados = quantidade informada`, sem incluir o picado;
3. `rolos = PLTs fechados × rolos por PLT + rolos picados`;
4. `metragem em m² = largura × rolos ÷ 10`;
5. a opção **− PLT picado** permite informar zero PLT fechado e somente rolos;
6. os rolos picados devem ser maiores que zero e menores que um PLT completo;
7. o picado não aumenta a contagem de pallets fechados;
8. mostrar largura, padrão e cálculos antes de salvar;
9. manter compatibilidade de leitura com registros antigos, cuja representação do picado era diferente;
10. a OP é obrigatória.

Exemplo: FVD 20 com 2 PLTs fechados, padrão de 320 e mais 100 rolos picados resulta em 2 PLTs e 740 rolos. Se a largura for 20, a metragem é 1.480 m².

## 12. Apontamento de Fitas

Campos essenciais:

- horário real da produção;
- OP;
- produto;
- tempo;
- velocidade;
- largura.

Fórmula:

`área em m² = tempo × velocidade × largura`

A OP é obrigatória. A metragem/área é a informação principal para o Protheus e deve aparecer em destaque. O registro histórico preserva os valores usados no cálculo.

## 13. Apontamento de Mantas

Campos essenciais:

- horário real da produção;
- produto;
- lote;
- quantidade de PLTs;
- metragem.

Mantas **não usa OP no fluxo atual**. O lote identifica o lançamento.

Regras:

1. quantidade de PLTs deve ser inteira e maior que zero;
2. metragem deve ser maior que zero;
3. `rolos = metragem ÷ metros por rolo`;
4. a metragem deve formar uma quantidade inteira de rolos;
5. ao selecionar um produto ou alterar PLTs, sugerir a metragem conforme o catálogo;
6. metragem é o valor principal exibido no painel e no Protheus; PLTs e rolos são apoio;
7. os apontamentos permanecem registros unitários para auditoria, mesmo quando forem agrupados para lançamento.

Exemplos: 250 m correspondem a 25 rolos; 200 m correspondem a 20 rolos.

## 14. Painel do turno

O painel é a tela operacional principal e deve carregar, preferencialmente, por uma RPC única e otimizada. Ele apresenta:

- setor, turno, data operacional e usuário;
- pendentes para o Protheus;
- lançados;
- unidade principal produzida no turno;
- PLTs fechados quando aplicável;
- apontamentos do turno;
- pendências de turnos anteriores;
- acesso rápido para apontar e repetir o último registro;
- ação de lançamento no Protheus para usuário autorizado;
- situação de turno aberto ou fechado.

Ao repetir o último apontamento, preencher os dados, mas exigir revisão e novo horário de produção antes da confirmação.

## 15. Contagem por hora, meta e programação

A tela **Programação/Contagem** possui duas visões complementares.

### 15.1 Produção por hora

- agrupar registros pela hora real da produção;
- dentro de cada hora, separar por produto;
- respeitar a ordem operacional do turno, inclusive T2 após a meia-noite;
- Corte: destacar PLTs e mostrar unidades/rolos e m² como apoio;
- Fitas: destacar m²;
- Mantas: destacar metros e mostrar PLTs e rolos como apoio;
- apresentar total da hora, realizado acumulado, meta acumulada e diferença acumulada.

### 15.2 Meta do turno

- a meta total é definida por usuário autorizado;
- a duração produtiva pode ser ajustada;
- `meta média por hora = meta total ÷ horas produtivas`;
- ajustes específicos de uma hora podem substituir a média;
- paradas programadas ou registradas devem permanecer visíveis;
- unidades atuais da meta: Corte e Fitas em m²; Mantas em m;
- a interface simula a distribuição antes de salvar.

### 15.3 Programação do dia

- disponível para Corte, Fitas e Mantas;
- somente administrador ou Programador de Produção altera;
- pode registrar produto, quantidade prevista e OP/lote quando conhecidos;
- a programação é global para a data operacional e compartilhada entre turnos;
- unidades: Corte em PLTs, Fitas em m² e Mantas em m;
- mostrar programado, produzido no dia e saldo;
- permitir informar OP/lote na primeira produção quando ainda não estiverem definidos;
- alertar quando o apontamento ultrapassar o saldo, sem perder o registro real por engano.

## 16. Ocorrências e passagem de turno

- Registrar ocorrências operacionais por setor, turno e data operacional.
- Permitir paradas com duração e motivo.
- Oferecer campo de mensagem para fatos não cobertos pelas opções estruturadas.
- Consolidar o texto das ocorrências para o relatório e para a passagem de turno.
- A ocorrência deve indicar autor e horário quando aplicável.
- A passagem de turno deve facilitar a leitura do próximo facilitador sem misturar outros setores.

## 17. Controle e agrupamento para o Protheus

Todo apontamento nasce com status **Pendente**. A confirmação muda o status para **Lançado** e registra usuário e data/hora.

Agrupamento atual:

| Setor | Chave do agrupamento | Valor principal |
| --- | --- | --- |
| Corte | mesma OP + mesmo produto | soma de PLTs fechados e unidades/rolos |
| Fitas | mesma OP + mesmo produto | soma da área em m² |
| Mantas | mesmo produto + mesmo lote | soma de metros, PLTs e rolos |

Somente registros pendentes são agrupados para nova confirmação. Se faltar OP em Corte/Fitas ou lote em Mantas, não consolidar silenciosamente: manter o item isolado para correção.

No painel atual, pendências da mesma data/turno são consolidadas. Ao mostrar pendências antigas, a chave também separa data e turno para não misturar contextos operacionais diferentes.

A confirmação agrupada deve enviar ao banco os IDs originais. O histórico e a auditoria continuam existindo por apontamento; o agrupamento é uma visão de lançamento, não uma fusão destrutiva dos registros.

## 18. Correção e auditoria

- Registrar valores anteriores e novos, autor e horário da correção.
- Facilitador corrige somente o que sua permissão permitir e nunca apaga rastreabilidade.
- Corrigir registro já lançado exige permissão administrativa e devolve o status para Pendente.
- Correções devem respeitar as mesmas fórmulas e validações de um novo apontamento.
- Evitar exclusão física de produção; preferir correção auditada ou inativação quando houver regra definida.

## 19. Fechamento, reabertura e relatórios

Ao fechar um turno:

1. validar setor, turno e data operacional;
2. consolidar produção, pendências, responsáveis, programação, metas e ocorrências;
3. gerar o registro de fechamento;
4. gerar o relatório;
5. enviar automaticamente ao grupo de e-mail ativo marcado como automático;
6. registrar status, tentativas e eventual erro de envio;
7. **não baixar o PDF automaticamente**.

O PDF continua disponível manualmente no Histórico de Relatórios para abrir, baixar, imprimir ou compartilhar.

Somente administrador pode reabrir um turno. A reabertura deve ser auditável e permitir que o fluxo operacional volte a receber correções/apontamentos conforme as regras do banco.

O e-mail remetente operacional é `apontaproducao@gmail.com`. Destinatários são administrados no aplicativo e limitados pelo banco. Nunca gravar tokens ou credenciais no código.

## 20. Administração

A área administrativa reúne:

- visão operacional geral;
- controle dos apontamentos;
- usuários ativos e permissões;
- produtos e seus padrões;
- prioridade das marcas;
- grupos de e-mail para relatórios;
- problemas reportados;
- reabertura de turno;
- ações de manutenção permitidas.

O cadastro em lote deve usar a rotina administrativa do Supabase Auth e criar Facilitadores com primeiro acesso obrigatório. Nunca inserir usuários diretamente em tabelas internas do Auth por SQL de aplicação.

## 21. Reporte de problemas

- Usuário pode descrever um problema e anexar fotografia.
- A imagem vai para bucket específico com limite de tamanho e MIME.
- O administrador consulta e resolve os registros.
- Se o salvamento do registro falhar após upload, remover o arquivo órfão quando possível.

## 22. Modelo de dados conceitual

Principais entidades versionadas:

- `profiles`: identidade operacional, estado do primeiro acesso, setor/turno e permissões granulares;
- `user_roles`: papéis acumuláveis;
- `setores` e `turnos`: cadastros-base;
- `produtos` e `marcas_produto`: catálogo e prioridade;
- `apontamentos`: produção e status Protheus;
- `apontamento_auditoria`: trilha de correções;
- `metas_op`, `metas_turno` e `meta_auditoria`: metas e histórico;
- `programacao_producao` e `programacao_hora`: plano diário, meta horária e paradas;
- `ocorrencias_turno`: fatos operacionais;
- `fechamentos_turno` e `relatorios`: fechamento e envio;
- `grupos_email_relatorio`: destinatários automáticos;
- `problemas`: suporte interno;
- `webauthn_challenges` e `webauthn_credenciais`: biometria validada no servidor.

Buckets:

- `problemas`: fotografias de chamados;
- `avatars`: fotos privadas de perfil, separadas pela pasta do usuário.

## 23. Segurança obrigatória

- RLS habilitada nas tabelas acessadas pelo navegador.
- `SUPABASE_SERVICE_ROLE_KEY` somente no servidor.
- Variáveis com prefixo `VITE_` são públicas; nunca colocar segredo nelas.
- Funções `SECURITY DEFINER` devem fixar `search_path`, validar o usuário e ter privilégios mínimos.
- Credenciais e desafios WebAuthn são acessados somente pelo backend com service role.
- Desafios WebAuthn expiram e são consumidos uma única vez.
- Bucket de avatar é privado e limitado à pasta do próprio usuário.
- Operações administrativas precisam de validação no servidor/RPC.
- Erros de recuperação de senha não devem revelar se um e-mail existe.
- Senhas, tokens, dumps com dados pessoais e arquivos de produção não entram no GitHub.

## 24. Desempenho e confiabilidade

- Priorizar uma experiência rápida em Android e redes instáveis.
- Não recarregar listas ou consultar o banco a cada tecla digitada.
- Debounce em buscas que dependem do servidor.
- Reutilizar cache de produtos e marcas.
- Carregar somente colunas e períodos necessários.
- Usar RPC agregada para o painel.
- Paginar ou limitar histórico e relatórios.
- Carregar diálogos e áreas administrativas sob demanda.
- Evitar dependências pesadas quando uma solução nativa for suficiente.
- Índices do banco devem acompanhar filtros por setor, turno, data, status, OP, lote e produto.
- Escritas críticas devem ser idempotentes ou protegidas contra duplo toque.
- Toda consulta assíncrona deve apresentar estado de carregamento e erro útil.

## 25. Critérios mínimos de aceite

Antes de considerar uma nova implantação pronta:

1. login, primeiro acesso, troca e recuperação de senha funcionam;
2. usuário inativo é bloqueado;
3. seleção de setor/turno persiste;
4. a data operacional é correta antes e depois da meia-noite nos três turnos;
5. os cálculos de Corte, Fitas e Mantas batem com exemplos conhecidos;
6. PLT picado não soma pallet fechado;
7. a ordem das marcas chega ao seletor de produtos;
8. agrupamentos do Protheus seguem a tabela desta especificação;
9. confirmação registra o lançador sem perder o apontador;
10. contagem por hora mantém a ordem real do T2;
11. programação global e saldo do dia são coerentes;
12. fechamento gera relatório, envia e-mail e não força download;
13. PDF pode ser baixado manualmente no histórico;
14. apenas administrador reabre turno;
15. RLS impede acesso indevido a outro setor;
16. avatar privado e biometria funcionam no domínio final;
17. PWA instala com nome, ícone e tema corretos;
18. `bun install --frozen-lockfile`, `bun run build` e `bun run verify:portability` concluem sem erro.

## 26. Limites atuais e decisões que não devem ser inventadas

- Integração automática de escrita no Protheus ainda não existe.
- Regras de Asfox, Misturadores, Líquidos, Pós e Avulsos aguardam levantamento operacional.
- GitHub guarda código e estrutura do banco, não os registros vivos do Supabase.
- Dados de Auth e arquivos de Storage exigem estratégia própria de backup/restauração.
- Uma nova plataforma pode trocar a tecnologia de interface, mas deve preservar cálculos, permissões, auditoria, data operacional e agrupamentos.

## 27. Ordem recomendada para reconstrução em outra plataforma

1. banco, enums, funções, índices, RLS e buckets;
2. Auth, perfil, papéis e primeiro acesso;
3. catálogo, marcas e seleção de setor/turno;
4. apontamento de Corte e testes do PLT picado;
5. apontamento de Fitas;
6. apontamento de Mantas;
7. painel e agrupamento Protheus;
8. programação, metas, hora a hora e ocorrências;
9. correção, auditoria e fechamento;
10. PDF, histórico e e-mail;
11. administração, avatar, biometria e reporte de problema;
12. PWA, desempenho, testes de celular e ensaio de restauração.

Para executar a migração técnica, seguir também `docs/GUIA_MIGRACAO_E_BACKUP.md`.
