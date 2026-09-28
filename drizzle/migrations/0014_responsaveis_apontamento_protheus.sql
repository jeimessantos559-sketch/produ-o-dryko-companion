-- Rastreabilidade nominal dos apontamentos e lançamentos no Protheus.
-- Mantém o UUID para integridade e grava também o nome como fotografia histórica.

ALTER TABLE public.apontamentos
  ADD COLUMN IF NOT EXISTS apontado_por_nome text,
  ADD COLUMN IF NOT EXISTS lancado_por_nome text;

UPDATE public.apontamentos a
SET apontado_por_nome = p.nome
FROM public.profiles p
WHERE p.id = a.usuario_id
  AND a.apontado_por_nome IS NULL;

UPDATE public.apontamentos a
SET lancado_por_nome = p.nome
FROM public.profiles p
WHERE p.id = a.lancado_por
  AND a.lancado_por IS NOT NULL
  AND a.lancado_por_nome IS NULL;

CREATE OR REPLACE FUNCTION public.preencher_nomes_responsaveis_apontamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  nome_usuario text;
BEGIN
  IF TG_OP = 'INSERT' OR NEW.usuario_id IS DISTINCT FROM OLD.usuario_id THEN
    SELECT p.nome INTO nome_usuario
    FROM public.profiles p
    WHERE p.id = NEW.usuario_id;
    NEW.apontado_por_nome := COALESCE(nome_usuario, NEW.apontado_por_nome, 'Usuário');
  END IF;

  IF NEW.lancado_por IS NULL THEN
    NEW.lancado_por_nome := NULL;
  ELSIF TG_OP = 'INSERT' OR NEW.lancado_por IS DISTINCT FROM OLD.lancado_por THEN
    SELECT p.nome INTO nome_usuario
    FROM public.profiles p
    WHERE p.id = NEW.lancado_por;
    NEW.lancado_por_nome := COALESCE(nome_usuario, NEW.lancado_por_nome, 'Usuário');
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_apontamentos_nomes_responsaveis ON public.apontamentos;
CREATE TRIGGER trg_apontamentos_nomes_responsaveis
BEFORE INSERT OR UPDATE OF usuario_id, lancado_por
ON public.apontamentos
FOR EACH ROW
EXECUTE FUNCTION public.preencher_nomes_responsaveis_apontamento();

CREATE OR REPLACE FUNCTION public.confirmar_apontamentos_protheus(p_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  apontamento public.apontamentos%ROWTYPE;
  dados_antes JSONB;
  dados_depois JSONB;
  p_id UUID;
  total INTEGER := 0;
  nome_lancador text;
BEGIN
  IF NOT public.pode_confirmar_protheus(auth.uid()) THEN
    RAISE EXCEPTION 'Usuario sem permissao para confirmar no Protheus';
  END IF;

  SELECT p.nome INTO nome_lancador
  FROM public.profiles p
  WHERE p.id = auth.uid();

  FOREACH p_id IN ARRAY p_ids
  LOOP
    SELECT * INTO apontamento FROM public.apontamentos WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Apontamento nao encontrado';
    END IF;
    IF apontamento.status = 'lancado' THEN
      CONTINUE;
    END IF;
    IF NOT public.has_role(auth.uid(), 'administrador') AND NOT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.ativo = true AND p.setor_atual = apontamento.setor
    ) THEN
      RAISE EXCEPTION 'Apontamento fora do setor atual';
    END IF;

    dados_antes := to_jsonb(apontamento);

    UPDATE public.apontamentos SET
      status = 'lancado',
      lancado_por = auth.uid(),
      lancado_por_nome = COALESCE(nome_lancador, 'Usuário'),
      lancado_em = now(),
      updated_at = now()
    WHERE id = p_id
    RETURNING * INTO apontamento;

    dados_depois := to_jsonb(apontamento);

    INSERT INTO public.apontamento_auditoria (
      apontamento_id, setor, usuario_id, acao, dados_anteriores, dados_novos
    ) VALUES (
      p_id, apontamento.setor, auth.uid(), 'confirmacao_protheus', dados_antes, dados_depois
    );
    total := total + 1;
  END LOOP;
  RETURN total;
END;
$function$;
