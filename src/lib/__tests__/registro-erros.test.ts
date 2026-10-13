import { beforeEach, describe, expect, it } from "vitest";

import {
  LIMITE_POR_SESSAO,
  contarErroGravado,
  deveRegistrar,
  mensagemDoErro,
  reiniciarRegistroDeErros,
} from "../registro-erros-regras";

describe("registro automático de erros", () => {
  beforeEach(() => reiniciarRegistroDeErros());

  it("monta a mensagem a partir de Error, texto ou objeto", () => {
    expect(mensagemDoErro(new TypeError("x is undefined"))).toBe("TypeError: x is undefined");
    expect(mensagemDoErro("falhou")).toBe("falhou");
    expect(mensagemDoErro({ message: "erro do banco" })).toBe("erro do banco");
    expect(mensagemDoErro("a".repeat(2000))).toHaveLength(1000);
  });

  it("não registra falta de internet nem ruído conhecido do navegador", () => {
    expect(deveRegistrar(new TypeError("Failed to fetch"), "/painel")).toBe(false);
    expect(deveRegistrar("ResizeObserver loop limit exceeded", "/painel")).toBe(false);
    expect(deveRegistrar("Script error.", "/painel")).toBe(false);
    expect(deveRegistrar(new Error("x"), "/painel", Date.now(), "chrome-extension://abc/x.js")).toBe(
      false,
    );
  });

  it("registra o mesmo erro uma vez por minuto em cada tela", () => {
    const agora = 1_000_000;
    expect(deveRegistrar(new Error("quebrou"), "/painel", agora)).toBe(true);
    expect(deveRegistrar(new Error("quebrou"), "/painel", agora + 30_000)).toBe(false);
    expect(deveRegistrar(new Error("quebrou"), "/historico", agora + 30_000)).toBe(true);
    expect(deveRegistrar(new Error("quebrou"), "/painel", agora + 61_000)).toBe(true);
  });

  it("para de registrar depois do limite da sessão", () => {
    for (let i = 0; i < LIMITE_POR_SESSAO; i += 1) contarErroGravado();
    expect(deveRegistrar(new Error("novo"), "/painel")).toBe(false);
  });
});
