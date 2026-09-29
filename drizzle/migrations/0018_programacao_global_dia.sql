-- Programacao definida uma vez por dia e compartilhada entre os turnos.
ALTER TABLE public.programacao_producao
  ADD COLUMN IF NOT EXISTS global_dia boolean NOT NULL DEFAULT true;

DROP INDEX IF EXISTS public.programacao_producao_global_unico_idx;
CREATE UNIQUE INDEX programacao_producao_global_unico_idx
  ON public.programacao_producao (
    setor,
    data_local,
    produto_id,
    COALESCE(op, ''),
    COALESCE(lote, '')
  )
  WHERE global_dia = true;

CREATE INDEX IF NOT EXISTS programacao_producao_global_contexto_idx
  ON public.programacao_producao (setor, data_local, global_dia, created_at);

DROP POLICY IF EXISTS "Equipe insere programacao do setor" ON public.programacao_producao;
DROP POLICY IF EXISTS "Equipe atualiza programacao do setor" ON public.programacao_producao;
DROP POLICY IF EXISTS "Equipe exclui programacao do setor" ON public.programacao_producao;
DROP POLICY IF EXISTS "Programacao visivel no setor" ON public.programacao_producao;

CREATE POLICY "Programacao visivel no setor" ON public.programacao_producao
  FOR SELECT TO authenticated
  USING (
    public.eh_admin_ativo(auth.uid())
    OR public.has_role(auth.uid(), 'programador_producao'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.ativo = true
        AND p.setor_atual = programacao_producao.setor
    )
  );

CREATE POLICY "Programador insere programacao" ON public.programacao_producao
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = criado_por
    AND (
      public.eh_admin_ativo(auth.uid())
      OR public.has_role(auth.uid(), 'programador_producao'::public.app_role)
    )
  );

CREATE POLICY "Programador atualiza programacao" ON public.programacao_producao
  FOR UPDATE TO authenticated
  USING (
    public.eh_admin_ativo(auth.uid())
    OR public.has_role(auth.uid(), 'programador_producao'::public.app_role)
  )
  WITH CHECK (
    public.eh_admin_ativo(auth.uid())
    OR public.has_role(auth.uid(), 'programador_producao'::public.app_role)
  );

CREATE POLICY "Programador exclui programacao" ON public.programacao_producao
  FOR DELETE TO authenticated
  USING (
    public.eh_admin_ativo(auth.uid())
    OR public.has_role(auth.uid(), 'programador_producao'::public.app_role)
  );
