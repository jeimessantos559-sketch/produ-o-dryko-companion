-- Permite informar duracao produtiva com horas e minutos (ex.: 9:28).
ALTER TABLE public.metas_turno
  DROP CONSTRAINT IF EXISTS metas_turno_horas_produtivas_check;

ALTER TABLE public.metas_turno
  ALTER COLUMN horas_produtivas TYPE numeric(5,2)
  USING horas_produtivas::numeric;

ALTER TABLE public.metas_turno
  ADD CONSTRAINT metas_turno_horas_produtivas_check
  CHECK (horas_produtivas > 0 AND horas_produtivas <= 24);
