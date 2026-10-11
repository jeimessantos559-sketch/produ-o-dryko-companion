import { Buffer } from "node:buffer";
import { z } from "zod";

export type MensagemEmail = {
  to: string[];
  subject: string;
  body: string;
  reportId?: string;
  pdf?: Uint8Array;
  fileName?: string;
};

const MAX_PDF_BYTES = 20 * 1024 * 1024;
const PRAZO_ENVIO_MS = 45_000;

export function lerVariavelEmail(nome: string): string | undefined {
  const valor = process.env[nome];
  if (typeof valor === "string" && valor.length > 0) return valor;
  const bindings = (globalThis as typeof globalThis & { __env__?: unknown }).__env__;
  if (!bindings || typeof bindings !== "object" || Array.isArray(bindings)) return undefined;
  const valorRuntime = (bindings as Record<string, unknown>)[nome];
  return typeof valorRuntime === "string" && valorRuntime.length > 0 ? valorRuntime : undefined;
}

function configuracaoAppsScript() {
  const url = lerVariavelEmail("APPS_SCRIPT_WEB_APP_URL");
  const token = lerVariavelEmail("APPS_SCRIPT_API_TOKEN");
  if (!url || !token) throw new Error("Configure a URL e a chave do Apps Script nas variáveis privadas do servidor.");
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error("A URL configurada para o Apps Script é inválida."); }
  if (
    parsed.protocol !== "https:" || parsed.hostname !== "script.google.com" ||
    parsed.port || parsed.username || parsed.password || parsed.search || parsed.hash ||
    !/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(parsed.pathname)
  ) throw new Error("A URL do Apps Script deve ser a implantação Web App terminada em /exec.");
  return { url, token };
}

function validarMensagem(mensagem: MensagemEmail): MensagemEmail {
  const to = [...new Set(mensagem.to.map((email) => email.trim().toLowerCase()))];
  if (!z.array(z.string().email()).min(1).max(10).safeParse(to).success)
    throw new Error("Informe entre 1 e 10 destinatários válidos.");
  if (!mensagem.subject.trim() || mensagem.subject.length > 180 || /[\r\n\0]/.test(mensagem.subject))
    throw new Error("O assunto do e-mail é inválido.");
  if (!mensagem.body.trim() || mensagem.body.length > 5_000)
    throw new Error("O conteúdo do e-mail é inválido.");
  if (mensagem.pdf) {
    if (mensagem.pdf.byteLength === 0 || mensagem.pdf.byteLength > MAX_PDF_BYTES)
      throw new Error("O PDF deve ter conteúdo e no máximo 20 MB.");
    if (!mensagem.fileName || !/\.pdf$/i.test(mensagem.fileName) || /[\r\n\0"\\/]/.test(mensagem.fileName))
      throw new Error("O nome do PDF é inválido.");
  } else if (mensagem.fileName) throw new Error("O anexo PDF não foi informado.");
  return { ...mensagem, to };
}

const b64 = (valor: string | Uint8Array) => Buffer.from(valor).toString("base64");
const linhasBase64 = (valor: string | Uint8Array) => b64(valor).replace(/.{76}/g, "$&\r\n");
const cabecalho = (valor: string) => /^[\x00-\x7F]*$/.test(valor) ? valor : `=?UTF-8?B?${b64(valor)}?=`;

function mensagemMime(mensagem: MensagemEmail) {
  const headers = [`To: ${mensagem.to.join(", ")}`, `Subject: ${cabecalho(mensagem.subject)}`, "MIME-Version: 1.0"];
  const texto = ['Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: base64", "", linhasBase64(mensagem.body)];
  if (!mensagem.pdf) return [...headers, ...texto].join("\r\n");
  const boundary = `dryko_${crypto.randomUUID()}`;
  return [
    ...headers, `Content-Type: multipart/mixed; boundary="${boundary}"`, "",
    `--${boundary}`, ...texto, `--${boundary}`,
    `Content-Type: application/pdf; name="${mensagem.fileName}"`,
    `Content-Disposition: attachment; filename="${mensagem.fileName}"`,
    "Content-Transfer-Encoding: base64", "", linhasBase64(mensagem.pdf), `--${boundary}--`,
  ].join("\r\n");
}

async function requisicao(url: string, init: RequestInit) {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(PRAZO_ENVIO_MS) });
  } catch {
    // Sem repetição/fallback após iniciar o envio: uma falha de rede pode ocorrer após o provedor aceitar a mensagem.
    throw new Error("Não foi possível confirmar o envio. Verifique a conexão antes de tentar novamente.");
  }
}

