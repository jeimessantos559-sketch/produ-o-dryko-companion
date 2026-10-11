import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync(new URL("../../../integrations/apps-script/email.gs", import.meta.url), "utf8");
const token = "chave-ficticia-de-teste-com-mais-de-32-caracteres";
const mensagem = { token, requestId: "requisicao-test", to: ["destinatario@example.com"], subject: "Relatório", body: "Mensagem" };

function servico(opts: { sender?: string; quota?: number; token?: string; cacheFalha?: boolean; ocupado?: boolean } = {}) {
  const enviar = vi.fn();
  const cache = new Map<string, string>();
  const liberar = vi.fn();
  const contexto = createContext({
    MailApp: { sendEmail: enviar, getRemainingDailyQuota: () => opts.quota ?? 100 },
    Session: { getEffectiveUser: () => ({ getEmail: () => opts.sender ?? "apontaproducao@gmail.com" }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => opts.token ?? token }) },
    LockService: { getScriptLock: () => ({ tryLock: () => !opts.ocupado, releaseLock: liberar }) },
    CacheService: { getScriptCache: () => ({ get: (key: string) => cache.get(key), put: (key: string, value: string) => { if (opts.cacheFalha) throw new Error("falha"); cache.set(key, value); } }) },
    Utilities: {
      base64Decode: (value: string) => [...Buffer.from(value, "base64")],
      newBlob: (bytes: number[], mime: string, name: string) => ({ bytes, mime, name }),
      computeDigest: (_: string, value: string) => [...createHash("sha256").update(value).digest()],
      DigestAlgorithm: { SHA_256: "SHA_256" }, Charset: { UTF_8: "UTF_8" },
    },
    ContentService: { createTextOutput: (text: string) => ({ setMimeType: () => text }), MimeType: { JSON: "application/json" } },
  });
  runInContext(source, contexto);
  const post = runInContext("doPost", contexto) as (e: { postData: { contents: string } }) => string;
  return { enviar, liberar, post: (payload: unknown) => JSON.parse(post({ postData: { contents: JSON.stringify(payload) } })) };
}

describe("Web App de envio do Apps Script", () => {
  it("valida a chave, o remetente e os recursos sem enviar e-mail", () => {
    const api = servico();
    expect(api.post({ token, action: "verify" })).toMatchObject({ ok: true, dryRun: true, sender: "apontaproducao@gmail.com", capabilities: ["pdf", "password-recovery"] });
    expect(api.enviar).not.toHaveBeenCalled();
  });
  it("recusa uma chave incorreta sem expor o valor configurado", () => {
    const api = servico();
    expect(api.post({ ...mensagem, token: "invalido" })).toEqual({ ok: false, error: "UNAUTHORIZED" });
    expect(api.enviar).not.toHaveBeenCalled();
  });
  it("recusa implantação em outra conta", () => {
    const api = servico({ sender: "outra@example.com" });
    expect(api.post(mensagem)).toEqual({ ok: false, error: "WRONG_SENDER" });
    expect(api.enviar).not.toHaveBeenCalled();
  });
  it("envia recuperação sem anexo PDF", () => {
    const api = servico();
    expect(api.post(mensagem)).toEqual({ ok: true });
    expect(api.enviar).toHaveBeenCalledWith({ to: "destinatario@example.com", subject: "Relatório", body: "Mensagem", name: "Aponta Produção DRYKO" });
    expect(api.liberar).toHaveBeenCalledOnce();
  });
  it("envia o PDF com os mesmos bytes e nome", () => {
    const api = servico();
    const pdf = Buffer.from("%PDF-1.4\n");
    expect(api.post({ ...mensagem, reportId: "relatorio-test", pdfBase64: pdf.toString("base64"), fileName: "relatorio.pdf" })).toEqual({ ok: true });
    expect(api.enviar.mock.calls[0]![0].attachments[0]).toEqual({ bytes: [...pdf], mime: "application/pdf", name: "relatorio.pdf" });
  });
  it("mantém aliases e o reportId usados pelo cliente anterior", () => {
    const api = servico();
    expect(api.post({ token, reportId: "relatorio-legado", destinatarios: mensagem.to, assunto: mensagem.subject, mensagem: mensagem.body, pdfBase64: Buffer.from("%PDF-1.4\n").toString("base64"), nomeArquivo: "relatorio.pdf" })).toEqual({ ok: true });
    expect(api.enviar).toHaveBeenCalledOnce();
  });
  it("não duplica a mesma requisição e permite reenvio explícito", () => {
    const api = servico();
    expect(api.post(mensagem)).toEqual({ ok: true });
    expect(api.post(mensagem)).toEqual({ ok: true, duplicate: true });
    expect(api.post({ ...mensagem, requestId: "reenvio-test" })).toEqual({ ok: true });
    expect(api.enviar).toHaveBeenCalledTimes(2);
  });
  it("não transforma uma falha do cache em falha do envio já aceito", () => {
    const api = servico({ cacheFalha: true });
    expect(api.post(mensagem)).toEqual({ ok: true });
    expect(api.enviar).toHaveBeenCalledOnce();
  });
  it("respeita o limite de destinatários diário", () => {
    const api = servico({ quota: 0 });
    expect(api.post(mensagem)).toEqual({ ok: false, error: "QUOTA_EXCEEDED" });
    expect(api.enviar).not.toHaveBeenCalled();
    expect(api.liberar).toHaveBeenCalledOnce();
  });
  it("não envia se o bloqueio estiver ocupado", () => {
    const api = servico({ ocupado: true });
    expect(api.post(mensagem)).toEqual({ ok: false, error: "BUSY" });
    expect(api.enviar).not.toHaveBeenCalled();
  });
  it.each([
    { ...mensagem, subject: "Assunto\r\nBcc:outro@example.com" },
    { ...mensagem, to: Array.from({ length: 11 }, () => "outro@example.com") },
    { ...mensagem, pdfBase64: Buffer.from("arquivo sem PDF").toString("base64"), fileName: "arquivo.pdf" },
  ])("rejeita payload inválido sem enviar mensagem", (payload) => {
    const api = servico();
    expect(api.post(payload)).toEqual({ ok: false, error: "INVALID_REQUEST" });
    expect(api.enviar).not.toHaveBeenCalled();
  });
});
