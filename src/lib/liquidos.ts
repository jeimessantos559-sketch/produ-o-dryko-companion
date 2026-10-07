export type EmbalagemLiquido = "balde" | "galao" | "unidade";

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
  return embalagem === "balde" ? "Balde" : embalagem === "galao" ? "Galão" : "Unidade";
}

/** O cadastro define a conversão; o nome do produto nunca determina a conta. */
export function calcularLiquidos(
  produto: ParametrosLiquido | null | undefined,
  quantidade: QuantidadeLiquido,
) {
  const unitario = produto?.embalagem_liquido === "unidade";
  const padrao = Number(produto?.unidades_por_plt ?? 0);
  const fator = Number(produto?.semi_kg_por_unidade ?? 0);
  const configurado = Boolean(
    produto &&
    (unitario ||
      ((produto.embalagem_liquido === "balde" || produto.embalagem_liquido === "galao") &&
        Number.isSafeInteger(padrao) &&
        padrao > 0 &&
        Number.isFinite(fator) &&
        fator > 0)),
  );
  const picado = quantidade.picadoUnidades === "" ? 0 : quantidade.picadoUnidades;
  const plts = unitario ? 0 : quantidade.quantidadePlts;
  const unidades = unitario ? quantidade.unidades : plts * padrao + picado;
  const semiKg = unitario ? 0 : Math.round(unidades * fator * 1000) / 1000;
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
  return { unitario, configurado, valido, plts, unidades, semiKg, picado: unitario ? 0 : picado };
}
