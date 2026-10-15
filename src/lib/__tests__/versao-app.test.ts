import { describe, expect, it } from "vitest";
import { haNovaVersao } from "../versao-app";

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
