export type SetorAgrupamento = "corte" | "fitas" | "mantas" | string;

export type ItemAgrupavelProtheus = {
  id: string;
  produto_nome: string;
  op?: string | null;
  lote?: string | null;
};

export function normalizarChaveProtheus(valor: string | null | undefined) {
  return (valor ?? "").trim().toLocaleUpperCase("pt-BR");
}

/**
 * Regra industrial única para consolidação antes do lançamento:
 * - Corte e Fitas: OP + produto;
 * - Mantas: lote + produto;
 * - sem o identificador obrigatório: mantém o registro isolado.
 */
export function chaveAgrupamentoProtheus(
  item: ItemAgrupavelProtheus,
  setor: SetorAgrupamento,
  sufixo = "",
) {
  const produto = normalizarChaveProtheus(item.produto_nome);
  if (setor === "mantas" && item.lote) {
    return `manta:${produto}:${normalizarChaveProtheus(item.lote)}${sufixo}`;
  }
  if (setor === "corte" && item.op) {
    return `corte:${produto}:${normalizarChaveProtheus(item.op)}${sufixo}`;
  }
  if (setor === "fitas" && item.op) {
    return `fitas:${produto}:${normalizarChaveProtheus(item.op)}${sufixo}`;
  }
  if (setor === "liquidos" && item.op) {
    return `liquidos:${produto}:${normalizarChaveProtheus(item.op)}${sufixo}`;
  }
  return `item:${item.id}${sufixo}`;
}
