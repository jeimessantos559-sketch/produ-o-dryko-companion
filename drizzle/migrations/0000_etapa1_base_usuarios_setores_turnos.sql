-- Enums base
CREATE TYPE public.app_role AS ENUM ('facilitador', 'autorizado_protheus', 'administrador');
CREATE TYPE public.setor_codigo AS ENUM ('corte', 'fitas', 'mantas', 'asfox', 'misturadores', 'liquidos', 'pos', 'avulsos');
CREATE TYPE public.turno_codigo AS ENUM ('T1', 'T2', 'T3');

-- Setores
CREATE TABLE public.setores (
  codigo public.setor_codigo PRIMARY KEY,
  nome TEXT NOT NULL,
  ordem INTEGER NOT NULL,
  regras_definidas BOOLEAN NOT NULL DEFAULT false
);
GRANT SELECT ON public.setores TO authenticated;
GRANT ALL ON public.setores TO service_role;
ALTER TABLE public.setores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Setores visiveis para autenticados" ON public.setores FOR SELECT TO authenticated USING (true);

INSERT INTO public.setores (codigo, nome, ordem, regras_definidas) VALUES
  ('corte', 'Corte', 1, true),
  ('fitas', 'Fitas', 2, true),
  ('mantas', 'Mantas', 3, false),
  ('asfox', 'Asfox', 4, false),
  ('misturadores', 'Misturadores', 5, false),
  ('liquidos', 'Líquidos', 6, false),
  ('pos', 'Pós', 7, false),
  ('avulsos', 'Avulsos', 8, false);

-- Turnos (sem horarios definidos)
CREATE TABLE public.turnos (
  codigo public.turno_codigo PRIMARY KEY,
  nome TEXT NOT NULL,
  ordem INTEGER NOT NULL
);
GRANT SELECT ON public.turnos TO authenticated;
GRANT ALL ON public.turnos TO service_role;
ALTER TABLE public.turnos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Turnos visiveis para autenticados" ON public.turnos FOR SELECT TO authenticated USING (true);

INSERT INTO public.turnos (codigo, nome, ordem) VALUES
  ('T1', 'Turno 1', 1), ('T2', 'Turno 2', 2), ('T3', 'Turno 3', 3);

-- Perfis
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL DEFAULT '',
  matricula TEXT,
  setor_atual public.setor_codigo,
  turno_atual public.turno_codigo,
  onboarding_concluido BOOLEAN NOT NULL DEFAULT false,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Papeis
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

-- Policies profiles
CREATE POLICY "Usuario le proprio perfil" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id OR public.has_role(auth.uid(), 'administrador'));
CREATE POLICY "Usuario cria proprio perfil" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Usuario atualiza proprio perfil" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id OR public.has_role(auth.uid(), 'administrador'))
  WITH CHECK (auth.uid() = id OR public.has_role(auth.uid(), 'administrador'));

-- Policies user_roles
CREATE POLICY "Usuario le proprios papeis" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'administrador'));

-- Criacao automatica do perfil no cadastro
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, nome)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'nome', ''))
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'facilitador')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();