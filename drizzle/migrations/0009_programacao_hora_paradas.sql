-- Programacao da producao e ajustes hora a hora.
-- Complementa a meta do turno sem alterar os apontamentos existentes.

CREATE TABLE IF NOT EXISTS public.programacao_producao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setor public.setor_codigo NOT NULL,
  turno public.turno_codigo NOT NULL,
  data_local DATE NOT NULL,
  produto_id UUID NOT NULL REFERENCES public.produtos(id),
  produto_nome TEXT NOT NULL,
  op TEXT,
  lote TEXT,
  quantidade_prevista NUMERIC NOT NULL CHECK (quantidade_prevista > 0),
  unidade TEXT NOT NULL CHECK (unidade IN ('PLTs', 'm', 'm²')),
  criado_por UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (op IS NOT NULL OR lote IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS programacao_producao_contexto_unico_idx
  ON public.programacao_producao (
    setor,
    turno,
    data_local,
    produto_id,
    COALESCE(op, ''),
    COALESCE(lote, '')
  );

CREATE INDEX IF NOT EXISTS programacao_producao_contexto_idx
  ON public.programacao_producao (setor, turno, data_local, created_at);

CREATE TABLE IF NOT EXISTS public.programacao_hora (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setor public.setor_codigo NOT NULL,
  turno public.turno_codigo NOT NULL,
  data_local DATE NOT NULL,
  hora SMALLINT NOT NULL CHECK (hora BETWEEN 0 AND 23),
  meta_hora NUMERIC CHECK (meta_hora IS NULL OR meta_hora >= 0),
  parada_minutos INTEGER NOT NULL DEFAULT 0 CHECK (parada_minutos BETWEEN 0 AND 60),
  motivo_parada TEXT,
  criado_por UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (setor, turno, data_local, hora)
);

CREATE INDEX IF NOT EXISTS programacao_hora_contexto_idx
  ON public.programacao_hora (setor, turno, data_local, hora);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.programacao_producao TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.programacao_hora TO authenticated;
GRANT ALL ON public.programacao_producao TO service_role;
GRANT ALL ON public.programacao_hora TO service_role;

ALTER TABLE public.programacao_producao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.programacao_hora ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Programacao visivel no setor" ON public.programacao_producao;
CREATE POLICY "Programacao visivel no setor" ON public.programacao_producao
  FOR SELECT TO authenticated
  USING (
    public.eh_admin_ativo(auth.uid()) OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.ativo = true
        AND p.setor_atual = programacao_producao.setor
    )
  );

DROP POLICY IF EXISTS "Equipe gerencia programacao do setor" ON public.programacao_producao;
CREATE POLICY "Equipe gerencia programacao do setor" ON public.programacao_producao
  FOR ALL TO authenticated
  USING (
    public.eh_admin_ativo(auth.uid()) OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.ativo = true
        AND p.setor_atual = programacao_producao.setor
    )
  )
  WITH CHECK (
    (public.eh_admin_ativo(auth.uid()) OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.ativo = true
        AND p.setor_atual = programacao_producao.setor
    ))
    AND auth.uid() = criado_por
  );

DROP POLICY IF EXISTS "Hora a hora visivel no setor" ON public.programacao_hora;
CREATE POLICY "Hora a hora visivel no setor" ON public.programacao_hora
  FOR SELECT TO authenticated
  USING (
    public.eh_admin_ativo(auth.uid()) OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.ativo = true
        AND p.setor_atual = programacao_hora.setor
    )
  );

DROP POLICY IF EXISTS "Equipe gerencia hora a hora do setor" ON public.programacao_hora;
CREATE POLICY "Equipe gerencia hora a hora do setor" ON public.programacao_hora
  FOR ALL TO authenticated
  USING (
    public.eh_admin_ativo(auth.uid()) OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.ativo = true
        AND p.setor_atual = programacao_hora.setor
    )
  )
  WITH CHECK (
    (public.eh_admin_ativo(auth.uid()) OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.ativo = true
        AND p.setor_atual = programacao_hora.setor
    ))
    AND auth.uid() = criado_por
  );
