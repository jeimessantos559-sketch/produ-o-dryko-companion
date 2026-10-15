import { afterEach, describe, expect, it, vi } from "vitest";
import { consultarVersaoPublicada, haNovaVersao } from "../versao-app";

afterEach(() => vi.unstubAllGlobals());

describe("aviso de nova versão", () => {
  it("avisa quando o servidor publicou outro commit", () => {
    expect(haNovaVersao("a703f7e", "c523091")).toBe(true);
  });

  it("não avisa na mesma versão nem quando alguma é desconhecida", () => {
    expect(haNovaVersao("c523091", "c523091")).toBe(false);
    expect(haNovaVersao("c523091", " c523091 ")).toBe(false);
    expect(haNovaVersao("local", "c523091")).toBe(false);
    expect(haNovaVersao("c523091", "local")).toBe(false);
    expect(haNovaVersao("c523091", "")).toBe(false);
    expect(haNovaVersao(undefined, null)).toBe(false);
  });
});

describe("consulta da versão publicada", () => {
  it("usa endereço estável e ignora a cópia do cache HTTP", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ versao: "c523091" }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await consultarVersaoPublicada()).toBe("c523091");
    expect(fetchMock).toHaveBeenCalledWith("/versao.json", {
      cache: "no-store",
      signal: expect.any(AbortSignal),
    });
  });

  it.each([null, "c523091", {}, { versao: 123 }])(
    "não inventa versão para resposta inválida: %j",
    async (dados) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(dados)));
      expect(await consultarVersaoPublicada()).toBeNull();
    },
  );

  it("não trata uma falha HTTP como atualização disponível", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("indisponível", { status: 503 })),
    );
    await expect(consultarVersaoPublicada()).rejects.toThrow("Não foi possível verificar");
  });
});
