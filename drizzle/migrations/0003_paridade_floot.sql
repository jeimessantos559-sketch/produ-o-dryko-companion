-- Paridade funcional com o fluxo validado no Floot.
-- Esta migracao e aditiva: preserva usuarios, produtos e apontamentos existentes.

CREATE TYPE public.apontamento_status AS ENUM ('pendente', 'lancado');
CREATE TYPE public.meta_status AS ENUM ('ativa', 'finalizada');
CREATE TYPE public.fechamento_status AS ENUM ('fechado', 'reaberto');
CREATE TYPE public.envio_status AS ENUM ('aguardando', 'enviando', 'enviado', 'falhou');

ALTER TABLE public.profiles
  ADD COLUMN pode_gerenciar_produtos BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN pode_confirmar_protheus BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.apontamentos
  ADD COLUMN status public.apontamento_status NOT NULL DEFAULT 'pendente',
  ADD COLUMN lancado_por UUID REFERENCES auth.users(id),
  ADD COLUMN lancado_em TIMESTAMPTZ,
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX apontamentos_status_idx
  ON public.apontamentos (setor, status, data_local, created_at DESC);
CREATE INDEX apontamentos_op_idx
  ON public.apontamentos (setor, op, produto_id, data_local DESC);

UPDATE public.produtos SET categoria = 'FVD' WHERE setor = 'corte' AND nome LIKE 'FVD%';
UPDATE public.produtos SET categoria = 'DRYKO' WHERE setor = 'corte' AND nome LIKE 'DRYKO%';
UPDATE public.produtos SET categoria = 'FVDG' WHERE setor = 'fitas' AND nome LIKE 'FVDG%';
UPDATE public.produtos SET categoria = 'FITAG' WHERE setor = 'fitas' AND nome LIKE 'FITAG%';
UPDATE public.produtos SET categoria = upper(categoria) WHERE setor = 'mantas' AND categoria IS NOT NULL;

CREATE TABLE public.marcas_produto (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setor public.setor_codigo NOT NULL,
  nome TEXT NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (setor, nome)
);

INSERT INTO public.marcas_produto (setor, nome, ordem) VALUES
  ('corte', 'FVD', 1),
  ('corte', 'DRYKO', 2),
  ('fitas', 'FVDG', 1),
  ('fitas', 'FITAG', 2),
  ('mantas', 'DRYKO', 1),
  ('mantas', 'DENVER SUPREMA', 2)
ON CONFLICT (setor, nome) DO UPDATE SET ordem = EXCLUDED.ordem;

