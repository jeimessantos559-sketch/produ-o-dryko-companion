-- Já aplicada no banco; mantida apenas para portabilidade do repositório.
ALTER TABLE public.ocorrencias_turno ADD COLUMN IF NOT EXISTS hora_inicio time NULL;
ALTER TABLE public.ocorrencias_turno ADD COLUMN IF NOT EXISTS hora_fim time NULL;
ALTER TABLE public.ocorrencias_turno ADD COLUMN IF NOT EXISTS duracao_min integer NULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.ocorrencias_turno'::regclass AND conname = 'ocorrencias_turno_duracao_min_check'
  ) THEN
    ALTER TABLE public.ocorrencias_turno
      ADD CONSTRAINT ocorrencias_turno_duracao_min_check CHECK (duracao_min IS NULL OR (duracao_min >= 0 AND duracao_min <= 1440));
  END IF;
END $$;
