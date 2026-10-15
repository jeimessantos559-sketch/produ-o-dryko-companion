// Misturadores: apontamento por OP + produto com o peso total produzido em kg.
// O peso é digitado pelo facilitador; o app não converte nem multiplica nada.

export const PESO_MAXIMO_KG = 999_999.999;

export function setorEmKg(setor: string | null | undefined): setor is "misturadores" {
  return setor === "misturadores";
}

/**
 * Aceita "1250", "1250,5" ou "1250.5" (até 3 casas). Separador de milhar não é aceito,
 * para que "1.250" nunca vire 1,25 kg sem o facilitador perceber.
 */
export function pesoDigitadoKg(valor: string): number | null {
  const limpo = valor.trim();
  if (!/^\d{1,6}(?:[.,]\d{1,3})?$/.test(limpo)) return null;
  if (/^\d{1,3}\.\d{3}$/.test(limpo)) return null;
  const peso = Number(limpo.replace(",", "."));
  return Number.isFinite(peso) && peso > 0 && peso <= PESO_MAXIMO_KG ? peso : null;
}

export function formatarKg(valor: number) {
  return `${valor.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} kg`;
}

/** Valor já salvo, mostrado no campo de correção com vírgula. */
export function pesoParaCampo(valor: number | null | undefined) {
  return valor == null ? "" : String(Number(valor)).replace(".", ",");
}
