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

const NOMES_SETOR: Record<string, string> = {
  corte: "Corte", fitas: "Fitas", mantas: "Mantas", asfox: "Asfox",
  misturadores: "Misturadores", liquidos: "Líquidos", pos: "Pós", avulsos: "Avulsos",
};

function campo(obj: unknown, chave: string): unknown {
  return obj && typeof obj === "object" && !Array.isArray(obj) ? (obj as Record<string, unknown>)[chave] : undefined;
}

function txt(valor: unknown) {
  if (valor === null || valor === undefined || valor === "") return "—";
  if (typeof valor === "number") return valor.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  if (typeof valor === "object") return String(campo(valor, "nome") ?? campo(valor, "email") ?? "—");
  return String(valor);
}

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");
const b64txt = (s: string) => b64(new TextEncoder().encode(s));
const cabecalho = (v: string) => (/^[\x00-\x7F]*$/.test(v) ? v : `=?UTF-8?B?${b64txt(v)}?=`);

async function enviarViaGmail(opts: { to: string[]; subject: string; body: string; pdf: Uint8Array; fileName: string }) {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const gmailKey = process.env["GOOGLE_MAIL_API_KEY"] ?? process.env["GOOGLE_MAIL_API_KEY_1"];
  if (!lovableKey || !gmailKey) throw new Error("GMAIL_NAO_CONFIGURADO");
  const boundary = `dryko_${crypto.randomUUID()}`;
  const anexo = b64(opts.pdf).replace(/.{76}/g, "$&\r\n");
  const mime = [
    `To: ${opts.to.join(", ")}`,
    `Subject: ${cabecalho(opts.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    b64txt(opts.body).replace(/.{76}/g, "$&\r\n"),
    `--${boundary}`,
    `Content-Type: application/pdf; name="${opts.fileName}"`,
    `Content-Disposition: attachment; filename="${opts.fileName}"`,
    "Content-Transfer-Encoding: base64",
    "",
    anexo,
    `--${boundary}--`,
  ].join("\r\n");
  const raw = b64txt(mime).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const resp = await fetch("https://connector-gateway.lovable.dev/google_mail/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": gmailKey, "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });
  if (!resp.ok) {
    const corpo = await resp.text();
    console.error(`Gmail falhou [${resp.status}]: ${corpo}`);
    if (resp.status === 401 || resp.status === 403) throw new Error(`O Gmail recusou o envio (autorização). Reconecte a conta Gmail. [${resp.status}]`);
    if (resp.status === 429) throw new Error("Limite de envios do Gmail atingido. Tente novamente em alguns minutos.");
    throw new Error(`O Gmail não conseguiu enviar o e-mail [${resp.status}].`);
  }
}

async function enviarViaAppsScript(opts: { reportId: string; to: string[]; subject: string; body: string; pdf: Uint8Array; fileName: string }) {
  const { url, token } = configuracao();
  const resposta = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token, to: opts.to, reportId: opts.reportId, subject: opts.subject, body: opts.body,
      pdfBase64: b64(opts.pdf), fileName: opts.fileName,
      destinatarios: opts.to, assunto: opts.subject, mensagem: opts.body, nomeArquivo: opts.fileName,
    }),
  });
  const textoResposta = await resposta.text();
  let retorno: { ok?: boolean; error?: string } = {};
  try { retorno = JSON.parse(textoResposta) as typeof retorno; } catch { /* tratado abaixo */ }
  if (!resposta.ok || retorno.ok !== true) {
    throw new Error(retorno.error || `Apps Script respondeu com status ${resposta.status} ou conteúdo inválido.`);
  }
}

export const enviarRelatorio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(entrada)
  .handler(async ({ data, context }) => {
    const destinatarios = normalizarDestinatarios(data.destinatarios);
    if (destinatarios.length === 0) throw new Error("Informe ao menos um destinatário válido.");

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
        destinatarios,
        tentativas_envio: relatorio.tentativas_envio + 1,
        erro_envio: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", relatorio.id)
      .in("status_envio", ["aguardando", "falhou", "enviado"])
      .select("id")
      .maybeSingle();

    if (erroBloqueio || !bloqueio) {
      throw new Error("Este relatório já está sendo enviado. Aguarde alguns segundos e tente novamente.");
    }

    try {
      const dataFormatada = dataExibicao(relatorio.data_local);
      const turnoFormatado = turnoExibicao(relatorio.turno);
      const setor = NOMES_SETOR[relatorio.setor] ?? relatorio.setor;
      const fileName = `Relatorio-DRYKO-${setor.normalize("NFD").replace(/[^\w]/g, "")}-${relatorio.data_local}-Turno${relatorio.turno.replace("T", "")}.pdf`;
      const pdf = gerarPdfRelatorio(relatorio.resumo);
      if (pdf.byteLength > 20 * 1024 * 1024) throw new Error("O PDF ultrapassa 20 MB e não pode ser enviado por e-mail.");
      const raiz = relatorio.resumo;
      const totais = campo(raiz, "totais");
      const fitas = relatorio.setor === "fitas";
      const producao = fitas ? `${txt(campo(totais, "area"))} m²` : `${txt(campo(totais, "metragem"))} ${relatorio.setor === "mantas" ? "m" : "m²"}`;
      const subject = `Relatório de Produção DRYKO - ${setor} - ${dataFormatada} - ${turnoFormatado}`;
      const body = [
        "Relatório de Produção DRYKO",
        "",
        `Setor: ${setor}`,
        `Turno: ${turnoFormatado}`,
        `Data: ${dataFormatada}`,
        `Responsável pelo fechamento: ${txt(campo(raiz, "responsavel"))}`,
        "",
        `Total de apontamentos: ${txt(campo(totais, "apontamentos"))}`,
        `PLTs: ${fitas ? "—" : txt(campo(totais, "plts"))}`,
        `${fitas ? "Área" : "Metragem"}: ${producao}`,
        `Pendentes: ${txt(campo(totais, "pendentes"))}`,
        `Lançados: ${txt(campo(totais, "lancados"))}`,
        "",
        "O relatório completo está anexado em PDF.",
      ].join("\n");

      const envio = { reportId: relatorio.id, to: destinatarios, subject, body, pdf, fileName };
      try {
        await enviarViaGmail(envio);
      } catch (erroGmail) {
        // fallback técnico: só usa o Apps Script se o Gmail não estiver configurado
        if (erroGmail instanceof Error && erroGmail.message === "GMAIL_NAO_CONFIGURADO" && process.env["APPS_SCRIPT_WEB_APP_URL"]) {
          await enviarViaAppsScript(envio);
        } else if (erroGmail instanceof Error && erroGmail.message === "GMAIL_NAO_CONFIGURADO") {
          throw new Error("O envio por Gmail não está configurado neste projeto.");
        } else {
          throw erroGmail;
        }
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

      return { ok: true, destinatarios };
    } catch (erro) {
      const mensagem = limparErro(erro);
      await context.supabase
        .from("relatorios")
        .update({
          status_envio: "falhou",
          erro_envio: `${new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date())} · ${mensagem}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", relatorio.id);
      throw new Error(mensagem);
    }
  });