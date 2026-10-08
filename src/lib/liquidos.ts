export type EmbalagemLiquido = "balde" | "galao" | "unidade" | "saco";

export function setorComConsumoSemi(
  setor: string | null | undefined,
): setor is "liquidos" | "asfox" {
  return setor === "liquidos" || setor === "asfox";
}

export type ParametrosLiquido = {
  embalagem_liquido?: string | null;
  unidades_por_plt?: number | null;
  semi_kg_por_unidade?: number | null;
};

export type QuantidadeLiquido = {
  quantidadePlts: number;
  picadoUnidades: number | "";
  unidades: number;
};

export const quantidadeLiquidoInicial = (): QuantidadeLiquido => ({
  quantidadePlts: 1,
  picadoUnidades: "",
  unidades: 0,
});

export function nomeEmbalagemLiquido(embalagem: string | null | undefined) {
  return embalagem === "saco"
    ? "Saco"
    : embalagem === "balde"
      ? "Balde"
      : embalagem === "galao"
        ? "Galão"
        : "Unidade";
}

/** Aceita o peso digitado ou colado com vírgula ou ponto, até a precisão do cadastro. */
export function pesoLiquidoKg(valor: string): number | null {
  const normalizado = valor.trim().replace(",", ".");
  const peso = Number(normalizado);
  return /^\d+(?:\.\d{1,3})?$/.test(normalizado) && peso > 0 && peso <= 999_999_999.999
    ? peso
    : null;
}

/** O cadastro define a conversão; o nome do produto nunca determina a conta. */
export function calcularLiquidos(
  produto: ParametrosLiquido | null | undefined,
  quantidade: QuantidadeLiquido,
) {
  const pouch = produto?.embalagem_liquido === "unidade";
  const unitario = pouch && produto.unidades_por_plt == null;
  const padrao = Number(produto?.unidades_por_plt ?? 0);
  const fator = Number(produto?.semi_kg_por_unidade ?? 0);
  const padraoValido = Number.isSafeInteger(padrao) && padrao > 0 && padrao <= 2_147_483_647;
  const consomeSemi =
    pouch ||
    produto?.embalagem_liquido === "balde" ||
    produto?.embalagem_liquido === "galao" ||
    produto?.embalagem_liquido === "saco";
  const configurado = Boolean(
    produto && consomeSemi && Number.isFinite(fator) && fator > 0 && (unitario || padraoValido),
  );
  const picado = quantidade.picadoUnidades === "" ? 0 : quantidade.picadoUnidades;
  const plts = unitario ? 0 : quantidade.quantidadePlts;
  const unidades = unitario ? quantidade.unidades : plts * padrao + picado;
  const semiKg = consomeSemi ? Math.round(unidades * fator * 1000) / 1000 : 0;
  const valido =
    configurado &&
    Number.isSafeInteger(unidades) &&
    unidades > 0 &&
    unidades <= 2_147_483_647 &&
    Number.isFinite(semiKg) &&
    (unitario ||
      (Number.isInteger(plts) &&
        plts >= 0 &&
        plts <= 20 &&
        Number.isInteger(picado) &&
        picado >= 0 &&
        picado < padrao));
  return {
    unitario,
    consomeSemi,
    configurado,
    valido,
    plts,
    unidades,
    semiKg,
    picado: unitario ? 0 : picado,
  };
}
