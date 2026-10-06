-- Painel completo do turno, correções auditadas e finalização explícita da programação.
-- Não altera nenhum apontamento existente.
BEGIN;

CREATE OR REPLACE FUNCTION public.plts_fechados(
  p_setor public.setor_codigo, p_grupos jsonb, p_quantidade integer
) RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN p_setor = 'corte' AND jsonb_typeof(p_grupos) = 'array'
    AND jsonb_array_length(p_grupos) > 0 THEN
    (SELECT COALESCE(SUM(GREATEST(0, COALESCE((g->>'quantidadePlts')::integer, 0)
      - CASE WHEN NULLIF(g->>'pltPicadoRolos', '') IS NOT NULL
          AND NOT COALESCE((g->>'picadoAdicional')::boolean, false) THEN 1 ELSE 0 END)), 0)::integer
     FROM jsonb_array_elements(p_grupos) g)
    ELSE COALESCE(p_quantidade, 0) END;
$$;

CREATE OR REPLACE FUNCTION public.painel_turno(
  p_setor public.setor_codigo, p_turno public.turno_codigo, p_data date
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_resumo jsonb; v_recentes jsonb; v_pendencias jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.ativo
    AND (p.setor_atual = p_setor OR public.eh_admin_ativo(auth.uid()))) THEN
    RAISE EXCEPTION 'Acesso nao autorizado ao setor';
  END IF;
  SELECT jsonb_build_object(
    'registros', COUNT(*), 'pendentes', COUNT(*) FILTER (WHERE a.status = 'pendente'),
    'lancados', COUNT(*) FILTER (WHERE a.status = 'lancado'),
    'plts', COALESCE(SUM(public.plts_fechados(a.setor, a.grupos, a.quantidade_plts)), 0),
    'rolos', COALESCE(SUM(a.total_rolos), 0), 'metragem', COALESCE(SUM(a.metragem), 0),
    'area', COALESCE(SUM(a.area_m2), 0)
  ) INTO v_resumo FROM public.apontamentos a
  WHERE a.setor = p_setor AND a.turno = p_turno AND a.data_local = p_data;

  -- Todos os registros, sem LIMIT: filtros e numeração não podem ocultar produção do turno.
  SELECT COALESCE(jsonb_agg(to_jsonb(a) || jsonb_build_object('correcao', c.dados)
    ORDER BY a.data_hora_producao DESC, a.created_at DESC, a.id DESC), '[]'::jsonb)
  INTO v_recentes FROM public.apontamentos a
  LEFT JOIN LATERAL (
    SELECT jsonb_build_object('nome', COALESCE(au.dados_novos->>'corrigido_por_nome', p.nome),
      'motivo', au.justificativa, 'created_at', au.created_at) AS dados
    FROM public.apontamento_auditoria au LEFT JOIN public.profiles p ON p.id = au.usuario_id
    WHERE au.apontamento_id = a.id AND au.acao = 'correcao'
    ORDER BY au.created_at DESC, au.id DESC LIMIT 1
  ) c ON true
  WHERE a.setor = p_setor AND a.turno = p_turno AND a.data_local = p_data;
  SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.data_hora_producao DESC, p.created_at DESC), '[]'::jsonb)
  INTO v_pendencias FROM (SELECT a.* FROM public.apontamentos a
    WHERE a.setor = p_setor AND a.status = 'pendente'
    ORDER BY a.data_hora_producao DESC, a.created_at DESC) p;
  RETURN jsonb_build_object('resumo', v_resumo, 'recentes', v_recentes, 'pendencias', v_pendencias);
END;
$$;

