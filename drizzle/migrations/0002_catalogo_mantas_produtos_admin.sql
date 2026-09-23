-- Etapa 3: catalogos de Fitas e Mantas, apontamento de Mantas e cadastro de produtos.
ALTER TABLE public.produtos
  ADD COLUMN categoria TEXT,
  ADD COLUMN metragem_por_plt NUMERIC CHECK (metragem_por_plt IS NULL OR metragem_por_plt > 0),
  ADD COLUMN metros_por_rolo NUMERIC CHECK (metros_por_rolo IS NULL OR metros_por_rolo > 0);

UPDATE public.produtos
SET rolos_por_plt = 960
WHERE setor = 'corte' AND nome = 'DRYKO 5';

INSERT INTO public.produtos (setor, nome, largura) VALUES
  ('fitas', 'FVDG', 0.93),
  ('fitas', 'FITAG', 0.93),
  ('fitas', 'FVDG TERRA', 0.93),
  ('fitas', 'FITAG TERRA', 0.93),
  ('fitas', 'FVDG CINZA', 0.93),
  ('fitas', 'FITAG CINZA', 0.93)
ON CONFLICT (setor, nome) DO UPDATE SET
  largura = EXCLUDED.largura,
  ativo = true;

INSERT INTO public.produtos (
  setor,
  nome,
  categoria,
  rolos_por_plt,
  metragem_por_plt,
  metros_por_rolo
) VALUES
  ('mantas', 'P4top', 'Dryko', 20, 200, 10),
  ('mantas', 'P3top', 'Dryko', 25, 250, 10),
  ('mantas', 'Polialum3', 'Dryko', 25, 250, 10),
  ('mantas', 'Polialum4', 'Dryko', 20, 200, 10),
  ('mantas', 'Polialum3VF', 'Dryko', 25, 250, 10),
  ('mantas', 'Polialum4Vf', 'Dryko', 20, 200, 10),
  ('mantas', 'PR3PP', 'Dryko', 25, 250, 10),
  ('mantas', 'PR4PP', 'Dryko', 20, 200, 10),
  ('mantas', 'P4top-sop', 'Denver Suprema', 20, 200, 10),
  ('mantas', 'P3top-sop', 'Denver Suprema', 25, 250, 10),
  ('mantas', 'Polialum3-sop', 'Denver Suprema', 25, 250, 10),
  ('mantas', 'Polialum4-sop', 'Denver Suprema', 20, 200, 10),
  ('mantas', 'Pr3pp-sop', 'Denver Suprema', 25, 250, 10),
  ('mantas', 'Pr4pp-sop', 'Denver Suprema', 20, 200, 10)
ON CONFLICT (setor, nome) DO UPDATE SET
  categoria = EXCLUDED.categoria,
  rolos_por_plt = EXCLUDED.rolos_por_plt,
  metragem_por_plt = EXCLUDED.metragem_por_plt,
  metros_por_rolo = EXCLUDED.metros_por_rolo,
  ativo = true;

UPDATE public.setores
SET regras_definidas = true
WHERE codigo = 'mantas';

ALTER TABLE public.apontamentos
  ALTER COLUMN op DROP NOT NULL,
  ADD COLUMN lote TEXT,
  ADD CONSTRAINT apontamentos_identificador_por_setor_check CHECK (
    (setor IN ('corte', 'fitas') AND op IS NOT NULL AND btrim(op) <> '')
    OR (setor = 'mantas' AND lote IS NOT NULL AND btrim(lote) <> '')
    OR setor NOT IN ('corte', 'fitas', 'mantas')
  ),
  ADD CONSTRAINT apontamentos_mantas_check CHECK (
    setor <> 'mantas'
    OR (
      quantidade_plts > 0
      AND metragem > 0
      AND total_rolos > 0
      AND lote IS NOT NULL
      AND btrim(lote) <> ''
    )
  );

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
  total_plts_calculado INTEGER := 0;
  total_rolos_calculado INTEGER := 0;
  proxima_sequencia INTEGER;
  metros_por_rolo_calculado NUMERIC;
