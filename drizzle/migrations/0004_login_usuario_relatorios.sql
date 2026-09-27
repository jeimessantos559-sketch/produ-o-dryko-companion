-- Login operacional sem e-mail na interface e recuperação de relatórios de turno.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS login TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS login_key TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS deve_alterar_senha BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_login_key_unique_idx
  ON public.profiles (login_key)
  WHERE login_key IS NOT NULL;

UPDATE public.profiles
SET login = 'Jeimes.Santos', login_key = 'jeimes.santos', deve_alterar_senha = false
WHERE lower(btrim(nome)) = 'jeimes andrei barbosa dos santos';

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, nome, login, login_key, deve_alterar_senha)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'nome', ''),
    NULLIF(NEW.raw_user_meta_data ->> 'login', ''),
    NULLIF(NEW.raw_user_meta_data ->> 'login_key', ''),
    COALESCE((NEW.raw_user_meta_data ->> 'deve_alterar_senha')::boolean, false)
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'facilitador')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.concluir_troca_senha()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessao invalida';
  END IF;

  UPDATE public.profiles
  SET deve_alterar_senha = false, updated_at = now()
  WHERE id = auth.uid() AND ativo = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuario ativo nao encontrado';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.concluir_troca_senha() TO authenticated;

CREATE OR REPLACE FUNCTION public.gerar_relatorio_turno(
  p_setor public.setor_codigo,
  p_turno public.turno_codigo,
  p_data DATE,
  p_resumo JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fechamento_id UUID;
  relatorio_id UUID;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.ativo = true
      AND (
        public.has_role(auth.uid(), 'administrador')
        OR (p.setor_atual = p_setor AND p.turno_atual = p_turno)
      )
  ) THEN
    RAISE EXCEPTION 'Setor ou turno diferente do perfil atual';
  END IF;

  SELECT id INTO fechamento_id
  FROM public.fechamentos_turno
  WHERE setor = p_setor
    AND turno = p_turno
    AND data_local = p_data
    AND status = 'fechado'
  LIMIT 1;

  IF fechamento_id IS NULL THEN
    RAISE EXCEPTION 'Encerre o turno antes de gerar o relatorio';
  END IF;

  INSERT INTO public.relatorios (
    fechamento_id, setor, turno, data_local, resumo, criado_por
  )
  VALUES (
    fechamento_id, p_setor, p_turno, p_data, p_resumo, auth.uid()
  )
  ON CONFLICT (fechamento_id) DO UPDATE SET
    resumo = EXCLUDED.resumo,
    criado_por = auth.uid(),
    status_envio = CASE
      WHEN public.relatorios.status_envio = 'enviado' THEN public.relatorios.status_envio
      ELSE 'aguardando'::public.envio_status
    END,
    erro_envio = CASE
      WHEN public.relatorios.status_envio = 'enviado' THEN public.relatorios.erro_envio
      ELSE NULL
    END,
    updated_at = now()
  RETURNING id INTO relatorio_id;

  RETURN relatorio_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.gerar_relatorio_turno(
  public.setor_codigo,
  public.turno_codigo,
  DATE,
  JSONB
) TO authenticated;
