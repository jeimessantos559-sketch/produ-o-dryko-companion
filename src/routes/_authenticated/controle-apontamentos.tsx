import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, SlidersHorizontal } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell, nomeSetor } from "@/components/dryko/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth, type SetorCodigo } from "@/lib/auth";
import { dataSaoPaulo } from "@/lib/producao";

export const Route = createFileRoute("/_authenticated/controle-apontamentos")({
  component: ControleApontamentos,
});

type Apontamento = Database["public"]["Tables"]["apontamentos"]["Row"];
const SETORES: SetorCodigo[] = ["corte", "fitas", "mantas"];

type GrupoLancamento = {
  chave: string;
  ids: string[];
  item: Apontamento;
  quantidadeRegistros: number;
  plts: number;
  rolos: number;
  metragem: number;
  area: number;
};

function ControleApontamentos() {
  const { profile, isAutorizado, isAdmin } = useAuth();
  const [setor, setSetor] = useState<SetorCodigo>(profile?.setor_atual ?? "corte");
  const [data, setData] = useState(dataSaoPaulo());
  const [turno, setTurno] = useState("");
  const [status, setStatus] = useState("pendente");
  const [op, setOp] = useState("");
  const [produto, setProduto] = useState("");
  const [facilitador, setFacilitador] = useState("");
  const [itens, setItens] = useState<Apontamento[]>([]);
  const [nomes, setNomes] = useState<Record<string, string>>({});
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [confirmando, setConfirmando] = useState(false);

  useEffect(() => {
    if (profile?.setor_atual && !isAdmin) setSetor(profile.setor_atual);
  }, [isAdmin, profile?.setor_atual]);

  const carregar = useCallback(async () => {
    if (!isAutorizado) {
      setCarregando(false);
      return;
    }
    setCarregando(true);
    const [{ data: registros, error }, { data: perfis }] = await Promise.all([
      supabase.from("apontamentos").select("*").eq("setor", setor).eq("data_local", data).order("created_at", { ascending: false }).limit(200),
      supabase.from("profiles").select("id, nome").eq("ativo", true),
    ]);
    if (error) {
      toast.error("Não foi possível carregar os apontamentos.");
      setItens([]);
    } else {
      setItens(registros ?? []);
    }
    setNomes(Object.fromEntries((perfis ?? []).map((item) => [item.id, item.nome || "Sem nome"])));
    setSelecionados([]);
    setCarregando(false);
  }, [data, isAutorizado, setor]);

  useEffect(() => { void carregar(); }, [carregar]);

  const produtos = useMemo(() => [...new Set(itens.map((item) => item.produto_nome))].sort(), [itens]);
  const facilitadores = useMemo(() => [...new Set(itens.map((item) => item.usuario_id))], [itens]);
  const visiveis = useMemo(
    () => itens.filter((item) =>
      (!turno || item.turno === turno) &&
      (!status || item.status === status) &&
      (!op.trim() || item.op?.toLowerCase().includes(op.trim().toLowerCase())) &&
      (!produto || item.produto_nome === produto) &&
      (!facilitador || item.usuario_id === facilitador)),
    [facilitador, itens, op, produto, status, turno],
  );
  const grupos = useMemo(() => agruparParaLancamento(visiveis), [visiveis]);
  const pendentesVisiveis = useMemo(() => grupos.flatMap((grupo) => grupo.item.status === "pendente" ? grupo.ids : []), [grupos]);

  async function confirmar(idsEntrada?: string[]) {
    const ids = [...new Set(idsEntrada ?? selecionados)];
    if (ids.length === 0 || confirmando) return;
    setConfirmando(true);
    const { data: total, error } = await supabase.rpc("confirmar_apontamentos_protheus", { p_ids: ids });
    setConfirmando(false);
    if (error) {
      toast.error(error.message || "Não foi possível confirmar os apontamentos no Protheus.");
      return;
    }
    toast.success(`${total ?? ids.length} apontamento(s) lançado(s) no Protheus.`);
    await carregar();
  }

  function alternarGrupo(grupo: GrupoLancamento) {
    if (grupo.item.status === "lancado") return;
    setSelecionados((atuais) => {
      const todos = grupo.ids.every((id) => atuais.includes(id));
      return todos ? atuais.filter((id) => !grupo.ids.includes(id)) : [...new Set([...atuais, ...grupo.ids])];
    });
  }

  return (
    <AppShell title="Controle Protheus" eyebrow={isAdmin ? "ADMINISTRAÇÃO · APONTAMENTOS" : "LANÇAMENTOS"}>
      <div className="mx-auto max-w-5xl space-y-3">
        <div><h2 className="text-xl font-extrabold sm:text-2xl">Lançamentos no Protheus</h2><p className="text-xs text-muted-foreground sm:text-sm">Apontamentos de Mantas com a mesma OP, produto e lote são somados e lançados juntos.</p></div>

        {!isAutorizado ? (
          <Card><CardContent className="p-4 text-sm text-muted-foreground">Você não tem permissão para lançar apontamentos no Protheus.</CardContent></Card>
        ) : (
          <>
            <details className="rounded-2xl border bg-white shadow-sm" open={isAdmin}>
              <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-semibold"><SlidersHorizontal className="size-4 text-primary" /> Filtros</summary>
              <div className="grid grid-cols-2 gap-2 border-t px-3 py-3 sm:grid-cols-4">
                <Campo label="Setor"><select className="h-10 w-full rounded-xl border bg-background px-2 text-sm" value={setor} onChange={(e) => setSetor(e.target.value as SetorCodigo)} disabled={!isAdmin}>{SETORES.map((item) => <option key={item} value={item}>{nomeSetor(item)}</option>)}</select></Campo>
                <Campo label="Data"><Input className="h-10" type="date" value={data} onChange={(e) => setData(e.target.value)} /></Campo>
                <Campo label="Turno"><select className="h-10 w-full rounded-xl border bg-background px-2 text-sm" value={turno} onChange={(e) => setTurno(e.target.value)}><option value="">Todos</option><option value="T1">T1</option><option value="T2">T2</option><option value="T3">T3</option></select></Campo>
                <Campo label="Situação"><select className="h-10 w-full rounded-xl border bg-background px-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Todos</option><option value="pendente">Pendente</option><option value="lancado">Lançado</option></select></Campo>
                <Campo label="OP"><Input className="h-10" value={op} onChange={(e) => setOp(e.target.value)} placeholder="Buscar OP" /></Campo>
                <Campo label="Produto"><select className="h-10 w-full rounded-xl border bg-background px-2 text-sm" value={produto} onChange={(e) => setProduto(e.target.value)}><option value="">Todos</option>{produtos.map((item) => <option key={item}>{item}</option>)}</select></Campo>
                <Campo label="Facilitador"><select className="h-10 w-full rounded-xl border bg-background px-2 text-sm" value={facilitador} onChange={(e) => setFacilitador(e.target.value)}><option value="">Todos</option>{facilitadores.map((id) => <option key={id} value={id}>{nomes[id] ?? "Usuário"}</option>)}</select></Campo>
              </div>
            </details>

            <div className="sticky top-[58px] z-20 flex items-center justify-between gap-2 rounded-2xl border bg-background/95 p-2.5 shadow-sm backdrop-blur">
              <label className="flex items-center gap-2 text-xs font-medium sm:text-sm"><input type="checkbox" checked={pendentesVisiveis.length > 0 && pendentesVisiveis.every((id) => selecionados.includes(id))} onChange={(e) => setSelecionados(e.target.checked ? pendentesVisiveis : [])} /> Selecionar pendentes</label>
              <Button size="sm" disabled={selecionados.length === 0 || confirmando} onClick={() => void confirmar()}><CheckCircle2 className="size-4" /> {confirmando ? "Lançando..." : `Lançar (${selecionados.length})`}</Button>
            </div>

            {carregando ? <p className="py-6 text-center text-sm text-muted-foreground">Carregando...</p> : grupos.length === 0 ? (
              <Card><CardContent className="p-5 text-center text-sm text-muted-foreground">Nenhum apontamento encontrado.</CardContent></Card>
            ) : (
              <div className="space-y-2">
                {grupos.map((grupo) => {
                  const selecionado = grupo.ids.every((id) => selecionados.includes(id));
                  const agrupado = grupo.quantidadeRegistros > 1;
                  return (
                    <article key={grupo.chave} className={`rounded-2xl border bg-white p-3 shadow-sm ${selecionado ? "border-primary ring-1 ring-primary/20" : "border-slate-200"}`}>
                      <div className="flex items-start gap-3">
                        <input className="mt-1 size-5 shrink-0" type="checkbox" disabled={grupo.item.status === "lancado"} checked={selecionado} onChange={() => alternarGrupo(grupo)} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2"><p className="font-bold text-slate-950">{grupo.item.op ? `OP ${grupo.item.op} · ` : ""}{grupo.item.produto_nome}</p>{agrupado && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">{grupo.quantidadeRegistros} registros juntos</span>}</div>
                          <p className="mt-0.5 text-xs text-slate-500">{nomes[grupo.item.usuario_id] ?? "Usuário"} · {grupo.item.turno} · {formatarDataHora(grupo.item.created_at)}</p>
                          <p className="mt-2 text-sm font-semibold text-slate-800">{resumoGrupo(grupo)}</p>
                          {grupo.item.setor === "mantas" && grupo.item.lote && <p className="mt-1 text-xs font-semibold text-primary">Lote {grupo.item.lote}</p>}
                          {grupo.item.status === "pendente" && <Button size="sm" className="mt-2 w-full sm:w-auto" disabled={confirmando} onClick={() => void confirmar(grupo.ids)}>{confirmando ? "Lançando..." : grupo.item.setor === "mantas" ? `Confirmar ${fmt(grupo.metragem)} m` : "Confirmar no Protheus"}</Button>}
                        </div>
                        <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold ${grupo.item.status === "lancado" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-900"}`}>{grupo.item.status === "lancado" ? "Lançado" : "Pendente"}</span>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}

function agruparParaLancamento(itens: Apontamento[]) {
  const mapa = new Map<string, GrupoLancamento>();
  for (const item of itens) {
    const deveAgrupar = item.setor === "mantas" && item.status === "pendente" && Boolean(item.lote);
    const chave = deveAgrupar ? `manta:${item.op ?? ""}:${item.produto_id}:${item.lote}` : `item:${item.id}`;
    const atual = mapa.get(chave);
    if (!atual) {
      mapa.set(chave, { chave, ids: [item.id], item, quantidadeRegistros: 1, plts: Number(item.quantidade_plts ?? 0), rolos: Number(item.total_rolos ?? 0), metragem: Number(item.metragem ?? 0), area: Number(item.area_m2 ?? 0) });
    } else {
      atual.ids.push(item.id);
      atual.quantidadeRegistros += 1;
      atual.plts += Number(item.quantidade_plts ?? 0);
      atual.rolos += Number(item.total_rolos ?? 0);
      atual.metragem += Number(item.metragem ?? 0);
      atual.area += Number(item.area_m2 ?? 0);
    }
  }
  return [...mapa.values()];
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-1"><Label className="text-xs">{label}</Label>{children}</div>; }
function resumoGrupo(grupo: GrupoLancamento) {
  if (grupo.item.setor === "fitas") return `${fmt(grupo.area)} m² para lançar no Protheus`;
  if (grupo.item.setor === "mantas") return `${fmt(grupo.metragem)} m · ${grupo.plts} PLTs · ${grupo.rolos} rolos`;
  return `${grupo.plts} PLTs fechados · ${grupo.rolos} rolos`;
}
function fmt(valor: number) { return valor.toLocaleString("pt-BR", { maximumFractionDigits: 2 }); }
function formatarDataHora(valor: string) { return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(valor)); }
