import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const entrada = z.object({
  email: z.string().email(),
  nome: z.string().trim().min(2),
  senha: z.string().min(6),
});

export const criarUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(entrada)
  .handler(async ({ data, context }) => {
    const { data: admin } = await context.supabase.rpc("eh_admin_ativo", {
      _user_id: context.userId,
    });
    if (!admin) throw new Error("Apenas administradores podem criar usuários.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: criado, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email.toLowerCase(),
      password: data.senha,
      email_confirm: true,
      user_metadata: { nome: data.nome },
    });
    if (error || !criado.user) {
      throw new Error(error?.message || "Não foi possível criar o usuário.");
    }

    await supabaseAdmin
      .from("profiles")
      .update({ nome: data.nome, ativo: true })
      .eq("id", criado.user.id);
    return { id: criado.user.id };
  });
