import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/dryko/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/metas")({ component: Metas });

type Meta = Database["public"]["Tables"]["metas_op"]["Row"];
type AuditoriaMeta = Database["public"]["Tables"]["meta_auditoria"]["Row"];
type Producao = Pick<
  Database["public"]["Tables"]["apontamentos"]["Row"],
  "op" | "produto_id" | "quantidade_plts" | "area_m2" | "created_at"
>;

function Metas() {
  const { profile, isAutorizado } = useAuth();
  const [metas, setMetas] = useState<Meta[]>([]);
  const [producao, setProducao] = useState<Producao[]>([]);
  const [auditorias, setAuditorias] = useState<AuditoriaMeta[]>([]);
  const [nomes, setNomes] = useState<Record<string, string>>({});
  const [mostrarFinalizadas, setMostrarFinalizadas] = useState(false);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    if (!profile?.setor_atual) {
      setCarregando(false);
      return;
    }
    setCarregando(true);
    const [
      { data: lista, error },
      { data: apontamentos, error: erroApontamentos },
      { data: trilha },
      { data: perfis },
    ] = await Promise.all([
      supabase
        .from("metas_op")
        .select("*")
        .eq("setor", profile.setor_atual)
        .order("created_at", { ascending: false }),
      supabase
        .from("apontamentos")
        .select("op, produto_id, quantidade_plts, area_m2, created_at")
        .eq("setor", profile.setor_atual),
      supabase
        .from("meta_auditoria")
        .select("*")
        .eq("setor", profile.setor_atual)
        .order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, nome"),
    ]);
    if (error || erroApontamentos) {
      toast.error("Não foi possível carregar as metas.");
      setCarregando(false);
      return;
    }
    setMetas(lista ?? []);
    setProducao(apontamentos ?? []);
    setAuditorias(trilha ?? []);
    setNomes(Object.fromEntries((perfis ?? []).map((item) => [item.id, item.nome || "Sem nome"])));
    setCarregando(false);
  }, [profile?.setor_atual]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const visiveis = useMemo(
    () => metas.filter((meta) => mostrarFinalizadas || meta.status === "ativa"),
    [metas, mostrarFinalizadas],
  );

  async function alterarStatus(meta: Meta) {
    if (!isAutorizado) return;
    const finalizando = meta.status === "ativa";
    const { error } = await supabase.rpc("alterar_status_meta", {
      p_meta_id: meta.id,
      p_status: finalizando ? "finalizada" : "ativa",
    });
    if (error) {
      toast.error(
        error.code === "23505"
          ? "Já existe uma meta ativa para esta OP e produto."
          : "Não foi possível atualizar a meta.",
      );
      return;
    }
    toast.success(finalizando ? "Meta finalizada." : "Meta reaberta.");
    await carregar();
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Metas das OPs</h1>
            <p className="text-sm text-muted-foreground">
              O apontado soma a produção dos três turnos até a finalização da OP.
            </p>
          </div>
          <Button variant="outline" onClick={() => setMostrarFinalizadas((atual) => !atual)}>
            {mostrarFinalizadas ? "Ocultar finalizadas" : "Mostrar finalizadas"}
          </Button>
        </div>

        {carregando ? (
          <p className="text-sm text-muted-foreground">Carregando metas...</p>
        ) : visiveis.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">
              Nenhuma meta {mostrarFinalizadas ? "cadastrada" : "ativa"}. A meta pode ser informada
              ao fazer o primeiro apontamento de uma OP e produto.
            </CardContent>
          </Card>
        ) : (
          visiveis.map((meta) => {
            const trilhaMeta = auditorias.filter((item) => item.meta_id === meta.id);
            const apontado = producao
              .filter(
                (item) =>
                  item.op === meta.op &&
                  item.produto_id === meta.produto_id &&
                  item.created_at >= meta.created_at,
              )
              .reduce(
                (total, item) =>
                  total +
                  (profile?.setor_atual === "fitas"
                    ? Number(item.area_m2 ?? 0)
                    : (item.quantidade_plts ?? 0)),
                0,
              );
            const restante = Math.max(0, Number(meta.quantidade_meta) - apontado);
            const percentual = Math.min(100, (apontado / Number(meta.quantidade_meta)) * 100);
            return (
              <Card key={meta.id}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">
                        OP {meta.op} · {meta.produto_nome}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">
                        {meta.status === "ativa" ? "Em produção" : "Finalizada"}
                      </p>
                    </div>
                    {isAutorizado && (
                      <Button size="sm" variant="outline" onClick={() => alterarStatus(meta)}>
                        {meta.status === "ativa" ? <CheckCircle2 /> : <RotateCcw />}
                        {meta.status === "ativa" ? "Finalizar OP" : "Reabrir meta"}
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <Indicador
                      label="Programado"
                      valor={Number(meta.quantidade_meta)}
                      unidade={meta.unidade}
                    />
                    <Indicador label="Apontado" valor={apontado} unidade={meta.unidade} />
                    <Indicador label="Restante" valor={restante} unidade={meta.unidade} />
                  </div>
                  <div>
                    <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                      <span>Progresso</span>
                      <span>
                        {percentual.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
                      </span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-muted">
                      <div className="h-full bg-primary" style={{ width: `${percentual}%` }} />
                    </div>
                  </div>
                  {trilhaMeta.length > 0 && (
                    <details className="rounded-md border p-3 text-sm">
                      <summary className="cursor-pointer font-medium">
                        Histórico de finalização e reabertura ({trilhaMeta.length})
                      </summary>
                      <div className="mt-2 space-y-2">
                        {trilhaMeta.map((item) => (
                          <p key={item.id} className="rounded-md bg-muted p-2 text-xs">
                            {item.acao === "finalizacao" ? "Finalizada" : "Reaberta"} por{" "}
                            {nomes[item.usuario_id] ?? "usuário autorizado"} em{" "}
                            {formatar(item.created_at)}
                          </p>
                        ))}
                      </div>
                    </details>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </AppShell>
  );
}

function formatar(valor: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(valor));
}

function Indicador({ label, valor, unidade }: { label: string; valor: number; unidade: string }) {
  return (
    <div className="rounded-md bg-muted p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-semibold">
        {valor.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} {unidade}
      </p>
    </div>
  );
}
