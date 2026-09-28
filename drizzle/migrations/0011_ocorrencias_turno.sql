-- Ocorrencias livres registradas durante o turno.
-- Sao usadas para compor o resumo final de ocorrencias sem alterar os apontamentos.

CREATE TABLE IF NOT EXISTS public.ocorrencias_turno (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setor public.setor_codigo NOT NULL,
  turno public.turno_codigo NOT NULL,
  data_local DATE NOT NULL,
  mensagem TEXT NOT NULL CHECK (char_length(trim(mensagem)) BETWEEN 1 AND 1500),
  criado_por UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ocorrencias_turno_contexto_idx
  ON public.ocorrencias_turno (setor, turno, data_local, created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ocorrencias_turno TO authenticated;
GRANT ALL ON public.ocorrencias_turno TO service_role;
ALTER TABLE public.ocorrencias_turno ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Ocorrencias visiveis no setor" ON public.ocorrencias_turno;
CREATE POLICY "Ocorrencias visiveis no setor" ON public.ocorrencias_turno
  FOR SELECT TO authenticated
  USING (
    public.eh_admin_ativo(auth.uid()) OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.ativo = true
        AND p.setor_atual = ocorrencias_turno.setor
    )
  );

DROP POLICY IF EXISTS "Equipe insere ocorrencias do setor" ON public.ocorrencias_turno;
CREATE POLICY "Equipe insere ocorrencias do setor" ON public.ocorrencias_turno
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = criado_por
    AND (
      public.eh_admin_ativo(auth.uid()) OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.ativo = true
          AND p.setor_atual = ocorrencias_turno.setor
      )
    )
  );

DROP POLICY IF EXISTS "Equipe atualiza ocorrencias do setor" ON public.ocorrencias_turno;
CREATE POLICY "Equipe atualiza ocorrencias do setor" ON public.ocorrencias_turno
  FOR UPDATE TO authenticated
  USING (
    public.eh_admin_ativo(auth.uid()) OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.ativo = true
        AND p.setor_atual = ocorrencias_turno.setor
    )
  )
  WITH CHECK (
    public.eh_admin_ativo(auth.uid()) OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.ativo = true
        AND p.setor_atual = ocorrencias_turno.setor
    )
  );

DROP POLICY IF EXISTS "Equipe exclui ocorrencias do setor" ON public.ocorrencias_turno;
CREATE POLICY "Equipe exclui ocorrencias do setor" ON public.ocorrencias_turno
  FOR DELETE TO authenticated
  USING (
    public.eh_admin_ativo(auth.uid()) OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.ativo = true
        AND p.setor_atual = ocorrencias_turno.setor
    )
  );
