-- Limite persistente de tentativas de autenticacao.
-- As chaves sao hashes de IP + identificador; nenhum login ou IP puro e armazenado.

CREATE TABLE IF NOT EXISTS public.auth_rate_limits (
  chave TEXT NOT NULL,
  acao TEXT NOT NULL,
  tentativas INTEGER NOT NULL DEFAULT 0 CHECK (tentativas >= 0),
  janela_inicio TIMESTAMPTZ NOT NULL DEFAULT now(),
  bloqueado_ate TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (chave, acao)
);

CREATE INDEX IF NOT EXISTS auth_rate_limits_updated_at_idx
  ON public.auth_rate_limits (updated_at);

ALTER TABLE public.auth_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.auth_rate_limits FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.auth_rate_limits TO service_role;

CREATE OR REPLACE FUNCTION public.registrar_tentativa_auth(
  p_chave TEXT,
  p_acao TEXT,
  p_max_tentativas INTEGER,
  p_janela_segundos INTEGER,
  p_bloqueio_segundos INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agora TIMESTAMPTZ := clock_timestamp();
  v_bloqueado_ate TIMESTAMPTZ;
BEGIN
  IF length(p_chave) < 32 OR length(p_acao) NOT BETWEEN 2 AND 50
     OR p_max_tentativas NOT BETWEEN 2 AND 100
     OR p_janela_segundos NOT BETWEEN 60 AND 86400
     OR p_bloqueio_segundos NOT BETWEEN 60 AND 86400 THEN
    RAISE EXCEPTION 'Parametros invalidos para limite de autenticacao';
  END IF;

  INSERT INTO public.auth_rate_limits (
    chave, acao, tentativas, janela_inicio, bloqueado_ate, updated_at
  ) VALUES (
    p_chave, p_acao, 1, v_agora, NULL, v_agora
  )
  ON CONFLICT (chave, acao) DO UPDATE SET
    tentativas = CASE
      WHEN auth_rate_limits.bloqueado_ate > v_agora THEN auth_rate_limits.tentativas
      WHEN auth_rate_limits.janela_inicio <= v_agora - make_interval(secs => p_janela_segundos) THEN 1
      ELSE auth_rate_limits.tentativas + 1
    END,
    janela_inicio = CASE
      WHEN auth_rate_limits.janela_inicio <= v_agora - make_interval(secs => p_janela_segundos) THEN v_agora
      ELSE auth_rate_limits.janela_inicio
    END,
    bloqueado_ate = CASE
      WHEN auth_rate_limits.bloqueado_ate > v_agora THEN auth_rate_limits.bloqueado_ate
      WHEN auth_rate_limits.janela_inicio <= v_agora - make_interval(secs => p_janela_segundos) THEN NULL
      WHEN auth_rate_limits.tentativas + 1 >= p_max_tentativas
        THEN v_agora + make_interval(secs => p_bloqueio_segundos)
      ELSE NULL
    END,
    updated_at = v_agora
  RETURNING bloqueado_ate INTO v_bloqueado_ate;

  RETURN v_bloqueado_ate IS NOT NULL AND v_bloqueado_ate > v_agora;
END;
$$;

CREATE OR REPLACE FUNCTION public.limpar_tentativas_auth(p_chave TEXT, p_acao TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.auth_rate_limits WHERE chave = p_chave AND acao = p_acao;
$$;

REVOKE ALL ON FUNCTION public.registrar_tentativa_auth(TEXT, TEXT, INTEGER, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.limpar_tentativas_auth(TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_tentativa_auth(TEXT, TEXT, INTEGER, INTEGER, INTEGER)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.limpar_tentativas_auth(TEXT, TEXT)
  TO service_role;
