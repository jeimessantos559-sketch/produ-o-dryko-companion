/**
 * Compara a versão que está aberta no aparelho com a versão publicada no servidor.
 * Só avisa quando as duas são conhecidas e diferentes: versão "local" (build sem
 * commit identificado) nunca gera aviso, para não pedir atualização à toa.
 */
export function haNovaVersao(
  atual: string | null | undefined,
  publicada: string | null | undefined,
) {
  const a = (atual ?? "").trim();
  const p = (publicada ?? "").trim();
  if (!a || !p || a === "local" || p === "local") return false;
  return a !== p;
}

export function versaoDoAparelho() {
  return typeof __APP_COMMIT__ === "string" ? __APP_COMMIT__ : "local";
}

/** Consulta leve, sem cache HTTP e sem depender de código da publicação anterior. */
export async function consultarVersaoPublicada(): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch("/versao.json", { cache: "no-store", signal: controller.signal });
    if (!response.ok) throw new Error("Não foi possível verificar a versão publicada.");
    const dados: unknown = await response.json();
    if (!dados || typeof dados !== "object" || !("versao" in dados)) return null;
    return typeof dados.versao === "string" ? dados.versao : null;
  } finally {
    clearTimeout(timeout);
  }
}
