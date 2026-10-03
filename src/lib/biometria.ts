import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  limparTentativasAutenticacao,
  registrarTentativaAutenticacao,
} from "@/lib/limite-autenticacao";

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
    const { generateRegistrationOptions } = await import("@simplewebauthn/server");
    const { rpID } = await origemEsperada();
    const db = await admin();
    const { data: perfil } = await db
      .from("profiles")
      .select("nome, login, ativo")
      .eq("id", context.userId)
      .maybeSingle();
    if (!perfil?.ativo) throw new Error("Usuário inativo.");
    const { data: existentes } = await db
      .from("webauthn_credenciais")
      .select("credential_id, transports")
      .eq("user_id", context.userId);

    const opcoes = await generateRegistrationOptions({
      rpName: "Aponta Produção DRYKO",
      rpID,
      userName: perfil.login || perfil.nome || "usuario",
      userDisplayName: perfil.nome || perfil.login || "Usuário",
      userID: new TextEncoder().encode(context.userId),
      attestationType: "none",
      excludeCredentials: (existentes ?? []).map((c: any) => ({
        id: c.credential_id,
        transports: c.transports ?? undefined,
      })),
      authenticatorSelection: {
        residentKey: "required",
        requireResidentKey: true,
        userVerification: "required",
      },
    });

    await db
      .from("webauthn_challenges")
      .delete()
      .eq("user_id", context.userId)
      .eq("tipo", "registro");
    await db
      .from("webauthn_challenges")
      .insert({ user_id: context.userId, challenge: opcoes.challenge, tipo: "registro" });
    return { json: JSON.stringify(opcoes) };
  });

export const confirmarRegistroBiometria = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ resposta: z.any(), aparelho: z.string().max(200).optional() }))
  .handler(async ({ data, context }) => {
    const { verifyRegistrationResponse } = await import("@simplewebauthn/server");
    const { isoBase64URL } = await import("@simplewebauthn/server/helpers");
    const { origin, rpID } = await origemEsperada();
    const db = await admin();
    const { data: desafio } = await db
      .from("webauthn_challenges")
      .select("id, challenge")
      .eq("user_id", context.userId)
      .eq("tipo", "registro")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!desafio) throw new Error("Solicitação expirada. Tente novamente.");
    await db.from("webauthn_challenges").delete().eq("id", desafio.id);

    const verificacao = await verifyRegistrationResponse({
      response: data.resposta,
      expectedChallenge: desafio.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });
    if (!verificacao.verified || !verificacao.registrationInfo)
      throw new Error("Não foi possível validar a biometria.");
    const cred = verificacao.registrationInfo.credential;
    const { error } = await db.from("webauthn_credenciais").insert({
      user_id: context.userId,
      credential_id: cred.id,
      public_key: isoBase64URL.fromBuffer(cred.publicKey),
      counter: cred.counter,
      transports: cred.transports ?? null,
      aparelho: data.aparelho ?? null,
    });
    if (error) throw new Error("Não foi possível salvar a biometria.");
    return { credentialId: cred.id };
  });

export const statusBiometria = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin();
    const { data } = await db
      .from("webauthn_credenciais")
      .select("credential_id")
      .eq("user_id", context.userId);
    return { credenciais: (data ?? []).map((c: any) => c.credential_id as string) };
  });

export const removerBiometria = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ credentialId: z.string().min(1).max(1024) }))
  .handler(async ({ data, context }) => {
    const db = await admin();
    await db
      .from("webauthn_credenciais")
      .delete()
      .eq("user_id", context.userId)
      .eq("credential_id", data.credentialId);
    return { ok: true };
  });

