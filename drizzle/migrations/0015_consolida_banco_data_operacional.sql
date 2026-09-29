-- Consolida no GitHub regras que ja estavam ativas no banco cloud.
-- A data operacional e unica para apontamentos, painel, fechamento e relatorios:
-- T2 e T3 entre 00:00 e 05:59 pertencem ao dia de producao anterior.

CREATE OR REPLACE FUNCTION public.data_producao_turno(
  p_turno public.turno_codigo,
  p_momento TIMESTAMPTZ DEFAULT now()
)
RETURNS DATE
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  momento_local TIMESTAMP := p_momento AT TIME ZONE 'America/Sao_Paulo';
BEGIN
  IF p_turno IN ('T2'::public.turno_codigo, 'T3'::public.turno_codigo)
     AND momento_local::TIME < TIME '06:00' THEN
    RETURN momento_local::DATE - 1;
  END IF;

  RETURN momento_local::DATE;
END;
$$;

COMMENT ON FUNCTION public.data_producao_turno(public.turno_codigo, TIMESTAMPTZ)
  IS 'Calcula a data operacional em America/Sao_Paulo; T2 e T3 antes das 06:00 pertencem ao dia anterior.';

REVOKE ALL ON FUNCTION public.data_producao_turno(public.turno_codigo, TIMESTAMPTZ)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.data_producao_turno(public.turno_codigo, TIMESTAMPTZ)
  TO authenticated, service_role;

-- Cadastro usado no envio automatico dos relatorios de fechamento.
CREATE TABLE IF NOT EXISTS public.grupos_email_relatorio (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  emails TEXT[] NOT NULL DEFAULT '{}',
  automatico BOOLEAN NOT NULL DEFAULT false,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_por UUID NOT NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT grupos_email_relatorio_emails_check
    CHECK (cardinality(emails) BETWEEN 1 AND 10)
);

CREATE UNIQUE INDEX IF NOT EXISTS grupos_email_relatorio_unico_automatico
  ON public.grupos_email_relatorio (automatico)
  WHERE automatico = true AND ativo = true;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.grupos_email_relatorio TO authenticated;
GRANT ALL ON public.grupos_email_relatorio TO service_role;
ALTER TABLE public.grupos_email_relatorio ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS grupos_email_select_auth ON public.grupos_email_relatorio;
CREATE POLICY grupos_email_select_auth ON public.grupos_email_relatorio
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS grupos_email_admin_insert ON public.grupos_email_relatorio;
CREATE POLICY grupos_email_admin_insert ON public.grupos_email_relatorio
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'administrador'));

DROP POLICY IF EXISTS grupos_email_admin_update ON public.grupos_email_relatorio;
CREATE POLICY grupos_email_admin_update ON public.grupos_email_relatorio
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'administrador'))
  WITH CHECK (public.has_role(auth.uid(), 'administrador'));

DROP POLICY IF EXISTS grupos_email_admin_delete ON public.grupos_email_relatorio;
CREATE POLICY grupos_email_admin_delete ON public.grupos_email_relatorio
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'administrador'));

