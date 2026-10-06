import { toast } from "sonner";

/** Impede falsa sensação de salvamento: sem conexão, nada é enviado nem guardado para depois. */
export function bloquearSeOffline() {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    toast.error("Sem internet. O apontamento NÃO foi salvo. Tente novamente quando a conexão voltar.");
    return true;
  }
  return false;
}