export const opcoesLoginBiometria = createServerFn({ method: "POST" }).handler(async () => {
  const limite = await registrarTentativaAutenticacao({
    acao: "biometria_opcoes",
    identificador: "sem-credencial",
    maxTentativas: 20,
    janelaSegundos: 15 * 60,
    bloqueioSegundos: 15 * 60,
  });
  if (limite.bloqueado) throw new Error("Muitas tentativas. Aguarde alguns minutos.");
  const { generateAuthenticationOptions } = await import("@simplewebauthn/server");
  const { rpID } = await origemEsperada();
  const db = await admin();
  const opcoes = await generateAuthenticationOptions({
    rpID,
    userVerification: "required",
    allowCredentials: [],
  });
  await db.from("webauthn_challenges").delete().lt("expires_at", new Date().toISOString());
  const { data: desafio, error } = await db
    .from("webauthn_challenges")
    .insert({ challenge: opcoes.challenge, tipo: "login" })
    .select("id")
    .single();
  if (error) throw new Error("Biometria indisponível no momento.");
  return { desafioId: desafio.id as string, opcoesJson: JSON.stringify(opcoes) };
});

export const entrarComBiometria = createServerFn({ method: "POST" })
  .validator(z.object({ desafioId: z.string().uuid(), resposta: z.any() }))
  .handler(async ({ data }) => {
    const { verifyAuthenticationResponse } = await import("@simplewebauthn/server");
    const { isoBase64URL } = await import("@simplewebauthn/server/helpers");
    const { origin, rpID } = await origemEsperada();
    const db = await admin();
    const falha = "Biometria não reconhecida. Entre com usuário e senha.";
    const credId = String(data.resposta?.id ?? "");
    const limite = await registrarTentativaAutenticacao({
      acao: "biometria_login",
      identificador: credId || data.desafioId,
      maxTentativas: 8,
      janelaSegundos: 15 * 60,
      bloqueioSegundos: 15 * 60,
    });
    if (limite.bloqueado) throw new Error("Muitas tentativas. Aguarde 15 minutos.");

    const { data: desafio } = await db
      .from("webauthn_challenges")
      .select("id, challenge")
      .eq("id", data.desafioId)
      .eq("tipo", "login")
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (!desafio) throw new Error("Solicitação expirada. Tente novamente.");
    await db.from("webauthn_challenges").delete().eq("id", desafio.id);

    const { data: cred } = await db
      .from("webauthn_credenciais")
      .select("*")
      .eq("credential_id", credId)
      .maybeSingle();
    if (!cred) throw new Error(falha);

    const verificacao = await verifyAuthenticationResponse({
      response: data.resposta,
      expectedChallenge: desafio.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: {
        id: cred.credential_id,
        publicKey: isoBase64URL.toBuffer(cred.public_key),
        counter: Number(cred.counter),
        transports: cred.transports ?? undefined,
      },
    });
    if (!verificacao.verified) throw new Error(falha);
    await db
      .from("webauthn_credenciais")
      .update({
        counter: verificacao.authenticationInfo.newCounter,
        last_used_at: new Date().toISOString(),
      })
      .eq("id", cred.id);

    const { data: perfil } = await db
      .from("profiles")
      .select("ativo, deve_alterar_senha, onboarding_concluido")
      .eq("id", cred.user_id)
      .maybeSingle();
    if (!perfil?.ativo) throw new Error("Usuário inativo. Procure o administrador.");

    const { data: usuario } = await db.auth.admin.getUserById(cred.user_id);
    const email = usuario?.user?.email;
    if (!email) throw new Error(falha);
    const { data: link, error: erroLink } = await db.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    const tokenHash = link?.properties?.hashed_token;
    if (erroLink || !tokenHash) throw new Error("Não foi possível entrar agora.");

    const url = process.env["SUPABASE_URL"];
    const chave = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!url || !chave) throw new Error("Autenticação indisponível no momento.");
    const { createClient } = await import("@supabase/supabase-js");
    const cliente = createClient(url, chave, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: sessao, error } = await cliente.auth.verifyOtp({
      type: "magiclink",
      token_hash: tokenHash,
    });
    if (error || !sessao.session) throw new Error("Não foi possível entrar agora.");

    await limparTentativasAutenticacao("biometria_login", limite.chave);

    return {
      accessToken: sessao.session.access_token,
      refreshToken: sessao.session.refresh_token,
      deveAlterarSenha: Boolean(perfil.deve_alterar_senha),
      onboardingConcluido: Boolean(perfil.onboarding_concluido),
    };
  });
