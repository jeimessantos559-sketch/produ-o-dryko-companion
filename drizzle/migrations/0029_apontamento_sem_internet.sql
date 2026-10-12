-- Apontamento feito sem internet no aparelho do facilitador.
--
-- Regra anterior (docs/db/20260930044600_ajuste_horario_apontamento.sql): o horário
-- da produção é sempre o momento em que o registro chega ao banco.
-- Esta migração mantém essa regra para o envio normal e acrescenta uma exceção
-- controlada: quando o aplicativo guardou o apontamento sem conexão, vale a hora
-- em que o facilitador salvou no aparelho (registrado_offline_em), desde que:
--   * não esteja no futuro (tolerância de 5 minutos para o relógio do aparelho);
--   * o envio aconteça em até 12 horas;
--   * o horário pertença ao turno e o turno não esteja fechado (validado depois,
--     pelo gatilho preparar_apontamento, como em qualquer apontamento).
-- O registro fica marcado pela própria coluna, para aparecer como "sem internet".
-- Idempotente.

ALTER TABLE public.apontamentos
  ADD COLUMN IF NOT EXISTS registrado_offline_em TIMESTAMPTZ;

COMMENT ON COLUMN public.apontamentos.registrado_offline_em IS
  'Momento em que o apontamento foi salvo no aparelho sem internet; NULL para envio normal.';

CREATE OR REPLACE FUNCTION public.forcar_horario_atual_apontamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.registrado_offline_em IS NULL THEN
    NEW.data_hora_producao := date_trunc('minute', now() AT TIME ZONE 'America/Sao_Paulo');
    RETURN NEW;
  END IF;

  IF NEW.registrado_offline_em > now() + INTERVAL '5 minutes' THEN
    RAISE EXCEPTION 'O horario do apontamento sem internet nao pode estar no futuro';
  END IF;

  IF NEW.registrado_offline_em < now() - INTERVAL '12 hours' THEN
    RAISE EXCEPTION 'Apontamento sem internet enviado depois do prazo de 12 horas';
  END IF;

  NEW.data_hora_producao := date_trunc(
    'minute',
    NEW.registrado_offline_em AT TIME ZONE 'America/Sao_Paulo'
  );
  RETURN NEW;
END;
$function$;

-- O gatilho "00_forcar_horario_atual" (BEFORE INSERT) já existe e continua o mesmo;
-- recriado aqui só para a migração funcionar também num banco novo.
DROP TRIGGER IF EXISTS "00_forcar_horario_atual" ON public.apontamentos;
CREATE TRIGGER "00_forcar_horario_atual"
BEFORE INSERT ON public.apontamentos
FOR EACH ROW EXECUTE FUNCTION public.forcar_horario_atual_apontamento();