BEGIN
  IF NEW.usuario_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Usuario invalido para o apontamento';
  END IF;

  NEW.created_at := now();
  NEW.data_local := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  NEW.op := NULLIF(btrim(NEW.op), '');
  NEW.lote := NULLIF(btrim(NEW.lote), '');

  SELECT * INTO produto FROM public.produtos WHERE id = NEW.produto_id AND ativo = true;
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
      qtd := (grupo->>'quantidadePlts')::INTEGER;
      padrao := (grupo->>'rolosPorPlt')::INTEGER;
      picado := NULLIF(grupo->>'pltPicadoRolos', '')::INTEGER;
      IF qtd < 1 OR padrao < 1 OR (picado IS NOT NULL AND (picado < 1 OR picado >= padrao)) THEN
        RAISE EXCEPTION 'Grupo de PLTs invalido';
      END IF;
      total_plts_calculado := total_plts_calculado + qtd;
      total_rolos_calculado := total_rolos_calculado + ((qtd - CASE WHEN picado IS NULL THEN 0 ELSE 1 END) * padrao) + COALESCE(picado, 0);
    END LOOP;
    IF total_plts_calculado NOT BETWEEN 1 AND 20 THEN
      RAISE EXCEPTION 'A quantidade deve ficar entre 1 e 20 PLTs';
    END IF;

    NEW.lote := NULL;
    NEW.quantidade_plts := total_plts_calculado;
    NEW.rolos_por_plt := COALESCE(NEW.rolos_por_plt, produto.rolos_por_plt);
    NEW.total_rolos := total_rolos_calculado;
    NEW.largura := produto.largura;
    NEW.metragem := CASE WHEN produto.largura IS NULL THEN NULL ELSE produto.largura * total_rolos_calculado / 10 END;
    NEW.tempo := NULL;
    NEW.velocidade := NULL;
    NEW.area_m2 := NULL;

    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.produto_id::text || NEW.turno::text || NEW.data_local::text, 0));
    SELECT COALESCE(MAX(sequencia_fim), 0) + 1 INTO proxima_sequencia
      FROM public.apontamentos
      WHERE produto_id = NEW.produto_id AND turno = NEW.turno AND data_local = NEW.data_local;
    NEW.sequencia_inicio := proxima_sequencia;
    NEW.sequencia_fim := proxima_sequencia + total_plts_calculado - 1;
  ELSIF NEW.setor = 'fitas' THEN
    IF NEW.op IS NULL THEN
      RAISE EXCEPTION 'Informe a OP';
    END IF;
    NEW.lote := NULL;
    NEW.largura := COALESCE(NEW.largura, produto.largura);
    IF COALESCE(NEW.tempo, 0) <= 0 OR COALESCE(NEW.velocidade, 0) <= 0 OR COALESCE(NEW.largura, 0) <= 0 THEN
      RAISE EXCEPTION 'Tempo, velocidade e largura devem ser maiores que zero';
    END IF;
    NEW.quantidade_plts := NULL;
    NEW.rolos_por_plt := NULL;
    NEW.total_rolos := NULL;
    NEW.metragem := NULL;
    NEW.grupos := NULL;
    NEW.sequencia_inicio := NULL;
    NEW.sequencia_fim := NULL;
    NEW.area_m2 := NEW.tempo * NEW.velocidade * NEW.largura;
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

    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.produto_id::text || NEW.turno::text || NEW.data_local::text, 0));
    SELECT COALESCE(MAX(sequencia_fim), 0) + 1 INTO proxima_sequencia
      FROM public.apontamentos
      WHERE produto_id = NEW.produto_id AND turno = NEW.turno AND data_local = NEW.data_local;
    NEW.sequencia_inicio := proxima_sequencia;
    NEW.sequencia_fim := proxima_sequencia + NEW.quantidade_plts - 1;
  ELSE
    RAISE EXCEPTION 'Setor ainda sem regra de apontamento';
  END IF;
  RETURN NEW;
END;
$$;
