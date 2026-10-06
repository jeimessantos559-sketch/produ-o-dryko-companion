import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Gauge, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { AppShell, nomeSetor, nomeTurno } from "@/components/dryko/app-shell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { contagemPorProduto, type ApontamentoTurno } from "@/lib/apontamentos-turno";
import { useAuth } from "@/lib/auth";
import { invalidarCache } from "@/lib/cache-consultas";
import { dataOperacional } from "@/lib/producao";
import { bloquearSeOffline } from "@/lib/rede";
import { nomeCurtoRelatorio } from "@/lib/responsaveis-relatorio";

export const Route = createFileRoute("/_authenticated/contagem")({
  head: () => ({ meta: [{ title: "Contagem por produto | Aponta Produção DRYKO" }] }),
  component: Contagem,
});

type Programacao = {
  id: string;
  produto_id: string;
  op: string | null;
  lote: string | null;
  quantidade_prevista: number;
  unidade: string;
  produzido: number;
  global_dia: boolean;
  finalizado_em: string | null;
  finalizado_por_nome: string | null;
};
type Meta = {
  id: string;
  produto_id: string;
  op: string;
  quantidade_meta: number;
  apontado: number;
  unidade: string;
  status: "ativa" | "finalizada";
};
type Payload = { apontamentos: ApontamentoTurno[]; programacao: Programacao[]; metas: Meta[] };
type Acao = { id: string; origem: "programacao" | "meta"; finalizar: boolean; referencia: string };
const VAZIO: Payload = { apontamentos: [], programacao: [], metas: [] };
const numero = (n: number) => Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 2 });

