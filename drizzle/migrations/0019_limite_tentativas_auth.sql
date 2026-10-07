CREATE TABLE IF NOT EXISTS public.auth_tentativas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave text NOT NULL,
  tipo text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.auth_tentativas TO service_role;
ALTER TABLE public.auth_tentativas ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS auth_tentativas_chave_idx ON public.auth_tentativas (tipo, chave, created_at DESC);
COMMENT ON TABLE public.auth_tentativas IS 'Falhas de autenticacao (login, recuperacao, biometria) por usuario/IP com hash. Acesso somente service_role.';

CREATE OR REPLACE FUNCTION public.limpar_seguranca_expirada()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.webauthn_challenges WHERE expires_at < now();
  DELETE FROM public.auth_tentativas WHERE created_at < now() - interval '1 day';
$$;
REVOKE ALL ON FUNCTION public.limpar_seguranca_expirada() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.limpar_seguranca_expirada() TO service_role;