-- Permissao administrativa para finalizar metas.
CREATE OR REPLACE FUNCTION public.gerenciar_permissao_meta(
  p_usuario_id UUID,
  p_pode_finalizar_metas BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.eh_admin_ativo(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas administradores podem definir quem finaliza metas';
  END IF;

  UPDATE public.profiles
  SET
    pode_finalizar_metas = COALESCE(p_pode_finalizar_metas, false),
    updated_at = now()
  WHERE id = p_usuario_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.pode_finalizar_meta(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = p_user_id
      AND p.ativo = true
      AND (
        p.pode_finalizar_metas = true
        OR public.has_role(p_user_id, 'administrador')
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.metas_painel(p_setor public.setor_codigo)
RETURNS TABLE (
  id UUID,
  setor public.setor_codigo,
  op TEXT,
  produto_id UUID,
  produto_nome TEXT,
  unidade TEXT,
  quantidade_meta NUMERIC,
  status public.meta_status,
  criado_por UUID,
  finalizado_por UUID,
  finalizado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  apontado NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.ativo = true
      AND (
        p.setor_atual = p_setor
        OR public.has_role(auth.uid(), 'administrador')
      )
  ) THEN
    RAISE EXCEPTION 'Acesso nao autorizado ao setor';
  END IF;

  RETURN QUERY
  SELECT
    m.id,
    m.setor,
    m.op,
    m.produto_id,
    m.produto_nome,
    m.unidade,
    m.quantidade_meta,
    m.status,
    m.criado_por,
    m.finalizado_por,
    m.finalizado_em,
    m.created_at,
    m.updated_at,
    COALESCE((
      SELECT SUM(
        CASE
          WHEN m.unidade = 'm²' THEN COALESCE(a.area_m2, 0)
          WHEN m.unidade = 'm' THEN COALESCE(a.metragem, 0)
          ELSE COALESCE(a.quantidade_plts, 0)::NUMERIC
        END
      )
      FROM public.apontamentos a
      WHERE a.setor = m.setor
        AND a.op = m.op
        AND a.produto_id = m.produto_id
    ), 0)::NUMERIC AS apontado
  FROM public.metas_op m
  WHERE m.setor = p_setor
  ORDER BY m.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.gerenciar_permissao_meta(UUID, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pode_finalizar_meta(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.metas_painel(public.setor_codigo) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gerenciar_permissao_meta(UUID, BOOLEAN)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pode_finalizar_meta(UUID)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.metas_painel(public.setor_codigo)
  TO authenticated, service_role;

-- Regra de insercao consolidada: data operacional, PLT picado e Mantas sem OP.
CREATE OR REPLACE FUNCTION public.preparar_apontamento()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  produto public.produtos%ROWTYPE;
  grupo JSONB;
  qtd INTEGER;
  padrao INTEGER;
  picado INTEGER;
  picado_adicional BOOLEAN;
  total_plts_calculado INTEGER := 0;
  total_rolos_calculado INTEGER := 0;
  proxima_sequencia INTEGER;
  metros_por_rolo_calculado NUMERIC;
BEGIN
  IF NEW.usuario_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Usuario invalido para o apontamento';
  END IF;

  NEW.created_at := now();
  NEW.updated_at := now();
  NEW.data_local := public.data_producao_turno(NEW.turno, now());
  NEW.op := NULLIF(btrim(NEW.op), '');
  NEW.lote := NULLIF(btrim(NEW.lote), '');
  NEW.status := 'pendente';
  NEW.lancado_por := NULL;
  NEW.lancado_em := NULL;

  IF EXISTS (
    SELECT 1
    FROM public.fechamentos_turno f
    WHERE f.setor = NEW.setor
      AND f.turno = NEW.turno
      AND f.data_local = NEW.data_local
      AND f.status = 'fechado'
  ) THEN
    RAISE EXCEPTION 'O turno esta fechado. Solicite a reabertura ao administrador';
  END IF;

  SELECT *
  INTO produto
  FROM public.produtos
  WHERE id = NEW.produto_id
    AND ativo = true;

  IF NOT FOUND OR produto.setor <> NEW.setor THEN
    RAISE EXCEPTION 'Produto invalido para o setor';
  END IF;

  NEW.produto_nome := produto.nome;

  IF NEW.setor = 'corte' THEN
    IF NEW.op IS NULL THEN
      RAISE EXCEPTION 'Informe a OP';
    END IF;

    IF jsonb_typeof(NEW.grupos) <> 'array' OR jsonb_array_length(NEW.grupos) = 0 THEN
      RAISE EXCEPTION 'Informe ao menos um grupo de PLTs';
    END IF;

    FOR grupo IN SELECT * FROM jsonb_array_elements(NEW.grupos)
    LOOP
      qtd := COALESCE((grupo->>'quantidadePlts')::INTEGER, 0);
      padrao := (grupo->>'rolosPorPlt')::INTEGER;
      picado := NULLIF(grupo->>'pltPicadoRolos', '')::INTEGER;
      picado_adicional := COALESCE((grupo->>'picadoAdicional')::BOOLEAN, false);

      IF qtd < 0
         OR padrao < 1
         OR (picado IS NOT NULL AND (picado < 1 OR picado >= padrao)) THEN
        RAISE EXCEPTION 'Grupo de PLTs invalido';
      END IF;

      IF qtd = 0 AND picado IS NULL THEN
        RAISE EXCEPTION 'Informe PLT fechado ou PLT picado';
      END IF;

      IF picado_adicional THEN
        total_plts_calculado := total_plts_calculado + qtd;
        total_rolos_calculado := total_rolos_calculado + (qtd * padrao) + COALESCE(picado, 0);
      ELSE
        total_plts_calculado := total_plts_calculado + qtd;
        total_rolos_calculado := total_rolos_calculado
          + ((qtd - CASE WHEN picado IS NULL THEN 0 ELSE 1 END) * padrao)
          + COALESCE(picado, 0);
      END IF;
    END LOOP;

    IF total_plts_calculado NOT BETWEEN 0 AND 20 THEN
      RAISE EXCEPTION 'A quantidade deve ficar entre 0 e 20 PLTs fechados';
    END IF;

    IF total_rolos_calculado <= 0 THEN
      RAISE EXCEPTION 'Informe a quantidade produzida';
    END IF;

    NEW.lote := NULL;
    NEW.quantidade_plts := total_plts_calculado;
    NEW.rolos_por_plt := COALESCE(NEW.rolos_por_plt, produto.rolos_por_plt);
    NEW.total_rolos := total_rolos_calculado;
    NEW.largura := produto.largura;
    NEW.metragem := CASE
      WHEN produto.largura IS NULL THEN NULL
      ELSE produto.largura * total_rolos_calculado / 10
    END;
    NEW.tempo := NULL;
    NEW.velocidade := NULL;
    NEW.area_m2 := NULL;
  ELSIF NEW.setor = 'fitas' THEN
    IF NEW.op IS NULL THEN
      RAISE EXCEPTION 'Informe a OP';
    END IF;

    NEW.lote := NULL;
    NEW.largura := COALESCE(NEW.largura, produto.largura);

    IF COALESCE(NEW.tempo, 0) <= 0
       OR COALESCE(NEW.velocidade, 0) <= 0
       OR COALESCE(NEW.largura, 0) <= 0 THEN
      RAISE EXCEPTION 'Tempo, velocidade e largura devem ser maiores que zero';
    END IF;

    NEW.quantidade_plts := NULL;
    NEW.rolos_por_plt := NULL;
    NEW.total_rolos := NULL;
    NEW.metragem := NULL;
    NEW.grupos := NULL;
    NEW.area_m2 := NEW.tempo * NEW.velocidade * NEW.largura;
    NEW.sequencia_inicio := NULL;
    NEW.sequencia_fim := NULL;
    RETURN NEW;
  ELSIF NEW.setor = 'mantas' THEN
    IF NEW.lote IS NULL THEN
      RAISE EXCEPTION 'Informe o lote';
    END IF;

    IF COALESCE(NEW.quantidade_plts, 0) < 1 THEN
      RAISE EXCEPTION 'A quantidade de PLTs deve ser maior que zero';
    END IF;

    IF COALESCE(NEW.metragem, 0) <= 0 THEN
      RAISE EXCEPTION 'A metragem deve ser maior que zero';
    END IF;

    metros_por_rolo_calculado := COALESCE(produto.metros_por_rolo, 10);

    IF mod(NEW.metragem, metros_por_rolo_calculado) <> 0 THEN
      RAISE EXCEPTION 'A metragem deve formar uma quantidade inteira de rolos';
    END IF;

    NEW.op := NULL;
    NEW.rolos_por_plt := produto.rolos_por_plt;
    NEW.total_rolos := (NEW.metragem / metros_por_rolo_calculado)::INTEGER;
    NEW.largura := NULL;
    NEW.grupos := NULL;
    NEW.tempo := NULL;
    NEW.velocidade := NULL;
    NEW.area_m2 := NULL;
  ELSE
    RAISE EXCEPTION 'Setor ainda sem regra de apontamento';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(NEW.produto_id::TEXT || NEW.turno::TEXT || NEW.data_local::TEXT, 0)
  );

  SELECT COALESCE(MAX(sequencia_fim), 0) + 1
  INTO proxima_sequencia
  FROM public.apontamentos
  WHERE produto_id = NEW.produto_id
    AND turno = NEW.turno
    AND data_local = NEW.data_local;

  NEW.sequencia_inicio := proxima_sequencia;
  NEW.sequencia_fim := proxima_sequencia
    + GREATEST(COALESCE(NEW.quantidade_plts, 1), 1)
    - 1;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.preparar_apontamento() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preparar_apontamento() TO authenticated, service_role;

-- Falha a migration se a fronteira da regra operacional for alterada por engano.
DO $$
BEGIN
  IF public.data_producao_turno(
       'T2'::public.turno_codigo,
       TIMESTAMPTZ '2026-09-29 05:59:00-03'
     ) <> DATE '2026-09-28' THEN
    RAISE EXCEPTION 'Regra invalida para T2 antes das 06:00';
  END IF;

  IF public.data_producao_turno(
       'T3'::public.turno_codigo,
       TIMESTAMPTZ '2026-09-29 05:59:00-03'
     ) <> DATE '2026-09-28' THEN
    RAISE EXCEPTION 'Regra invalida para T3 antes das 06:00';
  END IF;

  IF public.data_producao_turno(
       'T2'::public.turno_codigo,
       TIMESTAMPTZ '2026-09-29 06:00:00-03'
     ) <> DATE '2026-09-29' THEN
    RAISE EXCEPTION 'Regra invalida para T2 a partir das 06:00';
  END IF;

  IF public.data_producao_turno(
       'T1'::public.turno_codigo,
       TIMESTAMPTZ '2026-09-29 03:00:00-03'
     ) <> DATE '2026-09-29' THEN
    RAISE EXCEPTION 'T1 nao deve usar o dia anterior';
  END IF;
END;
$$;
