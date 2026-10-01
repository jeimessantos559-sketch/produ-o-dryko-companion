// Regras puras de agrupamento para lançamento manual no Protheus.
// Apontamentos continuam unitários no banco; o agrupamento serve apenas para lançar.
// Corte: OP + produto · Fitas: OP + produto · Mantas: lote + produto.

export type ItemProtheus = {
  id: string;
  setor?: string | null;
  status?: string | null;
  produto_nome: string;
  op?: string | null;
  lote?: string | null;
  data_local?: string | null;
  turno?: string | null;
  quantidade_plts?: number | null;
  total_rolos?: number | null;
  metragem?: number | null;
  area_m2?: number | null;
};

export type GrupoProtheusBase<T extends ItemProtheus> = {
  chave: string;
  ids: string[];
  item: T;
  itens: T[];
  registros: number;
  plts: number;
  rolos: number;
  metragem: number;
  area: number;
};

export function normalizarChaveProtheus(valor: string | null | undefined) {
  return (valor ?? "").trim().toLocaleUpperCase("pt-BR");
}

export function chaveProtheus(
  item: ItemProtheus,
  setor: string,
  opcoes: { incluirTurno?: boolean; somentePendentes?: boolean } = {},
) {
  const unitario = `item:${item.id}`;
  if (opcoes.somentePendentes && item.status !== "pendente") return unitario;
  const produto = normalizarChaveProtheus(item.produto_nome);
  const sufixo = opcoes.incluirTurno ? `:${item.data_local ?? ""}:${item.turno ?? ""}` : "";
  if (setor === "mantas" && item.lote) return `manta:${produto}:${normalizarChaveProtheus(item.lote)}${sufixo}`;
  if (setor === "corte" && item.op) return `corte:${produto}:${normalizarChaveProtheus(item.op)}${sufixo}`;
  if (setor === "fitas" && item.op) return `fitas:${produto}:${normalizarChaveProtheus(item.op)}${sufixo}`;
  return unitario;
}

export function agruparProtheus<T extends ItemProtheus>(
  itens: readonly T[],
  setor: string,
  opcoes: { incluirTurno?: boolean; somentePendentes?: boolean } = {},
): GrupoProtheusBase<T>[] {
  const mapa = new Map<string, GrupoProtheusBase<T>>();
  for (const item of itens) {
    const chave = chaveProtheus(item, setor, opcoes);
    const atual = mapa.get(chave) ?? {
      chave, ids: [], item, itens: [], registros: 0, plts: 0, rolos: 0, metragem: 0, area: 0,
    };
    atual.ids.push(item.id);
    atual.itens.push(item);
    atual.registros += 1;
    atual.plts += Number(item.quantidade_plts ?? 0);
    atual.rolos += Number(item.total_rolos ?? 0);
    atual.metragem += Number(item.metragem ?? 0);
    atual.area += Number(item.area_m2 ?? 0);
    mapa.set(chave, atual);
  }
  return [...mapa.values()];
}
