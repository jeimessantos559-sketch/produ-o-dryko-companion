ALTER TABLE public.ocorrencias_turno ADD COLUMN IF NOT EXISTS motivo_parada text NULL;
ALTER TABLE public.ocorrencias_turno ADD COLUMN IF NOT EXISTS motivo_outro text NULL;
ALTER TABLE public.ocorrencias_turno ADD COLUMN IF NOT EXISTS acao_realizada text NULL;
ALTER TABLE public.ocorrencias_turno ADD COLUMN IF NOT EXISTS turno_origem public.turno_codigo NULL;
ALTER TABLE public.ocorrencias_turno ADD COLUMN IF NOT EXISTS data_origem date NULL;
ALTER TABLE public.ocorrencias_turno ADD COLUMN IF NOT EXISTS transferida_em timestamptz NULL;
ALTER TABLE public.ocorrencias_turno ADD COLUMN IF NOT EXISTS transferida_por uuid NULL REFERENCES auth.users(id);
ALTER TABLE public.ocorrencias_turno ADD COLUMN IF NOT EXISTS quantidade_transferencias integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS ocorrencias_turno_abertas_idx
  ON public.ocorrencias_turno (setor, data_local, turno)
  WHERE hora_inicio IS NOT NULL AND hora_fim IS NULL;
CREATE INDEX IF NOT EXISTS ocorrencias_turno_periodo_idx
  ON public.ocorrencias_turno (data_local, setor);

CREATE TABLE IF NOT EXISTS public.ocorrencia_transferencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ocorrencia_id uuid NOT NULL REFERENCES public.ocorrencias_turno(id) ON DELETE CASCADE,
  setor public.setor_codigo NOT NULL,
  turno_de public.turno_codigo NOT NULL,
  data_de date NOT NULL,
  turno_para public.turno_codigo NOT NULL,
  data_para date NOT NULL,
  usuario_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ocorrencia_transferencias TO authenticated;
GRANT ALL ON public.ocorrencia_transferencias TO service_role;
ALTER TABLE public.ocorrencia_transferencias ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.pode_acessar_setor(_user_id uuid, _setor public.setor_codigo)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.eh_admin_ativo(_user_id) OR EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = _user_id AND p.ativo = true AND p.setor_atual = _setor
  )
$$;

CREATE POLICY "Transferencias leitura setor" ON public.ocorrencia_transferencias
  FOR SELECT TO authenticated USING (public.pode_acessar_setor(auth.uid(), setor));

CREATE OR REPLACE FUNCTION public.finalizar_ocorrencia(p_id uuid, p_hora_fim time, p_acao text)
RETURNS public.ocorrencias_turno LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v public.ocorrencias_turno;
  v_min integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sessão inválida.' USING errcode = '42501'; END IF;
  SELECT * INTO v FROM public.ocorrencias_turno WHERE id = p_id FOR UPDATE;
  IF v.id IS NULL OR NOT public.pode_acessar_setor(auth.uid(), v.setor) THEN
    RAISE EXCEPTION 'Ocorrência não encontrada.' USING errcode = 'P0002';
  END IF;
  IF v.hora_inicio IS NULL THEN RAISE EXCEPTION 'Ocorrência sem hora inicial.' USING errcode = '22023'; END IF;
  IF v.hora_fim IS NOT NULL THEN RAISE EXCEPTION 'Esta ocorrência já foi finalizada. Atualize a página.' USING errcode = '40001'; END IF;
  IF p_hora_fim IS NULL THEN RAISE EXCEPTION 'Informe a hora final.' USING errcode = '22023'; END IF;
  v_min := (EXTRACT(epoch FROM (p_hora_fim - v.hora_inicio)) / 60)::integer;
  IF v_min < 0 THEN v_min := v_min + 1440; END IF;
  UPDATE public.ocorrencias_turno
     SET hora_fim = p_hora_fim,
         duracao_min = v_min,
         acao_realizada = NULLIF(trim(COALESCE(p_acao, '')), ''),
         updated_at = now()
   WHERE id = p_id
   RETURNING * INTO v;
  RETURN v;
END;
$$;
REVOKE ALL ON FUNCTION public.finalizar_ocorrencia(uuid, time, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalizar_ocorrencia(uuid, time, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.transferir_ocorrencia(p_id uuid)
RETURNS public.ocorrencias_turno LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v public.ocorrencias_turno;
  v_turno public.turno_codigo;
  v_data date;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sessão inválida.' USING errcode = '42501'; END IF;
  SELECT * INTO v FROM public.ocorrencias_turno WHERE id = p_id FOR UPDATE;
  IF v.id IS NULL OR NOT public.pode_acessar_setor(auth.uid(), v.setor) THEN
    RAISE EXCEPTION 'Ocorrência não encontrada.' USING errcode = 'P0002';
  END IF;
  IF v.hora_inicio IS NULL OR v.hora_fim IS NOT NULL THEN
    RAISE EXCEPTION 'Só ocorrências em andamento podem ser transferidas.' USING errcode = '40001';
  END IF;
  IF v.turno = 'T1' THEN v_turno := 'T2'; v_data := v.data_local;
  ELSIF v.turno = 'T2' THEN v_turno := 'T3'; v_data := v.data_local;
  ELSE v_turno := 'T1'; v_data := v.data_local + 1;
  END IF;
  INSERT INTO public.ocorrencia_transferencias (ocorrencia_id, setor, turno_de, data_de, turno_para, data_para, usuario_id)
  VALUES (v.id, v.setor, v.turno, v.data_local, v_turno, v_data, auth.uid());
  UPDATE public.ocorrencias_turno
     SET turno_origem = COALESCE(turno_origem, turno),
         data_origem = COALESCE(data_origem, data_local),
         turno = v_turno,
         data_local = v_data,
         transferida_em = now(),
         transferida_por = auth.uid(),
         quantidade_transferencias = quantidade_transferencias + 1,
         updated_at = now()
   WHERE id = p_id
   RETURNING * INTO v;
  RETURN v;
END;
$$;
REVOKE ALL ON FUNCTION public.transferir_ocorrencia(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transferir_ocorrencia(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.pode_acessar_setor(uuid, public.setor_codigo) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pode_acessar_setor(uuid, public.setor_codigo) TO authenticated;