CREATE TABLE public.metas_op (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setor public.setor_codigo NOT NULL,
  op TEXT NOT NULL CHECK (btrim(op) <> ''),
  produto_id UUID NOT NULL REFERENCES public.produtos(id),
  produto_nome TEXT NOT NULL,
  unidade TEXT NOT NULL CHECK (unidade IN ('PLTs', 'm²')),
  quantidade_meta NUMERIC NOT NULL CHECK (quantidade_meta > 0),
  status public.meta_status NOT NULL DEFAULT 'ativa',
  criado_por UUID NOT NULL REFERENCES auth.users(id),
  finalizado_por UUID REFERENCES auth.users(id),
  finalizado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX metas_op_ativa_unica_idx
  ON public.metas_op (setor, op, produto_id)
  WHERE status = 'ativa';
CREATE INDEX metas_op_setor_status_idx ON public.metas_op (setor, status, created_at DESC);

CREATE TABLE public.meta_auditoria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meta_id UUID NOT NULL REFERENCES public.metas_op(id) ON DELETE CASCADE,
  setor public.setor_codigo NOT NULL,
  usuario_id UUID NOT NULL REFERENCES auth.users(id),
  acao TEXT NOT NULL CHECK (acao IN ('finalizacao', 'reabertura')),
  dados_anteriores JSONB NOT NULL,
  dados_novos JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX meta_auditoria_meta_idx ON public.meta_auditoria (meta_id, created_at DESC);

CREATE TABLE public.apontamento_auditoria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  apontamento_id UUID NOT NULL REFERENCES public.apontamentos(id) ON DELETE CASCADE,
  setor public.setor_codigo NOT NULL,
  usuario_id UUID NOT NULL REFERENCES auth.users(id),
  acao TEXT NOT NULL CHECK (acao IN ('correcao', 'confirmacao_protheus')),
  justificativa TEXT,
  dados_anteriores JSONB NOT NULL,
  dados_novos JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX apontamento_auditoria_apontamento_idx
  ON public.apontamento_auditoria (apontamento_id, created_at DESC);

CREATE TABLE public.fechamentos_turno (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setor public.setor_codigo NOT NULL,
  turno public.turno_codigo NOT NULL,
  data_local DATE NOT NULL,
  status public.fechamento_status NOT NULL DEFAULT 'fechado',
  resumo JSONB NOT NULL DEFAULT '{}'::jsonb,
  fechado_por UUID NOT NULL REFERENCES auth.users(id),
  fechado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  reaberto_por UUID REFERENCES auth.users(id),
  reaberto_em TIMESTAMPTZ,
  justificativa_reabertura TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (setor, turno, data_local)
);

CREATE INDEX fechamentos_turno_setor_idx
  ON public.fechamentos_turno (setor, data_local DESC, turno);

CREATE TABLE public.relatorios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fechamento_id UUID NOT NULL UNIQUE REFERENCES public.fechamentos_turno(id) ON DELETE CASCADE,
  setor public.setor_codigo NOT NULL,
  turno public.turno_codigo NOT NULL,
  data_local DATE NOT NULL,
  resumo JSONB NOT NULL,
  criado_por UUID NOT NULL REFERENCES auth.users(id),
  status_envio public.envio_status NOT NULL DEFAULT 'aguardando',
  destinatarios TEXT[] NOT NULL DEFAULT '{}',
  tentativas_envio INTEGER NOT NULL DEFAULT 0,
  enviado_em TIMESTAMPTZ,
  erro_envio TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX relatorios_setor_data_idx ON public.relatorios (setor, data_local DESC, turno);

CREATE TABLE public.problemas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES auth.users(id),
  setor public.setor_codigo,
  tela TEXT NOT NULL CHECK (btrim(tela) <> ''),
  descricao TEXT NOT NULL CHECK (btrim(descricao) <> ''),
  foto_url TEXT,
  resolvido BOOLEAN NOT NULL DEFAULT false,
  resolvido_por UUID REFERENCES auth.users(id),
  resolvido_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX problemas_status_idx ON public.problemas (resolvido, created_at DESC);

CREATE OR REPLACE FUNCTION public.eh_admin_ativo(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = _user_id AND p.ativo = true
      AND public.has_role(_user_id, 'administrador')
  )
$$;

CREATE OR REPLACE FUNCTION public.pode_gerenciar_produtos(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.eh_admin_ativo(_user_id) OR COALESCE((
    SELECT pode_gerenciar_produtos FROM public.profiles
    WHERE id = _user_id AND ativo = true
  ), false)
$$;

CREATE OR REPLACE FUNCTION public.pode_confirmar_protheus(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.eh_admin_ativo(_user_id) OR COALESCE((
    SELECT public.has_role(_user_id, 'autorizado_protheus') OR pode_confirmar_protheus
    FROM public.profiles WHERE id = _user_id AND ativo = true
  ), false)
$$;

GRANT EXECUTE ON FUNCTION public.eh_admin_ativo(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pode_gerenciar_produtos(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pode_confirmar_protheus(UUID) TO authenticated;

DROP POLICY "Administradores gerenciam produtos" ON public.produtos;
DROP POLICY "Produtos visiveis para autenticados" ON public.produtos;
CREATE POLICY "Produtos visiveis para usuarios do setor" ON public.produtos
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.ativo = true AND p.setor_atual = produtos.setor
    ) OR public.pode_gerenciar_produtos(auth.uid())
  );
CREATE POLICY "Usuarios autorizados gerenciam produtos" ON public.produtos
  FOR ALL TO authenticated
  USING (public.pode_gerenciar_produtos(auth.uid()))
  WITH CHECK (public.pode_gerenciar_produtos(auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.marcas_produto TO authenticated;
GRANT ALL ON public.marcas_produto TO service_role;
ALTER TABLE public.marcas_produto ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Marcas visiveis para autenticados" ON public.marcas_produto
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Usuarios autorizados gerenciam marcas" ON public.marcas_produto
  FOR ALL TO authenticated
  USING (public.pode_gerenciar_produtos(auth.uid()))
  WITH CHECK (public.pode_gerenciar_produtos(auth.uid()));

GRANT SELECT, INSERT ON public.metas_op TO authenticated;
GRANT ALL ON public.metas_op TO service_role;
ALTER TABLE public.metas_op ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Metas visiveis no setor atual" ON public.metas_op
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.ativo = true AND p.setor_atual = metas_op.setor
    ) OR public.has_role(auth.uid(), 'administrador')
  );
CREATE POLICY "Usuarios criam metas no setor atual" ON public.metas_op
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = criado_por AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.ativo = true AND p.setor_atual = metas_op.setor
    )
  );
CREATE POLICY "Autorizados atualizam metas" ON public.metas_op
  FOR UPDATE TO authenticated
  USING (public.pode_confirmar_protheus(auth.uid()))
  WITH CHECK (public.pode_confirmar_protheus(auth.uid()));

GRANT SELECT ON public.meta_auditoria TO authenticated;
GRANT ALL ON public.meta_auditoria TO service_role;
ALTER TABLE public.meta_auditoria ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auditoria de metas visivel no setor atual" ON public.meta_auditoria
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.ativo = true AND p.setor_atual = meta_auditoria.setor
    ) OR public.has_role(auth.uid(), 'administrador')
  );