CREATE OR REPLACE FUNCTION public.corrigir_apontamento(p_id uuid, p_justificativa text, p_dados jsonb)
RETURNS public.apontamentos LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  anterior public.apontamentos%ROWTYPE; corrigido public.apontamentos%ROWTYPE;
  produto public.produtos%ROWTYPE; grupo jsonb; novos_grupos jsonb := '[]'::jsonb;
  qtd integer; padrao integer; picado integer;
  total_plts_calc integer := 0; total_rolos_calc integer := 0;
  nova_metragem numeric; novo_tempo numeric; nova_velocidade numeric; nova_largura numeric;
  referencia text; nome_corretor text; admin boolean;
BEGIN
  IF length(btrim(COALESCE(p_justificativa, ''))) NOT BETWEEN 3 AND 1000 THEN
    RAISE EXCEPTION 'Informe um motivo de 3 a 1000 caracteres';
  END IF;
  SELECT * INTO anterior FROM public.apontamentos WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Apontamento nao encontrado'; END IF;
  admin := public.eh_admin_ativo(auth.uid());
  IF NOT admin AND anterior.status = 'lancado' THEN
    RAISE EXCEPTION 'Somente o administrador corrige apontamento lancado';
  END IF;
  IF NOT admin AND NOT EXISTS (SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.ativo AND p.setor_atual = anterior.setor) THEN
    RAISE EXCEPTION 'Apontamento fora do setor atual';
  END IF;
  IF p_dados->>'updated_at_anterior' IS NOT NULL
    AND (p_dados->>'updated_at_anterior')::timestamptz IS DISTINCT FROM anterior.updated_at THEN
    RAISE EXCEPTION 'Este apontamento mudou em outro aparelho. Atualize e revise a correcao';
  END IF;
  SELECT * INTO produto FROM public.produtos
    WHERE id = COALESCE(NULLIF(p_dados->>'produto_id', '')::uuid, anterior.produto_id);
  IF NOT FOUND OR produto.setor <> anterior.setor OR
    (NOT produto.ativo AND produto.id <> anterior.produto_id) THEN
    RAISE EXCEPTION 'Produto invalido para o setor';
  END IF;
  referencia := NULLIF(btrim(CASE WHEN anterior.setor = 'mantas'
    THEN COALESCE(p_dados->>'lote', anterior.lote) ELSE COALESCE(p_dados->>'op', anterior.op) END), '');
  IF referencia IS NULL THEN RAISE EXCEPTION 'Informe a OP ou lote'; END IF;

  IF anterior.setor = 'corte' THEN
    IF jsonb_typeof(COALESCE(p_dados->'grupos', anterior.grupos)) IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Informe os grupos de PLTs';
    END IF;
    FOR grupo IN SELECT * FROM jsonb_array_elements(COALESCE(p_dados->'grupos', anterior.grupos)) LOOP
      qtd := (grupo->>'quantidadePlts')::integer;
      padrao := (grupo->>'rolosPorPlt')::integer;
      picado := NULLIF(grupo->>'pltPicadoRolos', '')::integer;
      -- Normaliza a representação antiga: o picado deixa de contar como PLT fechado.
      IF picado IS NOT NULL AND NOT COALESCE((grupo->>'picadoAdicional')::boolean, false) THEN qtd := qtd - 1; END IF;
      IF qtd IS NULL OR padrao IS NULL OR qtd < 0 OR padrao < 1
        OR (picado IS NOT NULL AND (picado < 1 OR picado >= padrao))
        OR (qtd = 0 AND picado IS NULL) THEN RAISE EXCEPTION 'Grupo de PLTs invalido'; END IF;
      total_plts_calc := total_plts_calc + qtd;
      total_rolos_calc := total_rolos_calc + qtd * padrao + COALESCE(picado, 0);
      novos_grupos := novos_grupos || jsonb_build_array(jsonb_build_object(
        'quantidadePlts', qtd, 'rolosPorPlt', padrao, 'pltPicadoRolos', picado, 'picadoAdicional', true));
    END LOOP;
    IF total_plts_calc NOT BETWEEN 0 AND 20 OR total_rolos_calc <= 0 THEN
      RAISE EXCEPTION 'Informe de 0 a 20 PLTs fechados e uma quantidade de rolos positiva';
    END IF;
    UPDATE public.apontamentos SET op = referencia, lote = NULL,
      produto_id = produto.id, produto_nome = produto.nome, grupos = novos_grupos,
      quantidade_plts = total_plts_calc, rolos_por_plt = (novos_grupos->0->>'rolosPorPlt')::integer,
      total_rolos = total_rolos_calc, largura = produto.largura,
      metragem = produto.largura * total_rolos_calc / 10,
      status = 'pendente', lancado_por = NULL, lancado_em = NULL, updated_at = now()
    WHERE id = p_id RETURNING * INTO corrigido;
  ELSIF anterior.setor = 'fitas' THEN
    novo_tempo := COALESCE((p_dados->>'tempo')::numeric, anterior.tempo);
    nova_velocidade := COALESCE((p_dados->>'velocidade')::numeric, anterior.velocidade);
    nova_largura := COALESCE((p_dados->>'largura')::numeric, anterior.largura, produto.largura);
    IF COALESCE(novo_tempo, 0) <= 0 OR COALESCE(nova_velocidade, 0) <= 0 OR COALESCE(nova_largura, 0) <= 0
      OR novo_tempo = 'NaN'::numeric OR nova_velocidade = 'NaN'::numeric OR nova_largura = 'NaN'::numeric THEN
      RAISE EXCEPTION 'Tempo, velocidade e largura devem ser positivos';
    END IF;
    UPDATE public.apontamentos SET op = referencia, produto_id = produto.id, produto_nome = produto.nome,
      tempo = novo_tempo, velocidade = nova_velocidade, largura = nova_largura,
      area_m2 = novo_tempo * nova_velocidade * nova_largura,
      status = 'pendente', lancado_por = NULL, lancado_em = NULL, updated_at = now()
    WHERE id = p_id RETURNING * INTO corrigido;
  ELSIF anterior.setor = 'mantas' THEN
    nova_metragem := COALESCE((p_dados->>'metragem')::numeric, anterior.metragem);
    qtd := COALESCE((p_dados->>'quantidade_plts')::integer, anterior.quantidade_plts);
    IF COALESCE(qtd, 0) < 1 OR COALESCE(nova_metragem, 0) <= 0 OR nova_metragem = 'NaN'::numeric
      OR mod(nova_metragem, COALESCE(produto.metros_por_rolo, 10)) <> 0 THEN
      RAISE EXCEPTION 'Informe PLTs positivos e metragem para rolos inteiros';
    END IF;
    UPDATE public.apontamentos SET op = NULL, lote = referencia, produto_id = produto.id, produto_nome = produto.nome,
      quantidade_plts = qtd, rolos_por_plt = produto.rolos_por_plt, metragem = nova_metragem,
      total_rolos = (nova_metragem / COALESCE(produto.metros_por_rolo, 10))::integer,
      status = 'pendente', lancado_por = NULL, lancado_em = NULL, updated_at = now()
    WHERE id = p_id RETURNING * INTO corrigido;
  ELSE RAISE EXCEPTION 'Setor sem regra de correcao'; END IF;
  SELECT nome INTO nome_corretor FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.apontamento_auditoria (apontamento_id, setor, usuario_id, acao, justificativa, dados_anteriores, dados_novos)
  VALUES (p_id, anterior.setor, auth.uid(), 'correcao', btrim(p_justificativa), to_jsonb(anterior),
    to_jsonb(corrigido) || jsonb_build_object('corrigido_por_nome', nome_corretor));
  RETURN corrigido;
