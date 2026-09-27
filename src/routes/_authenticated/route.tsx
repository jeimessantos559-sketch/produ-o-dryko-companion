import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });

    const [{ data: perfil }, { data: papeis }] = await Promise.all([
      supabase
        .from("profiles")
        .select("ativo, deve_alterar_senha, onboarding_concluido")
        .eq("id", data.user.id)
        .maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", data.user.id),
    ]);
    const perfilOperacional = perfil as
      | { ativo: boolean; deve_alterar_senha?: boolean; onboarding_concluido?: boolean }
      | null;

    if (!perfilOperacional?.ativo || !papeis?.length) {
      await supabase.auth.signOut();
      throw redirect({ to: "/auth" });
    }
    if (perfilOperacional.deve_alterar_senha) {
      throw redirect({ to: "/alterar-senha" });
    }
    if (!perfilOperacional.onboarding_concluido && location.pathname !== "/selecionar") {
      throw redirect({ to: "/selecionar" });
    }
    return { user: data.user };
  },
  component: () => <Outlet />,
});
