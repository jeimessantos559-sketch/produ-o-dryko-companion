ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url text;

CREATE OR REPLACE FUNCTION public.proteger_colunas_admin_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR public.eh_admin_ativo(auth.uid()) THEN
    RETURN NEW;
  END IF;
  IF NEW.ativo IS DISTINCT FROM OLD.ativo
    OR NEW.pode_gerenciar_produtos IS DISTINCT FROM OLD.pode_gerenciar_produtos
    OR NEW.pode_confirmar_protheus IS DISTINCT FROM OLD.pode_confirmar_protheus
    OR NEW.pode_finalizar_metas IS DISTINCT FROM OLD.pode_finalizar_metas
    OR NEW.login IS DISTINCT FROM OLD.login
    OR NEW.login_key IS DISTINCT FROM OLD.login_key THEN
    RAISE EXCEPTION 'Sem permissão para alterar dados administrativos do perfil';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_proteger_colunas_admin_profile ON public.profiles;
CREATE TRIGGER trg_proteger_colunas_admin_profile
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.proteger_colunas_admin_profile();

CREATE OR REPLACE FUNCTION public.salvar_permissoes_usuario(
  p_usuario_id uuid,
  p_ativo boolean,
  p_papeis public.app_role[],
  p_pode_confirmar_protheus boolean,
  p_pode_finalizar_metas boolean,
  p_pode_gerenciar_produtos boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  papel public.app_role;
BEGIN
  IF NOT public.eh_admin_ativo(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas administradores podem gerenciar permissões';
  END IF;
  IF p_usuario_id = auth.uid() AND (
    NOT COALESCE(p_ativo, false) OR NOT ('administrador'::public.app_role = ANY(COALESCE(p_papeis, ARRAY[]::public.app_role[])))
  ) THEN
    RAISE EXCEPTION 'O administrador não pode remover o próprio acesso';
  END IF;

  UPDATE public.profiles SET
    ativo = COALESCE(p_ativo, false),
    pode_confirmar_protheus = COALESCE(p_pode_confirmar_protheus, false),
    pode_finalizar_metas = COALESCE(p_pode_finalizar_metas, false),
    pode_gerenciar_produtos = COALESCE(p_pode_gerenciar_produtos, false),
    updated_at = now()
  WHERE id = p_usuario_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Usuário não encontrado'; END IF;

  DELETE FROM public.user_roles WHERE user_id = p_usuario_id AND role <> 'autorizado_protheus';
  FOREACH papel IN ARRAY COALESCE(p_papeis, ARRAY[]::public.app_role[]) LOOP
    IF papel <> 'autorizado_protheus' THEN
      INSERT INTO public.user_roles (user_id, role) VALUES (p_usuario_id, papel)
      ON CONFLICT (user_id, role) DO NOTHING;
    END IF;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.salvar_permissoes_usuario(uuid, boolean, public.app_role[], boolean, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.salvar_permissoes_usuario(uuid, boolean, public.app_role[], boolean, boolean, boolean) TO authenticated;

CREATE TABLE public.webauthn_credenciais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  credential_id text NOT NULL UNIQUE,
  public_key text NOT NULL,
  counter bigint NOT NULL DEFAULT 0,
  transports text[],
  aparelho text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);
GRANT ALL ON public.webauthn_credenciais TO service_role;
ALTER TABLE public.webauthn_credenciais ENABLE ROW LEVEL SECURITY;
CREATE INDEX webauthn_credenciais_user_idx ON public.webauthn_credenciais(user_id);

CREATE TABLE public.webauthn_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  challenge text NOT NULL,
  tipo text NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '5 minutes',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.webauthn_challenges TO service_role;
ALTER TABLE public.webauthn_challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Avatares leitura autenticada" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'avatars');
CREATE POLICY "Avatar envio proprio" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Avatar atualiza proprio" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Avatar exclui proprio" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);