-- Corrige ambiguidade de nomes PL/pgSQL que impedia o fechamento e a geração de relatórios.

CREATE OR REPLACE FUNCTION public.fechar_turno(
  p_setor public.setor_codigo,
  p_turno public.turno_codigo,
  p_data DATE,
  p_resumo JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fechamento_id UUID;
  v_relatorio_id UUID;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.ativo = true
      AND (
        public.has_role(auth.uid(), 'administrador')
        OR (p.setor_atual = p_setor AND p.turno_atual = p_turno)
      )
  ) THEN
    RAISE EXCEPTION 'Setor ou turno diferente do perfil atual';
  END IF;

  INSERT INTO public.fechamentos_turno (
    setor, turno, data_local, status, resumo, fechado_por, fechado_em,
    reaberto_por, reaberto_em, justificativa_reabertura
  ) VALUES (
    p_setor, p_turno, p_data, 'fechado', p_resumo, auth.uid(), now(), NULL, NULL, NULL
  )
  ON CONFLICT (setor, turno, data_local) DO UPDATE SET
    status = 'fechado',
    resumo = EXCLUDED.resumo,
    fechado_por = auth.uid(),
    fechado_em = now(),
    reaberto_por = NULL,
    reaberto_em = NULL,
    justificativa_reabertura = NULL,
    updated_at = now()
  WHERE public.fechamentos_turno.status = 'reaberto'
  RETURNING id INTO v_fechamento_id;

  IF v_fechamento_id IS NULL THEN
    RAISE EXCEPTION 'Este turno ja esta fechado';
  END IF;

  INSERT INTO public.relatorios (
    fechamento_id, setor, turno, data_local, resumo, criado_por
  ) VALUES (
    v_fechamento_id, p_setor, p_turno, p_data, p_resumo, auth.uid()
  )
  ON CONFLICT (fechamento_id) DO UPDATE SET
    resumo = EXCLUDED.resumo,
    criado_por = auth.uid(),
    status_envio = 'aguardando',
    erro_envio = NULL,
    updated_at = now()
  RETURNING id INTO v_relatorio_id;

  RETURN v_relatorio_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fechar_turno(
  public.setor_codigo,
  public.turno_codigo,
  DATE,
  JSONB
) TO authenticated;

CREATE OR REPLACE FUNCTION public.gerar_relatorio_turno(
  p_setor public.setor_codigo,
  p_turno public.turno_codigo,
  p_data DATE,
  p_resumo JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fechamento_id UUID;
  v_relatorio_id UUID;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.ativo = true
      AND (
        public.has_role(auth.uid(), 'administrador')
        OR (p.setor_atual = p_setor AND p.turno_atual = p_turno)
      )
  ) THEN
    RAISE EXCEPTION 'Setor ou turno diferente do perfil atual';
  END IF;

  SELECT f.id INTO v_fechamento_id
  FROM public.fechamentos_turno f
  WHERE f.setor = p_setor
    AND f.turno = p_turno
    AND f.data_local = p_data
    AND f.status = 'fechado'
  LIMIT 1;

  IF v_fechamento_id IS NULL THEN
    RAISE EXCEPTION 'Encerre o turno antes de gerar o relatorio';
  END IF;

  INSERT INTO public.relatorios (
    fechamento_id, setor, turno, data_local, resumo, criado_por
  ) VALUES (
    v_fechamento_id, p_setor, p_turno, p_data, p_resumo, auth.uid()
  )
  ON CONFLICT (fechamento_id) DO UPDATE SET
    resumo = EXCLUDED.resumo,
    criado_por = auth.uid(),
    status_envio = CASE
      WHEN public.relatorios.status_envio = 'enviado' THEN public.relatorios.status_envio
      ELSE 'aguardando'::public.envio_status
    END,
    erro_envio = CASE
      WHEN public.relatorios.status_envio = 'enviado' THEN public.relatorios.erro_envio
      ELSE NULL
    END,
    updated_at = now()
  RETURNING id INTO v_relatorio_id;

  RETURN v_relatorio_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.gerar_relatorio_turno(
  public.setor_codigo,
  public.turno_codigo,
  DATE,
  JSONB
) TO authenticated;
