-- Meta diaria do turno e distribuicao automatica por hora.
-- Mantem as metas de OP existentes separadas da meta operacional do turno.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pode_finalizar_metas BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.pode_definir_meta_turno(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.eh_admin_ativo(_user_id) OR COALESCE((
    SELECT p.pode_finalizar_metas
    FROM public.profiles p
    WHERE p.id = _user_id AND p.ativo = true
  ), false)
$$;

GRANT EXECUTE ON FUNCTION public.pode_definir_meta_turno(UUID) TO authenticated;

CREATE TABLE IF NOT EXISTS public.metas_turno (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setor public.setor_codigo NOT NULL,
  turno public.turno_codigo NOT NULL,
  data_local DATE NOT NULL,
  quantidade_meta NUMERIC NOT NULL CHECK (quantidade_meta > 0),
  unidade TEXT NOT NULL CHECK (unidade IN ('PLTs', 'm', 'm²')),
  horas_produtivas INTEGER NOT NULL CHECK (horas_produtivas BETWEEN 1 AND 16),
  criado_por UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (setor, turno, data_local)
);

CREATE INDEX IF NOT EXISTS metas_turno_contexto_idx
  ON public.metas_turno (setor, turno, data_local DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.metas_turno TO authenticated;
GRANT ALL ON public.metas_turno TO service_role;
ALTER TABLE public.metas_turno ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Metas do turno visiveis no setor" ON public.metas_turno;
CREATE POLICY "Metas do turno visiveis no setor" ON public.metas_turno
  FOR SELECT TO authenticated USING (
    public.eh_admin_ativo(auth.uid()) OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.ativo = true
        AND p.setor_atual = metas_turno.setor
    )
  );

DROP POLICY IF EXISTS "Autorizados definem metas do turno" ON public.metas_turno;
CREATE POLICY "Autorizados definem metas do turno" ON public.metas_turno
  FOR ALL TO authenticated
  USING (public.pode_definir_meta_turno(auth.uid()))
  WITH CHECK (
    public.pode_definir_meta_turno(auth.uid())
    AND auth.uid() = criado_por
  );

-- Meta informada para o 1º turno de Fitas em 28/09/2026.
-- O registro so e criado quando ja existe um administrador ativo.
INSERT INTO public.metas_turno (
  setor,
  turno,
  data_local,
  quantidade_meta,
  unidade,
  horas_produtivas,
  criado_por
)
SELECT
  'fitas'::public.setor_codigo,
  'T1'::public.turno_codigo,
  DATE '2026-09-28',
  27391,
  'm²',
  9,
  p.id
FROM public.profiles p
WHERE p.ativo = true
  AND public.has_role(p.id, 'administrador')
ORDER BY p.created_at
LIMIT 1
ON CONFLICT (setor, turno, data_local) DO NOTHING;
