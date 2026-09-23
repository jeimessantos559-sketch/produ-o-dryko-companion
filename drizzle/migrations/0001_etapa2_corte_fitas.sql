-- Etapa 2: catalogos e apontamentos isolados por setor.
CREATE TABLE public.produtos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setor public.setor_codigo NOT NULL,
  nome TEXT NOT NULL,
  rolos_por_plt INTEGER CHECK (rolos_por_plt IS NULL OR rolos_por_plt > 0),
  largura NUMERIC CHECK (largura IS NULL OR largura > 0),
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (setor, nome)
);

INSERT INTO public.produtos (setor, nome, rolos_por_plt, largura) VALUES
  ('corte', 'FVD 5', 1280, NULL),
  ('corte', 'FVD 10', 640, NULL),
  ('corte', 'FVD 15', 432, NULL),
  ('corte', 'FVD 20', 320, NULL),
  ('corte', 'FVD 30', 216, NULL),
  ('corte', 'FVD 45', 144, NULL),
  ('corte', 'FVD 60', 72, NULL),
  ('corte', 'FVD 90', 72, NULL),
  ('corte', 'DRYKO 5', 980, NULL),
  ('corte', 'DRYKO 10', 480, NULL),
  ('corte', 'DRYKO 15', 288, NULL),
  ('corte', 'DRYKO 20', 240, NULL),
  ('corte', 'DRYKO 30', 168, NULL),
  ('corte', 'DRYKO 45', 112, NULL),
  ('corte', 'DRYKO 60', 56, NULL),
  ('corte', 'DRYKO 90', 56, NULL)
ON CONFLICT (setor, nome) DO UPDATE SET rolos_por_plt = EXCLUDED.rolos_por_plt;

CREATE TABLE public.apontamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES auth.users(id),
  setor public.setor_codigo NOT NULL,
  turno public.turno_codigo NOT NULL,
  op TEXT NOT NULL CHECK (btrim(op) <> ''),
  produto_id UUID NOT NULL REFERENCES public.produtos(id),
  produto_nome TEXT NOT NULL,
  quantidade_plts INTEGER,
  rolos_por_plt INTEGER,
  total_rolos INTEGER,
  largura NUMERIC,
  metragem NUMERIC,
  grupos JSONB,
  tempo NUMERIC,
  velocidade NUMERIC,
  area_m2 NUMERIC,
  data_local DATE NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Sao_Paulo')::date),
  sequencia_inicio INTEGER,
  sequencia_fim INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (setor <> 'corte' OR (quantidade_plts BETWEEN 1 AND 20 AND total_rolos > 0 AND grupos IS NOT NULL)),
  CHECK (setor <> 'fitas' OR (tempo > 0 AND velocidade > 0 AND largura > 0 AND area_m2 > 0))
);

CREATE INDEX apontamentos_turno_idx
  ON public.apontamentos (setor, turno, data_local, created_at DESC);
CREATE INDEX apontamentos_sequencia_idx
  ON public.apontamentos (produto_id, turno, data_local, sequencia_fim DESC);

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
BEGIN
  IF NEW.usuario_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Usuario invalido para o apontamento';
  END IF;

  NEW.created_at := now();
  NEW.data_local := (now() AT TIME ZONE 'America/Sao_Paulo')::date;

  SELECT * INTO produto FROM public.produtos WHERE id = NEW.produto_id AND ativo = true;
  IF NOT FOUND OR produto.setor <> NEW.setor THEN
    RAISE EXCEPTION 'Produto invalido para o setor';
  END IF;
  NEW.produto_nome := produto.nome;

  IF NEW.setor = 'corte' THEN
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
    NEW.quantidade_plts := NULL;
    NEW.rolos_por_plt := NULL;
    NEW.total_rolos := NULL;
    NEW.metragem := NULL;
    NEW.grupos := NULL;
    NEW.sequencia_inicio := NULL;
    NEW.sequencia_fim := NULL;
    NEW.area_m2 := NEW.tempo * NEW.velocidade * NEW.largura;
  ELSE
    RAISE EXCEPTION 'Setor ainda sem regra de apontamento';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER preparar_apontamento_antes_insert
BEFORE INSERT ON public.apontamentos
FOR EACH ROW EXECUTE FUNCTION public.preparar_apontamento();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.produtos TO authenticated;
GRANT ALL ON public.produtos TO service_role;
ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Produtos visiveis para autenticados" ON public.produtos
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.ativo = true AND p.setor_atual = produtos.setor
    ) OR public.has_role(auth.uid(), 'administrador')
  );
CREATE POLICY "Administradores gerenciam produtos" ON public.produtos
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'administrador'))
  WITH CHECK (public.has_role(auth.uid(), 'administrador'));

GRANT SELECT, INSERT ON public.apontamentos TO authenticated;
GRANT ALL ON public.apontamentos TO service_role;
ALTER TABLE public.apontamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Usuario insere no setor atual" ON public.apontamentos
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = usuario_id AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.ativo = true AND p.setor_atual = setor AND p.turno_atual = turno
    )
  );
CREATE POLICY "Usuarios leem apenas o setor atual" ON public.apontamentos
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.ativo = true AND p.setor_atual = setor
    ) OR public.has_role(auth.uid(), 'administrador')
  );
