import { toast } from "sonner";

/**
 * Impede falsa sensação de salvamento nas ações que exigem o servidor (correção,
 * fechamento, lançamento). O apontamento rápido é a exceção: sem conexão ele é
 * guardado no aparelho (src/lib/fila-offline.ts) e enviado depois.
 */
export function bloquearSeOffline() {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    toast.error("Sem internet. Esta alteração NÃO foi salva. Tente novamente quando a conexão voltar.");
    return true;
  }
  return false;
}
