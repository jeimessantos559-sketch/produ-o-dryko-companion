import { readFileSync } from "node:fs";
import type { Plugin } from "vite";

/** Mantém o endereço do worker, mas muda seu conteúdo a cada publicação. */
export function atualizacaoPwa(versao: string, build: string): Plugin {
  const versaoJson = JSON.stringify({ versao, build });
  return {
    name: "dryko-atualizacao-pwa",
    applyToEnvironment: (environment) => environment.name === "client",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url?.split("?")[0] !== "/versao.json") return next();
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.setHeader("Cache-Control", "no-store");
        response.end(versaoJson);
      });
    },
    generateBundle() {
      const worker = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
      this.emitFile({
        type: "asset",
        fileName: "sw.js",
        source: `// Publicação: ${versaoJson}\n${worker}`,
      });
      // Endereço estável: aparelhos antigos não dependem do ID de uma server function.
      this.emitFile({ type: "asset", fileName: "versao.json", source: versaoJson });
    },
  };
}
