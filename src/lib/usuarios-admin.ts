import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { emailInternoDoLogin, normalizarLogin } from "@/lib/login-operacional";

const entrada = z.object({
  login: z.string().trim().min(2).max(80),
  nome: z.string().trim().min(2),
  senha: z.string().min(6).max(200),
});

export const criarUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(entrada)
  .handler(async ({ data, context }) => {
    const { data: admin } = await context.supabase.rpc("eh_admin_ativo", {
      _user_id: context.userId,
    });
    if (!admin) throw new Error("Apenas administradores podem criar usuários.");

    const loginKey = normalizarLogin(data.login);
    if (!loginKey) throw new Error("Informe um login válido.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existente } = await (supabaseAdmin.from("profiles") as any)
      .select("id")
      .eq("login_key", loginKey)
      .maybeSingle();
    if (existente) throw new Error("Este login já está cadastrado.");

    const emailInterno = emailInternoDoLogin(loginKey);
    const { data: criado, error } = await supabaseAdmin.auth.admin.createUser({
      email: emailInterno,
      password: data.senha,
      email_confirm: true,
      user_metadata: {
        nome: data.nome,
        login: data.login.trim(),
        login_key: loginKey,
        deve_alterar_senha: true,
      },
    });
    if (error || !criado.user) {
      if (error?.message?.toLowerCase().includes("already")) {
        throw new Error("Este login já está cadastrado.");
      }
      throw new Error(error?.message || "Não foi possível criar o usuário.");
    }

    const { error: erroPerfil } = await (supabaseAdmin.from("profiles") as any)
      .update({
        nome: data.nome,
        login: data.login.trim(),
        login_key: loginKey,
        deve_alterar_senha: true,
        ativo: true,
      })
      .eq("id", criado.user.id);

    if (erroPerfil) {
      await supabaseAdmin.auth.admin.deleteUser(criado.user.id);
      throw new Error("Não foi possível concluir o cadastro do usuário.");
    }

    return { id: criado.user.id, login: data.login.trim() };
  });
