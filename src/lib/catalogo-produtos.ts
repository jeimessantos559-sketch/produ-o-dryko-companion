export type ProdutoOrdenavel = {
  id: string;
  nome: string;
  categoria: string | null;
};

export type MarcaOrdenavel = {
  nome: string;
  ordem: number;
};

export function normalizarMarca(valor: string | null | undefined) {
  return (valor ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleUpperCase("pt-BR");
}

export function ordenarProdutosPorMarca<T extends ProdutoOrdenavel>(
  produtos: readonly T[],
  marcas: readonly MarcaOrdenavel[],
) {
  const ordemPorMarca = new Map(
    marcas.map((marca) => [normalizarMarca(marca.nome), Number(marca.ordem)]),
  );

  return [...produtos].sort((a, b) => {
    const marcaA = normalizarMarca(a.categoria);
    const marcaB = normalizarMarca(b.categoria);
    const ordemA = ordemPorMarca.get(marcaA) ?? Number.MAX_SAFE_INTEGER;
    const ordemB = ordemPorMarca.get(marcaB) ?? Number.MAX_SAFE_INTEGER;

    return (
      ordemA - ordemB ||
      marcaA.localeCompare(marcaB, "pt-BR", { sensitivity: "base" }) ||
      a.nome.localeCompare(b.nome, "pt-BR", { numeric: true, sensitivity: "base" })
    );
  });
}

export function agruparProdutosPorMarca<T extends ProdutoOrdenavel>(produtos: readonly T[]) {
  const grupos = new Map<string, T[]>();

  for (const produto of produtos) {
    const marca = produto.categoria?.trim() || "PRODUTOS";
    grupos.set(marca, [...(grupos.get(marca) ?? []), produto]);
  }

  return [...grupos.entries()];
}
