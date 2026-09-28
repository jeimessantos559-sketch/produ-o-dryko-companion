import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/dryko/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/metas")({ component: Metas });

type Meta = Database["public"]["Tables"]["metas_op"]["Row"];
type AuditoriaMeta = Database["public"]["Tables"]["meta_auditoria"]["Row"];
type MetaPainel = Meta & { apontado: number };

function Metas() {
  const { profile, isAutorizado } = useAuth();
  const [metas, setMetas] = useState<MetaPainel[]>([]);
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
    const [resultadoMetas, { data: trilha }, { data: perfis }] = await Promise.all([
      (supabase.rpc as any)("metas_painel", { p_setor: profile.setor_atual }),
      supabase.from("meta_auditoria").select("*").eq("setor", profile.setor_atual).order("created_at", { ascending: false }).limit(100),
      supabase.from("profiles").select("id, nome").eq("ativo", true),
    ]);

    if (resultadoMetas.error) {
      toast.error("Não foi possível carregar as metas.");
      setMetas([]);
    } else {
      setMetas(((resultadoMetas.data ?? []) as MetaPainel[]).map((item) => ({ ...item, apontado: Number(item.apontado ?? 0) })));
    }
    setAuditorias(trilha ?? []);
    setNomes(Object.fromEntries((perfis ?? []).map((item) => [item.id, item.nome || "Sem nome"])));
    setCarregando(false);
  }, [profile?.setor_atual]);

  useEffect(() => { void carregar(); }, [carregar]);

  const visiveis = useMemo(() => metas.filter((meta) => mostrarFinalizadas || meta.status === "ativa"), [metas, mostrarFinalizadas]);

  async function alterarStatus(meta: MetaPainel) {
    if (!isAutorizado) return;
    const finalizando = meta.status === "ativa";
    const { error } = await supabase.rpc("alterar_status_meta", { p_meta_id: meta.id, p_status: finalizando ? "finalizada" : "ativa" });
    if (error) {
      toast.error(error.code === "23505" ? "Já existe uma meta ativa para esta OP e produto." : "Não foi possível atualizar a meta.");
      return;
    }
    toast.success(finalizando ? "Meta finalizada." : "Meta reaberta.");
    await carregar();
  }

  return (
    <AppShell title="Metas" eyebrow="PRODUÇÃO · OPs">
      <div className="mx-auto max-w-4xl space-y-3">
        <div className="flex items-end justify-between gap-2">
          <div><h2 className="text-xl font-extrabold sm:text-2xl">Metas das OPs</h2><p className="text-xs text-muted-foreground sm:text-sm">Soma a produção dos turnos até finalizar a OP.</p></div>
          <Button size="sm" variant="outline" onClick={() => setMostrarFinalizadas((atual) => !atual)}>{mostrarFinalizadas ? "Ocultar finalizadas" : "Finalizadas"}</Button>
        </div>

        {carregando ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Carregando metas...</p>
        ) : visiveis.length === 0 ? (
          <Card><CardContent className="p-5 text-center text-sm text-muted-foreground">Nenhuma meta ativa. A meta pode ser definida no primeiro apontamento da OP.</CardContent></Card>
        ) : (
          <div className="space-y-2.5">
            {visiveis.map((meta) => {
              const trilhaMeta = auditorias.filter((item) => item.meta_id === meta.id);
              const apontado = Number(meta.apontado ?? 0);
              const programado = Number(meta.quantidade_meta);
              const restante = Math.max(0, programado - apontado);
              const excesso = Math.max(0, apontado - programado);
              const percentualReal = programado > 0 ? (apontado / programado) * 100 : 0;
              const percentualBarra = Math.min(100, percentualReal);
              return (
                <Card key={meta.id} className="rounded-2xl">
                  <CardContent className="space-y-3 p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0"><p className="truncate font-bold">OP {meta.op} · {meta.produto_nome}</p><p className="text-xs text-slate-500">{meta.status === "ativa" ? "Em produção" : "Finalizada"}</p></div>
                      {isAutorizado && <Button size="sm" variant="outline" onClick={() => alterarStatus(meta)}>{meta.status === "ativa" ? <CheckCircle2 className="size-4" /> : <RotateCcw className="size-4" />}{meta.status === "ativa" ? "Finalizar" : "Reabrir"}</Button>}
                    </div>

                    <div className="grid grid-cols-3 gap-1.5 text-center">
                      <Indicador label="Meta" valor={programado} unidade={meta.unidade} />
                      <Indicador label="Apontado" valor={apontado} unidade={meta.unidade} destaque={excesso > 0} />
                      <Indicador label={excesso > 0 ? "Excesso" : "Restante"} valor={excesso > 0 ? excesso : restante} unidade={meta.unidade} destaque={excesso > 0} />
                    </div>

                    {excesso > 0 && (
                      <div className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900"><AlertTriangle className="size-4" /> A produção ultrapassou a meta em {fmt(excesso)} {meta.unidade}.</div>
                    )}

                    <div>
                      <div className="mb-1 flex justify-between text-[11px] text-slate-500"><span>Progresso</span><span>{percentualReal.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</span></div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full ${excesso > 0 ? "bg-amber-500" : "bg-primary"}`} style={{ width: `${percentualBarra}%` }} /></div>
                    </div>

                    {trilhaMeta.length > 0 && (
                      <details className="rounded-xl border px-3 py-2 text-xs"><summary className="cursor-pointer font-medium">Histórico ({trilhaMeta.length})</summary><div className="mt-2 space-y-1.5">{trilhaMeta.map((item) => <p key={item.id} className="rounded-lg bg-slate-50 p-2">{item.acao === "finalizacao" ? "Finalizada" : "Reaberta"} por {nomes[item.usuario_id] ?? "usuário autorizado"} em {formatar(item.created_at)}</p>)}</div></details>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function formatar(valor: string) { return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(valor)); }
function fmt(valor: number) { return valor.toLocaleString("pt-BR", { maximumFractionDigits: 2 }); }

function Indicador({ label, valor, unidade, destaque = false }: { label: string; valor: number; unidade: string; destaque?: boolean }) {
  return <div className={`rounded-xl p-2 ${destaque ? "bg-amber-50 text-amber-900" : "bg-slate-50"}`}><p className="text-[10px] uppercase text-slate-500">{label}</p><p className="truncate text-sm font-bold">{fmt(valor)} {unidade}</p></div>;
}
