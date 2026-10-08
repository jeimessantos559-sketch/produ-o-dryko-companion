import type { Json } from "@/integrations/supabase/types";
import { gruposFechados, pltsFechados, type ApontamentoTurno } from "./apontamentos-turno.ts";
import { dataOperacional, type TurnoOperacional } from "./producao.ts";
import { setorComConsumoSemi } from "./liquidos.ts";

export type GrupoRevisao = {
  chave: string;
  setor: string;
  produtoNome: string;
  lote: string;
  ops: string[];
  plts: number;
  picados: number;
  unidadesPicadas: number;
  unidades: number;
  semiKg: number;
  area: number;
  pendentes: number;
  lancados: number;
};

const referencia = (valor: string | null | undefined) => valor?.trim().toUpperCase() ?? "";

/** A revisão consolida produto/lote. A OP não separa os totais do mesmo produto. */
export function agruparRevisaoDoTurno(itens: readonly ApontamentoTurno[]): GrupoRevisao[] {
  const mapa = new Map<string, GrupoRevisao>();
  for (const item of itens) {
    const lote = referencia(item.lote);
    const chave = JSON.stringify([item.setor, item.turno, item.data_local, item.produto_id, lote]);
    const grupo = mapa.get(chave) ?? {
      chave,
      setor: item.setor,
      produtoNome: item.produto_nome,
      lote,
      ops: [],
      plts: 0,
      picados: 0,
      unidadesPicadas: 0,
      unidades: 0,
      semiKg: 0,
      area: 0,
      pendentes: 0,
      lancados: 0,
    };
    const op = referencia(item.op);
    if (op && !grupo.ops.includes(op)) grupo.ops.push(op);
    grupo.plts += pltsFechados(item);
    grupo.area += Number(item.area_m2 ?? 0);
    grupo.unidades += Number(item.total_unidades ?? 0);
    grupo.semiKg += Number(item.semi_consumido_kg ?? 0);
    grupo.pendentes += item.status === "pendente" ? 1 : 0;
    grupo.lancados += item.status === "lancado" ? 1 : 0;
    if (setorComConsumoSemi(item.setor) && Number(item.picado_unidades ?? 0) > 0) {
      grupo.picados += 1;
      grupo.unidadesPicadas += Number(item.picado_unidades);
    }
    if (item.setor === "corte") {
      const grupos = gruposFechados(item.grupos);
      const picados = grupos.filter((g) => Number(g.pltPicadoRolos ?? 0) > 0);
      grupo.picados += picados.length;
      grupo.unidadesPicadas += picados.reduce((n, g) => n + Number(g.pltPicadoRolos), 0);
      // Apontamentos antigos podem guardar o picado isolado sem o JSON de grupos.
      if (!grupos.length && pltsFechados(item) === 0 && Number(item.total_rolos ?? 0) > 0) {
        grupo.picados += 1;
        grupo.unidadesPicadas += Number(item.total_rolos);
      }
    }
    mapa.set(chave, grupo);
  }
  return [...mapa.values()].sort(
    (a, b) =>
      a.produtoNome.localeCompare(b.produtoNome, "pt-BR") || a.lote.localeCompare(b.lote, "pt-BR"),
  );
}

export function quantidadeDaRevisao(grupo: GrupoRevisao) {
  const numero = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  if (grupo.setor === "fitas") return `${numero(grupo.area)} m²`;
  if (setorComConsumoSemi(grupo.setor) && grupo.plts === 0 && grupo.picados === 0)
    return `${numero(grupo.unidades)} unidades`;
  const partes: string[] = [];
  if (grupo.plts > 0 || grupo.picados === 0)
    partes.push(`${numero(grupo.plts)} ${grupo.plts === 1 ? "PLT" : "PLTs"}`);
  if (grupo.picados > 0) {
    partes.push(
      `${numero(grupo.picados)} ${grupo.picados === 1 ? "picado" : "picados"} de ${numero(grupo.unidadesPicadas)} unidades`,
    );
  }
  return partes.join(" e ");
}

