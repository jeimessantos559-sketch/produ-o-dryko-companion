-- Configuracoes de perfil: avatar privado e credenciais WebAuthn.
-- Esta migracao registra no Git a estrutura que ja e utilizada pelo aplicativo.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Bucket privado: cada usuario enxerga e gerencia apenas sua propria pasta.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Usuario le proprio avatar" ON storage.objects;
CREATE POLICY "Usuario le proprio avatar" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

DROP POLICY IF EXISTS "Usuario envia proprio avatar" ON storage.objects;
CREATE POLICY "Usuario envia proprio avatar" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

DROP POLICY IF EXISTS "Usuario atualiza proprio avatar" ON storage.objects;
CREATE POLICY "Usuario atualiza proprio avatar" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

DROP POLICY IF EXISTS "Usuario remove proprio avatar" ON storage.objects;
CREATE POLICY "Usuario remove proprio avatar" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

-- Desafios temporarios e credenciais ficam acessiveis somente ao backend.
CREATE TABLE IF NOT EXISTS public.webauthn_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  challenge TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('login', 'registro')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '5 minutes'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS webauthn_challenges_expires_at_idx
  ON public.webauthn_challenges (expires_at);
CREATE INDEX IF NOT EXISTS webauthn_challenges_user_tipo_idx
  ON public.webauthn_challenges (user_id, tipo, created_at DESC);

CREATE TABLE IF NOT EXISTS public.webauthn_credenciais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL,
  counter BIGINT NOT NULL DEFAULT 0 CHECK (counter >= 0),
  transports TEXT[],
  aparelho TEXT,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS webauthn_credenciais_user_id_idx
  ON public.webauthn_credenciais (user_id, created_at DESC);

ALTER TABLE public.webauthn_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webauthn_credenciais ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.webauthn_challenges FROM anon, authenticated;
REVOKE ALL ON public.webauthn_credenciais FROM anon, authenticated;
GRANT ALL ON public.webauthn_challenges TO service_role;
GRANT ALL ON public.webauthn_credenciais TO service_role;
