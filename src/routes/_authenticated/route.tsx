import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";

type PerfilAcesso = {
  ativo: boolean;
  deve_alterar_senha?: boolean;
  onboarding_concluido?: boolean;
};

type CacheAcesso = {
  userId: string;
  expiresAt: number;
  perfil: PerfilAcesso | null;
};

let cacheAcesso: CacheAcesso | null = null;
const CACHE_ACESSO_MS = 30_000;

async function carregarPerfilAcesso(userId: string) {
  if (cacheAcesso?.userId === userId && cacheAcesso.expiresAt > Date.now()) {
    return cacheAcesso.perfil;
  }
  const { data } = await supabase
    .from("profiles")
    .select("ativo, deve_alterar_senha, onboarding_concluido")
    .eq("id", userId)
    .maybeSingle();
  const perfil = (data as PerfilAcesso | null) ?? null;
  cacheAcesso = { userId, expiresAt: Date.now() + CACHE_ACESSO_MS, perfil };
  return perfil;
}

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.user) throw redirect({ to: "/auth" });

    const perfilOperacional = await carregarPerfilAcesso(data.session.user.id);
    if (!perfilOperacional?.ativo) {
      cacheAcesso = null;
      await supabase.auth.signOut();
      throw redirect({ to: "/auth" });
    }
    if (perfilOperacional.deve_alterar_senha) {
      throw redirect({ to: "/alterar-senha" });
    }
    if (!perfilOperacional.onboarding_concluido && location.pathname !== "/selecionar") {
      throw redirect({ to: "/selecionar" });
    }
    return { user: data.session.user };
  },
  component: () => <Outlet />,
});
