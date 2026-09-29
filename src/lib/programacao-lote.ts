import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";

/**
 * Após salvar um apontamento, preenche a referência da programação global do dia
 * (mesmo setor, produto e data operacional) somente se ela ainda estiver vazia.
 * Corte/Fitas: coluna `op`. Mantas: coluna `lote`.
 * Nunca cria programação e nunca sobrescreve referência existente. Falha só gera aviso.
 */
export async function preencherReferenciaProgramacao(params: {
  setor: "corte" | "fitas" | "mantas";
  dataLocal: string | null | undefined;
  produtoId: string;
  referencia: string | null | undefined;
}) {
  const referencia = (params.referencia ?? "").trim();
  if (!referencia || !params.dataLocal) return;
  const coluna = params.setor === "mantas" ? "lote" : "op";
  try {
    const { error } = await (supabase as any)
      .from("programacao_producao")
      .update({ [coluna]: referencia, updated_at: new Date().toISOString() })
      .eq("setor", params.setor)
      .eq("data_local", params.dataLocal)
      .eq("produto_id", params.produtoId)
      .eq("global_dia", true)
      .or(`${coluna}.is.null,${coluna}.eq.`);
    if (error) throw error;
  } catch {
    toast.warning(
      `Apontamento salvo, mas não foi possível preencher ${coluna === "lote" ? "o lote" : "a OP"} da programação.`,
    );
  }
}

export function preencherLoteProgramacaoMantas(params: {
  dataLocal: string | null | undefined;
  produtoId: string;
  lote: string;
}) {
  return preencherReferenciaProgramacao({
    setor: "mantas",
    dataLocal: params.dataLocal,
    produtoId: params.produtoId,
    referencia: params.lote,
  });
}
