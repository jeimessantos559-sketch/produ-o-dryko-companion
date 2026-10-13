import { describe, expect, it, vi } from "vitest";

import {
  ErroEnvioEmail,
  enviarComNovasTentativas,
  podeRepetirAutomaticamente,
} from "../reenvio-email";

const semEspera = () => Promise.resolve();

describe("reenvio automático do e-mail do relatório", () => {
  it("repete só quando o serviço garantiu que nada saiu e o motivo é passageiro", () => {
    expect(podeRepetirAutomaticamente(new ErroEnvioEmail("ocupado", "BUSY", true))).toBe(true);
    expect(podeRepetirAutomaticamente(new ErroEnvioEmail("falhou", "SEND_FAILED", true))).toBe(true);
    expect(podeRepetirAutomaticamente(new ErroEnvioEmail("cota", "QUOTA_EXCEEDED", true))).toBe(false);
    expect(podeRepetirAutomaticamente(new ErroEnvioEmail("?", "SEM_CONFIRMACAO", false))).toBe(false);
    expect(podeRepetirAutomaticamente(new Error("qualquer"))).toBe(false);
  });

  it("envia na segunda tentativa depois de serviço ocupado", async () => {
    const enviar = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new ErroEnvioEmail("ocupado", "BUSY", true))
      .mockResolvedValueOnce(undefined);
    const esperar = vi.fn(semEspera);
    await expect(enviarComNovasTentativas(enviar, esperar)).resolves.toBe(2);
    expect(esperar).toHaveBeenCalledWith(2000);
  });

  it("nunca repete um envio de resultado incerto", async () => {
    const enviar = vi
      .fn<() => Promise<void>>()
      .mockRejectedValue(new ErroEnvioEmail("sem resposta", "SEM_CONFIRMACAO", false));
    await expect(enviarComNovasTentativas(enviar, semEspera)).rejects.toThrow("sem resposta");
    expect(enviar).toHaveBeenCalledOnce();
  });

  it("desiste depois de três tentativas", async () => {
    const enviar = vi
      .fn<() => Promise<void>>()
      .mockRejectedValue(new ErroEnvioEmail("ocupado", "BUSY", true));
    await expect(enviarComNovasTentativas(enviar, semEspera)).rejects.toThrow("ocupado");
    expect(enviar).toHaveBeenCalledTimes(3);
  });
});
