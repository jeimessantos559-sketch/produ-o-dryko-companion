/**
 * Compara a versão que está aberta no aparelho com a versão publicada no servidor.
 * Só avisa quando as duas são conhecidas e diferentes: versão "local" (build sem
 * commit identificado) nunca gera aviso, para não pedir atualização à toa.
 */
export function haNovaVersao(atual: string | null | undefined, publicada: string | null | undefined) {
  const a = (atual ?? "").trim();
  const p = (publicada ?? "").trim();
  if (!a || !p || a === "local" || p === "local") return false;
  return a !== p;
}

export function versaoDoAparelho() {
  return typeof __APP_COMMIT__ === "string" ? __APP_COMMIT__ : "local";
}
