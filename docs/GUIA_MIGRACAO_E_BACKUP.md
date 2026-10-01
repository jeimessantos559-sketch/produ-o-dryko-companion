# Guia de migração, implantação e backup

Este guia permite mover o **Aponta Produção — DRYKO** para outra conta, domínio ou plataforma sem confundir três ativos diferentes:

1. **código e estrutura**: ficam no GitHub;
2. **registros operacionais**: ficam no PostgreSQL/Supabase;
3. **identidades e arquivos**: ficam no Supabase Auth e Storage.

O GitHub, sozinho, não é um backup completo do aplicativo em operação.

## 1. Fontes oficiais

- Repositório: `https://github.com/jeimessantos559-sketch/produ-o-dryko-companion`
- Branch de produção: `main`
- Projeto Lovable conhecido: `5b6aad8c-1fd1-4fa9-a5dd-d060a95ca778`
- Domínio público conhecido: `https://aponta-dryko.lovable.app`
- Especificação funcional: `docs/PROMPT_MESTRE_APONTA_PRODUCAO.md`
- Migrações do banco: `drizzle/migrations/*.sql`
- Tipos gerados do Supabase: `src/integrations/supabase/types.ts`
- Variáveis necessárias: `.env.example`

## 2. O que está versionado no Git

- código React/TanStack do frontend e do servidor;
- componentes, rotas, validações e cálculos;
- catálogo inicial dos produtos;
- manifesto, ícones e configuração PWA;
- migrações SQL numeradas;
- funções/RPCs, gatilhos, índices, permissões e políticas RLS;
- criação dos buckets e políticas de Storage;
- tipos TypeScript do banco;
- documentação funcional e de migração;
- arquivo de dependências e lockfile.

## 3. O que não deve ser colocado no GitHub

- registros reais de produção;
- usuários e senhas do Supabase Auth;
- tokens de sessão;
- service role, tokens do Gmail ou token do Apps Script;
- fotos de perfil e de problemas;
- dumps com dados pessoais ou industriais;
- relatórios reais com informações da fábrica.

Esses itens exigem backup criptografado e acesso restrito.

## 4. Pré-requisitos para uma nova implantação

- Git;
- Node.js compatível com as dependências atuais;
- Bun 1.2.22 ou versão validada pelo projeto;
- projeto Supabase/PostgreSQL novo;
- provedor capaz de executar TanStack Start com funções de servidor;
- domínio HTTPS definitivo para PWA e WebAuthn;
- serviço de e-mail: conector Gmail compatível ou Google Apps Script protegido.

## 5. Clonar e validar o código

```bash
git clone https://github.com/jeimessantos559-sketch/produ-o-dryko-companion.git
cd produ-o-dryko-companion
git switch main
bun install --frozen-lockfile
bun run verify:portability
bun run build
```

Não usar um branch antigo como origem de migração. Antes da cópia, confirmar que `main` está atualizada e que o build foi concluído.

## 6. Configurar variáveis

Copiar apenas os nomes de `.env.example` para o cofre de segredos da nova plataforma.

### Públicas, usadas pelo navegador

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

### Servidor

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `APP_URL`

### E-mail no Lovable

- `LOVABLE_API_KEY`
- `GOOGLE_MAIL_API_KEY` ou `GOOGLE_MAIL_API_KEY_1`

### Alternativa de envio de relatórios

- `APPS_SCRIPT_WEB_APP_URL`
- `APPS_SCRIPT_API_TOKEN`

### Rotinas agendadas

- `LOVABLE_CRON_SECRET`
- `LOVABLE_CRON_SECRET_PREVIOUS`, usado somente durante rotação controlada

Regras:

- nunca prefixar segredo com `VITE_`;
- nunca copiar valores reais para `.env.example`;
- `SUPABASE_SERVICE_ROLE_KEY` só pode existir no ambiente do servidor;
- atualizar `APP_URL` ao trocar o domínio;
- configurar no Supabase as URLs permitidas de login e recuperação.

## 7. Criar a estrutura do banco em ambiente novo

As migrações devem ser executadas em ordem lexical, de `0000` até a última. Cada arquivo precisa concluir antes do próximo.

Exemplo com uma conexão PostgreSQL administrativa, em ambiente controlado:

```bash
for arquivo in drizzle/migrations/*.sql; do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$arquivo" || exit 1
done
```

Cuidados:

- use a conexão direta/pooler indicada pelo provedor;
- mantenha `DATABASE_URL` fora do histórico do terminal e do Git;
- em banco já existente, não execute novamente todas as migrações às cegas;
- compare a estrutura e aplique somente migrações ainda não executadas;
- faça snapshot antes de qualquer alteração em produção;
- valide tabelas, funções, gatilhos, RLS, índices e buckets após a execução.

A migração `0019_configuracoes_avatar_webauthn.sql` cria a coluna de avatar, o bucket privado `avatars` e as tabelas de biometria usadas pelo código atual.

## 8. Primeiro administrador em ambiente totalmente novo

1. Crie a primeira identidade pelo Supabase Dashboard ou pela API administrativa segura.
2. Não insira manualmente uma linha em `auth.users`.
3. Copie o UUID criado.
4. Em uma sessão administrativa do banco, conceda o papel inicial:

```sql
INSERT INTO public.user_roles (user_id, role)
VALUES ('UUID_DO_USUARIO', 'administrador')
ON CONFLICT (user_id, role) DO NOTHING;
```

Depois disso, todos os demais usuários devem ser criados pela Administração do aplicativo, que usa a API Admin no servidor e aplica o primeiro acesso obrigatório.

## 9. Migrar dados operacionais

### 9.1 Antes do corte

