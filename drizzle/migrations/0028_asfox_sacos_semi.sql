-- Asfox SC: 100 unidades por PLT, sacos de 10 kg, com consumo de semi.
-- Reutiliza a conversão e as validações de Líquidos sem alterar seus históricos.
BEGIN;

ALTER TABLE public.produtos DROP CONSTRAINT produtos_liquidos_parametros_check;
ALTER TABLE public.produtos ADD CONSTRAINT produtos_liquidos_parametros_check CHECK (
  (embalagem_liquido IS NULL OR embalagem_liquido IN ('balde','galao','unidade','saco'))
  AND (embalagem_liquido IS DISTINCT FROM 'saco' OR setor='asfox')
  AND (unidades_por_plt IS NULL OR unidades_por_plt > 0)
  AND (semi_kg_por_unidade IS NULL OR (semi_kg_por_unidade > 0 AND semi_kg_por_unidade <> 'NaN'::numeric))
);

ALTER TABLE public.produtos ADD CONSTRAINT produtos_asfox_parametros_check CHECK (
  setor <> 'asfox' OR (
    embalagem_liquido IS NOT NULL AND embalagem_liquido='saco'
    AND unidades_por_plt IS NOT NULL AND unidades_por_plt > 0
    AND semi_kg_por_unidade IS NOT NULL AND semi_kg_por_unidade > 0
    AND semi_kg_por_unidade <> 'NaN'::numeric
  )
);

ALTER TABLE public.apontamentos ADD CONSTRAINT apontamentos_asfox_check CHECK (
  setor <> 'asfox' OR (
    op IS NOT NULL AND btrim(op) <> ''
    AND embalagem_liquido IS NOT NULL AND embalagem_liquido='saco'
    AND unidades_por_plt IS NOT NULL AND unidades_por_plt > 0
    AND semi_kg_por_unidade IS NOT NULL AND semi_kg_por_unidade > 0
    AND semi_kg_por_unidade <> 'NaN'::numeric
    AND quantidade_plts IS NOT NULL AND quantidade_plts BETWEEN 0 AND 20
    AND picado_unidades IS NOT NULL AND picado_unidades >= 0 AND picado_unidades < unidades_por_plt
    AND total_unidades IS NOT NULL AND total_unidades > 0
    AND total_unidades=quantidade_plts::bigint*unidades_por_plt+picado_unidades
    AND semi_consumido_kg IS NOT NULL AND semi_consumido_kg > 0 AND semi_consumido_kg <> 'NaN'::numeric
    AND semi_consumido_kg=round(total_unidades*semi_kg_por_unidade,3)
  )
);

CREATE OR REPLACE FUNCTION public.calcular_liquidos(
  p_produto public.produtos, p_plts integer, p_picado integer, p_unidades integer
) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE plts integer; picado integer; unidades bigint; semi numeric;
BEGIN
  IF p_produto.setor IS NULL OR p_produto.embalagem_liquido IS NULL OR NOT (
    (p_produto.setor='liquidos' AND p_produto.embalagem_liquido IN ('balde','galao','unidade'))
    OR (p_produto.setor='asfox' AND p_produto.embalagem_liquido='saco')
  ) THEN
    RAISE EXCEPTION 'Produto sem embalagem configurada para o setor';
  END IF;
  IF COALESCE(p_produto.semi_kg_por_unidade,0)<=0 OR p_produto.semi_kg_por_unidade='NaN'::numeric THEN
    RAISE EXCEPTION 'Defina o peso por unidade em kg no cadastro do produto';
  END IF;
  IF p_produto.embalagem_liquido='unidade' AND p_produto.unidades_por_plt IS NULL THEN
    plts:=0; picado:=0; unidades:=COALESCE(p_unidades,0);
  ELSE
    IF COALESCE(p_produto.unidades_por_plt,0)<=0 THEN
      RAISE EXCEPTION 'Defina uma quantidade positiva de unidades por PLT no cadastro do produto';
    END IF;
    plts:=COALESCE(p_plts,0); picado:=COALESCE(p_picado,0);
    IF plts NOT BETWEEN 0 AND 20 OR picado < 0 OR picado >= p_produto.unidades_por_plt THEN
      RAISE EXCEPTION 'Informe de 0 a 20 PLTs fechados e um picado menor que um PLT';
    END IF;
    unidades:=plts::bigint*p_produto.unidades_por_plt+picado;
  END IF;
  IF unidades<=0 OR unidades>2147483647 THEN
    RAISE EXCEPTION 'Informe uma quantidade de unidades positiva ate 2147483647';
  END IF;
  semi:=round(unidades*p_produto.semi_kg_por_unidade,3);
  RETURN jsonb_build_object('plts',plts,'picado',picado,'unidades',unidades,'semi',semi);
END;
$$;

-- Amplia somente o ramo de conversão; mantém permissões, horário, locks e auditoria.
DO $$
DECLARE assinatura text; definicao text; trecho text; novo_trecho text;
BEGIN
  FOREACH assinatura IN ARRAY ARRAY[
    'public.preparar_apontamento()', 'public.corrigir_apontamento(uuid,text,jsonb)'
  ] LOOP
    trecho := CASE WHEN assinatura='public.preparar_apontamento()'
      THEN 'ELSIF NEW.setor = ''liquidos'' THEN'
      ELSE 'ELSIF anterior.setor = ''liquidos'' THEN' END;
    novo_trecho := replace(trecho, '= ''liquidos''', 'IN (''liquidos'',''asfox'')');
    definicao := pg_get_functiondef(assinatura::regprocedure);
    IF position(trecho IN definicao)=0 THEN
      RAISE EXCEPTION 'Funcao % sem o ramo esperado de liquidos', assinatura;
    END IF;
    EXECUTE replace(definicao, trecho, novo_trecho);
  END LOOP;
END;
$$;

INSERT INTO public.marcas_produto (setor,nome,ordem)
VALUES ('asfox','ASFOX',1) ON CONFLICT (setor,nome) DO NOTHING;

INSERT INTO public.produtos (setor,nome,categoria,embalagem_liquido,unidades_por_plt,semi_kg_por_unidade)
VALUES ('asfox','Asfox SC','ASFOX','saco',100,10) ON CONFLICT (setor,nome) DO NOTHING;

UPDATE public.setores SET regras_definidas=true WHERE codigo='asfox';

NOTIFY pgrst, 'reload schema';
COMMIT;
