import { Buffer } from "node:buffer";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { registrarTentativaAutenticacao } from "@/lib/limite-autenticacao";

const entrada = z.object({ email: z.string().trim().email().max(200) });

const b64txt = (s: string) => Buffer.from(new TextEncoder().encode(s)).toString("base64");
const cabecalho = (v: string) =>
  [...v].every((caractere) => (caractere.codePointAt(0) ?? 0) <= 0x7f)
    ? v
    : `=?UTF-8?B?${b64txt(v)}?=`;

async function enviarEmailRecuperacao(destinatario: string, link: string) {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const gmailKey = process.env["GOOGLE_MAIL_API_KEY"] ?? process.env["GOOGLE_MAIL_API_KEY_1"];
  if (!lovableKey || !gmailKey) throw new Error("O envio de recuperação não está configurado.");

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

  if (!resposta.ok) throw new Error("Não foi possível enviar o e-mail de recuperação agora.");
}

export const solicitarRecuperacaoSenha = createServerFn({ method: "POST" })
  .validator(entrada)
  .handler(async ({ data }) => {
    const email = data.email.trim().toLowerCase();
    const respostaGenerica = {
      ok: true,
      mensagem:
        "Se este e-mail estiver cadastrado, você receberá as instruções para redefinir a senha.",
    };

    const limite = await registrarTentativaAutenticacao({
      acao: "recuperacao_senha",
      identificador: email,
      maxTentativas: 5,
      janelaSegundos: 60 * 60,
      bloqueioSegundos: 60 * 60,
    });
    if (limite.bloqueado) return respostaGenerica;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: perfil } = await supabaseAdmin
      .from("profiles")
      .select("id, ativo, email_recuperacao")
      .eq("ativo", true)
      .ilike("email_recuperacao", email)
      .maybeSingle();

    if (!perfil?.id) return respostaGenerica;

    const { data: usuario } = await supabaseAdmin.auth.admin.getUserById(perfil.id);
    const emailInterno = usuario.user?.email;
    if (!emailInterno) return respostaGenerica;

    const appUrl = (process.env["APP_URL"] ?? "https://aponta-dryko.lovable.app").replace(
      /\/$/,
      "",
    );
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
