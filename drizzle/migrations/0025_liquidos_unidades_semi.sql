-- Líquidos: o produto define a embalagem e os parâmetros de conversão.
-- Baldes e galões: PLTs x unidades/PLT + picado; semi em kg por unidade.
-- Pouch: somente unidades, sem PLTs e sem consumo de semi.

ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS embalagem_liquido text,
  ADD COLUMN IF NOT EXISTS unidades_por_plt integer,
  ADD COLUMN IF NOT EXISTS semi_kg_por_unidade numeric(12,3);

ALTER TABLE public.apontamentos
  ADD COLUMN IF NOT EXISTS embalagem_liquido text,
  ADD COLUMN IF NOT EXISTS unidades_por_plt integer,
  ADD COLUMN IF NOT EXISTS semi_kg_por_unidade numeric(12,3),
  ADD COLUMN IF NOT EXISTS picado_unidades integer,
  ADD COLUMN IF NOT EXISTS total_unidades integer,
  ADD COLUMN IF NOT EXISTS semi_consumido_kg numeric(15,3);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.produtos'::regclass AND conname='produtos_liquidos_parametros_check') THEN
    ALTER TABLE public.produtos ADD CONSTRAINT produtos_liquidos_parametros_check CHECK (
      (embalagem_liquido IS NULL OR embalagem_liquido IN ('balde','galao','unidade'))
      AND (unidades_por_plt IS NULL OR unidades_por_plt > 0)
      AND (semi_kg_por_unidade IS NULL OR (semi_kg_por_unidade > 0 AND semi_kg_por_unidade <> 'NaN'::numeric))
      AND (embalagem_liquido IS DISTINCT FROM 'unidade' OR (unidades_por_plt IS NULL AND semi_kg_por_unidade IS NULL))
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.apontamentos'::regclass AND conname='apontamentos_liquidos_check') THEN
    ALTER TABLE public.apontamentos ADD CONSTRAINT apontamentos_liquidos_check CHECK (
      setor <> 'liquidos' OR (
        op IS NOT NULL AND btrim(op) <> ''
        AND embalagem_liquido IS NOT NULL AND embalagem_liquido IN ('balde','galao','unidade')
        AND total_unidades IS NOT NULL AND total_unidades > 0
        AND quantidade_plts IS NOT NULL AND quantidade_plts BETWEEN 0 AND 20
        AND picado_unidades IS NOT NULL AND picado_unidades >= 0
        AND semi_consumido_kg IS NOT NULL AND semi_consumido_kg >= 0 AND semi_consumido_kg <> 'NaN'::numeric
        AND (
          (embalagem_liquido='unidade' AND quantidade_plts=0 AND picado_unidades=0
            AND semi_consumido_kg=0 AND unidades_por_plt IS NULL AND semi_kg_por_unidade IS NULL)
          OR (embalagem_liquido IN ('balde','galao') AND unidades_por_plt IS NOT NULL AND unidades_por_plt > 0
            AND semi_kg_por_unidade IS NOT NULL AND semi_kg_por_unidade > 0
            AND picado_unidades < unidades_por_plt
            AND total_unidades=quantidade_plts*unidades_por_plt+picado_unidades
            AND semi_consumido_kg=round(total_unidades*semi_kg_por_unidade,3))
        )
      )
    );
  END IF;
END;
$$;

ALTER TABLE public.metas_op DROP CONSTRAINT IF EXISTS metas_op_unidade_check;
ALTER TABLE public.metas_op ADD CONSTRAINT metas_op_unidade_check CHECK (
  unidade IN ('PLTs','m²') OR (setor='liquidos' AND unidade='unidades')
);

INSERT INTO public.marcas_produto (setor,nome,ordem)
VALUES ('liquidos','PRIKOL',1), ('liquidos','KOLEL',2), ('liquidos','KAL',3)
ON CONFLICT (setor,nome) DO NOTHING;

INSERT INTO public.produtos (setor,nome,categoria,embalagem_liquido,unidades_por_plt,semi_kg_por_unidade)
VALUES
  ('liquidos','Prikol BD','PRIKOL','balde',36,18),
  ('liquidos','Prikol GL','PRIKOL','galao',36,18),
  ('liquidos','Kolel BD','KOLEL','balde',36,18),
  ('liquidos','Kal pouch','KAL','unidade',NULL,NULL),
  ('liquidos','Prikol pouch','PRIKOL','unidade',NULL,NULL)
ON CONFLICT (setor,nome) DO NOTHING;

UPDATE public.setores SET regras_definidas=true WHERE codigo='liquidos';

-- A mesma validação serve à inclusão e à correção. Totais enviados pelo cliente
-- nunca substituem a conversão definida pelo cadastro de baldes e galões.
CREATE OR REPLACE FUNCTION public.calcular_liquidos(
  p_produto public.produtos, p_plts integer, p_picado integer, p_unidades integer
) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE plts integer; picado integer; unidades integer; semi numeric;
BEGIN
  IF p_produto.setor IS DISTINCT FROM 'liquidos' OR p_produto.embalagem_liquido IS NULL THEN
    RAISE EXCEPTION 'Produto sem embalagem de liquidos configurada';
  END IF;
  IF p_produto.embalagem_liquido='unidade' THEN
    plts:=0; picado:=0; unidades:=COALESCE(p_unidades,0); semi:=0;
  ELSIF p_produto.embalagem_liquido IN ('balde','galao') THEN
    IF COALESCE(p_produto.unidades_por_plt,0)<=0 OR COALESCE(p_produto.semi_kg_por_unidade,0)<=0
      OR p_produto.semi_kg_por_unidade='NaN'::numeric THEN
      RAISE EXCEPTION 'Defina as unidades por PLT e os kg de semi por unidade no cadastro do produto';
    END IF;
    plts:=COALESCE(p_plts,0); picado:=COALESCE(p_picado,0);
    IF plts NOT BETWEEN 0 AND 20 OR picado < 0 OR picado >= p_produto.unidades_por_plt THEN
      RAISE EXCEPTION 'Informe de 0 a 20 PLTs fechados e um picado menor que um PLT';
    END IF;
    unidades:=plts*p_produto.unidades_por_plt+picado;
    semi:=round(unidades*p_produto.semi_kg_por_unidade,3);
  ELSE RAISE EXCEPTION 'Embalagem de liquidos invalida'; END IF;
  IF unidades<=0 THEN RAISE EXCEPTION 'Informe uma quantidade de unidades positiva'; END IF;
  RETURN jsonb_build_object('plts',plts,'picado',picado,'unidades',unidades,'semi',semi);
END;
$$;
REVOKE ALL ON FUNCTION public.calcular_liquidos(public.produtos,integer,integer,integer) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.preparar_apontamento()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  liquido JSONB;
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
  ELSIF NEW.setor = 'liquidos' THEN
    IF NEW.op IS NULL THEN RAISE EXCEPTION 'Informe a OP'; END IF;
    liquido := public.calcular_liquidos(produto, NEW.quantidade_plts, NEW.picado_unidades, NEW.total_unidades);
    NEW.lote := NULL;
    NEW.embalagem_liquido := produto.embalagem_liquido;
    NEW.unidades_por_plt := CASE WHEN produto.embalagem_liquido='unidade' THEN NULL ELSE produto.unidades_por_plt END;
    NEW.semi_kg_por_unidade := CASE WHEN produto.embalagem_liquido='unidade' THEN NULL ELSE produto.semi_kg_por_unidade END;
    NEW.quantidade_plts := (liquido->>'plts')::integer;
    NEW.picado_unidades := (liquido->>'picado')::integer;
    NEW.total_unidades := (liquido->>'unidades')::integer;
    NEW.semi_consumido_kg := (liquido->>'semi')::numeric;
    NEW.rolos_por_plt := NULL; NEW.total_rolos := NULL; NEW.largura := NULL;
    NEW.metragem := NULL; NEW.area_m2 := NULL; NEW.tempo := NULL; NEW.velocidade := NULL; NEW.grupos := NULL;
    IF NEW.quantidade_plts=0 THEN
      NEW.sequencia_inicio := NULL; NEW.sequencia_fim := NULL;
      RETURN NEW;
    END IF;
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
$function$;

CREATE OR REPLACE FUNCTION public.corrigir_apontamento(p_id uuid, p_justificativa text, p_dados jsonb)
 RETURNS apontamentos
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  anterior public.apontamentos%ROWTYPE; corrigido public.apontamentos%ROWTYPE;
  produto public.produtos%ROWTYPE; grupo jsonb; novos_grupos jsonb := '[]'::jsonb;
  qtd integer; padrao integer; picado integer;
  total_plts_calc integer := 0; total_rolos_calc integer := 0;
  nova_metragem numeric; novo_tempo numeric; nova_velocidade numeric; nova_largura numeric;
  referencia text; nome_corretor text; admin boolean;
  liquido jsonb;
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
  ELSIF anterior.setor = 'liquidos' THEN
    liquido := public.calcular_liquidos(produto,
      COALESCE((p_dados->>'quantidade_plts')::integer, anterior.quantidade_plts),
      COALESCE((p_dados->>'picado_unidades')::integer, anterior.picado_unidades),
      COALESCE((p_dados->>'total_unidades')::integer, anterior.total_unidades));
    UPDATE public.apontamentos SET op=referencia, lote=NULL, produto_id=produto.id, produto_nome=produto.nome,
      embalagem_liquido=produto.embalagem_liquido,
      unidades_por_plt=CASE WHEN produto.embalagem_liquido='unidade' THEN NULL ELSE produto.unidades_por_plt END,
      semi_kg_por_unidade=CASE WHEN produto.embalagem_liquido='unidade' THEN NULL ELSE produto.semi_kg_por_unidade END,
      quantidade_plts=(liquido->>'plts')::integer, picado_unidades=(liquido->>'picado')::integer,
      total_unidades=(liquido->>'unidades')::integer, semi_consumido_kg=(liquido->>'semi')::numeric,
      rolos_por_plt=NULL, total_rolos=NULL, largura=NULL, metragem=NULL, area_m2=NULL,
      tempo=NULL, velocidade=NULL, grupos=NULL,
      sequencia_inicio=NULL, sequencia_fim=NULL,
      status='pendente', lancado_por=NULL, lancado_em=NULL, updated_at=now()
    WHERE id=p_id RETURNING * INTO corrigido;
  ELSE RAISE EXCEPTION 'Setor sem regra de correcao'; END IF;
  SELECT nome INTO nome_corretor FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.apontamento_auditoria (apontamento_id, setor, usuario_id, acao, justificativa, dados_anteriores, dados_novos)
  VALUES (p_id, anterior.setor, auth.uid(), 'correcao', btrim(p_justificativa), to_jsonb(anterior),
    to_jsonb(corrigido) || jsonb_build_object('corrigido_por_nome', nome_corretor));
  RETURN corrigido;
END;
$function$;

CREATE OR REPLACE FUNCTION public.painel_turno(p_setor setor_codigo, p_turno turno_codigo, p_data date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    'area', COALESCE(SUM(a.area_m2), 0),
    'unidades', COALESCE(SUM(a.total_unidades), 0), 'semiKg', COALESCE(SUM(a.semi_consumido_kg), 0)
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
$function$;

CREATE OR REPLACE FUNCTION public.metas_painel(p_setor setor_codigo)
 RETURNS TABLE(id uuid, setor setor_codigo, op text, produto_id uuid, produto_nome text, unidade text, quantidade_meta numeric, status meta_status, criado_por uuid, finalizado_por uuid, finalizado_em timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone, apontado numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
          WHEN m.unidade = 'unidades' THEN COALESCE(a.total_unidades, 0)::NUMERIC
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
$function$;

CREATE OR REPLACE FUNCTION public.contagem_turno(p_setor setor_codigo, p_turno turno_codigo, p_data date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      WHEN 'unidades' THEN COALESCE(a.total_unidades, 0)::numeric
      WHEN 'm²' THEN COALESCE(a.area_m2, a.metragem, 0) ELSE COALESCE(a.metragem, 0) END), 0)
    FROM public.apontamentos a WHERE a.setor = m.setor AND a.op = m.op AND a.produto_id = m.produto_id
  ))), '[]'::jsonb) INTO metas FROM public.metas_painel(p_setor) m
    WHERE EXISTS (SELECT 1 FROM public.apontamentos a WHERE a.setor = p_setor AND a.turno = p_turno
      AND a.data_local = p_data AND a.produto_id = m.produto_id AND a.op = m.op);
  RETURN jsonb_build_object('apontamentos', painel->'recentes', 'programacao', programacao, 'metas', metas);
END;
$function$;

CREATE OR REPLACE FUNCTION public.finalizar_meta_atingida(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    WHEN 'unidades' THEN COALESCE(a.total_unidades, 0)::numeric
      WHEN 'm²' THEN COALESCE(a.area_m2, a.metragem, 0) ELSE COALESCE(a.metragem, 0) END), 0) INTO produzido
  FROM public.apontamentos a WHERE a.setor = m.setor AND a.produto_id = m.produto_id AND a.op = m.op;
  IF produzido < m.quantidade_meta THEN RAISE EXCEPTION 'A quantidade programada ainda nao foi atingida'; END IF;
  PERFORM public.alterar_status_meta(p_id, 'finalizada');
END;
$function$;

NOTIFY pgrst, 'reload schema';