END;
$$;

CREATE OR REPLACE FUNCTION public.produtos_da_referencia(p_setor public.setor_codigo, p_referencia text)
RETURNS TABLE(produto_id uuid) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.ativo
    AND (p.setor_atual = p_setor OR public.eh_admin_ativo(auth.uid()))) THEN
    RAISE EXCEPTION 'Acesso nao autorizado ao setor';
  END IF;
  IF NULLIF(btrim(p_referencia), '') IS NULL THEN RETURN; END IF;
  RETURN QUERY SELECT DISTINCT a.produto_id FROM public.apontamentos a
    WHERE a.setor = p_setor AND upper(btrim(CASE WHEN p_setor = 'mantas' THEN a.lote ELSE a.op END)) = upper(btrim(p_referencia));
END;
$$;

ALTER TABLE public.programacao_producao
  ADD COLUMN IF NOT EXISTS finalizado_em timestamptz,
  ADD COLUMN IF NOT EXISTS finalizado_por uuid REFERENCES auth.users(id);

CREATE OR REPLACE FUNCTION public.quantidade_produzida_programacao(p public.programacao_producao)
RETURNS numeric LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT COALESCE(SUM(CASE p.unidade WHEN 'PLTs' THEN public.plts_fechados(a.setor, a.grupos, a.quantidade_plts)::numeric
    WHEN 'm²' THEN COALESCE(a.area_m2, a.metragem, 0) ELSE COALESCE(a.metragem, 0) END), 0)
  FROM public.apontamentos a WHERE a.setor = p.setor AND a.produto_id = p.produto_id AND a.data_local = p.data_local
    AND (p.global_dia OR a.turno = p.turno)
    AND (NULLIF(btrim(p.op), '') IS NULL OR upper(btrim(a.op)) = upper(btrim(p.op)))
    AND (NULLIF(btrim(p.lote), '') IS NULL OR upper(btrim(a.lote)) = upper(btrim(p.lote)));
