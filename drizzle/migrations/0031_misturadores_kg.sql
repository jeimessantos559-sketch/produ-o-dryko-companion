-- Misturadores: apontamento por OP + produto com o peso total produzido em kg.
-- O peso fica em coluna própria (peso_kg); não reaproveita o semi de Líquidos/Asfox.
-- Mantém permissões, horário, locks e auditoria das funções existentes.
BEGIN;

ALTER TABLE public.apontamentos ADD COLUMN IF NOT EXISTS peso_kg numeric(12,3);

ALTER TABLE public.apontamentos DROP CONSTRAINT IF EXISTS apontamentos_misturadores_check;
ALTER TABLE public.apontamentos ADD CONSTRAINT apontamentos_misturadores_check CHECK (
  (setor = 'misturadores'
    AND op IS NOT NULL AND btrim(op) <> ''
    AND peso_kg IS NOT NULL AND peso_kg > 0 AND peso_kg <> 'NaN'::numeric)
  OR (setor <> 'misturadores' AND peso_kg IS NULL)
);

-- Inclui o ramo de Misturadores no cadastro e na correção, sem reescrever as funções.
DO $$
DECLARE definicao text; trecho text; novo_trecho text;
BEGIN
  definicao := pg_get_functiondef('public.preparar_apontamento()'::regprocedure);
  IF position('''misturadores''' IN definicao) = 0 THEN
    trecho := E'  ELSE\n    RAISE EXCEPTION ''Setor ainda sem regra de apontamento'';';
    IF position(trecho IN definicao) = 0 THEN
      RAISE EXCEPTION 'preparar_apontamento sem o ramo final esperado';
    END IF;
    novo_trecho := E'  ELSIF NEW.setor = ''misturadores'' THEN\n'
      || E'    IF NEW.op IS NULL THEN RAISE EXCEPTION ''Informe a OP''; END IF;\n'
      || E'    IF NEW.peso_kg IS NULL OR NEW.peso_kg <= 0 OR NEW.peso_kg = ''NaN''::numeric OR NEW.peso_kg > 999999.999 THEN\n'
      || E'      RAISE EXCEPTION ''Informe o peso produzido em kg'';\n'
      || E'    END IF;\n'
      || E'    NEW.peso_kg := round(NEW.peso_kg, 3);\n'
      || E'    NEW.lote := NULL; NEW.quantidade_plts := NULL; NEW.rolos_por_plt := NULL; NEW.total_rolos := NULL;\n'
      || E'    NEW.largura := NULL; NEW.metragem := NULL; NEW.area_m2 := NULL; NEW.tempo := NULL; NEW.velocidade := NULL;\n'
      || E'    NEW.grupos := NULL; NEW.embalagem_liquido := NULL; NEW.unidades_por_plt := NULL;\n'
      || E'    NEW.semi_kg_por_unidade := NULL; NEW.picado_unidades := NULL; NEW.total_unidades := NULL;\n'
      || E'    NEW.semi_consumido_kg := NULL; NEW.sequencia_inicio := NULL; NEW.sequencia_fim := NULL;\n'
      || E'    RETURN NEW;\n'
      || trecho;
    EXECUTE replace(definicao, trecho, novo_trecho);
  END IF;

  definicao := pg_get_functiondef('public.corrigir_apontamento(uuid,text,jsonb)'::regprocedure);
  IF position('''misturadores''' IN definicao) = 0 THEN
    trecho := E'  liquido jsonb;\nBEGIN';
    IF position(trecho IN definicao) = 0 THEN
      RAISE EXCEPTION 'corrigir_apontamento sem a declaracao esperada';
    END IF;
    definicao := replace(definicao, trecho, E'  liquido jsonb;\n  novo_peso numeric;\nBEGIN');
    trecho := E'  ELSE RAISE EXCEPTION ''Setor sem regra de correcao''; END IF;';
    IF position(trecho IN definicao) = 0 THEN
      RAISE EXCEPTION 'corrigir_apontamento sem o ramo final esperado';
    END IF;
    novo_trecho := E'  ELSIF anterior.setor = ''misturadores'' THEN\n'
      || E'    novo_peso := COALESCE((p_dados->>''peso_kg'')::numeric, anterior.peso_kg);\n'
      || E'    IF novo_peso IS NULL OR novo_peso <= 0 OR novo_peso = ''NaN''::numeric OR novo_peso > 999999.999 THEN\n'
      || E'      RAISE EXCEPTION ''Informe o peso produzido em kg'';\n'
      || E'    END IF;\n'
      || E'    UPDATE public.apontamentos SET op = referencia, lote = NULL, produto_id = produto.id, produto_nome = produto.nome,\n'
      || E'      peso_kg = round(novo_peso, 3),\n'
      || E'      status = ''pendente'', lancado_por = NULL, lancado_em = NULL, updated_at = now()\n'
      || E'    WHERE id = p_id RETURNING * INTO corrigido;\n'
      || trecho;
    EXECUTE replace(definicao, trecho, novo_trecho);
  END IF;
END;
$$;

INSERT INTO public.marcas_produto (setor, nome, ordem)
VALUES ('misturadores', 'COMPOUND', 1) ON CONFLICT (setor, nome) DO NOTHING;

INSERT INTO public.produtos (setor, nome, categoria)
VALUES ('misturadores', 'Compound Adesiva', 'COMPOUND'),
       ('misturadores', 'Compound W-11', 'COMPOUND')
ON CONFLICT (setor, nome) DO NOTHING;

UPDATE public.setores SET regras_definidas = true WHERE codigo = 'misturadores';

NOTIFY pgrst, 'reload schema';
COMMIT;
