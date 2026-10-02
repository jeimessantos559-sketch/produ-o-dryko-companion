import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import {
  calcularDuracaoOcorrencia,
  formatarDuracaoOcorrencia,
  horaAtualSaoPaulo,
  hhmm,
  type OcorrenciaOperacional,
} from "@/lib/ocorrencias-operacionais";

export const classeCampoHora =
  "h-12 w-full rounded-xl border border-input bg-background px-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

/** Finaliza na MESMA linha via RPC (servidor recusa se já finalizada em outro aparelho). */
export async function finalizarOcorrenciaServidor(id: string, horaFim: string, acao: string) {
  const { data, error } = await (supabase.rpc as any)("finalizar_ocorrencia", { p_id: id, p_hora_fim: horaFim, p_acao: acao });
  if (error) {
    throw new Error(error.code === "40001" ? "Esta ocorrência já foi finalizada em outro aparelho. Atualize a página." : error.message || "Não foi possível finalizar a ocorrência.");
  }
  return data as OcorrenciaOperacional;
}

export async function transferirOcorrenciaServidor(id: string) {
  const { data, error } = await (supabase.rpc as any)("transferir_ocorrencia", { p_id: id });
  if (error) {
    throw new Error(error.code === "40001" ? "Esta ocorrência já foi finalizada. Atualize a página." : error.message || "Não foi possível transferir a ocorrência.");
  }
  return data as OcorrenciaOperacional;
}

type Props = {
  item: OcorrenciaOperacional;
  onFinalizada: (atualizada: OcorrenciaOperacional) => void;
  onCancelar: () => void;
};

/** Painel inline: hora final (pré-preenchida com a hora de São Paulo), ação realizada e duração. */
export function FinalizarOcorrencia({ item, onFinalizada, onCancelar }: Props) {
  const [horaFim, setHoraFim] = useState(() => horaAtualSaoPaulo());
  const [acao, setAcao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const duracao = calcularDuracaoOcorrencia(item.hora_inicio, horaFim);

  async function confirmar() {
    if (!horaFim || salvando) return;
    setSalvando(true);
    try {
      const atualizada = await finalizarOcorrenciaServidor(item.id, horaFim, acao);
      toast.success("Ocorrência finalizada.");
      onFinalizada(atualizada);
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível finalizar a ocorrência.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="mt-2 space-y-2 rounded-xl border border-border bg-background p-3">
      <p className="text-xs text-muted-foreground">Início: {hhmm(item.hora_inicio)}</p>
      <div className="space-y-1">
        <Label htmlFor={`fim-${item.id}`}>Hora final</Label>
        <input id={`fim-${item.id}`} type="time" className={classeCampoHora} value={horaFim} onChange={(e) => setHoraFim(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`acao-${item.id}`}>Ação realizada (opcional)</Label>
        <input
          id={`acao-${item.id}`}
          className={classeCampoHora}
          maxLength={500}
          value={acao}
          onChange={(e) => setAcao(e.target.value)}
          placeholder="Ex.: troca do motor e testes"
        />
      </div>
      {duracao !== null && (
        <p className="text-sm font-semibold text-destructive">Duração: {formatarDuracaoOcorrencia(duracao) || "0 min"}</p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" className="h-11" disabled={salvando} onClick={onCancelar}>Cancelar</Button>
        <Button className="h-11" disabled={salvando || !horaFim} onClick={() => void confirmar()}>{salvando ? "Salvando..." : "Confirmar"}</Button>
      </div>
    </div>
  );
}
