-- Executar na origem e no destino para comparar uma restauração.
-- Somente leitura: não retorna senhas, tokens, e-mails nem registros pessoais.
-- Contagens equivalentes são uma etapa da validação; testar também o aplicativo.
WITH contagens AS (
  SELECT 'apontamento_auditoria' AS tabela, count(*) AS registros FROM public.apontamento_auditoria
  UNION ALL SELECT 'apontamentos', count(*) FROM public.apontamentos
  UNION ALL SELECT 'auth_tentativas', count(*) FROM public.auth_tentativas
  UNION ALL SELECT 'fechamentos_turno', count(*) FROM public.fechamentos_turno
  UNION ALL SELECT 'grupos_email_relatorio', count(*) FROM public.grupos_email_relatorio
  UNION ALL SELECT 'marcas_produto', count(*) FROM public.marcas_produto
  UNION ALL SELECT 'meta_auditoria', count(*) FROM public.meta_auditoria
  UNION ALL SELECT 'metas_op', count(*) FROM public.metas_op
  UNION ALL SELECT 'metas_turno', count(*) FROM public.metas_turno
  UNION ALL SELECT 'ocorrencia_transferencias', count(*) FROM public.ocorrencia_transferencias
  UNION ALL SELECT 'ocorrencias_turno', count(*) FROM public.ocorrencias_turno
  UNION ALL SELECT 'problemas', count(*) FROM public.problemas
  UNION ALL SELECT 'produtos', count(*) FROM public.produtos
  UNION ALL SELECT 'profiles', count(*) FROM public.profiles
  UNION ALL SELECT 'programacao_hora', count(*) FROM public.programacao_hora
  UNION ALL SELECT 'programacao_producao', count(*) FROM public.programacao_producao
  UNION ALL SELECT 'relatorios', count(*) FROM public.relatorios
  UNION ALL SELECT 'setores', count(*) FROM public.setores
  UNION ALL SELECT 'turnos', count(*) FROM public.turnos
  UNION ALL SELECT 'user_roles', count(*) FROM public.user_roles
  UNION ALL SELECT 'webauthn_challenges', count(*) FROM public.webauthn_challenges
  UNION ALL SELECT 'webauthn_credenciais', count(*) FROM public.webauthn_credenciais
), arquivos AS (
  SELECT b.id AS bucket, b.public AS publico, count(o.id) AS arquivos,
         COALESCE(sum((o.metadata ->> 'size')::bigint), 0) AS bytes
    FROM storage.buckets b
    LEFT JOIN storage.objects o ON o.bucket_id = b.id
   WHERE b.id IN ('avatars', 'problemas')
   GROUP BY b.id, b.public
), politicas AS (
  SELECT schemaname AS schema, tablename AS tabela, policyname AS politica,
         permissive, roles, cmd, qual, with_check
    FROM pg_policies
   WHERE schemaname IN ('public', 'storage')
), funcoes AS (
  SELECT p.proname AS nome, pg_get_function_identity_arguments(p.oid) AS argumentos,
         p.prosecdef AS security_definer,
         md5(pg_get_functiondef(p.oid)) AS definicao_md5
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.prokind IN ('f', 'p')
), rls AS (
  SELECT tablename AS tabela, rowsecurity AS habilitada
    FROM pg_tables WHERE schemaname = 'public'
), permissoes AS (
  SELECT 'tabela' AS tipo, c.relname AS objeto, NULL::text AS coluna,
         NULL::text AS argumentos, COALESCE(r.rolname, 'PUBLIC') AS papel,
         a.privilege_type AS privilegio, a.is_grantable AS delegavel
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a
    LEFT JOIN pg_roles r ON r.oid = a.grantee
   WHERE n.nspname = 'public' AND c.relkind = 'r'
     AND (a.grantee = 0 OR r.rolname IN ('anon', 'authenticated', 'service_role'))
  UNION ALL
  SELECT 'coluna', c.relname, at.attname, NULL::text, COALESCE(r.rolname, 'PUBLIC'),
         a.privilege_type, a.is_grantable
    FROM pg_attribute at JOIN pg_class c ON c.oid = at.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(at.attacl) a
    LEFT JOIN pg_roles r ON r.oid = a.grantee
   WHERE n.nspname = 'public' AND at.attnum > 0 AND NOT at.attisdropped
     AND (a.grantee = 0 OR r.rolname IN ('anon', 'authenticated', 'service_role'))
  UNION ALL
  SELECT 'funcao', p.proname, NULL::text, pg_get_function_identity_arguments(p.oid),
         COALESCE(r.rolname, 'PUBLIC'), a.privilege_type, a.is_grantable
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
    LEFT JOIN pg_roles r ON r.oid = a.grantee
   WHERE n.nspname = 'public' AND p.prokind IN ('f', 'p')
     AND (a.grantee = 0 OR r.rolname IN ('anon', 'authenticated', 'service_role'))
)
SELECT jsonb_build_object(
  'tabelas', (SELECT jsonb_agg(to_jsonb(c) ORDER BY c.tabela) FROM contagens c),
  'usuarios_auth', (SELECT count(*) FROM auth.users),
  'identidades_auth', (SELECT count(*) FROM auth.identities),
  'usuarios_com_senha', (SELECT count(*) FROM auth.users WHERE encrypted_password IS NOT NULL AND encrypted_password <> ''),
  'contas_md5', (SELECT md5(COALESCE(string_agg(id::text || ':' || COALESCE(encrypted_password, '') || ':' || COALESCE(email, ''), E'\n' ORDER BY id), '')) FROM auth.users),
  'perfis_sem_usuario', (SELECT count(*) FROM public.profiles p LEFT JOIN auth.users u ON u.id = p.id WHERE u.id IS NULL),
  'arquivos', (SELECT jsonb_agg(to_jsonb(a) ORDER BY a.bucket) FROM arquivos a),
  'politicas', (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.schema, p.tabela, p.politica) FROM politicas p),
  'funcoes', (SELECT jsonb_agg(to_jsonb(f) ORDER BY f.nome, f.argumentos) FROM funcoes f),
  'permissoes', (SELECT jsonb_build_object('entradas', count(*), 'md5', md5(COALESCE(string_agg(to_jsonb(p)::text, E'\n' ORDER BY to_jsonb(p)::text), ''))) FROM permissoes p),
  'rls', (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.tabela) FROM rls r)
) AS verificacao_migracao;
