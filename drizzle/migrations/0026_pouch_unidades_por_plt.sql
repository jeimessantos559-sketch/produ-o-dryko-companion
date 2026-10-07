-- Pouch pode ter um padrão de unidades por PLT, sem consumir semi.
-- Padrão vazio mantém os apontamentos diretamente em unidades.
BEGIN;

ALTER TABLE public.produtos DROP CONSTRAINT produtos_liquidos_parametros_check;
ALTER TABLE public.produtos ADD CONSTRAINT produtos_liquidos_parametros_check CHECK (
  (embalagem_liquido IS NULL OR embalagem_liquido IN ('balde','galao','unidade'))
  AND (unidades_por_plt IS NULL OR unidades_por_plt > 0)
  AND (semi_kg_por_unidade IS NULL OR (semi_kg_por_unidade > 0 AND semi_kg_por_unidade <> 'NaN'::numeric))
  AND (embalagem_liquido IS DISTINCT FROM 'unidade' OR semi_kg_por_unidade IS NULL)
);

ALTER TABLE public.apontamentos DROP CONSTRAINT apontamentos_liquidos_check;
ALTER TABLE public.apontamentos ADD CONSTRAINT apontamentos_liquidos_check CHECK (
  setor <> 'liquidos' OR (
    op IS NOT NULL AND btrim(op) <> ''
    AND embalagem_liquido IS NOT NULL AND embalagem_liquido IN ('balde','galao','unidade')
    AND total_unidades IS NOT NULL AND total_unidades > 0
    AND quantidade_plts IS NOT NULL AND quantidade_plts BETWEEN 0 AND 20
    AND picado_unidades IS NOT NULL AND picado_unidades >= 0
    AND semi_consumido_kg IS NOT NULL AND semi_consumido_kg >= 0 AND semi_consumido_kg <> 'NaN'::numeric
    AND (
      (embalagem_liquido='unidade' AND semi_consumido_kg=0 AND semi_kg_por_unidade IS NULL
        AND (
          (unidades_por_plt IS NULL AND quantidade_plts=0 AND picado_unidades=0)
          OR (unidades_por_plt IS NOT NULL AND unidades_por_plt > 0
            AND picado_unidades < unidades_por_plt
            AND total_unidades=quantidade_plts::bigint*unidades_por_plt+picado_unidades)
        ))
      OR (embalagem_liquido IN ('balde','galao') AND unidades_por_plt IS NOT NULL AND unidades_por_plt > 0
        AND semi_kg_por_unidade IS NOT NULL AND semi_kg_por_unidade > 0
        AND picado_unidades < unidades_por_plt
        AND total_unidades=quantidade_plts::bigint*unidades_por_plt+picado_unidades
        AND semi_consumido_kg=round(total_unidades*semi_kg_por_unidade,3))
    )
  )
);

CREATE OR REPLACE FUNCTION public.calcular_liquidos(
  p_produto public.produtos, p_plts integer, p_picado integer, p_unidades integer
) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE plts integer; picado integer; unidades bigint; semi numeric;
BEGIN
  IF p_produto.setor IS DISTINCT FROM 'liquidos' OR p_produto.embalagem_liquido IS NULL THEN
    RAISE EXCEPTION 'Produto sem embalagem de liquidos configurada';
  END IF;
  IF p_produto.embalagem_liquido='unidade' AND p_produto.unidades_por_plt IS NULL THEN
    plts:=0; picado:=0; unidades:=COALESCE(p_unidades,0); semi:=0;
  ELSIF p_produto.embalagem_liquido IN ('balde','galao','unidade') THEN
    IF COALESCE(p_produto.unidades_por_plt,0)<=0 THEN
      RAISE EXCEPTION 'Defina uma quantidade positiva de unidades por PLT no cadastro do produto';
    END IF;
    IF p_produto.embalagem_liquido IN ('balde','galao') AND (
      COALESCE(p_produto.semi_kg_por_unidade,0)<=0 OR p_produto.semi_kg_por_unidade='NaN'::numeric
    ) THEN
      RAISE EXCEPTION 'Defina os kg de semi por unidade no cadastro do produto';
    END IF;
    plts:=COALESCE(p_plts,0); picado:=COALESCE(p_picado,0);
    IF plts NOT BETWEEN 0 AND 20 OR picado < 0 OR picado >= p_produto.unidades_por_plt THEN
      RAISE EXCEPTION 'Informe de 0 a 20 PLTs fechados e um picado menor que um PLT';
    END IF;
    unidades:=plts::bigint*p_produto.unidades_por_plt+picado;
    semi:=CASE WHEN p_produto.embalagem_liquido='unidade' THEN 0
      ELSE round(unidades*p_produto.semi_kg_por_unidade,3) END;
  ELSE RAISE EXCEPTION 'Embalagem de liquidos invalida'; END IF;
  IF unidades<=0 OR unidades>2147483647 THEN
    RAISE EXCEPTION 'Informe uma quantidade de unidades positiva ate 2147483647';
  END IF;
  RETURN jsonb_build_object('plts',plts,'picado',picado,'unidades',unidades,'semi',semi);
END;
$$;

-- Altera apenas o retrato do padrão de pouch nas funções existentes.
-- Mantém permissões, auditoria, datas, sequências e as regras dos demais setores.
DO $$
DECLARE assinatura text; definicao text;
  trecho text := 'CASE WHEN produto.embalagem_liquido=''unidade'' THEN NULL ELSE produto.unidades_por_plt END';
  original text;
BEGIN
  FOREACH assinatura IN ARRAY ARRAY[
    'public.preparar_apontamento()', 'public.corrigir_apontamento(uuid,text,jsonb)'
  ] LOOP
    definicao := pg_get_functiondef(assinatura::regprocedure);
    IF position(trecho IN definicao)>0 THEN
      definicao := replace(definicao, trecho, 'produto.unidades_por_plt');
    ELSIF position('produto.unidades_por_plt' IN definicao)=0 THEN
      RAISE EXCEPTION 'Funcao % sem o retrato esperado de unidades por PLT', assinatura;
    END IF;
    IF assinatura='public.corrigir_apontamento(uuid,text,jsonb)' AND
      position('-- Preserva o padrao historico do pouch.' IN definicao)=0 THEN
      original := '  ELSIF anterior.setor = ''liquidos'' THEN';
      IF position(original IN definicao)=0 THEN
        RAISE EXCEPTION 'Funcao de correcao sem o ramo esperado de liquidos';
      END IF;
      definicao := replace(definicao, original, original || E'\n' ||
        '    -- Preserva o padrao historico do pouch.' || E'\n' ||
        '    IF produto.id=anterior.produto_id AND produto.embalagem_liquido=''unidade''' || E'\n' ||
        '      AND anterior.embalagem_liquido=''unidade'' THEN' || E'\n' ||
        '      produto.unidades_por_plt := anterior.unidades_por_plt;' || E'\n' ||
        '    END IF;');
    END IF;
    EXECUTE definicao;
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