- combinar uma janela de manutenção;
- impedir novos apontamentos durante o dump final;
- anotar data, hora, origem e responsável;
- conferir espaço, criptografia e destino do backup;
- registrar contagens por tabela antes da exportação.

### 9.2 Banco

Use a ferramenta oficial de backup do provedor ou `pg_dump` a partir de uma máquina segura. Um exemplo genérico de arquivo em formato customizado é:

```bash
pg_dump --format=custom --no-owner --no-acl "$DATABASE_URL" --file aponta-dryko.dump
```

Para restaurar em um ambiente de homologação:

```bash
pg_restore --no-owner --no-acl --clean --if-exists --dbname "$DESTINATION_DATABASE_URL" aponta-dryko.dump
```

Esses comandos são uma referência PostgreSQL. Auth e schemas gerenciados podem exigir o procedimento específico do Supabase. Teste primeiro em homologação; nunca faça a primeira tentativa diretamente no destino de produção.

### 9.3 Auth

O backup das tabelas públicas não recria automaticamente senhas utilizáveis. Planeje uma destas opções com o provedor:

- migração suportada do schema Auth;
- convite/recriação administrativa das identidades;
- redefinição de senha no primeiro acesso.

Preserve os UUIDs quando for necessário manter os vínculos com `profiles`, apontamentos e auditorias. Nunca copie hashes de senha por planilha ou chat.

### 9.4 Storage

Exporte e restaure separadamente os objetos dos buckets:

- `problemas`;
- `avatars`.

Preserve o caminho do objeto, porque `profiles.avatar_url` guarda o caminho no bucket e as imagens de problemas também dependem de seus endereços. Depois da cópia, valide as políticas e URLs assinadas.

## 10. Ordem segura de uma migração completa

1. Criar o novo Supabase e o novo ambiente web.
2. Aplicar as migrações em um banco vazio.
3. Configurar Auth, URLs e segredos.
4. Fazer build e executar testes sem dados reais.
5. Restaurar uma cópia anonimizada em homologação.
6. Validar permissões, cálculos, relatórios e WebAuthn.
7. Exportar Auth e Storage pelo processo aprovado.
8. Abrir a janela de corte e bloquear escrita na origem.
9. Fazer o backup final e registrar hashes/contagens.
10. Restaurar no destino.
11. Comparar contagens e amostras por setor/data/status.
12. Testar login, apontamento, Protheus, fechamento, PDF e e-mail.
13. Trocar o domínio/DNS somente após aceite.
14. Manter a origem somente leitura durante o período de retorno.

## 11. Validações após restauração

Conferir, no mínimo:

- quantidade de usuários ativos e papéis;
- quantidade de produtos ativos por setor;
- apontamentos por setor, data operacional, turno e status;
- soma de PLTs/rolos/m²/metros em dias de amostra;
- metas e programação do dia;
- ocorrências e fechamentos;
- relatórios e status de envio;
- referências de autor, corretor e lançador no Protheus;
- imagens existentes;
- políticas RLS com uma conta comum e uma conta administradora;
- RPC do painel;
- login por senha e recuperação;
- novo cadastro WebAuthn no domínio de destino.

## 12. Particularidades por plataforma

### Lovable

- conectar o repositório correto;
- configurar Supabase e segredos no ambiente;
- usar o projeto para preview e publicação;
- um push no GitHub pode sincronizar o editor, mas não substitui a autorização para publicar produção;
- validar o conector Gmail da conta nova.

### Vercel, Netlify ou outro provedor Node

- confirmar suporte a SSR/funções do TanStack Start;
- configurar todas as variáveis de servidor e cliente;
- definir `APP_URL` com o domínio final;
- não transformar funções administrativas em código executado no navegador;
- validar limites de payload e tempo para geração/envio de PDF.

### Outra ferramenta low-code

- tratar `docs/PROMPT_MESTRE_APONTA_PRODUCAO.md` como contrato funcional;
- recriar as validações no banco, mesmo que a ferramenta também valide na tela;
- preservar UUIDs e auditoria na importação;
- provar RLS e agrupamentos com testes de aceite antes da troca.

## 13. Plano de retorno

Antes da publicação em outro lugar, documentar:

- ponto exato de retorno;
- responsável pela decisão;
- tempo máximo de indisponibilidade;
- origem que continuará preservada;
- procedimento para reverter DNS/domínio;
- como reconciliar registros eventualmente criados depois do corte.

Não operar dois bancos graváveis em paralelo sem uma estratégia explícita de sincronização.

## 14. Rotina mínima de backup recomendada

- backup diário automático do banco;
- retenção curta diária e retenção mais longa semanal/mensal;
- cópia separada dos arquivos de Storage;
- alerta de falha de backup;
- teste periódico de restauração em ambiente isolado;
- documento com RPO/RTO aceitos pela empresa;
- acesso ao backup limitado e auditado;
- criptografia em trânsito e em repouso.

Backup só é confiável depois que uma restauração foi testada.

## 15. Checklist antes de considerar o projeto portável

- [ ] `main` do GitHub contém o código mais recente.
- [ ] Não existem alterações locais importantes sem commit.
- [ ] Todas as mudanças do banco possuem migração SQL.
- [ ] `bun.lock` corresponde ao `package.json`.
- [ ] `.env.example` lista todas as variáveis sem valores secretos.
- [ ] `bun run verify:portability` passa.
- [ ] `bun run build` passa.
- [ ] Backup do banco foi criado e testado.
- [ ] Auth e Storage possuem plano de migração.
- [ ] Domínio e URLs de redirecionamento estão definidos.
- [ ] E-mail foi testado com destinatário controlado.
- [ ] Critérios de aceite do prompt mestre foram executados.
- [ ] Publicação foi autorizada pelo responsável.
