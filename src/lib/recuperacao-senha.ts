import { Buffer } from "node:buffer";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const entrada = z.object({ email: z.string().trim().email().max(200) });

const b64txt = (s: string) => Buffer.from(new TextEncoder().encode(s)).toString("base64");
const cabecalho = (v: string) => (/^[\x00-\x7F]*$/.test(v) ? v : `=?UTF-8?B?${b64txt(v)}?=`);

type RuntimeBindings = Record<string, unknown>;

function lerVariavelServidor(nome: string): string | undefined {
  const valorProcesso = process.env[nome];
  if (typeof valorProcesso === "string" && valorProcesso.length > 0) return valorProcesso;
  const bindings = (globalThis as typeof globalThis & { __env__?: unknown }).__env__;
  if (!bindings || typeof bindings !== "object" || Array.isArray(bindings)) return undefined;
  const valorRuntime = (bindings as RuntimeBindings)[nome];
  return typeof valorRuntime === "string" && valorRuntime.length > 0 ? valorRuntime : undefined;
}

function configuracaoAppsScript() {
  const url = lerVariavelServidor("APPS_SCRIPT_WEB_APP_URL");
  const token = lerVariavelServidor("APPS_SCRIPT_API_TOKEN");
  if (!url || !token) return null;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("A URL configurada para o Apps Script é inválida.");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== "script.google.com" ||
    !/^\/macros\/s\/[^/]+\/exec$/.test(parsed.pathname)
  ) {
    throw new Error("A URL do Apps Script deve ser a implantação Web App terminada em /exec.");
  }
  return { url, token };
}

function conteudoRecuperacao(destinatario: string, link: string) {
  const assunto = "Recuperação de senha - Aponta Produção DRYKO";
  const corpo = [
    "Aponta Produção DRYKO",
    "",
    "Recebemos uma solicitação para redefinir sua senha.",
    "Use o link abaixo para criar uma nova senha:",
    "",
    link,
    "",
    "Se você não solicitou esta alteração, ignore esta mensagem.",
  ].join("\n");
  return { destinatario, assunto, corpo };
}

async function enviarViaGmail(destinatario: string, assunto: string, corpo: string) {
  const lovableKey = lerVariavelServidor("LOVABLE_API_KEY");
  const gmailKey =
    lerVariavelServidor("GOOGLE_MAIL_API_KEY") ?? lerVariavelServidor("GOOGLE_MAIL_API_KEY_1");
  if (!lovableKey || !gmailKey) throw new Error("GMAIL_NAO_CONFIGURADO");

  const mime = [
    `To: ${destinatario}`,
    `Subject: ${cabecalho(assunto)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    b64txt(corpo),
  ].join("\r\n");
  const raw = b64txt(mime).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const resposta = await fetch(
    "https://connector-gateway.lovable.dev/google_mail/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": gmailKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
    },
  );

  if (!resposta.ok) {
    if (resposta.status === 401 || resposta.status === 403) {
      throw new Error("O Gmail recusou o envio. Reconecte a conta de e-mail.");
    }
    if (resposta.status === 429) {
      throw new Error("Limite de envios do Gmail atingido. Tente novamente em alguns minutos.");
    }
    throw new Error("Não foi possível enviar o e-mail de recuperação agora.");
  }
}

async function enviarViaAppsScript(destinatario: string, assunto: string, corpo: string) {
  const config = configuracaoAppsScript();
  if (!config) throw new Error("APPS_SCRIPT_NAO_CONFIGURADO");

  const resposta = await fetch(config.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token: config.token,
      to: [destinatario],
      subject: assunto,
      body: corpo,
      destinatarios: [destinatario],
      assunto,
      mensagem: corpo,
    }),
  });

  const textoResposta = await resposta.text();
  let retorno: { ok?: boolean; error?: string } = {};
  try {
    retorno = JSON.parse(textoResposta) as typeof retorno;
  } catch {
    /* tratado abaixo */
  }

  if (!resposta.ok || retorno.ok !== true) {
    throw new Error(
      retorno.error || `Apps Script respondeu com status ${resposta.status} ou conteúdo inválido.`,
    );
  }
}

async function enviarEmailRecuperacao(destinatario: string, link: string) {
  const { assunto, corpo } = conteudoRecuperacao(destinatario, link);
  try {
    await enviarViaGmail(destinatario, assunto, corpo);
  } catch (erroGmail) {
    if (erroGmail instanceof Error && erroGmail.message === "GMAIL_NAO_CONFIGURADO") {
      await enviarViaAppsScript(destinatario, assunto, corpo);
      return;
    }
    throw erroGmail;
  }
}

export const solicitarRecuperacaoSenha = createServerFn({ method: "POST" })
  .validator(entrada)
  .handler(async ({ data }) => {
    const email = data.email.trim().toLowerCase();
    const respostaGenerica = {
      ok: true,
      mensagem: "Se este e-mail estiver cadastrado, você receberá as instruções para redefinir a senha.",
    };

    const limite = await import("./limite-tentativas.server");
    // Toda solicitação conta (resposta é sempre genérica para não revelar se o e-mail existe).
    const tentativa = await limite.verificarLimite("recuperacao", email);
    await limite.registrarFalha(tentativa);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: perfil } = await (supabaseAdmin.from("profiles") as any)
      .select("id, ativo, email_recuperacao")
      .eq("ativo", true)
      .ilike("email_recuperacao", email)
      .maybeSingle();

    if (!perfil?.id) return respostaGenerica;

    const { data: usuario } = await supabaseAdmin.auth.admin.getUserById(perfil.id);
    const emailInterno = usuario.user?.email;
    if (!emailInterno) return respostaGenerica;

    const appUrl = (process.env["APP_URL"] ?? "https://dryko-prod-tracker.lovable.app").replace(/\/$/, "");
    const { data: link, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: emailInterno,
      options: { redirectTo: `${appUrl}/redefinir-senha` },
    });

    if (error || !link?.properties?.action_link) return respostaGenerica;

    try {
      await enviarEmailRecuperacao(email, link.properties.action_link);
    } catch {
      return respostaGenerica;
    }

    return respostaGenerica;
  });