CREATE OR REPLACE FUNCTION public.auditar_meta_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.meta_auditoria (
      meta_id, setor, usuario_id, acao, dados_anteriores, dados_novos
    ) VALUES (
      NEW.id,
      NEW.setor,
      COALESCE(auth.uid(), NEW.finalizado_por, NEW.criado_por),
      CASE WHEN NEW.status = 'finalizada' THEN 'finalizacao' ELSE 'reabertura' END,
      to_jsonb(OLD),
      to_jsonb(NEW)
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER auditar_meta_status_apos_update
AFTER UPDATE OF status ON public.metas_op
FOR EACH ROW EXECUTE FUNCTION public.auditar_meta_status();

CREATE OR REPLACE FUNCTION public.alterar_status_meta(p_meta_id UUID, p_status public.meta_status)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meta public.metas_op%ROWTYPE;
BEGIN
  IF NOT public.pode_confirmar_protheus(auth.uid()) THEN
    RAISE EXCEPTION 'Usuario sem permissao para finalizar ou reabrir metas';
  END IF;
  SELECT * INTO meta FROM public.metas_op WHERE id = p_meta_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Meta nao encontrada'; END IF;
  IF NOT public.has_role(auth.uid(), 'administrador') AND NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.ativo = true AND p.setor_atual = meta.setor
  ) THEN
    RAISE EXCEPTION 'Meta fora do setor atual';
  END IF;
  IF meta.status = p_status THEN RETURN; END IF;

  UPDATE public.metas_op SET
    status = p_status,
    finalizado_por = CASE WHEN p_status = 'finalizada' THEN auth.uid() ELSE NULL END,
    finalizado_em = CASE WHEN p_status = 'finalizada' THEN now() ELSE NULL END,
    updated_at = now()
  WHERE id = p_meta_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.alterar_status_meta(UUID, public.meta_status) TO authenticated;

GRANT SELECT ON public.apontamento_auditoria TO authenticated;
GRANT ALL ON public.apontamento_auditoria TO service_role;
ALTER TABLE public.apontamento_auditoria ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auditoria visivel no setor atual" ON public.apontamento_auditoria
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.ativo = true AND p.setor_atual = apontamento_auditoria.setor
    ) OR public.has_role(auth.uid(), 'administrador')
  );

GRANT SELECT, INSERT, UPDATE ON public.fechamentos_turno TO authenticated;
GRANT ALL ON public.fechamentos_turno TO service_role;
ALTER TABLE public.fechamentos_turno ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Fechamentos visiveis no setor atual" ON public.fechamentos_turno
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.ativo = true AND p.setor_atual = fechamentos_turno.setor
    ) OR public.has_role(auth.uid(), 'administrador')
  );

GRANT SELECT, INSERT, UPDATE ON public.relatorios TO authenticated;
GRANT ALL ON public.relatorios TO service_role;
ALTER TABLE public.relatorios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Relatorios visiveis no setor atual" ON public.relatorios
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.ativo = true AND p.setor_atual = relatorios.setor
    ) OR public.has_role(auth.uid(), 'administrador')
  );
