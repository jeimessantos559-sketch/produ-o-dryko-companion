-- Consolida o catálogo validado no Floot sem sobrescrever prioridades já personalizadas.

UPDATE public.produtos
SET
  categoria = CASE WHEN nome LIKE 'FVD%' THEN 'FVD' ELSE 'DRYKO' END,
  largura = CASE
    WHEN nome IN ('FVD 5', 'DRYKO 5') THEN 5
    WHEN nome IN ('FVD 10', 'DRYKO 10') THEN 10
    WHEN nome IN ('FVD 15', 'DRYKO 15') THEN 15
    WHEN nome IN ('FVD 20', 'DRYKO 20') THEN 20
    WHEN nome IN ('FVD 30', 'DRYKO 30') THEN 30
    WHEN nome IN ('FVD 45', 'DRYKO 45') THEN 45
    WHEN nome IN ('FVD 60', 'DRYKO 60') THEN 60
    WHEN nome IN ('FVD 90', 'DRYKO 90') THEN 90
    ELSE largura
  END
WHERE setor = 'corte';

UPDATE public.produtos
SET rolos_por_plt = 960
WHERE setor = 'corte' AND nome = 'DRYKO 5';

UPDATE public.produtos
SET
  categoria = CASE WHEN nome LIKE 'FVDG%' THEN 'FVDG' ELSE 'FITAG' END,
  largura = 0.93
WHERE setor = 'fitas';

UPDATE public.produtos
SET categoria = upper(categoria)
WHERE setor = 'mantas' AND categoria IS NOT NULL;

INSERT INTO public.marcas_produto (setor, nome, ordem) VALUES
  ('corte', 'FVD', 1),
  ('corte', 'DRYKO', 2),
  ('fitas', 'FVDG', 1),
  ('fitas', 'FITAG', 2),
  ('mantas', 'DRYKO', 1),
  ('mantas', 'DENVER SUPREMA', 2)
ON CONFLICT (setor, nome) DO NOTHING;

CREATE INDEX IF NOT EXISTS marcas_produto_setor_ordem_idx
  ON public.marcas_produto (setor, ordem, nome);
