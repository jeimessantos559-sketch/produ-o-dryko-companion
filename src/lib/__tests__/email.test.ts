import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enviarEmail, lerVariavelEmail, verificarIntegracaoAppsScript } from "../email.server";

const url = "https://script.google.com/macros/s/deployment_test/exec";
const mensagem = { to: ["destinatario@example.com"], subject: "Relatório DRYKO", body: "Conteúdo de teste." };
const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset().mockResolvedValue(new Response(JSON.stringify({ ok: true })));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("__env__", undefined);
  for (const nome of ["LOVABLE_API_KEY", "GOOGLE_MAIL_API_KEY", "GOOGLE_MAIL_API_KEY_1", "APPS_SCRIPT_WEB_APP_URL", "APPS_SCRIPT_API_TOKEN"])
    vi.stubEnv(nome, "");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

function appsScript() {
  vi.stubEnv("APPS_SCRIPT_WEB_APP_URL", url);
  vi.stubEnv("APPS_SCRIPT_API_TOKEN", "chave-ficticia-apenas-para-testes");
}
function gmail() {
  vi.stubEnv("LOVABLE_API_KEY", "autorizacao-ficticia");
  vi.stubEnv("GOOGLE_MAIL_API_KEY", "conexao-ficticia");
}
function payload() { return JSON.parse(fetchMock.mock.calls[0]![1].body); }

