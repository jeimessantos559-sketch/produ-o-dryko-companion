-- Registro automático de erros do aplicativo (tela, código e rede inesperada).
-- Cada usuário grava apenas os próprios erros; só o administrador consulta.
-- Registros com mais de 30 dias são apagados a cada nova gravação.
-- Idempotente.

CREATE TABLE IF NOT EXISTS public.erros_app (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  usuario_id UUID NOT NULL DEFAULT auth.uid(),
  origem TEXT NOT NULL CHECK (char_length(origem) <= 40),
  mensagem TEXT NOT NULL CHECK (char_length(mensagem) BETWEEN 1 AND 1000),
  pilha TEXT CHECK (pilha IS NULL OR char_length(pilha) <= 6000),
  rota TEXT CHECK (rota IS NULL OR char_length(rota) <= 300),
  versao TEXT CHECK (versao IS NULL OR char_length(versao) <= 80),
  navegador TEXT CHECK (navegador IS NULL OR char_length(navegador) <= 300),
  setor TEXT CHECK (setor IS NULL OR char_length(setor) <= 40),
  turno TEXT CHECK (turno IS NULL OR char_length(turno) <= 10)
);

CREATE INDEX IF NOT EXISTS erros_app_created_at_idx ON public.erros_app (created_at DESC);

ALTER TABLE public.erros_app ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuario registra os proprios erros" ON public.erros_app;
CREATE POLICY "Usuario registra os proprios erros"
ON public.erros_app
FOR INSERT
TO authenticated
WITH CHECK (usuario_id = auth.uid());

DROP POLICY IF EXISTS "Administrador consulta erros" ON public.erros_app;
CREATE POLICY "Administrador consulta erros"
ON public.erros_app
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'administrador'::public.app_role));

REVOKE ALL ON public.erros_app FROM anon;
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.erros_app FROM authenticated;
GRANT INSERT, SELECT ON public.erros_app TO authenticated;

CREATE OR REPLACE FUNCTION public.limpar_erros_app_antigos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.erros_app WHERE created_at < now() - INTERVAL '30 days';
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS limpar_erros_app_antigos ON public.erros_app;
CREATE TRIGGER limpar_erros_app_antigos
AFTER INSERT ON public.erros_app
FOR EACH STATEMENT EXECUTE FUNCTION public.limpar_erros_app_antigos();
