import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { aliasDoNome, normalizarLogin } from "@/lib/login-operacional";

const entrada = z.object({
  login: z.string().trim().min(2).max(80),
  senha: z.string().min(6).max(200),
});

type PerfilLogin = {
  id: string;
  nome: string;
  login: string | null;
  login_key: string | null;
  ativo: boolean;
  deve_alterar_senha: boolean;
};

export const entrarComLogin = createServerFn({ method: "POST" })
  .validator(entrada)
  .handler(async ({ data }) => {
    const chave = normalizarLogin(data.login);
    if (!chave) throw new Error("Usuário ou senha inválidos.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: perfis, error: erroPerfis } = await (supabaseAdmin.from("profiles") as any)
      .select("id, nome, login, login_key, ativo, deve_alterar_senha")
      .eq("ativo", true);

    if (erroPerfis) throw new Error("Não foi possível entrar agora.");

    const lista = (perfis ?? []) as PerfilLogin[];
    const perfil = lista.find((item) => item.login_key === chave)
      ?? lista.find((item) => aliasDoNome(item.nome) === chave);

    if (!perfil) throw new Error("Usuário ou senha inválidos.");

    const { data: usuario, error: erroUsuario } = await supabaseAdmin.auth.admin.getUserById(perfil.id);
    const email = usuario.user?.email;
    if (erroUsuario || !email) throw new Error("Usuário ou senha inválidos.");

    const SUPABASE_URL = process.env["SUPABASE_URL"];
    const SUPABASE_PUBLISHABLE_KEY = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
      throw new Error("Autenticação indisponível no momento.");
    }

    const { createClient } = await import("@supabase/supabase-js");
    const cliente = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: sessao, error: erroLogin } = await cliente.auth.signInWithPassword({
      email,
      password: data.senha,
    });

    if (erroLogin || !sessao.session) throw new Error("Usuário ou senha inválidos.");

    return {
      accessToken: sessao.session.access_token,
      refreshToken: sessao.session.refresh_token,
      deveAlterarSenha: perfil.deve_alterar_senha,
    };
  });