function Contagem() {
  const { profile, canFinalizeGoals } = useAuth();
  const setor = profile?.setor_atual;
  const turno = profile?.turno_atual;
  const data = dataOperacional(turno);
  const [payload, setPayload] = useState<Payload>(VAZIO);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [acao, setAcao] = useState<Acao | null>(null);
  const [salvando, setSalvando] = useState(false);
  const cargaAtual = useRef(0);

  const carregar = useCallback(async () => {
    const carga = ++cargaAtual.current;
    setPayload(VAZIO);
    if (!setor || !turno) {
      setCarregando(false);
      return;
    }
    setCarregando(true);
    setErro(false);
    const { data: resultado, error } = await supabase.rpc("contagem_turno", {
      p_setor: setor,
      p_turno: turno,
      p_data: data,
    });
    if (carga !== cargaAtual.current) return;
    if (error) setErro(true);
    else setPayload((resultado ?? VAZIO) as unknown as Payload);
    setCarregando(false);
  }, [setor, turno, data]);

  useEffect(() => {
    void carregar();
  }, [carregar]);
  useEffect(() => {
    const atualizar = () => {
      void carregar();
    };
    window.addEventListener("apontamento-salvo", atualizar);
    return () => window.removeEventListener("apontamento-salvo", atualizar);
  }, [carregar]);
  const totais = useMemo(
    () => contagemPorProduto(payload.apontamentos, setor ?? "", turno ?? "", data),
    [payload.apontamentos, setor, turno, data],
  );

  async function confirmar() {
    if (!acao || salvando || bloquearSeOffline()) return;
    setSalvando(true);
    const { error } =
      acao.origem === "programacao"
        ? await supabase.rpc("alterar_status_programacao", {
            p_id: acao.id,
            p_finalizar: acao.finalizar,
          })
        : await supabase.rpc("finalizar_meta_atingida", { p_id: acao.id });
    setSalvando(false);
    if (error) {
      toast.error(error.message || "Não foi possível finalizar a OP.");
      return;
    }
    toast.success(acao.finalizar ? "Finalização registrada." : "OP reaberta.");
    setAcao(null);
    invalidarCache("painel:");
    await carregar();
  }

  return (
    <>
      <AppShell
        title="Contagem por produto"
        eyebrow={`${data.split("-").reverse().join("/")} · ${nomeTurno(turno)} · ${setor ? nomeSetor(setor) : "Setor"}`}
      >
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-primary/5 text-primary">
                <Gauge className="size-6" />
              </div>
              <h2 className="text-xl font-extrabold text-slate-950">Contagem por produto</h2>
              <p className="mt-1 text-sm text-slate-500">
                Totais consolidados dos apontamentos deste turno.
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Atualizar contagem"
              disabled={carregando}
              onClick={() => void carregar()}
            >
              <RefreshCw className="size-4" />
            </Button>
          </div>
          <div className="mt-5 space-y-4 border-t pt-5">
            {carregando ? (
              <p className="text-sm text-slate-500">Carregando contagem do turno...</p>
            ) : erro ? (
              <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">
                Não foi possível carregar a contagem.{" "}
                <Button variant="link" onClick={() => void carregar()}>
                  Tentar novamente
                </Button>
              </div>
            ) : totais.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">
                Nenhum produto apontado neste turno.
              </p>
            ) : (
              totais.map((total) => {
                const programacoes = payload.programacao.filter(
                  (p) =>
                    p.produto_id === total.produtoId &&
                    payload.apontamentos.some(
                      (a) =>
                        a.produto_id === p.produto_id &&
                        (setor === "mantas"
                          ? !p.lote || a.lote?.trim().toUpperCase() === p.lote.trim().toUpperCase()
                          : !p.op || a.op?.trim().toUpperCase() === p.op.trim().toUpperCase()),
                    ),
                );
                const metas = payload.metas.filter(
                  (m) =>
                    m.produto_id === total.produtoId &&
                    !programacoes.some((p) => p.op?.trim() === m.op.trim()),
                );
                return (
                  <article
                    key={total.produtoId}
                    className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5"
                  >
                    <h3 className="font-mono text-sm font-bold text-slate-600">{total.nome}</h3>
                    <p className="mt-3 text-3xl font-extrabold text-slate-950">
                      {numero(setor === "fitas" ? total.area : total.metragem)}{" "}
                      {setor === "mantas" ? "m" : "m²"}
                    </p>
                    {setor !== "fitas" && (
                      <p className="mt-1 text-sm text-slate-500">
                        {numero(total.plts)} PLTs · {numero(total.rolos)} rolos
                      </p>
                    )}
                    {programacoes.map((p) => {
                      const referencia =
                        setor === "mantas"
                          ? `Lote ${p.lote ?? "não informado"}`
                          : `OP ${p.op ?? "não informada"}`;
                      const atingiu = Number(p.produzido) >= Number(p.quantidade_prevista);
                      const identificada = Boolean((setor === "mantas" ? p.lote : p.op)?.trim());
                      return (
                        <div key={p.id} className="mt-4 space-y-2 border-t pt-3">
                          <p className="text-sm font-bold">{referencia}</p>
                          <p className="text-xs text-slate-500">
                            {p.global_dia ? "Produção do dia" : "Produção do turno"}:{" "}
                            {numero(p.produzido)} de {numero(p.quantidade_prevista)} {p.unidade}{" "}
                            programados
                          </p>
                          {p.finalizado_em ? (
                            <>
                              <p className="flex items-center gap-1 text-xs font-semibold text-emerald-800">
                                <CheckCircle2 className="size-4" /> Finalizada por{" "}
                                {nomeCurtoRelatorio(p.finalizado_por_nome)}
                              </p>
                              {canFinalizeGoals && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    setAcao({
                                      id: p.id,
                                      origem: "programacao",
                                      finalizar: false,
                                      referencia,
                                    })
                                  }
                                >
                                  Reabrir {setor === "mantas" ? "lote" : "OP"}
                                </Button>
                              )}
                            </>
                          ) : atingiu && identificada ? (
                            canFinalizeGoals ? (
                              <Button
                                className="h-11 w-full sm:w-auto"
                                onClick={() =>
                                  setAcao({
                                    id: p.id,
                                    origem: "programacao",
                                    finalizar: true,
                                    referencia,
                                  })
                                }
                              >
                                Finalizar {setor === "mantas" ? "lote" : "OP"}
                              </Button>
                            ) : (
                              <p className="text-xs text-emerald-800">
                                Total programado atingido. Aguardando responsável autorizado
                                finalizar.
                              </p>
                            )
                          ) : !identificada ? (
                            <Link to="/programacao" className="text-xs font-semibold text-primary">
                              Informe {setor === "mantas" ? "o lote" : "a OP"} na programação para
                              finalizar.
                            </Link>
                          ) : (
                            <p className="text-xs text-slate-500">
                              Faltam{" "}
                              {numero(
                                Math.max(0, Number(p.quantidade_prevista) - Number(p.produzido)),
                              )}{" "}
                              {p.unidade} para concluir.
                            </p>
                          )}
                        </div>
                      );
                    })}
                    {metas.map((m) => (
                      <div key={m.id} className="mt-4 space-y-2 border-t pt-3">
                        <p className="text-sm font-bold">OP {m.op}</p>
                        <p className="text-xs text-slate-500">
                          Acumulado da OP: {numero(m.apontado)} de {numero(m.quantidade_meta)}{" "}
                          {m.unidade}
                        </p>
                        {m.status === "finalizada" ? (
                          <p className="text-xs font-semibold text-emerald-800">OP finalizada</p>
                        ) : (
                          Number(m.apontado) >= Number(m.quantidade_meta) &&
                          (canFinalizeGoals ? (
                            <Button
                              className="h-11 w-full sm:w-auto"
                              onClick={() =>
                                setAcao({
                                  id: m.id,
                                  origem: "meta",
                                  finalizar: true,
                                  referencia: `OP ${m.op}`,
                                })
                              }
                            >
                              Finalizar OP
                            </Button>
                          ) : (
                            <p className="text-xs text-emerald-800">
                              Meta atingida. Aguardando responsável autorizado finalizar.
                            </p>
                          ))
                        )}
                      </div>
                    ))}
                  </article>
                );
              })
            )}
          </div>
        </section>
      </AppShell>
      <Dialog
        open={acao !== null}
        onOpenChange={(aberto) => {
          if (!aberto && !salvando) setAcao(null);
        }}
      >
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {acao?.finalizar ? "Finalizar" : "Reabrir"} {acao?.referencia}
            </DialogTitle>
            <DialogDescription>
              {acao?.finalizar
                ? "A quantidade programada foi atingida. Confirme a conclusão; o responsável ficará registrado. O lançamento no Protheus é conferido separadamente."
                : "A programação voltará a aguardar finalização."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="grid grid-cols-2 gap-2">
            <Button variant="outline" disabled={salvando} onClick={() => setAcao(null)}>
              Cancelar
            </Button>
            <Button disabled={salvando} onClick={() => void confirmar()}>
              {salvando ? "Salvando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