async function enviarViaGmail(mensagem: MensagemEmail, lovableKey: string, gmailKey: string) {
  const resposta = await requisicao("https://connector-gateway.lovable.dev/google_mail/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": gmailKey, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: Buffer.from(mensagemMime(mensagem)).toString("base64url") }),
  });
  if (resposta.status === 401 || resposta.status === 403)
    throw new Error(`O Gmail recusou o envio (autorização). Reconecte a conta Gmail. [${resposta.status}]`);
  if (resposta.status === 429) throw new Error("Limite de envios do Gmail atingido. Tente novamente em alguns minutos.");
  if (!resposta.ok) throw new Error(`O Gmail não conseguiu enviar o e-mail [${resposta.status}].`);
}

async function requisicaoAppsScript(payload: Record<string, unknown>) {
  const { url, token } = configuracaoAppsScript();
  const resposta = await requisicao(url, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, token }),
  });
  let retorno: Record<string, unknown> = {};
  try {
    const conteudo: unknown = await resposta.json();
    if (conteudo && typeof conteudo === "object" && !Array.isArray(conteudo)) retorno = conteudo as Record<string, unknown>;
  } catch { /* HTML de login e respostas inválidas não confirmam o envio. */ }
  if (!resposta.ok || retorno["ok"] !== true) {
    const erros: Record<string, string> = {
      UNAUTHORIZED: "O Apps Script recusou a chave de envio. Verifique a configuração privada.",
      NOT_CONFIGURED: "A chave de envio ainda não foi configurada no Apps Script.",
      WRONG_SENDER: "O Apps Script deve ser implantado pela conta apontaproducao@gmail.com.",
      QUOTA_EXCEEDED: "Limite diário de destinatários do Gmail atingido. Tente novamente após a renovação da cota.",
      BUSY: "O serviço de e-mail está ocupado. Aguarde alguns segundos.",
    };
    throw new Error(erros[String(retorno["error"])] ?? `O Apps Script não confirmou o envio [${resposta.status}].`);
  }
  return retorno;
}

export async function enviarEmail(entrada: MensagemEmail) {
  const mensagem = validarMensagem(entrada);
  const lovableKey = lerVariavelEmail("LOVABLE_API_KEY");
  const gmailKey = lerVariavelEmail("GOOGLE_MAIL_API_KEY") ?? lerVariavelEmail("GOOGLE_MAIL_API_KEY_1");
  // Mantém o conector já utilizado no Lovable quando suas duas credenciais estão presentes.
  if (lovableKey && gmailKey) {
    await enviarViaGmail(mensagem, lovableKey, gmailKey);
    return;
  }
  const retorno = await requisicaoAppsScript({
    requestId: crypto.randomUUID(), to: mensagem.to, subject: mensagem.subject, body: mensagem.body,
    ...(mensagem.reportId ? { reportId: mensagem.reportId } : {}),
    ...(mensagem.pdf ? { pdfBase64: b64(mensagem.pdf), fileName: mensagem.fileName } : {}),
    destinatarios: mensagem.to, assunto: mensagem.subject, mensagem: mensagem.body,
    ...(mensagem.fileName ? { nomeArquivo: mensagem.fileName } : {}),
  });
  if (retorno["dryRun"] === true) throw new Error("O serviço respondeu apenas com uma verificação; o e-mail não foi enviado.");
}

/** Valida a implantação e a chave sem enviar mensagem nem gerar link de recuperação. */
export async function verificarIntegracaoAppsScript() {
  const retorno = await requisicaoAppsScript({ action: "verify" });
  if (
    retorno["dryRun"] !== true || retorno["sender"] !== "apontaproducao@gmail.com" ||
    !Array.isArray(retorno["capabilities"]) || !retorno["capabilities"].includes("password-recovery") ||
    !retorno["capabilities"].includes("pdf") || typeof retorno["remainingDailyRecipients"] !== "number"
  ) throw new Error("A implantação do Apps Script precisa suportar relatórios PDF e recuperação de senha.");
  return { remetente: retorno["sender"], destinatariosRestantes: retorno["remainingDailyRecipients"] };
}