export type FonteFinalizacao = {
  produto_id: string;
  produto_nome: string;
  op?: string | null;
  lote?: string | null;
  status?: string;
  finalizado_em: string | null;
  finalizado_por?: string | null;
  finalizado_por_nome?: string | null;
};

export type OpFinalizada = {
  produto_id: string;
  produto_nome: string;
  op: string | null;
  lote: string | null;
  status: "finalizada";
  finalizado_em: string | null;
  finalizado_por_nome: string | null;
};

function chaveFinalizacao(item: { produto_id: string; op?: string | null; lote?: string | null }) {
  return JSON.stringify([item.produto_id, referencia(item.op), referencia(item.lote)]);
}

/** Só registra a finalização explícita, vinculada à produção e à data operacional deste turno. */
export function opsFinalizadasDoTurno(
  apontamentos: readonly ApontamentoTurno[],
  fontes: readonly FonteFinalizacao[],
  data: string,
  turno: TurnoOperacional,
  nomes: Readonly<Record<string, string>> = {},
): OpFinalizada[] {
  const referentes = new Set(apontamentos.map(chaveFinalizacao));
  const finais = new Map<string, OpFinalizada>();
  for (const item of fontes) {
    const chave = chaveFinalizacao(item);
    if (!referentes.has(chave) || (!referencia(item.op) && !referencia(item.lote))) continue;
    if (item.status !== undefined && item.status !== "finalizada") continue;
    if (!item.finalizado_em || Number.isNaN(new Date(item.finalizado_em).getTime())) continue;
    if (dataOperacional(turno, new Date(item.finalizado_em)) !== data) continue;
    const anterior = finais.get(chave);
    if (
      anterior &&
      new Date(anterior.finalizado_em!).getTime() >= new Date(item.finalizado_em).getTime()
    )
      continue;
    finais.set(chave, {
      produto_id: item.produto_id,
      produto_nome: item.produto_nome,
      op: referencia(item.op) || null,
      lote: referencia(item.lote) || null,
      status: "finalizada",
      finalizado_em: item.finalizado_em,
      finalizado_por_nome: item.finalizado_por_nome || nomes[item.finalizado_por ?? ""] || null,
    });
  }
  return [...finais.values()].sort((a, b) => a.produto_nome.localeCompare(b.produto_nome, "pt-BR"));
}

function objeto(valor: Json | undefined): Record<string, Json | undefined> {
  return valor && typeof valor === "object" && !Array.isArray(valor) ? valor : {};
}

/** Relatórios antigos podem ter metas salvas; metas ativas nunca aparecem como OPs finalizadas. */
export function opsFinalizadasNoRelatorio(resumo: Json | undefined): OpFinalizada[] {
  const raiz = objeto(resumo);
  const fontes = raiz["ops_finalizadas"] ?? raiz["metas"];
  if (!Array.isArray(fontes)) return [];
  const finais = new Map<string, OpFinalizada>();
  for (const valor of fontes) {
    const item = objeto(valor);
    if (item["status"] !== "finalizada") continue;
    const ler = (campo: string) => (typeof item[campo] === "string" ? (item[campo] as string) : "");
    const op = referencia(ler("op")) || null;
    const lote = referencia(ler("lote")) || null;
    if (!op && !lote) continue;
    const finalizada: OpFinalizada = {
      produto_id: ler("produto_id"),
      produto_nome: ler("produto_nome"),
      op,
      lote,
      status: "finalizada",
      finalizado_em: ler("finalizado_em") || null,
      finalizado_por_nome: ler("finalizado_por_nome") || null,
    };
    // O resumo é um retrato do fechamento, sem consultar estados atuais das OPs.
    const chave = chaveFinalizacao(finalizada);
    if (!finais.has(chave)) finais.set(chave, finalizada);
  }
  return [...finais.values()];
}

export function referenciaFinalizada(item: OpFinalizada) {
  return item.op ? `OP ${item.op}` : `Lote ${item.lote}`;
}
