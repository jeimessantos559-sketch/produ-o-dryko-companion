import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";

/**
 * Após salvar um apontamento de Mantas, preenche o lote da programação global do dia
 * (mesmo produto e data operacional) somente se ela ainda estiver sem lote.
 * Nunca cria programação e nunca sobrescreve lote existente. Falha só gera aviso.
 */
export async function preencherLoteProgramacaoMantas(params: {
  dataLocal: string | null | undefined;
  produtoId: string;
  lote: string;
}) {
  const lote = params.lote.trim();
  if (!lote || !params.dataLocal) return;
  try {
    const { error } = await (supabase as any)
      .from("programacao_producao")
      .update({ lote, updated_at: new Date().toISOString() })
      .eq("setor", "mantas")
      .eq("data_local", params.dataLocal)
      .eq("produto_id", params.produtoId)
      .eq("global_dia", true)
      .or("lote.is.null,lote.eq.");
    if (error) throw error;
  } catch {
    toast.warning("Apontamento salvo, mas não foi possível preencher o lote da programação.");
  }
}
