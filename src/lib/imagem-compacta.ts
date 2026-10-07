/** Reduz a foto no aparelho antes do envio (lado maior até `max` px). Se falhar, devolve o original. */
export async function compactarImagem(arquivo: File, max = 640, qualidade = 0.82): Promise<File> {
  try {
    if (typeof createImageBitmap !== "function") return arquivo;
    const bitmap = await createImageBitmap(arquivo);
    const escala = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const largura = Math.round(bitmap.width * escala);
    const altura = Math.round(bitmap.height * escala);
    const canvas = document.createElement("canvas");
    canvas.width = largura;
    canvas.height = altura;
    const ctx = canvas.getContext("2d");
    if (!ctx) return arquivo;
    ctx.drawImage(bitmap, 0, 0, largura, altura);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", qualidade));
    if (!blob || blob.size >= arquivo.size) return arquivo;
    return new File([blob], "avatar.jpg", { type: "image/jpeg" });
  } catch {
    return arquivo;
  }
}
