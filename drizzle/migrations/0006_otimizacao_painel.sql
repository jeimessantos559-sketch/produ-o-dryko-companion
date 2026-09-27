-- Otimizacao do painel operacional: indices e uma unica RPC para resumo, lista e pendencias.

CREATE INDEX IF NOT EXISTS apontamentos_setor_status_data_turno_idx
  ON public.apontamentos (setor, status, data_local DESC, turno, created_at DESC);

CREATE INDEX IF NOT EXISTS apontamentos_usuario_setor_turno_created_idx
  ON public.apontamentos (usuario_id, setor, turno, created_at DESC);

CREATE INDEX IF NOT EXISTS metas_op_setor_status_op_produto_idx
  ON public.metas_op (setor, status, op, produto_id);

CREATE INDEX IF NOT EXISTS produtos_setor_ativo_nome_idx
  ON public.produtos (setor, ativo, nome);

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

  SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC), '[]'::jsonb)
  INTO v_recentes
  FROM (
    SELECT a.id, a.op, a.produto_nome, a.quantidade_plts, a.total_rolos,
           a.metragem, a.area_m2, a.status, a.created_at
    FROM public.apontamentos a
    WHERE a.setor = p_setor
      AND a.turno = p_turno
      AND a.data_local = p_data
    ORDER BY a.created_at DESC
    LIMIT 40
  ) r;

  SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.created_at DESC), '[]'::jsonb)
  INTO v_pendencias
  FROM (
    SELECT a.id, a.op, a.produto_nome, a.quantidade_plts, a.total_rolos,
           a.metragem, a.area_m2, a.status, a.created_at, a.data_local, a.turno
    FROM public.apontamentos a
    WHERE a.setor = p_setor
      AND a.status = 'pendente'
    ORDER BY a.created_at DESC
    LIMIT 50
  ) p;

  RETURN jsonb_build_object(
    'resumo', COALESCE(v_resumo, '{}'::jsonb),
    'recentes', v_recentes,
    'pendencias', v_pendencias
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.painel_turno(
  public.setor_codigo,
  public.turno_codigo,
  DATE
) TO authenticated;
