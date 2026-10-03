# Auditoria de portabilidade e melhorias recomendadas

## Avanços implementados em 03/10/2026

- correção segura do perfil e do avatar, incluindo compatibilidade de permissões no banco;
- CI no GitHub com instalação pelo lockfile, portabilidade, lint crítico, testes, build e varredura de segredos;
- workflow diário de backup do PostgreSQL e dos buckets `avatars` e `problemas`, com criptografia e retenção de 14 dias, pronto para ativação;
- testes automatizados de data operacional, sequência de horas, PLT picado, fórmulas e agrupamento do Protheus;
- limite persistente de tentativas para senha, biometria e recuperação de acesso;
- identificação da versão instalada, aviso de internet indisponível e atualização controlada do PWA;
- recuperação de envio de relatório que tenha ficado travado no estado `enviando`;
- painel administrativo de indicadores por setor, sem misturar unidades produtivas.

Para ativar o backup, cadastre os segredos `SUPABASE_DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e `BACKUP_ENCRYPTION_KEY` no GitHub e defina a variável `BACKUP_ENABLED=true`. A fila offline de apontamentos permanece desativada até serem formalizadas as regras de conflito com fechamento de turno, horário e produto desativado.

## Resultado da auditoria do repositório

O repositório contém o aplicativo completo — frontend, funções de servidor, PWA, componentes, rotas, catálogo, relatórios, integrações e migrações do banco. A auditoria de portabilidade encontrou e tratou estes pontos:

1. documentação histórica conflitava com o fluxo atual de Mantas;
2. `.env.example` não listava todas as variáveis usadas pelo código;
3. avatar e WebAuthn já existiam no código/tipos, mas faltava a migração correspondente;
4. as dependências WebAuthn estavam no `package.json`, mas o lockfile precisava ser sincronizado;
5. faltava uma verificação automatizada dos arquivos essenciais à portabilidade.

As correções ficam versionadas junto do código. Os registros reais do Supabase não são parte do repositório e precisam de backup próprio.

## Prioridade 1 — proteção dos dados e previsibilidade

### 1. Backup automático e teste de restauração

Implantar backup diário do PostgreSQL e dos buckets, com alerta de falha, retenção definida e ensaio de restauração. É a melhoria mais importante porque o GitHub não guarda produção, usuários nem fotografias.

### 2. CI obrigatória no GitHub

Executar automaticamente em cada pull request/push:

- instalação pelo lockfile;
- `verify:portability`;
- build;
- lint;
- testes;
- varredura de segredos e dependências vulneráveis.

Bloquear merge quando uma etapa crítica falhar.

### 3. Testes automatizados das regras industriais

Priorizar testes para:

- data operacional de T2/T3 após a meia-noite;
- validação dos limites exatos dos três turnos;
- PLT picado sem aumentar PLTs fechados;
- fórmulas de Corte, Fitas e Mantas;
- agrupamentos do Protheus;
- correção de lançado voltando a Pendente;
- fechamento/reabertura e envio de relatório;
- programação global do dia e ordem das horas.

### 4. Disciplina de migrações

Toda alteração feita no painel do Supabase deve gerar, no mesmo trabalho, uma migração no GitHub e atualização dos tipos. Adotar uma tabela/ledger de migrações aplicadas e validar migração do zero na CI.

## Prioridade 2 — operação e segurança

### 5. Monitoramento e diagnóstico

Adicionar captura de erros do frontend e do servidor, métricas de tempo de resposta, falhas de RPC, erros de e-mail e uma identificação de versão/commit no aplicativo. Isso reduz o tempo para descobrir onde um problema ocorreu.

### 6. Fila confiável para relatórios

Separar geração e envio em uma fila idempotente, com retentativa automática, limite de tentativas e painel de falhas. Evita duplicidade ou perda quando o Gmail/Apps Script fica indisponível.

### 7. Proteção adicional da biometria e autenticação

Implementar limite de tentativas por IP/usuário, limpeza agendada dos desafios expirados, revogação clara de dispositivos e alertas para login anormal. Revisar periodicamente as URLs de Auth e o domínio WebAuthn.

### 8. Gestão de segredos

Remover o `.env` real do controle de versão, mesmo quando ele contiver apenas chaves públicas, e abastecer ambientes pelo cofre da plataforma. Manter rotação documentada dos segredos administrativos.

### 9. Modo de rede instável

Adicionar indicador offline e fila local segura para apontamentos, com prevenção de duplicidade e confirmação explícita da sincronização. Antes de ativar, definir conflitos de horário, fechamento e produto desativado.

## Prioridade 3 — evolução do produto

### 10. Definir os cinco setores pendentes

Fazer levantamento em campo de Asfox, Misturadores, Líquidos, Pós e Avulsos: identificador, unidade, fórmula, campos, catálogo, agrupamento Protheus e relatório. Implementar um setor por vez com testes de aceite.

### 11. Integração real com Protheus

Projetar uma fase separada com API oficial, ambiente de homologação, idempotência, retorno de protocolo, reprocessamento e conciliação. Não substituir a confirmação manual até existir aceite formal e plano de retorno.

### 12. Indicadores gerenciais

Adicionar, após validar a qualidade dos dados:

- aderência ao programado;
- produtividade por hora/turno/produto;
- causas e duração de paradas;
- tempo até lançamento no Protheus;
- pendências envelhecidas;
- tendência de meta e previsão de fechamento.

### 13. Exportação controlada

Gerar planilha padronizada para auditoria/gestão e, se necessário, importação de programação. Aplicar filtros de permissão e registrar quem exportou.

### 14. Acessibilidade e treinamento

Validar contraste, leitura em telas pequenas, teclado, leitores de tela e campos numéricos. Criar um tutorial curto por papel e um roteiro de contingência para indisponibilidade.

### 15. Atualização do PWA

Exibir versão instalada, avisar quando houver atualização pronta e permitir recarregar após salvar o trabalho. Não trocar a versão silenciosamente durante um apontamento em andamento.

## Ordem sugerida de execução

1. backup/restauração;
2. CI e testes das regras críticas;
3. monitoramento e fila de e-mail;
4. segurança/segredos/biometria;
5. rede instável;
6. setores pendentes;
7. integração Protheus;
8. indicadores e exportações.
