import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { FinalizarOcorrencia } from "@/components/dryko/finalizar-ocorrencia";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  CAMPOS_OCORRENCIA,
  calcularDuracaoOcorrencia,
  formatarDuracaoOcorrencia,
  horaAtualSaoPaulo,
  hhmm,
  type OcorrenciaOperacional,
} from "@/lib/ocorrencias-operacionais";

/** Card do Painel: só aparece com ocorrências abertas do setor/turno/data atual. Consulta leve (índice parcial). */
export function OcorrenciasAbertasCard({ setor, turno, data }: { setor: string; turno: string; data: string }) {
  const [abertas, setAbertas] = useState<OcorrenciaOperacional[]>([]);
  const [agora, setAgora] = useState(() => horaAtualSaoPaulo());
  const [finalizando, setFinalizando] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const { data: lista } = await (supabase as any)
      .from("ocorrencias_turno")
      .select(CAMPOS_OCORRENCIA)
      .eq("setor", setor)
      .eq("turno", turno)
      .eq("data_local", data)
      .not("hora_inicio", "is", null)
      .is("hora_fim", null)
      .order("hora_inicio", { ascending: true })
      .limit(20);
    setAbertas((lista ?? []) as OcorrenciaOperacional[]);
  }, [setor, turno, data]);

  useEffect(() => { void carregar(); }, [carregar]);
  useEffect(() => {
    const t = window.setInterval(() => setAgora(horaAtualSaoPaulo()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  if (abertas.length === 0) return null;

  return (
    <section className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-extrabold text-foreground">
          <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />
          {abertas.length} ocorrência{abertas.length > 1 ? "s" : ""} em andamento
        </h2>
        <Link to="/ocorrencias" className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
          Ver todas as ocorrências <ArrowRight className="size-3" />
        </Link>
      </div>
      <div className="mt-2 space-y-2">
        {abertas.map((o) => {
          const decorrido = formatarDuracaoOcorrencia(calcularDuracaoOcorrencia(o.hora_inicio, agora));
          return (
            <div key={o.id} className="rounded-xl border border-border bg-card p-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-foreground">{o.equipamento ?? "Ocorrência geral"}</p>
                  <p className="text-xs text-muted-foreground">
                    Desde {hhmm(o.hora_inicio)} · <span className="font-semibold text-destructive">Parada há {decorrido || "menos de 1 min"}</span>
                  </p>
                </div>
                {finalizando !== o.id && (
                  <Button size="sm" className="h-10 shrink-0" onClick={() => setFinalizando(o.id)}>Finalizar</Button>
                )}
              </div>
              {finalizando === o.id && (
                <FinalizarOcorrencia
                  item={o}
                  onCancelar={() => setFinalizando(null)}
                  onFinalizada={() => {
                    setFinalizando(null);
                    setAbertas((l) => l.filter((x) => x.id !== o.id));
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
