import { supabase } from "@/integrations/supabase/client";
import { invalidarCache } from "@/lib/cache-consultas";
import {
  armazenamentoPadrao,
  atualizarNaFila,
  EVENTO_ENVIADOS,
  classificarErroEnvio,
  lerFila,
  mensagemConflito,
  prazoVencido,
  removerDaFila,
  type ApontamentoNaFila,
  type ResultadoEnvio,
} from "@/lib/fila-offline";
import { preencherReferenciaProgramacao } from "@/lib/programacao-lote";

export type ResumoEnvio = { enviados: number; conflitos: number; aguardando: number };

const online = () => typeof navigator === "undefined" || navigator.onLine !== false;

/** Envia um item da fila com o mesmo id de quando foi salvo (reenvio não duplica). */
async function enviar(item: ApontamentoNaFila): Promise<{
  resultado: ResultadoEnvio;
  erro: unknown;
  dataLocal: string | null;
}> {
  try {
    const { data, error } = await supabase
      .from("apontamentos")
      .insert({ ...item.insercao, id: item.id, registrado_offline_em: item.registradoEm } as never)
      .select("data_local")
      .single();
    return {
      resultado: classificarErroEnvio(error, online()),
      erro: error,
      dataLocal: (data as { data_local?: string } | null)?.data_local ?? null,
    };
  } catch (erro) {
    return { resultado: classificarErroEnvio(erro, online()), erro, dataLocal: null };
  }
}

let emAndamento: Promise<ResumoEnvio> | null = null;

/**
 * Envia os itens "aguardando" do usuário, em ordem. Para ao primeiro sinal de falta
 * de rede ou de sessão (tenta de novo depois). Recusas do banco viram conflito.
 * Só uma sincronização por vez neste aparelho.
 */
export function sincronizarFila(usuarioId: string): Promise<ResumoEnvio> {
  if (emAndamento) return emAndamento;
  emAndamento = (async () => {
    const armazenamento = armazenamentoPadrao();
    let enviados = 0;
    for (const item of lerFila(usuarioId, armazenamento)) {
      if (item.situacao !== "aguardando") continue;
      if (prazoVencido(item)) {
        atualizarNaFila(
          usuarioId,
          item.id,
          {
            situacao: "conflito",
            erro: "Passou do prazo de 12 horas para envio. Descarte e, se precisar, registre de novo.",
          },
          armazenamento,
        );
        continue;
      }
      if (!online()) break;
      const { resultado, erro, dataLocal } = await enviar(item);
      if (resultado === "sem-rede" || resultado === "sessao") {
        atualizarNaFila(usuarioId, item.id, { tentativas: item.tentativas + 1 }, armazenamento);
        break;
      }
      if (resultado === "conflito") {
        atualizarNaFila(
          usuarioId,
          item.id,
          { situacao: "conflito", erro: mensagemConflito(erro, item), tentativas: item.tentativas + 1 },
          armazenamento,
        );
        continue;
      }
      // "salvo" ou "ja-salvo": o apontamento está no banco.
      removerDaFila(usuarioId, item.id, armazenamento);
      enviados += 1;
      if (resultado === "salvo" && item.programacao) {
        void preencherReferenciaProgramacao({ ...item.programacao, dataLocal });
      }
    }
    if (enviados > 0) {
      invalidarCache("painel:");
      if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENTO_ENVIADOS));
    }
    const restantes = lerFila(usuarioId, armazenamento);
    return {
      enviados,
      conflitos: restantes.filter((item) => item.situacao === "conflito").length,
      aguardando: restantes.filter((item) => item.situacao === "aguardando").length,
    };
  })().finally(() => {
    emAndamento = null;
  });
  return emAndamento;
}

/** Devolve um item em conflito para a fila e tenta enviar de novo. */
export function tentarNovamente(usuarioId: string, id: string) {
  atualizarNaFila(usuarioId, id, { situacao: "aguardando", erro: null });
  return sincronizarFila(usuarioId);
}

export function descartarDaFila(usuarioId: string, id: string) {
  return removerDaFila(usuarioId, id);
}
