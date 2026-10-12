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

// Migrações: numeração sequencial, sem lacunas e sem novos números repetidos.
// Os quatro pares abaixo já estão aplicados em produção com estes nomes; não renomeie.
// A ordem de execução é a ordem alfabética do nome do arquivo (ver docs/GUIA_MIGRACAO_E_BACKUP.md).
const paresHistoricos = {
  "0004": ["0004_configuracoes_permissoes_biometria.sql", "0004_login_usuario_relatorios.sql"],
  "0019": ["0019_configuracoes_avatar_webauthn.sql", "0019_limite_tentativas_auth.sql"],
  "0020": ["0020_atualizar_meu_perfil_rpc.sql", "0020_corrige_perfil_editavel.sql"],
  "0021": ["0021_horarios_ocorrencias.sql", "0021_seguranca_autenticacao.sql"],
};
const migracoes = readdirSync("drizzle/migrations").filter((n) => n.endsWith(".sql")).sort();
const porNumero = new Map();
for (const nome of migracoes) {
  if (!/^\d{4}_[a-z0-9_]+\.sql$/.test(nome)) {
    erros.push(`Migração com nome fora do padrão NNNN_descricao.sql: ${nome}`);
    continue;
  }
  const numero = nome.slice(0, 4);
  porNumero.set(numero, [...(porNumero.get(numero) ?? []), nome]);
}
for (const [numero, nomes] of porNumero) {
  if (nomes.length < 2) continue;
  const permitido = paresHistoricos[numero];
  if (!permitido || nomes.join() !== permitido.join()) {
    erros.push(`Número de migração repetido ${numero}: ${nomes.join(", ")}. Use o próximo número livre.`);
  }
}
const maior = Math.max(-1, ...[...porNumero.keys()].map(Number));
for (let indice = 0; indice <= maior; indice += 1) {
  const numero = String(indice).padStart(4, "0");
  if (!porNumero.has(numero)) erros.push(`Migração ${numero} ausente na sequência.`);
}

if (erros.length) {
  console.error("verify:portability falhou:\n- " + erros.join("\n- "));
  process.exit(1);
}
console.log("verify:portability OK");
