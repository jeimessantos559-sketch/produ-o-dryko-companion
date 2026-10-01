// Verifica se o projeto continua portável para o runtime de borda (Worker) e para o CI.
// Sem segredos: só lê arquivos do repositório.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const erros = [];
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const deps = { ...pkg.dependencies, ...pkg.devDependencies };

// Pacotes que já derrubaram o Worker ou exigem binários nativos.
for (const proibido of ["@simplewebauthn/server", "sharp", "canvas", "puppeteer", "react-router-dom", "reflect-metadata"]) {
  if (deps[proibido]) erros.push(`Dependência não portável: ${proibido}`);
}
if (!existsSync("bun.lock")) erros.push("bun.lock ausente: o CI instala pelo lockfile.");

function arquivos(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? arquivos(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}

for (const arquivo of arquivos("src")) {
  const texto = readFileSync(arquivo, "utf8");
  const servidor = /\.server\.tsx?$/.test(arquivo) || arquivo.includes("integrations/supabase/");
  if (/from\s+["']child_process["']|require\(["']child_process["']\)/.test(texto)) erros.push(`${arquivo}: child_process não funciona no Worker`);
  if (/from\s+["']@\/integrations\/supabase\/client\.server["']/.test(texto) && !servidor) {
    erros.push(`${arquivo}: importa client.server no topo (use await import dentro do handler)`);
  }
  if (/import\s[^;]*["']\.\/webauthn\.server["']/.test(texto) && !servidor) {
    erros.push(`${arquivo}: importa webauthn.server no topo (carregue sob demanda)`);
  }
  if (/SERVICE_ROLE_KEY/.test(texto) && !servidor) erros.push(`${arquivo}: referência à chave de serviço fora do servidor`);
}

if (erros.length) {
  console.error("verify:portability falhou:\n- " + erros.join("\n- "));
  process.exit(1);
}
console.log("verify:portability OK");
