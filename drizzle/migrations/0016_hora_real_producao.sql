-- Separa o horario efetivo da producao do horario de envio do apontamento.
-- created_at permanece como trilha de auditoria; data_hora_producao alimenta
-- data operacional, painel, contagem e relatorios.

ALTER TABLE public.apontamentos
  ADD COLUMN IF NOT EXISTS data_hora_producao TIMESTAMP WITHOUT TIME ZONE;

UPDATE public.apontamentos
SET data_hora_producao = date_trunc(
  'minute',
  created_at AT TIME ZONE 'America/Sao_Paulo'
)
WHERE data_hora_producao IS NULL;

ALTER TABLE public.apontamentos
  ALTER COLUMN data_hora_producao SET NOT NULL;

COMMENT ON COLUMN public.apontamentos.data_hora_producao
  IS 'Data e hora local efetiva da producao em America/Sao_Paulo, separada do horario de registro created_at.';

CREATE INDEX IF NOT EXISTS apontamentos_setor_turno_data_hora_producao_idx
  ON public.apontamentos (
    setor,
    turno,
    data_local,
    data_hora_producao DESC
  );

CREATE OR REPLACE FUNCTION public.horario_pertence_turno(
  p_turno public.turno_codigo,
  p_horario TIME WITHOUT TIME ZONE
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_turno
    WHEN 'T1'::public.turno_codigo
      THEN p_horario >= TIME '06:00' AND p_horario < TIME '15:38'
    WHEN 'T2'::public.turno_codigo
      THEN p_horario >= TIME '15:38' OR p_horario < TIME '02:00'
    WHEN 'T3'::public.turno_codigo
      THEN p_horario >= TIME '01:00' AND p_horario < TIME '06:00'
    ELSE false
  END
$$;

COMMENT ON FUNCTION public.horario_pertence_turno(public.turno_codigo, TIME WITHOUT TIME ZONE)
  IS 'Valida o horario local pelos turnos oficiais: T1 06:00-15:38, T2 15:38-02:00 e T3 01:00-06:00.';

REVOKE ALL ON FUNCTION public.horario_pertence_turno(
  public.turno_codigo,
  TIME WITHOUT TIME ZONE
) FROM PUBLIC, anon;

-- Mantem todas as validacoes consolidadas da migration 0015 e passa a derivar
-- data_local da hora real informada. Clientes antigos, que ainda nao enviam o
-- novo campo, continuam usando o instante atual sem interrupcao.
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
  hora_informada BOOLEAN;
BEGIN
  hora_informada := NEW.data_hora_producao IS NOT NULL;

  IF NEW.usuario_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Usuario invalido para o apontamento';
  END IF;

  NEW.created_at := now();
  NEW.updated_at := now();
  NEW.data_hora_producao := date_trunc(
    'minute',
    COALESCE(
      NEW.data_hora_producao,
      now() AT TIME ZONE 'America/Sao_Paulo'
    )
  );

  IF hora_informada
     AND NEW.data_hora_producao > (now() AT TIME ZONE 'America/Sao_Paulo') + INTERVAL '5 minutes' THEN
    RAISE EXCEPTION 'O horario da producao nao pode estar no futuro';
  END IF;

  IF hora_informada
     AND NOT public.horario_pertence_turno(NEW.turno, NEW.data_hora_producao::TIME) THEN
    RAISE EXCEPTION 'O horario informado nao pertence ao turno selecionado';
  END IF;

  NEW.data_local := public.data_producao_turno(
    NEW.turno,
    NEW.data_hora_producao AT TIME ZONE 'America/Sao_Paulo'
  );
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

-- Mantem o carregamento do painel em uma unica chamada, agora com o horario
-- efetivo e o lote de Mantas no payload.
CREATE OR REPLACE FUNCTION public.painel_turno(
  p_setor public.setor_codigo,
  p_turno public.turno_codigo,
  p_data DATE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_resumo JSONB;
  v_recentes JSONB;
  v_pendencias JSONB;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.ativo = true
      AND (p.setor_atual = p_setor OR public.has_role(auth.uid(), 'administrador'))
  ) THEN
    RAISE EXCEPTION 'Acesso nao autorizado ao setor';
  END IF;

  SELECT jsonb_build_object(
    'registros', COUNT(*),
    'pendentes', COUNT(*) FILTER (WHERE a.status = 'pendente'),
    'lancados', COUNT(*) FILTER (WHERE a.status = 'lancado'),
    'plts', COALESCE(SUM(a.quantidade_plts), 0),
    'rolos', COALESCE(SUM(a.total_rolos), 0),
    'metragem', COALESCE(SUM(a.metragem), 0),
    'area', COALESCE(SUM(a.area_m2), 0)
  ) INTO v_resumo
  FROM public.apontamentos a
  WHERE a.setor = p_setor
    AND a.turno = p_turno
    AND a.data_local = p_data;

  SELECT COALESCE(
    jsonb_agg(
      to_jsonb(r)
      ORDER BY r.data_hora_producao DESC, r.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_recentes
  FROM (
    SELECT
      a.id,
      a.op,
      a.lote,
      a.produto_nome,
      a.quantidade_plts,
      a.total_rolos,
      a.metragem,
      a.area_m2,
      a.status,
      a.data_hora_producao,
      a.created_at
    FROM public.apontamentos a
    WHERE a.setor = p_setor
      AND a.turno = p_turno
      AND a.data_local = p_data
    ORDER BY a.data_hora_producao DESC, a.created_at DESC
    LIMIT 40
  ) r;

  SELECT COALESCE(
    jsonb_agg(
      to_jsonb(p)
      ORDER BY p.data_hora_producao DESC, p.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_pendencias
  FROM (
    SELECT
      a.id,
      a.op,
      a.lote,
      a.produto_nome,
      a.quantidade_plts,
      a.total_rolos,
      a.metragem,
      a.area_m2,
      a.status,
      a.data_hora_producao,
      a.created_at,
      a.data_local,
      a.turno
    FROM public.apontamentos a
    WHERE a.setor = p_setor
      AND a.status = 'pendente'
    ORDER BY a.data_hora_producao DESC, a.created_at DESC
    LIMIT 50
  ) p;

  RETURN jsonb_build_object(
    'resumo', COALESCE(v_resumo, '{}'::jsonb),
    'recentes', v_recentes,
    'pendencias', v_pendencias
  );
END;
$$;

REVOKE ALL ON FUNCTION public.painel_turno(
  public.setor_codigo,
  public.turno_codigo,
  DATE
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.painel_turno(
  public.setor_codigo,
  public.turno_codigo,
  DATE
) TO authenticated, service_role;

-- Protege as fronteiras de horario e a virada da data operacional.
DO $$
BEGIN
  IF NOT public.horario_pertence_turno('T1'::public.turno_codigo, TIME '06:00')
     OR public.horario_pertence_turno('T1'::public.turno_codigo, TIME '15:38') THEN
    RAISE EXCEPTION 'Fronteira invalida para T1';
  END IF;

  IF NOT public.horario_pertence_turno('T2'::public.turno_codigo, TIME '23:00')
     OR NOT public.horario_pertence_turno('T2'::public.turno_codigo, TIME '01:59')
     OR public.horario_pertence_turno('T2'::public.turno_codigo, TIME '02:00') THEN
    RAISE EXCEPTION 'Fronteira invalida para T2';
  END IF;

  IF NOT public.horario_pertence_turno('T3'::public.turno_codigo, TIME '01:00')
     OR public.horario_pertence_turno('T3'::public.turno_codigo, TIME '06:00') THEN
    RAISE EXCEPTION 'Fronteira invalida para T3';
  END IF;

  IF public.data_producao_turno(
       'T2'::public.turno_codigo,
       TIMESTAMP '2026-09-29 01:30:00' AT TIME ZONE 'America/Sao_Paulo'
     ) <> DATE '2026-09-28' THEN
    RAISE EXCEPTION 'A hora real nao respeitou a data operacional de T2';
  END IF;

  IF public.data_producao_turno(
       'T3'::public.turno_codigo,
       TIMESTAMP '2026-09-29 05:59:00' AT TIME ZONE 'America/Sao_Paulo'
     ) <> DATE '2026-09-28' THEN
    RAISE EXCEPTION 'A hora real nao respeitou a data operacional de T3';
  END IF;
END;
$$;
