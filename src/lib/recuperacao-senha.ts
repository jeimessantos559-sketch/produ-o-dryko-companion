import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const APP_URL_PADRAO = "https://apontaproducaodryko.vercel.app";

const entrada = z.object({ email: z.string().trim().email().max(200) });

async function enviarEmailRecuperacao(destinatario: string, link: string) {
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

  const { enviarEmail } = await import("./email.server");
  await enviarEmail({ to: [destinatario], subject: assunto, body: corpo });
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

    // Endereço publicado na Vercel; APP_URL vazio também cai no padrão.
    const appUrl = (process.env["APP_URL"]?.trim() || APP_URL_PADRAO).replace(/\/$/, "");
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
