import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { normalizarLogin } from "@/lib/login-operacional";
import {
  limparTentativasAutenticacao,
  registrarTentativaAutenticacao,
} from "@/lib/limite-autenticacao";

const SENHA_INICIAL = "123456";

const entrada = z.object({
  login: z.string().trim().min(2).max(80),
  senha: z.string().min(6).max(200),
});

type PerfilLogin = {
  id: string;
  login: string | null;
  login_key: string | null;
  ativo: boolean;
  deve_alterar_senha: boolean;
  onboarding_concluido: boolean;
};

export const entrarComLogin = createServerFn({ method: "POST" })
  .validator(entrada)
  .handler(async ({ data }) => {
    const chave = normalizarLogin(data.login);
    if (!chave) throw new Error("Usuário ou senha inválidos.");

    const limite = await registrarTentativaAutenticacao({
      acao: "login_senha",
      identificador: chave,
      maxTentativas: 8,
      janelaSegundos: 15 * 60,
      bloqueioSegundos: 15 * 60,
    });
    if (limite.bloqueado) {
      throw new Error("Muitas tentativas de acesso. Aguarde 15 minutos e tente novamente.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: perfil, error: erroPerfil } = await supabaseAdmin
      .from("profiles")
      .select("id, login, login_key, ativo, deve_alterar_senha, onboarding_concluido")
      .eq("login_key", chave)
      .eq("ativo", true)
      .maybeSingle();

    if (erroPerfil) throw new Error("Não foi possível entrar agora.");
    if (!perfil) throw new Error("Usuário ou senha inválidos.");

    const perfilLogin = perfil as PerfilLogin;
    const { data: usuario, error: erroUsuario } = await supabaseAdmin.auth.admin.getUserById(
      perfilLogin.id,
    );
    const email = usuario.user?.email;
    if (erroUsuario || !email) throw new Error("Usuário ou senha inválidos.");

    const SUPABASE_URL = process.env["SUPABASE_URL"];
    const SUPABASE_PUBLISHABLE_KEY = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY)
      throw new Error("Autenticação indisponível no momento.");

    const { createClient } = await import("@supabase/supabase-js");
    const cliente = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    if (perfilLogin.deve_alterar_senha && data.senha === SENHA_INICIAL) {
      const { data: link, error: erroLink } = await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email,
      });
      const tokenHash = link?.properties?.hashed_token;
      if (erroLink || !tokenHash) throw new Error("Não foi possível iniciar o primeiro acesso.");

      const { data: sessaoInicial, error: erroVerificacao } = await cliente.auth.verifyOtp({
        type: "magiclink",
        token_hash: tokenHash,
      });
      if (erroVerificacao || !sessaoInicial.session)
        throw new Error("Não foi possível iniciar o primeiro acesso.");

      await limparTentativasAutenticacao("login_senha", limite.chave);

      return {
        accessToken: sessaoInicial.session.access_token,
        refreshToken: sessaoInicial.session.refresh_token,
        deveAlterarSenha: true,
        onboardingConcluido: perfilLogin.onboarding_concluido,
      };
    }

    const { data: sessao, error: erroLogin } = await cliente.auth.signInWithPassword({
      email,
      password: data.senha,
    });
    if (erroLogin || !sessao.session) throw new Error("Usuário ou senha inválidos.");

    await limparTentativasAutenticacao("login_senha", limite.chave);

    return {
      accessToken: sessao.session.access_token,
      refreshToken: sessao.session.refresh_token,
      deveAlterarSenha: perfilLogin.deve_alterar_senha,
      onboardingConcluido: perfilLogin.onboarding_concluido,
    };
  });