describe("envio de e-mail no servidor", () => {
  it("envia recuperação sem exigir um PDF ou um relatório", async () => {
    appsScript();
    await enviarEmail({ ...mensagem, body: "Recuperação: https://example.com/redefinir-senha" });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]![0]).toBe(url);
    expect(payload()).toMatchObject({ to: mensagem.to, subject: mensagem.subject });
    expect(payload().requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(payload()).not.toHaveProperty("pdfBase64");
    expect(payload()).not.toHaveProperty("reportId");
  });
  it("preserva os bytes do PDF, seu nome e o identificador do relatório", async () => {
    appsScript();
    const pdf = new TextEncoder().encode("%PDF-1.4\nconteúdo");
    await enviarEmail({ ...mensagem, reportId: "relatorio-test", pdf, fileName: "relatorio.pdf" });
    expect(Buffer.from(payload().pdfBase64, "base64")).toEqual(Buffer.from(pdf));
    expect(payload()).toMatchObject({ reportId: "relatorio-test", fileName: "relatorio.pdf", nomeArquivo: "relatorio.pdf" });
  });
  it("normaliza e deduplica destinatários", async () => {
    appsScript();
    await enviarEmail({ ...mensagem, to: ["DESTINATARIO@example.com ", "destinatario@example.com"] });
    expect(payload().to).toEqual(["destinatario@example.com"]);
  });
  it.each([
    { ...mensagem, to: ["a@example.com\r\nBcc:outro@example.com"] },
    { ...mensagem, subject: "Assunto\r\nBcc: outro@example.com" },
    { ...mensagem, pdf: new Uint8Array([1]), fileName: "relatorio.pdf\r\nBcc:outro@example.com" },
    { ...mensagem, to: Array.from({ length: 11 }, (_, i) => `teste${i}@example.com`) },
    { ...mensagem, pdf: new Uint8Array(20 * 1024 * 1024 + 1), fileName: "grande.pdf" },
  ])("bloqueia cabeçalhos, destinatários ou anexos inválidos antes da chamada externa", async (entrada) => {
    appsScript();
    await expect(enviarEmail(entrada)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(["https://outro.example/macros/s/test/exec", "https://script.google.com/macros/s/test/dev", `${url}?token=teste`])(
    "recusa a URL de implantação inválida %s", async (invalida) => {
      appsScript(); vi.stubEnv("APPS_SCRIPT_WEB_APP_URL", invalida);
      await expect(enviarEmail(mensagem)).rejects.toThrow("/exec");
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
  it("não chama um provedor quando faltam as configurações", async () => {
    await expect(enviarEmail(mensagem)).rejects.toThrow("variáveis privadas");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("também lê bindings do runtime do Lovable", () => {
    vi.stubGlobal("__env__", { APPS_SCRIPT_API_TOKEN: "binding-ficticio" });
    expect(lerVariavelEmail("APPS_SCRIPT_API_TOKEN")).toBe("binding-ficticio");
    vi.stubEnv("APPS_SCRIPT_API_TOKEN", "processo-ficticio");
    expect(lerVariavelEmail("APPS_SCRIPT_API_TOKEN")).toBe("processo-ficticio");
  });
  it("mantém o Gmail configurado e seu MIME UTF-8 com PDF", async () => {
    gmail(); appsScript();
    const pdf = new TextEncoder().encode("%PDF-1.4\n");
    await enviarEmail({ ...mensagem, pdf, fileName: "relatorio.pdf" });
    expect(fetchMock.mock.calls[0]![0]).toContain("connector-gateway.lovable.dev");
    const mime = Buffer.from(payload().raw, "base64url").toString();
    expect(mime).toContain(Buffer.from(mensagem.subject).toString("base64"));
    expect(mime).toContain('Content-Disposition: attachment; filename="relatorio.pdf"');
    expect(mime).toContain(Buffer.from(pdf).toString("base64"));
  });
  it("mantém o e-mail simples e o nome alternativo da chave Gmail", async () => {
    vi.stubEnv("LOVABLE_API_KEY", "autorizacao-ficticia");
    vi.stubEnv("GOOGLE_MAIL_API_KEY_1", "conexao-alternativa-ficticia");
    await enviarEmail(mensagem);
    expect(fetchMock.mock.calls[0]![1].headers["X-Connection-Api-Key"]).toBe("conexao-alternativa-ficticia");
    expect(Buffer.from(payload().raw, "base64url").toString()).not.toContain("multipart/mixed");
  });
  it("não envia por outro provedor após uma falha de autorização do Gmail", async () => {
    gmail(); appsScript();
    fetchMock.mockResolvedValue(new Response("conteúdo privado do provedor", { status: 403 }));
    await expect(enviarEmail(mensagem)).rejects.toThrow("autorização");
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("não repete um envio cujo resultado ficou incerto por falha de rede", async () => {
    appsScript(); fetchMock.mockRejectedValue(new Error("falha de rede"));
    await expect(enviarEmail(mensagem)).rejects.toThrow("confirmar o envio");
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it.each(["<html>Fazer login</html>", "null", "[]", JSON.stringify({ ok: false, error: "erro com segredo do provedor" }), JSON.stringify({ ok: true, dryRun: true })])(
    "não confirma envio com HTML, falha ou verificação", async (retorno) => {
      appsScript(); fetchMock.mockResolvedValue(new Response(retorno));
      await expect(enviarEmail(mensagem)).rejects.toThrow();
    },
  );
  it("não inclui conteúdo privado do provedor na mensagem de erro", async () => {
    appsScript(); fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: false, error: "credencial-privada-do-provedor" })));
    await expect(enviarEmail(mensagem)).rejects.toThrow("O Apps Script não confirmou o envio [200].");
  });
  it("informa quando o Apps Script garante que nada foi enviado", async () => {
    appsScript(); fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: false, error: "BUSY" })));
    await expect(enviarEmail(mensagem)).rejects.toMatchObject({ codigo: "BUSY", naoEnviado: true });
  });
  it("trata como incerto o retorno sem código conhecido ou sem resposta", async () => {
    appsScript(); fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: false, error: "outro" })));
    await expect(enviarEmail(mensagem)).rejects.toMatchObject({ codigo: "SEM_CONFIRMACAO", naoEnviado: false });
    fetchMock.mockReset().mockRejectedValue(new Error("falha de rede"));
    await expect(enviarEmail(mensagem)).rejects.toMatchObject({ codigo: "SEM_CONFIRMACAO", naoEnviado: false });
  });
  it("verifica a integração sem destinatários nem mensagem", async () => {
    appsScript();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true, dryRun: true, sender: "apontaproducao@gmail.com", capabilities: ["pdf", "password-recovery"], remainingDailyRecipients: 100 })));
    expect(await verificarIntegracaoAppsScript()).toEqual({ remetente: "apontaproducao@gmail.com", destinatariosRestantes: 100 });
    expect(payload()).toMatchObject({ action: "verify" });
    expect(payload()).not.toHaveProperty("to");
    expect(payload()).not.toHaveProperty("body");
  });
});
