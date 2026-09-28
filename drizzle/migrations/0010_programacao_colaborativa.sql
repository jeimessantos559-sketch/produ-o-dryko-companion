-- Permite que a equipe ativa do mesmo setor mantenha a programacao do turno.
-- A criacao continua registrando obrigatoriamente o usuario autenticado.

DROP POLICY IF EXISTS "Equipe gerencia programacao do setor" ON public.programacao_producao;
DROP POLICY IF EXISTS "Equipe insere programacao do setor" ON public.programacao_producao;
DROP POLICY IF EXISTS "Equipe atualiza programacao do setor" ON public.programacao_producao;
DROP POLICY IF EXISTS "Equipe exclui programacao do setor" ON public.programacao_producao;

CREATE POLICY "Equipe insere programacao do setor" ON public.programacao_producao
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = criado_por
    AND (
      public.eh_admin_ativo(auth.uid()) OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.ativo = true AND p.setor_atual = programacao_producao.setor
      )
    )
  );

CREATE POLICY "Equipe atualiza programacao do setor" ON public.programacao_producao
  FOR UPDATE TO authenticated
  USING (
    public.eh_admin_ativo(auth.uid()) OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.ativo = true AND p.setor_atual = programacao_producao.setor
    )
  )
  WITH CHECK (
    public.eh_admin_ativo(auth.uid()) OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.ativo = true AND p.setor_atual = programacao_producao.setor
    )
  );

CREATE POLICY "Equipe exclui programacao do setor" ON public.programacao_producao
  FOR DELETE TO authenticated
  USING (
    public.eh_admin_ativo(auth.uid()) OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.ativo = true AND p.setor_atual = programacao_producao.setor
    )
  );

DROP POLICY IF EXISTS "Equipe gerencia hora a hora do setor" ON public.programacao_hora;
DROP POLICY IF EXISTS "Equipe insere hora a hora do setor" ON public.programacao_hora;
DROP POLICY IF EXISTS "Equipe atualiza hora a hora do setor" ON public.programacao_hora;
DROP POLICY IF EXISTS "Equipe exclui hora a hora do setor" ON public.programacao_hora;

CREATE POLICY "Equipe insere hora a hora do setor" ON public.programacao_hora
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = criado_por
    AND (
      public.eh_admin_ativo(auth.uid()) OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.ativo = true AND p.setor_atual = programacao_hora.setor
      )
    )
  );

CREATE POLICY "Equipe atualiza hora a hora do setor" ON public.programacao_hora
  FOR UPDATE TO authenticated
  USING (
    public.eh_admin_ativo(auth.uid()) OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.ativo = true AND p.setor_atual = programacao_hora.setor
    )
  )
  WITH CHECK (
    public.eh_admin_ativo(auth.uid()) OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.ativo = true AND p.setor_atual = programacao_hora.setor
    )
  );

CREATE POLICY "Equipe exclui hora a hora do setor" ON public.programacao_hora
  FOR DELETE TO authenticated
  USING (
    public.eh_admin_ativo(auth.uid()) OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.ativo = true AND p.setor_atual = programacao_hora.setor
    )
  );
