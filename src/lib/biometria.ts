import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Tabelas webauthn_* são acessadas somente pelo servidor (sem policies públicas).
/* eslint-disable @typescript-eslint/no-explicit-any */

async function origemEsperada() {
  const { getRequest } = await import("@tanstack/react-start/server");
  const req = getRequest();
  const origem = req.headers.get("origin") || new URL(req.url).origin;
  const url = new URL(origem);
  return { origin: url.origin, rpID: url.hostname };
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

export const opcoesRegistroBiometria = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { opcoesRegistro } = await import("./webauthn.server");
    const { rpID } = await origemEsperada();
    const db = await admin();
    const { data: perfil } = await db.from("profiles").select("nome, login, ativo").eq("id", context.userId).maybeSingle();
    if (!perfil?.ativo) throw new Error("Usuário inativo.");
    const { data: existentes } = await db.from("webauthn_credenciais").select("credential_id, transports").eq("user_id", context.userId);

    const opcoes = opcoesRegistro({
      rpName: "Aponta Produção DRYKO",
      rpID,
      userId: context.userId,
      userName: perfil.login || perfil.nome || "usuario",
      displayName: perfil.nome || perfil.login || "Usuário",
      excluir: (existentes ?? []).map((c: any) => ({ id: c.credential_id, transports: c.transports })),
    });

    await db.from("webauthn_challenges").delete().eq("user_id", context.userId).eq("tipo", "registro");
    await db.from("webauthn_challenges").insert({ user_id: context.userId, challenge: opcoes.challenge, tipo: "registro" });
    return { json: JSON.stringify(opcoes) };
  });

export const confirmarRegistroBiometria = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ resposta: z.any(), aparelho: z.string().max(200).optional() }))
  .handler(async ({ data, context }) => {
    const { verificarRegistro } = await import("./webauthn.server");
    const { origin, rpID } = await origemEsperada();
    const db = await admin();
    const { data: desafio } = await db.from("webauthn_challenges")
      .select("id, challenge").eq("user_id", context.userId).eq("tipo", "registro")
      .gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!desafio) throw new Error("Solicitação expirada. Tente novamente.");
    await db.from("webauthn_challenges").delete().eq("id", desafio.id);

    let cred: Awaited<ReturnType<typeof verificarRegistro>>;
    try {
      cred = await verificarRegistro(data.resposta, desafio.challenge, origin, rpID);
    } catch (erro) {
      console.error("webauthn registro", erro);
      throw new Error("Não foi possível validar a biometria.");
    }
    const { error } = await db.from("webauthn_credenciais").insert({
      user_id: context.userId,
      credential_id: cred.credentialId,
      public_key: cred.publicKey,
      counter: cred.contador,
      transports: cred.transports,
      aparelho: data.aparelho ?? null,
    });
    if (error) throw new Error("Não foi possível salvar a biometria.");
    return { credentialId: cred.credentialId };
  });

export const statusBiometria = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin();
    const { data } = await db.from("webauthn_credenciais").select("credential_id").eq("user_id", context.userId);
    return { credenciais: (data ?? []).map((c: any) => c.credential_id as string) };
  });

export const removerBiometria = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ credentialId: z.string().min(1).max(1024) }))
  .handler(async ({ data, context }) => {
    const db = await admin();
    await db.from("webauthn_credenciais").delete().eq("user_id", context.userId).eq("credential_id", data.credentialId);
    return { ok: true };
  });

export const opcoesLoginBiometria = createServerFn({ method: "POST" }).handler(async () => {
  const { opcoesLogin } = await import("./webauthn.server");
  const { rpID } = await origemEsperada();
  const limite = await import("./limite-tentativas.server");
  await limite.verificarLimite("biometria", null);
  await limite.limparSegurancaExpirada();
  const db = await admin();
  const opcoes = opcoesLogin(rpID);
  const { data: desafio, error } = await db.from("webauthn_challenges")
    .insert({ challenge: opcoes.challenge, tipo: "login" }).select("id").single();
  if (error) throw new Error("Biometria indisponível no momento.");
  return { desafioId: desafio.id as string, opcoesJson: JSON.stringify(opcoes) };
});

export const entrarComBiometria = createServerFn({ method: "POST" })
  .validator(z.object({ desafioId: z.string().uuid(), resposta: z.any() }))
  .handler(async ({ data }) => {
    const limite = await import("./limite-tentativas.server");
    const credIdTentativa = String(data.resposta?.id ?? "").slice(0, 1024) || null;
    const tentativa = await limite.verificarLimite("biometria", credIdTentativa);
    try {
      const r = await loginBiometrico(data);
      await limite.limparFalhasUsuario(tentativa);
      return r;
    } catch (erro) {
      if (erro instanceof Error && erro.message === "Biometria não reconhecida. Entre com usuário e senha.") await limite.registrarFalha(tentativa);
      throw erro;
    }
  });

async function loginBiometrico(data: { desafioId: string; resposta: any }) {
    const { verificarLogin } = await import("./webauthn.server");
    const { origin, rpID } = await origemEsperada();
    const db = await admin();
    const falha = "Biometria não reconhecida. Entre com usuário e senha.";

    const { data: desafio } = await db.from("webauthn_challenges")
      .select("id, challenge").eq("id", data.desafioId).eq("tipo", "login")
      .gt("expires_at", new Date().toISOString()).maybeSingle();
    if (!desafio) throw new Error("Solicitação expirada. Tente novamente.");
    await db.from("webauthn_challenges").delete().eq("id", desafio.id);

    const credId = String(data.resposta?.id ?? "");
    const { data: cred } = await db.from("webauthn_credenciais").select("*").eq("credential_id", credId).maybeSingle();
    if (!cred) throw new Error(falha);

    let novoContador: number;
    try {
      ({ novoContador } = await verificarLogin(data.resposta, desafio.challenge, origin, rpID, {
        publicKey: cred.public_key, contador: Number(cred.counter), userId: cred.user_id,
      }));
    } catch (erro) {
      console.error("webauthn login", erro);
      throw new Error(falha);
    }
    await db.from("webauthn_credenciais")
      .update({ counter: novoContador, last_used_at: new Date().toISOString() })
      .eq("id", cred.id);

    const { data: perfil } = await db.from("profiles")
      .select("ativo, deve_alterar_senha, onboarding_concluido").eq("id", cred.user_id).maybeSingle();
    if (!perfil?.ativo) throw new Error("Usuário inativo. Procure o administrador.");

    const { data: usuario } = await db.auth.admin.getUserById(cred.user_id);
    const email = usuario?.user?.email;
    if (!email) throw new Error(falha);
    const { data: link, error: erroLink } = await db.auth.admin.generateLink({ type: "magiclink", email });
    const tokenHash = link?.properties?.hashed_token;
    if (erroLink || !tokenHash) throw new Error("Não foi possível entrar agora.");

    const url = process.env["SUPABASE_URL"];
    const chave = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!url || !chave) throw new Error("Autenticação indisponível no momento.");
    const { createClient } = await import("@supabase/supabase-js");
    const cliente = createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: sessao, error } = await cliente.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
    if (error || !sessao.session) throw new Error("Não foi possível entrar agora.");

    return {
      accessToken: sessao.session.access_token,
      refreshToken: sessao.session.refresh_token,
      deveAlterarSenha: Boolean(perfil.deve_alterar_senha),
      onboardingConcluido: Boolean(perfil.onboarding_concluido),
    };
  }