CREATE POLICY "Criadores e autorizados atualizam relatorios" ON public.relatorios
  FOR UPDATE TO authenticated
  USING (auth.uid() = criado_por OR public.pode_confirmar_protheus(auth.uid()))
  WITH CHECK (auth.uid() = criado_por OR public.pode_confirmar_protheus(auth.uid()));

GRANT SELECT, INSERT, UPDATE ON public.problemas TO authenticated;
GRANT ALL ON public.problemas TO service_role;
ALTER TABLE public.problemas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Usuario cria proprio problema" ON public.problemas
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = usuario_id);
CREATE POLICY "Usuario ve proprio problema ou administrador ve todos" ON public.problemas
  FOR SELECT TO authenticated USING (
    auth.uid() = usuario_id OR public.has_role(auth.uid(), 'administrador')
  );
CREATE POLICY "Administrador resolve problemas" ON public.problemas
  FOR UPDATE TO authenticated
  USING (public.eh_admin_ativo(auth.uid()))
  WITH CHECK (public.eh_admin_ativo(auth.uid()));

REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (nome, matricula, setor_atual, turno_atual, onboarding_concluido) ON public.profiles TO authenticated;

DROP POLICY "Usuario le proprio perfil" ON public.profiles;
CREATE POLICY "Usuarios autenticados leem perfis operacionais" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

GRANT INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
CREATE POLICY "Administradores inserem papeis" ON public.user_roles
  FOR INSERT TO authenticated WITH CHECK (public.eh_admin_ativo(auth.uid()));
CREATE POLICY "Administradores atualizam papeis" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (public.eh_admin_ativo(auth.uid()))
  WITH CHECK (public.eh_admin_ativo(auth.uid()));
CREATE POLICY "Administradores removem papeis" ON public.user_roles
  FOR DELETE TO authenticated USING (public.eh_admin_ativo(auth.uid()));

