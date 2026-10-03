import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const raiz = process.cwd();
const erros = [];
const avisos = [];

function exigirArquivo(caminho) {
  if (!existsSync(resolve(raiz, caminho))) erros.push(`Arquivo ausente: ${caminho}`);
}

const arquivosObrigatorios = [
  "package.json",
  "bun.lock",
  ".env.example",
  "src/integrations/supabase/types.ts",
  "docs/PROMPT_MESTRE_APONTA_PRODUCAO.md",
  "docs/GUIA_MIGRACAO_E_BACKUP.md",
  "drizzle/migrations/0000_etapa1_base_usuarios_setores_turnos.sql",
  "drizzle/migrations/0019_configuracoes_avatar_webauthn.sql",
  "drizzle/migrations/0020_corrige_perfil_editavel.sql",
  "drizzle/migrations/0021_seguranca_autenticacao.sql",
  ".github/workflows/quality.yml",
  ".github/workflows/backup-dados.yml",
  "scripts/exportar-storage-backup.mjs",
];
arquivosObrigatorios.forEach(exigirArquivo);

const exemploEnv = existsSync(resolve(raiz, ".env.example"))
  ? readFileSync(resolve(raiz, ".env.example"), "utf8")
  : "";
for (const chave of [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "APP_URL",
]) {
  if (!new RegExp(`^${chave}=`, "m").test(exemploEnv))
    erros.push(`Variavel ausente no .env.example: ${chave}`);
}

const pacote = JSON.parse(readFileSync(resolve(raiz, "package.json"), "utf8"));
for (const dependencia of [
  "@simplewebauthn/browser",
  "@simplewebauthn/server",
  "@supabase/supabase-js",
]) {
  if (!pacote.dependencies?.[dependencia]) erros.push(`Dependencia ausente: ${dependencia}`);
}

const diretorioMigracoes = resolve(raiz, "drizzle/migrations");
const migracoes = existsSync(diretorioMigracoes)
  ? readdirSync(diretorioMigracoes)
      .filter((nome) => nome.endsWith(".sql"))
      .sort()
  : [];
for (let indice = 0; indice <= 21; indice += 1) {
  const prefixo = String(indice).padStart(4, "0");
  if (!migracoes.some((nome) => nome.startsWith(`${prefixo}_`)))
    erros.push(`Migracao ${prefixo} ausente`);
}

if (existsSync(resolve(raiz, ".env"))) {
  const envLocal = readFileSync(resolve(raiz, ".env"), "utf8");
  if (/^VITE_[A-Z0-9_]*(SERVICE_ROLE|SECRET|TOKEN)[A-Z0-9_]*=/m.test(envLocal)) {
    erros.push("Segredo encontrado com prefixo VITE_; ele seria exposto ao navegador.");
  }
  if (/^SUPABASE_SERVICE_ROLE_KEY=\s*\S+/m.test(envLocal)) {
    avisos.push("A .env local contem service role: confirme que ela nao sera adicionada ao Git.");
  }
}

if (avisos.length) {
  console.warn("Avisos de portabilidade:");
  avisos.forEach((aviso) => console.warn(`- ${aviso}`));
}

if (erros.length) {
  console.error("Falha na verificacao de portabilidade:");
  erros.forEach((erro) => console.error(`- ${erro}`));
  process.exitCode = 1;
} else {
  console.log(
    `Portabilidade verificada: ${arquivosObrigatorios.length} arquivos essenciais e ${migracoes.length} migracoes SQL.`,
  );
  console.log(
    "Observacao: esta verificacao cobre codigo e estrutura; os registros do Supabase exigem backup separado.",
  );
}
