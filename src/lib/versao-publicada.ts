import { createServerFn } from "@tanstack/react-start";

/** Versão (commit) do código que o servidor está rodando agora. Sem dados de usuário. */
export const obterVersaoPublicada = createServerFn({ method: "GET" }).handler(async () => ({
  versao: typeof __APP_COMMIT__ === "string" ? __APP_COMMIT__ : "local",
}));
