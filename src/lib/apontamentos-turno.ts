import type { Database, Json } from "@/integrations/supabase/types";
import type { GrupoCorte } from "./producao.ts";

export type ApontamentoTurno = Database["public"]["Tables"]["apontamentos"]["Row"] & {
  correcao?: { nome: string | null; motivo: string; created_at: string } | null;
};

export function gruposFechados(valor: Json | null): GrupoCorte[] {
  if (!Array.isArray(valor)) return [];
  return (valor as unknown as GrupoCorte[]).map((grupo) => ({
    ...grupo,
    quantidadePlts: Math.max(
      0,
      Number(grupo.quantidadePlts ?? 0) -
        (grupo.pltPicadoRolos != null && grupo.picadoAdicional !== true ? 1 : 0),
    ),
    picadoAdicional: true,
  }));
}

export function pltsFechados(item: Pick<ApontamentoTurno, "setor" | "grupos" | "quantidade_plts">) {
  const grupos = item.setor === "corte" ? gruposFechados(item.grupos) : [];
  return grupos.length
    ? grupos.reduce((n, g) => n + g.quantidadePlts, 0)
    : Number(item.quantidade_plts ?? 0);
}

/** A numeração usa todos os registros do turno, antes dos filtros, e se recalcula após correções. */
export function sequenciasDoTurno(itens: readonly ApontamentoTurno[]) {
  const acumulado = new Map<string, number>();
  const sequencias = new Map<
    string,
    { registro: number; inicio: number | null; fim: number | null }
  >();
  const ordenados = [...itens].sort(
    (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
  );
  ordenados.forEach((item, indice) => {
    const chave = `${item.setor}:${item.turno}:${item.data_local}:${item.produto_id}`;
    const anterior = acumulado.get(chave) ?? 0;
    const qtd = pltsFechados(item);
    sequencias.set(item.id, {
      registro: indice + 1,
      inicio: qtd > 0 ? anterior + 1 : null,
      fim: qtd > 0 ? anterior + qtd : null,
    });
    acumulado.set(chave, anterior + qtd);
  });
  return sequencias;
}

export function contagemPorProduto(
  itens: readonly ApontamentoTurno[],
  setor: string,
  turno: string,
  data: string,
) {
  const mapa = new Map<
    string,
    {
      produtoId: string;
      nome: string;
      plts: number;
      rolos: number;
      metragem: number;
      area: number;
      unidades: number;
      semiKg: number;
    }
  >();
  for (const item of itens) {
    if (item.setor !== setor || item.turno !== turno || item.data_local !== data) continue;
    const total = mapa.get(item.produto_id) ?? {
      produtoId: item.produto_id,
      nome: item.produto_nome,
      plts: 0,
      rolos: 0,
      metragem: 0,
      area: 0,
      unidades: 0,
      semiKg: 0,
    };
    total.plts += pltsFechados(item);
    total.rolos += Number(item.total_rolos ?? 0);
    total.metragem += Number(item.metragem ?? 0);
    total.area += Number(item.area_m2 ?? 0);
    total.unidades += Number(item.total_unidades ?? 0);
    total.semiKg += Number(item.semi_consumido_kg ?? 0);
    mapa.set(item.produto_id, total);
  }
  return [...mapa.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/** Nunca escolhe arbitrariamente um produto quando a referência pertence a vários. */
export function produtoUnicoDaReferencia(
  itens: readonly { produto_id: string }[],
  produtosAtivos: readonly { id: string }[],
) {
  const ids = [...new Set(itens.map((i) => i.produto_id))];
  if (ids.length !== 1) return { id: null, ambiguo: ids.length > 1 };
  return { id: produtosAtivos.some((p) => p.id === ids[0]) ? ids[0]! : null, ambiguo: false };
}
