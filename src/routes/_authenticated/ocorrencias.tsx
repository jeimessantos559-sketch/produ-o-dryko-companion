import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AppShell, nomeSetor } from "@/components/dryko/app-shell";
import { FinalizarOcorrencia } from "@/components/dryko/finalizar-ocorrencia";
import { OcorrenciasOperacionaisForm } from "@/components/dryko/ocorrencias-operacionais-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  CAMPOS_OCORRENCIA,
  formatarDuracaoOcorrencia,
  hhmm,
  ocorrenciaEmAndamento,
  rotuloMotivo,
  rotuloSituacao,
  type OcorrenciaOperacional,
} from "@/lib/ocorrencias-operacionais";
import { dataOperacional } from "@/lib/producao";

export const Route = createFileRoute("/_authenticated/ocorrencias")({
  head: () => ({
    meta: [
      { title: "Ocorrências do turno | Aponta Produção DRYKO" },
      { name: "description", content: "Ocorrências em andamento e finalizadas do turno, com finalização rápida." },
      { property: "og:title", content: "Ocorrências do turno | Aponta Produção DRYKO" },
      { property: "og:description", content: "Ocorrências em andamento e finalizadas do turno." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Ocorrencias,
});

type Filtro = "todas" | "andamento" | "finalizadas";

function Ocorrencias() {
  const { profile, user } = useAuth();
  const setor = profile?.setor_atual;
  const turno = profile?.turno_atual;
  const data = dataOperacional(turno);
  const [lista, setLista] = useState<OcorrenciaOperacional[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [finalizando, setFinalizando] = useState<string | null>(null);
  const [novo, setNovo] = useState(false);

  const carregar = useCallback(async () => {
    if (!setor || !turno) return setCarregando(false);
    const { data: r } = await (supabase as any)
      .from("ocorrencias_turno")
      .select(CAMPOS_OCORRENCIA)
      .eq("setor", setor)
      .eq("turno", turno)
      .eq("data_local", data)
      .order("created_at", { ascending: true });
    setLista((r ?? []) as OcorrenciaOperacional[]);
    setCarregando(false);
  }, [setor, turno, data]);
  useEffect(() => { void carregar(); }, [carregar]);

  const visiveis = useMemo(() => {
    const base = lista.filter((o) => o.tipo_status !== "sem_ocorrencias" || filtro === "todas");
    if (filtro === "andamento") return base.filter((o) => ocorrenciaEmAndamento(o));
    if (filtro === "finalizadas") return base.filter((o) => !ocorrenciaEmAndamento(o));
    return base;
  }, [lista, filtro]);
  const abertas = lista.filter((o) => ocorrenciaEmAndamento(o)).length;

  return (
    <AppShell title="Ocorrências" eyebrow={setor ? `${nomeSetor(setor).toUpperCase()} · ${turno ?? ""}` : undefined}>
      <div className="mx-auto max-w-2xl space-y-3">
        <Button className="h-12 w-full" variant={novo ? "outline" : "default"} onClick={() => setNovo((v) => !v)}>
          <Plus className="size-4" /> {novo ? "Fechar registro" : "Registrar nova ocorrência"}
        </Button>
        {novo && setor && turno && (
          <Card className="rounded-2xl">
            <CardContent className="p-4">
              <OcorrenciasOperacionaisForm
                setor={setor}
                turno={turno}
                dataLocal={data}
                userId={user?.id}
                ocorrencias={lista}
                ocultarLista
                onChange={(l) => { setLista(l); setNovo(false); }}
              />
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-3 gap-1.5 rounded-2xl border bg-card p-1.5">
          {([["todas", "Todas"], ["andamento", `Em andamento${abertas ? ` (${abertas})` : ""}`], ["finalizadas", "Finalizadas"]] as const).map(([v, r]) => (
            <button key={v} type="button" onClick={() => setFiltro(v)}
              className={`h-10 rounded-xl text-xs font-bold ${filtro === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>
              {r}
            </button>
          ))}
        </div>

        {carregando ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : visiveis.length === 0 ? (
          <Card><CardContent className="p-4 text-sm text-muted-foreground">Nenhuma ocorrência neste filtro.</CardContent></Card>
        ) : (
          visiveis.map((o) => {
            const aberta = ocorrenciaEmAndamento(o);
            const dur = formatarDuracaoOcorrencia(o.duracao_min);
            const tipo = o.tipo_status ?? "ocorrencia";
            return (
              <div key={o.id} className="rounded-2xl border border-border bg-card p-3 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-bold text-foreground">{o.equipamento ?? "Ocorrência geral"}</p>
                  {aberta ? (
                    <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-xs font-bold text-amber-700 dark:text-amber-300">Em andamento</span>
                  ) : dur ? (
                    <span className="rounded-md bg-destructive/10 px-2 py-0.5 text-xs font-bold text-destructive">{dur} parada</span>
                  ) : (
                    <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">{rotuloSituacao(tipo)}</span>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {[
                    rotuloSituacao(tipo),
                    o.hora_inicio && (o.hora_fim ? `${hhmm(o.hora_inicio)} às ${hhmm(o.hora_fim)}` : `Início ${hhmm(o.hora_inicio)}`),
                    rotuloMotivo(o) && `Motivo: ${rotuloMotivo(o)}`,
                    o.turno_origem && `Transferida do ${o.turno_origem}`,
                  ].filter(Boolean).join(" · ")}
                </p>
                {tipo === "ocorrencia" && <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{o.mensagem}</p>}
                {o.acao_realizada && <p className="mt-1 text-xs text-muted-foreground">Ação: {o.acao_realizada}</p>}
                {aberta && (finalizando === o.id ? (
                  <FinalizarOcorrencia
                    item={o}
                    onCancelar={() => setFinalizando(null)}
                    onFinalizada={(a) => { setLista((l) => l.map((x) => (x.id === a.id ? a : x))); setFinalizando(null); }}
                  />
                ) : (
                  <Button className="mt-2 h-11 w-full" onClick={() => setFinalizando(o.id)}>Finalizar</Button>
                ))}
              </div>
            );
          })
        )}
      </div>
    </AppShell>
  );
}
