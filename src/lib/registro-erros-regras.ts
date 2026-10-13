/** Regras puras do registro de erros (sem acesso ao banco), cobertas por testes. */
import { ehErroDeRede } from "@/lib/fila-offline";

export const LIMITE_POR_SESSAO = 20;
const JANELA_REPETICAO_MS = 60_000;
const recentes = new Map<string, number>();
let gravados = 0;

const RUIDO =
  /resizeobserver loop|script error\.?$|non-error promise rejection|aborterror|the operation was aborted|load failed for the module script|dynamically imported module|chunkloaderror/i;

export function mensagemDoErro(erro: unknown): string {
  if (erro instanceof Error) return `${erro.name}: ${erro.message}`.slice(0, 1000);
  if (typeof erro === "string") return erro.slice(0, 1000);
  if (erro && typeof erro === "object" && "message" in erro)
    return String((erro as { message: unknown }).message).slice(0, 1000);
  try {
    return JSON.stringify(erro).slice(0, 1000);
  } catch {
    return String(erro).slice(0, 1000);
  }
}

/** Decide se vale gravar: filtra ruído, rede, extensões, repetição e excesso. */
export function deveRegistrar(
  erro: unknown,
  rota: string,
  agora = Date.now(),
  arquivo?: string | null,
): boolean {
  const mensagem = mensagemDoErro(erro);
  if (!mensagem.trim() || RUIDO.test(mensagem) || ehErroDeRede(erro)) return false;
  if (arquivo && /^(chrome|moz|safari)-extension:/i.test(arquivo)) return false;
  if (gravados >= LIMITE_POR_SESSAO) return false;
  const chave = `${mensagem}|${rota}`;
  const ultimo = recentes.get(chave);
  if (ultimo != null && agora - ultimo < JANELA_REPETICAO_MS) return false;
  recentes.set(chave, agora);
  return true;
}

/** Só para testes: zera os contadores da sessão. */
export function reiniciarRegistroDeErros() {
  recentes.clear();
  gravados = 0;
}

/** Conta um erro efetivamente gravado (para o limite por sessão). */
export function contarErroGravado() {
  gravados += 1;
}
