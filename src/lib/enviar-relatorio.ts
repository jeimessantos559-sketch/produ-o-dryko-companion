import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { gerarPdfRelatorio } from "@/lib/relatorio-pdf";

const entrada = z.object({
  relatorioId: z.string().uuid(),
  destinatarios: z.array(z.string().email()).min(1).max(10),
});

function base64(bytes: Uint8Array) {
  let binario = "";
  const tamanho = 8192;
  for (let i = 0; i < bytes.length; i += tamanho) {
    binario += String.fromCharCode(...bytes.subarray(i, i + tamanho));
  }
  return btoa(binario);
}

export const enviarRelatorio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(entrada)
  .handler(async ({ data, context }) => {
    const url = process.env["APPS_SCRIPT_WEB_APP_URL"];
    const token = process.env["APPS_SCRIPT_API_TOKEN"];
    if (!url || !token) {
      throw new Error(
        "Envio ainda não configurado. Cadastre APPS_SCRIPT_WEB_APP_URL e APPS_SCRIPT_API_TOKEN no ambiente seguro.",
      );
    }

    const { data: relatorio, error } = await context.supabase
      .from("relatorios")
      .select("*")
      .eq("id", data.relatorioId)
      .single();
    if (error || !relatorio) throw new Error("Relatório não encontrado ou sem permissão.");

    const { data: bloqueio, error: erroBloqueio } = await context.supabase
      .from("relatorios")
      .update({
        status_envio: "enviando",
        destinatarios: data.destinatarios,
        tentativas_envio: relatorio.tentativas_envio + 1,
        erro_envio: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", relatorio.id)
      .in("status_envio", ["aguardando", "falhou"])
      .select("id")
      .maybeSingle();
    if (erroBloqueio || !bloqueio) {
      throw new Error("Este relatório já foi enviado ou está sendo processado.");
    }

    try {
      const nomeArquivo = `relatorio-${relatorio.setor}-${relatorio.data_local}-${relatorio.turno}.pdf`;
      const resposta = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token,
          relatorioId: relatorio.id,
          destinatarios: data.destinatarios,
          assunto: `Relatório de Produção | ${relatorio.setor} | ${relatorio.data_local} | ${relatorio.turno}`,
          mensagem: `Segue em anexo o relatório de produção do setor ${relatorio.setor}, referente ao turno ${relatorio.turno} de ${relatorio.data_local}.`,
          nomeArquivo,
          pdfBase64: base64(gerarPdfRelatorio(relatorio.resumo)),
        }),
      });
      if (!resposta.ok) throw new Error(`Serviço de e-mail respondeu ${resposta.status}.`);
      const retorno = (await resposta.json().catch(() => ({ ok: true }))) as {
        ok?: boolean;
        error?: string;
      };
      if (retorno.ok === false) throw new Error(retorno.error || "O serviço recusou o envio.");

      await context.supabase
        .from("relatorios")
        .update({
          status_envio: "enviado",
          enviado_em: new Date().toISOString(),
          erro_envio: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", relatorio.id);
      return { ok: true };
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : "Falha desconhecida no envio.";
      await context.supabase
        .from("relatorios")
        .update({
          status_envio: "falhou",
          erro_envio: mensagem,
          updated_at: new Date().toISOString(),
        })
        .eq("id", relatorio.id);
      throw new Error(mensagem);
    }
  });