CREATE OR REPLACE FUNCTION public.gerenciar_usuario(
  p_usuario_id UUID,
  p_ativo BOOLEAN,
  p_pode_gerenciar_produtos BOOLEAN,
  p_pode_confirmar_protheus BOOLEAN,
  p_papeis public.app_role[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  papel public.app_role;
BEGIN
  IF NOT public.eh_admin_ativo(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas administradores podem gerenciar usuarios';
  END IF;
  IF p_usuario_id = auth.uid() AND (
    NOT p_ativo OR NOT ('administrador'::public.app_role = ANY(COALESCE(p_papeis, ARRAY[]::public.app_role[])))
  ) THEN
    RAISE EXCEPTION 'O administrador nao pode remover o proprio acesso';
  END IF;

  UPDATE public.profiles SET
    ativo = p_ativo,
    pode_gerenciar_produtos = p_pode_gerenciar_produtos,
    pode_confirmar_protheus = p_pode_confirmar_protheus,
    updated_at = now()
  WHERE id = p_usuario_id;

  DELETE FROM public.user_roles WHERE user_id = p_usuario_id;
  FOREACH papel IN ARRAY COALESCE(p_papeis, ARRAY[]::public.app_role[])
  LOOP
    INSERT INTO public.user_roles (user_id, role)
    VALUES (p_usuario_id, papel)
    ON CONFLICT (user_id, role) DO NOTHING;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.gerenciar_usuario(UUID, BOOLEAN, BOOLEAN, BOOLEAN, public.app_role[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.confirmar_apontamentos_protheus(p_ids UUID[])
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  apontamento public.apontamentos%ROWTYPE;
  dados_antes JSONB;
  dados_depois JSONB;
  p_id UUID;
  total INTEGER := 0;
BEGIN
  IF NOT public.pode_confirmar_protheus(auth.uid()) THEN
    RAISE EXCEPTION 'Usuario sem permissao para confirmar no Protheus';
  END IF;

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
$$;

GRANT EXECUTE ON FUNCTION public.confirmar_apontamentos_protheus(UUID[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.corrigir_apontamento(
  p_id UUID,
  p_justificativa TEXT,
  p_dados JSONB
)
RETURNS public.apontamentos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  anterior public.apontamentos%ROWTYPE;
  corrigido public.apontamentos%ROWTYPE;
  produto public.produtos%ROWTYPE;
  grupo JSONB;
  qtd INTEGER;
  padrao INTEGER;
  picado INTEGER;
  total_plts_calc INTEGER := 0;
  total_rolos_calc INTEGER := 0;
  nova_metragem NUMERIC;
  novos_grupos JSONB;
  admin BOOLEAN;
BEGIN
  IF btrim(COALESCE(p_justificativa, '')) = '' THEN
    RAISE EXCEPTION 'Informe a justificativa da correcao';
  END IF;

  SELECT * INTO anterior FROM public.apontamentos WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Apontamento nao encontrado'; END IF;

  admin := public.eh_admin_ativo(auth.uid());
  IF NOT admin AND anterior.status = 'lancado' THEN
    RAISE EXCEPTION 'Somente o administrador corrige apontamento lancado';
  END IF;
  IF NOT admin AND NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.ativo = true AND p.setor_atual = anterior.setor
  ) THEN
    RAISE EXCEPTION 'Apontamento fora do setor atual';
  END IF;

  SELECT * INTO produto FROM public.produtos WHERE id = anterior.produto_id;

  IF anterior.setor = 'corte' THEN
    novos_grupos := COALESCE(p_dados->'grupos', anterior.grupos);
    IF jsonb_typeof(novos_grupos) <> 'array' OR jsonb_array_length(novos_grupos) = 0 THEN
      RAISE EXCEPTION 'Informe os grupos de PLTs';
    END IF;
    FOR grupo IN SELECT * FROM jsonb_array_elements(novos_grupos)
    LOOP
      qtd := (grupo->>'quantidadePlts')::INTEGER;
      padrao := (grupo->>'rolosPorPlt')::INTEGER;
      picado := NULLIF(grupo->>'pltPicadoRolos', '')::INTEGER;
      IF qtd < 1 OR padrao < 1 OR (picado IS NOT NULL AND (picado < 1 OR picado >= padrao)) THEN
        RAISE EXCEPTION 'Grupo de PLTs invalido';
      END IF;
      total_plts_calc := total_plts_calc + qtd;
      total_rolos_calc := total_rolos_calc + ((qtd - CASE WHEN picado IS NULL THEN 0 ELSE 1 END) * padrao) + COALESCE(picado, 0);
    END LOOP;
    IF total_plts_calc NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'Limite de 1 a 20 PLTs'; END IF;

    UPDATE public.apontamentos SET
      op = COALESCE(NULLIF(btrim(p_dados->>'op'), ''), anterior.op),
      grupos = novos_grupos,
      quantidade_plts = total_plts_calc,
      total_rolos = total_rolos_calc,
      metragem = CASE WHEN produto.largura IS NULL THEN NULL ELSE produto.largura * total_rolos_calc / 10 END,
      status = CASE WHEN anterior.status = 'lancado' THEN 'pendente'::public.apontamento_status ELSE anterior.status END,
      lancado_por = CASE WHEN anterior.status = 'lancado' THEN NULL ELSE anterior.lancado_por END,
      lancado_em = CASE WHEN anterior.status = 'lancado' THEN NULL ELSE anterior.lancado_em END,
      updated_at = now()
    WHERE id = p_id RETURNING * INTO corrigido;
  ELSIF anterior.setor = 'fitas' THEN
    UPDATE public.apontamentos SET
      op = COALESCE(NULLIF(btrim(p_dados->>'op'), ''), anterior.op),
      tempo = COALESCE((p_dados->>'tempo')::NUMERIC, anterior.tempo),
      velocidade = COALESCE((p_dados->>'velocidade')::NUMERIC, anterior.velocidade),
      largura = COALESCE((p_dados->>'largura')::NUMERIC, anterior.largura),
      area_m2 = COALESCE((p_dados->>'tempo')::NUMERIC, anterior.tempo)
        * COALESCE((p_dados->>'velocidade')::NUMERIC, anterior.velocidade)
        * COALESCE((p_dados->>'largura')::NUMERIC, anterior.largura),
      status = CASE WHEN anterior.status = 'lancado' THEN 'pendente'::public.apontamento_status ELSE anterior.status END,
      lancado_por = CASE WHEN anterior.status = 'lancado' THEN NULL ELSE anterior.lancado_por END,
      lancado_em = CASE WHEN anterior.status = 'lancado' THEN NULL ELSE anterior.lancado_em END,
      updated_at = now()
    WHERE id = p_id RETURNING * INTO corrigido;
  ELSIF anterior.setor = 'mantas' THEN
    nova_metragem := COALESCE((p_dados->>'metragem')::NUMERIC, anterior.metragem);
    IF nova_metragem <= 0 OR mod(nova_metragem, COALESCE(produto.metros_por_rolo, 10)) <> 0 THEN
      RAISE EXCEPTION 'Metragem invalida para rolos inteiros';
    END IF;
    UPDATE public.apontamentos SET
      op = COALESCE(NULLIF(btrim(p_dados->>'op'), ''), anterior.op),
      lote = COALESCE(NULLIF(btrim(p_dados->>'lote'), ''), anterior.lote),
      quantidade_plts = COALESCE((p_dados->>'quantidade_plts')::INTEGER, anterior.quantidade_plts),
      metragem = nova_metragem,
      total_rolos = (nova_metragem / COALESCE(produto.metros_por_rolo, 10))::INTEGER,
      status = CASE WHEN anterior.status = 'lancado' THEN 'pendente'::public.apontamento_status ELSE anterior.status END,
      lancado_por = CASE WHEN anterior.status = 'lancado' THEN NULL ELSE anterior.lancado_por END,
      lancado_em = CASE WHEN anterior.status = 'lancado' THEN NULL ELSE anterior.lancado_em END,
      updated_at = now()
    WHERE id = p_id RETURNING * INTO corrigido;
  ELSE
    RAISE EXCEPTION 'Setor sem regra de correcao';
  END IF;

  INSERT INTO public.apontamento_auditoria (
    apontamento_id, setor, usuario_id, acao, justificativa, dados_anteriores, dados_novos
  ) VALUES (
    p_id, anterior.setor, auth.uid(), 'correcao', btrim(p_justificativa), to_jsonb(anterior), to_jsonb(corrigido)
  );
  RETURN corrigido;
END;
$$;

GRANT EXECUTE ON FUNCTION public.corrigir_apontamento(UUID, TEXT, JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.fechar_turno(
  p_setor public.setor_codigo,
  p_turno public.turno_codigo,
  p_data DATE,
  p_resumo JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fechamento_id UUID;
  relatorio_id UUID;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.ativo = true
      AND (public.has_role(auth.uid(), 'administrador') OR (p.setor_atual = p_setor AND p.turno_atual = p_turno))
  ) THEN
    RAISE EXCEPTION 'Setor ou turno diferente do perfil atual';
  END IF;

  INSERT INTO public.fechamentos_turno (
    setor, turno, data_local, status, resumo, fechado_por, fechado_em,
    reaberto_por, reaberto_em, justificativa_reabertura
  ) VALUES (
    p_setor, p_turno, p_data, 'fechado', p_resumo, auth.uid(), now(), NULL, NULL, NULL
  )
  ON CONFLICT (setor, turno, data_local) DO UPDATE SET
    status = 'fechado', resumo = EXCLUDED.resumo, fechado_por = auth.uid(), fechado_em = now(),
    reaberto_por = NULL, reaberto_em = NULL, justificativa_reabertura = NULL, updated_at = now()
  WHERE public.fechamentos_turno.status = 'reaberto'
  RETURNING id INTO fechamento_id;

  IF fechamento_id IS NULL THEN RAISE EXCEPTION 'Este turno ja esta fechado'; END IF;

  INSERT INTO public.relatorios (fechamento_id, setor, turno, data_local, resumo, criado_por)
  VALUES (fechamento_id, p_setor, p_turno, p_data, p_resumo, auth.uid())
  ON CONFLICT (fechamento_id) DO UPDATE SET
    resumo = EXCLUDED.resumo, criado_por = auth.uid(), status_envio = 'aguardando',
    erro_envio = NULL, updated_at = now()
  RETURNING id INTO relatorio_id;

  RETURN relatorio_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fechar_turno(public.setor_codigo, public.turno_codigo, DATE, JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.reabrir_turno(p_fechamento_id UUID, p_justificativa TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.eh_admin_ativo(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas o administrador pode reabrir o turno';
  END IF;
  IF btrim(COALESCE(p_justificativa, '')) = '' THEN
    RAISE EXCEPTION 'Informe a justificativa da reabertura';
  END IF;
  UPDATE public.fechamentos_turno SET
    status = 'reaberto', reaberto_por = auth.uid(), reaberto_em = now(),
    justificativa_reabertura = btrim(p_justificativa), updated_at = now()
  WHERE id = p_fechamento_id AND status = 'fechado';
  IF NOT FOUND THEN RAISE EXCEPTION 'Turno fechado nao encontrado'; END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reabrir_turno(UUID, TEXT) TO authenticated;

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
  NEW.updated_at := now();
  NEW.data_local := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  NEW.op := NULLIF(btrim(NEW.op), '');
  NEW.lote := NULLIF(btrim(NEW.lote), '');
  NEW.status := 'pendente';
  NEW.lancado_por := NULL;
  NEW.lancado_em := NULL;

  IF EXISTS (
    SELECT 1 FROM public.fechamentos_turno f
    WHERE f.setor = NEW.setor AND f.turno = NEW.turno AND f.data_local = NEW.data_local AND f.status = 'fechado'
  ) THEN
    RAISE EXCEPTION 'O turno esta fechado. Solicite a reabertura ao administrador';
  END IF;

  SELECT * INTO produto FROM public.produtos WHERE id = NEW.produto_id AND ativo = true;
  IF NOT FOUND OR produto.setor <> NEW.setor THEN
    RAISE EXCEPTION 'Produto invalido para o setor';
  END IF;
  NEW.produto_nome := produto.nome;

  IF NEW.setor = 'corte' THEN
    IF NEW.op IS NULL THEN RAISE EXCEPTION 'Informe a OP'; END IF;
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
    IF total_plts_calculado NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'A quantidade deve ficar entre 1 e 20 PLTs'; END IF;

    NEW.lote := NULL;
    NEW.quantidade_plts := total_plts_calculado;
    NEW.rolos_por_plt := COALESCE(NEW.rolos_por_plt, produto.rolos_por_plt);
    NEW.total_rolos := total_rolos_calculado;
    NEW.largura := produto.largura;
    NEW.metragem := CASE WHEN produto.largura IS NULL THEN NULL ELSE produto.largura * total_rolos_calculado / 10 END;
    NEW.tempo := NULL;
    NEW.velocidade := NULL;
    NEW.area_m2 := NULL;
  ELSIF NEW.setor = 'fitas' THEN
    IF NEW.op IS NULL THEN RAISE EXCEPTION 'Informe a OP'; END IF;
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
    NEW.area_m2 := NEW.tempo * NEW.velocidade * NEW.largura;
    NEW.sequencia_inicio := NULL;
    NEW.sequencia_fim := NULL;
    RETURN NEW;
  ELSIF NEW.setor = 'mantas' THEN
    IF NEW.op IS NULL THEN RAISE EXCEPTION 'Informe a OP'; END IF;
    IF NEW.lote IS NULL THEN RAISE EXCEPTION 'Informe o lote'; END IF;
    IF COALESCE(NEW.quantidade_plts, 0) < 1 THEN RAISE EXCEPTION 'A quantidade de PLTs deve ser maior que zero'; END IF;
    IF COALESCE(NEW.metragem, 0) <= 0 THEN RAISE EXCEPTION 'A metragem deve ser maior que zero'; END IF;
    metros_por_rolo_calculado := COALESCE(produto.metros_por_rolo, 10);
    IF mod(NEW.metragem, metros_por_rolo_calculado) <> 0 THEN
      RAISE EXCEPTION 'A metragem deve formar uma quantidade inteira de rolos';
    END IF;
    NEW.rolos_por_plt := produto.rolos_por_plt;
    NEW.total_rolos := (NEW.metragem / metros_por_rolo_calculado)::INTEGER;
    NEW.largura := NULL;
    NEW.grupos := NULL;
    NEW.tempo := NULL;
    NEW.velocidade := NULL;
    NEW.area_m2 := NULL;
  ELSE
    RAISE EXCEPTION 'Setor ainda sem regra de apontamento';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.produto_id::text || NEW.turno::text || NEW.data_local::text, 0));
  SELECT COALESCE(MAX(sequencia_fim), 0) + 1 INTO proxima_sequencia
    FROM public.apontamentos
    WHERE produto_id = NEW.produto_id AND turno = NEW.turno AND data_local = NEW.data_local;
  NEW.sequencia_inicio := proxima_sequencia;
  NEW.sequencia_fim := proxima_sequencia + COALESCE(NEW.quantidade_plts, 1) - 1;
  RETURN NEW;
END;
$$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('problemas', 'problemas', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Usuarios enviam fotos de problemas" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'problemas' AND (storage.foldername(name))[1] = auth.uid()::text
  );
CREATE POLICY "Fotos de problemas sao visiveis" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'problemas');
