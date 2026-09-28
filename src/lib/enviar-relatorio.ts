import { Buffer } from "node:buffer";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { gerarPdfRelatorio } from "@/lib/relatorio-pdf";

const entrada = z.object({
  relatorioId: z.string().uuid(),
  destinatarios: z.array(z.string().email()).min(1).max(10),
});

function configuracao() {
  const url = process.env["APPS_SCRIPT_WEB_APP_URL"];
  const token = process.env["APPS_SCRIPT_API_TOKEN"];
  if (!url || !token) {
    throw new Error("A integração com o Apps Script ainda não está configurada no Lovable.");
  }

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

function normalizarDestinatarios(destinatarios: string[]) {
  return [...new Set(destinatarios.map((email) => email.trim().toLowerCase()).filter(Boolean))].slice(0, 10);
}

function dataExibicao(valor: string) {
  const [ano, mes, dia] = valor.split("-");
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : valor;
}

function turnoExibicao(valor: string) {
  if (valor === "T1") return "1º turno";
  if (valor === "T2") return "2º turno";
  if (valor === "T3") return "3º turno";
  return valor;
}

function limparErro(erro: unknown) {
  return (erro instanceof Error ? erro.message : "Falha desconhecida no envio.")
    .replace(/[\r\n]+/g, " ")
    .slice(0, 500);
}

export const enviarRelatorio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(entrada)
  .handler(async ({ data, context }) => {
    const destinatarios = normalizarDestinatarios(data.destinatarios);
    if (destinatarios.length === 0) throw new Error("Informe ao menos um destinatário válido.");
    const { url, token } = configuracao();

    const { data: relatorio, error } = await context.supabase
      .from("relatorios")
      .select("*")
      .eq("id", data.relatorioId)
      .single();
    if (error || !relatorio) throw new Error("Relatório não encontrado ou sem permissão.");

    if (relatorio.status_envio === "enviado") {
      return { ok: true, jaEnviado: true, destinatarios: relatorio.destinatarios };
    }

    const { data: bloqueio, error: erroBloqueio } = await context.supabase
      .from("relatorios")
      .update({
        status_envio: "enviando",
        destinatarios,
        tentativas_envio: relatorio.tentativas_envio + 1,
        erro_envio: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", relatorio.id)
      .in("status_envio", ["aguardando", "falhou"])
      .select("id")
      .maybeSingle();

    if (erroBloqueio || !bloqueio) {
      throw new Error("Este relatório já está sendo processado. Aguarde alguns segundos e tente novamente.");
    }

    try {
      const dataFormatada = dataExibicao(relatorio.data_local);
      const turnoFormatado = turnoExibicao(relatorio.turno);
      const setor = relatorio.setor.charAt(0).toUpperCase() + relatorio.setor.slice(1);
      const nomeArquivo = `relatorio-${relatorio.data_local}-${relatorio.setor}-turno-${relatorio.turno.replace("T", "")}.pdf`;
      const pdfBase64 = Buffer.from(gerarPdfRelatorio(relatorio.resumo)).toString("base64");
      const subject = `Relatório de produção - ${setor} - ${dataFormatada} - ${turnoFormatado}`;
      const body = [
        "Relatório de produção DRYKO",
        "",
        `Data: ${dataFormatada}`,
        `Setor: ${setor}`,
        `Turno: ${turnoFormatado}`,
        "",
        "O relatório completo está anexado em PDF.",
      ].join("\n");

      const resposta = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          to: destinatarios,
          reportId: relatorio.id,
          subject,
          body,
          pdfBase64,
          fileName: nomeArquivo,
          // aliases mantidos para compatibilidade com versões anteriores do script
          destinatarios,
          assunto: subject,
          mensagem: body,
          nomeArquivo,
        }),
      });

      const textoResposta = await resposta.text();
      let retorno: { ok?: boolean; error?: string } = {};
      try {
        retorno = JSON.parse(textoResposta) as typeof retorno;
      } catch {
        // a validação abaixo trata respostas que não são JSON
      }

      if (!resposta.ok || retorno.ok !== true) {
        throw new Error(retorno.error || `Apps Script respondeu com status ${resposta.status} ou conteúdo inválido.`);
      }

      await context.supabase
        .from("relatorios")
        .update({
          status_envio: "enviado",
          destinatarios,
          enviado_em: new Date().toISOString(),
          erro_envio: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", relatorio.id);

      return { ok: true, jaEnviado: false, destinatarios };
    } catch (erro) {
      const mensagem = limparErro(erro);
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
