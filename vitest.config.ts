import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Config própria dos testes: não carrega os plugins do app (testes só de regras puras).
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { include: ["src/**/*.test.ts"], environment: "node" },
});