$$;

CREATE OR REPLACE FUNCTION public.contagem_turno(p_setor public.setor_codigo, p_turno public.turno_codigo, p_data date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE painel jsonb; programacao jsonb; metas jsonb;
BEGIN
  painel := public.painel_turno(p_setor, p_turno, p_data); -- valida usuário ativo e setor
  SELECT COALESCE(jsonb_agg(to_jsonb(p) || jsonb_build_object(
    'produzido', public.quantidade_produzida_programacao(p), 'finalizado_por_nome', perfil.nome)
    ORDER BY p.produto_nome, p.created_at), '[]'::jsonb)
  INTO programacao FROM public.programacao_producao p
  LEFT JOIN public.profiles perfil ON perfil.id = p.finalizado_por
  WHERE p.setor = p_setor AND p.data_local = p_data AND (p.global_dia OR p.turno = p_turno);
  SELECT COALESCE(jsonb_agg(to_jsonb(m) || jsonb_build_object('apontado', (
    SELECT COALESCE(SUM(CASE m.unidade WHEN 'PLTs' THEN public.plts_fechados(a.setor, a.grupos, a.quantidade_plts)::numeric
      WHEN 'm²' THEN COALESCE(a.area_m2, a.metragem, 0) ELSE COALESCE(a.metragem, 0) END), 0)
    FROM public.apontamentos a WHERE a.setor = m.setor AND a.op = m.op AND a.produto_id = m.produto_id
  ))), '[]'::jsonb) INTO metas FROM public.metas_painel(p_setor) m
    WHERE EXISTS (SELECT 1 FROM public.apontamentos a WHERE a.setor = p_setor AND a.turno = p_turno
      AND a.data_local = p_data AND a.produto_id = m.produto_id AND a.op = m.op);
  RETURN jsonb_build_object('apontamentos', painel->'recentes', 'programacao', programacao, 'metas', metas);
END;
$$;

CREATE OR REPLACE FUNCTION public.finalizar_meta_atingida(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m public.metas_op%ROWTYPE; produzido numeric;
BEGIN
  IF NOT public.pode_finalizar_meta(auth.uid()) THEN RAISE EXCEPTION 'Usuario sem permissao para finalizar OP'; END IF;
  SELECT * INTO m FROM public.metas_op WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Meta nao encontrada'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.ativo
    AND (p.setor_atual = m.setor OR public.eh_admin_ativo(auth.uid()))) THEN
    RAISE EXCEPTION 'Meta fora do setor atual';
  END IF;
  SELECT COALESCE(SUM(CASE m.unidade WHEN 'PLTs' THEN public.plts_fechados(a.setor, a.grupos, a.quantidade_plts)::numeric
    WHEN 'm²' THEN COALESCE(a.area_m2, a.metragem, 0) ELSE COALESCE(a.metragem, 0) END), 0) INTO produzido
  FROM public.apontamentos a WHERE a.setor = m.setor AND a.produto_id = m.produto_id AND a.op = m.op;
  IF produzido < m.quantidade_meta THEN RAISE EXCEPTION 'A quantidade programada ainda nao foi atingida'; END IF;
  PERFORM public.alterar_status_meta(p_id, 'finalizada');
END;
$$;

CREATE OR REPLACE FUNCTION public.alterar_status_programacao(p_id uuid, p_finalizar boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.programacao_producao%ROWTYPE;
BEGIN
  IF NOT public.pode_finalizar_meta(auth.uid()) THEN RAISE EXCEPTION 'Usuario sem permissao para finalizar OP'; END IF;
  SELECT * INTO p FROM public.programacao_producao WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Programacao nao encontrada'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles perfil WHERE perfil.id = auth.uid() AND perfil.ativo
    AND (perfil.setor_atual = p.setor OR public.eh_admin_ativo(auth.uid()))) THEN
    RAISE EXCEPTION 'Programacao fora do setor atual';
  END IF;
  IF p_finalizar THEN
    IF NULLIF(btrim(CASE WHEN p.setor = 'mantas' THEN p.lote ELSE p.op END), '') IS NULL THEN
      RAISE EXCEPTION 'Informe a OP ou lote da programacao antes de finalizar';
    END IF;
    IF public.quantidade_produzida_programacao(p) < p.quantidade_prevista THEN
      RAISE EXCEPTION 'A quantidade programada ainda nao foi atingida';
    END IF;
    IF p.finalizado_em IS NOT NULL THEN RETURN; END IF;
  END IF;
  UPDATE public.programacao_producao SET
    finalizado_em = CASE WHEN p_finalizar THEN now() ELSE NULL END,
    finalizado_por = CASE WHEN p_finalizar THEN auth.uid() ELSE NULL END, updated_at = now()
  WHERE id = p_id;
END;
$$;

-- Alterar a referência ou a quantidade de uma programação concluída exige nova finalização.
CREATE OR REPLACE FUNCTION public.reabrir_programacao_alterada()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.finalizado_em IS NOT NULL AND ROW(NEW.op, NEW.lote, NEW.produto_id, NEW.quantidade_prevista, NEW.unidade, NEW.data_local, NEW.turno, NEW.global_dia)
    IS DISTINCT FROM ROW(OLD.op, OLD.lote, OLD.produto_id, OLD.quantidade_prevista, OLD.unidade, OLD.data_local, OLD.turno, OLD.global_dia) THEN
    NEW.finalizado_em := NULL; NEW.finalizado_por := NULL;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS reabrir_programacao_alterada ON public.programacao_producao;
CREATE TRIGGER reabrir_programacao_alterada BEFORE UPDATE ON public.programacao_producao
  FOR EACH ROW EXECUTE FUNCTION public.reabrir_programacao_alterada();

REVOKE ALL ON FUNCTION public.produtos_da_referencia(public.setor_codigo, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.contagem_turno(public.setor_codigo, public.turno_codigo, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.alterar_status_programacao(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalizar_meta_atingida(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.produtos_da_referencia(public.setor_codigo, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.contagem_turno(public.setor_codigo, public.turno_codigo, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.alterar_status_programacao(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalizar_meta_atingida(uuid) TO authenticated;
COMMIT;
