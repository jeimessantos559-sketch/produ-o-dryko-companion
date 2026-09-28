import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Boxes,
  CheckCircle2,
  Clock3,
  Gauge,
  LockKeyhole,
  PackageCheck,
  Search,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { ApontamentoRapido } from "@/components/dryko/apontamento-rapido";
import { AppShell, nomeSetor, nomeTurno } from "@/components/dryko/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { dataSaoPaulo } from "@/lib/producao";

export const Route = createFileRoute("/_authenticated/painel")({ component: Painel });

type Resumo = {
  registros: number;
  pendentes: number;
  lancados: number;
  plts: number;
  rolos: number;
  metragem: number;
  area: number;
};

type Registro = {
  id: string;
  op: string | null;
  lote: string | null;
  produto_nome: string;
  quantidade_plts: number | null;
  total_rolos: number | null;
  metragem: number | null;
  area_m2: number | null;
  status: "pendente" | "lancado";
  created_at: string;
};

type Pendencia = Registro & {
  data_local: string;
  turno: "T1" | "T2" | "T3";
};

type PainelPayload = {
  resumo?: Partial<Resumo>;
  recentes?: Registro[];
  pendencias?: Pendencia[];
};

type GrupoProtheus = {
  chave: string;
  ids: string[];
  item: Pendencia;
  registros: number;
  plts: number;
  rolos: number;
  metragem: number;
  area: number;
};

const RESUMO_VAZIO: Resumo = {
  registros: 0,
  pendentes: 0,
  lancados: 0,
  plts: 0,
  rolos: 0,
  metragem: 0,
  area: 0,
};

function Painel() {
  const { profile, loading, isAutorizado } = useAuth();
  const [resumo, setResumo] = useState<Resumo>(RESUMO_VAZIO);
  const [pendencias, setPendencias] = useState<Pendencia[]>([]);
  const [recentes, setRecentes] = useState<Registro[]>([]);
  const [erro, setErro] = useState(false);
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState<"todos" | "pendente" | "lancado">("todos");
  const [notificacoesAbertas, setNotificacoesAbertas] = useState(false);
  const [apontarAberto, setApontarAberto] = useState(false);
  const [modoApontamento, setModoApontamento] = useState<"novo" | "repetir">("novo");
  const [confirmandoChave, setConfirmandoChave] = useState<string | null>(null);

  const carregarPainel = useCallback(async () => {
    if (!profile?.setor_atual || !profile.turno_atual) {
      setRecentes([]);
      setResumo(RESUMO_VAZIO);
      setPendencias([]);
      setErro(false);
      return;
    }

    setErro(false);
    const hoje = dataSaoPaulo();
    const rpc = await (supabase.rpc as any)("painel_turno", {
      p_setor: profile.setor_atual,
      p_turno: profile.turno_atual,
      p_data: hoje,
    });

    if (!rpc.error) {
      aplicarPayload((rpc.data ?? {}) as PainelPayload);
      return;
    }

    const [{ data, error }, { data: pendenciasData, error: erroPendencias }] = await Promise.all([
      supabase
        .from("apontamentos")
        .select("id, op, lote, produto_nome, quantidade_plts, total_rolos, metragem, area_m2, status, created_at")
        .eq("setor", profile.setor_atual)
        .eq("turno", profile.turno_atual)
        .eq("data_local", hoje)
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("apontamentos")
        .select("id, op, lote, produto_nome, quantidade_plts, total_rolos, metragem, area_m2, status, created_at, data_local, turno")
        .eq("setor", profile.setor_atual)
        .eq("status", "pendente")
        .order("created_at", { ascending: false })
        .limit(60),
    ]);

    if (error || erroPendencias) {
      setErro(true);
      setRecentes([]);
      setResumo(RESUMO_VAZIO);
      setPendencias([]);
      return;
    }

    const itens = (data ?? []) as Registro[];
    setRecentes(itens);
    setPendencias((pendenciasData ?? []) as Pendencia[]);
    setResumo(
      itens.reduce(
        (acc, item) => ({
          registros: acc.registros + 1,
          pendentes: acc.pendentes + (item.status === "pendente" ? 1 : 0),
          lancados: acc.lancados + (item.status === "lancado" ? 1 : 0),
          plts: acc.plts + Number(item.quantidade_plts ?? 0),
          rolos: acc.rolos + Number(item.total_rolos ?? 0),
          metragem: acc.metragem + Number(item.metragem ?? 0),
          area: acc.area + Number(item.area_m2 ?? 0),
        }),
        { ...RESUMO_VAZIO },
      ),
    );
  }, [profile?.setor_atual, profile?.turno_atual]);

  function aplicarPayload(payload: PainelPayload) {
    const r = payload.resumo ?? {};
    setResumo({
      registros: Number(r.registros ?? 0),
      pendentes: Number(r.pendentes ?? 0),
      lancados: Number(r.lancados ?? 0),
      plts: Number(r.plts ?? 0),
      rolos: Number(r.rolos ?? 0),
      metragem: Number(r.metragem ?? 0),
      area: Number(r.area ?? 0),
    });
    setRecentes(payload.recentes ?? []);
    setPendencias(payload.pendencias ?? []);
  }

  useEffect(() => {
    void carregarPainel();
  }, [carregarPainel]);

  const hoje = dataSaoPaulo();
  const setor = profile?.setor_atual ?? "";
  const setorFitas = setor === "fitas";
  const setorMantas = setor === "mantas";
  const setorCorte = setor === "corte";
  const setorNome = setor ? nomeSetor(setor) : "Setor";
  const turnoNome = nomeTurno(profile?.turno_atual);

  const pendenciasAnteriores = useMemo(
    () => pendencias.filter((item) => item.data_local !== hoje || item.turno !== profile?.turno_atual),
    [hoje, pendencias, profile?.turno_atual],
  );
  const pendenciasAtuais = useMemo(
    () => pendencias.filter((item) => item.data_local === hoje && item.turno === profile?.turno_atual),
    [hoje, pendencias, profile?.turno_atual],
  );

  const gruposProtheus = useMemo(
    () => agruparPendencias(pendenciasAtuais, setor, false),
    [pendenciasAtuais, setor],
  );
  const gruposAnteriores = useMemo(
    () => agruparPendencias(pendenciasAnteriores, setor, true),
    [pendenciasAnteriores, setor],
  );

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    return recentes.filter((item) => {
      const combinaStatus = statusFiltro === "todos" || item.status === statusFiltro;
      const combinaBusca =
        !termo ||
        item.produto_nome.toLocaleLowerCase("pt-BR").includes(termo) ||
        (item.op ?? "").toLocaleLowerCase("pt-BR").includes(termo) ||
        (item.lote ?? "").toLocaleLowerCase("pt-BR").includes(termo);
      return combinaStatus && combinaBusca;
    });
  }, [busca, recentes, statusFiltro]);

  function abrirApontamento(modo: "novo" | "repetir") {
    setModoApontamento(modo);
    setApontarAberto(true);
  }

  async function confirmarGrupo(grupo: GrupoProtheus) {
    if (!isAutorizado || confirmandoChave) return;
    setConfirmandoChave(grupo.chave);
    const { data, error } = await supabase.rpc("confirmar_apontamentos_protheus", { p_ids: grupo.ids });
    setConfirmandoChave(null);
    if (error) {
      toast.error(error.message || "Não foi possível lançar no Protheus.");
      return;
    }
    toast.success(`${data ?? grupo.ids.length} apontamento(s) lançado(s) no Protheus.`);
    await carregarPainel();
  }

  return (
    <>
      <AppShell
        title="Painel do turno"
        eyebrow={`HOJE · ${setorNome.toUpperCase()} · ${turnoNome.toUpperCase()}`}
        notificationCount={pendenciasAnteriores.length}
        onNotifications={() => setNotificacoesAbertas(true)}
        onRepeat={() => abrirApontamento("repetir")}
        onApontar={() => abrirApontamento("novo")}
      >
        <div className="mx-auto max-w-5xl space-y-3">
          {erro && <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm font-medium text-red-800">Não foi possível carregar o painel. Tente novamente.</div>}

          {!loading && (!profile?.setor_atual || !profile.turno_atual) && (
            <Card className="rounded-2xl"><CardContent className="flex items-center justify-between gap-3 p-4"><p className="text-sm">Escolha setor e turno para começar.</p><Button asChild size="sm"><Link to="/selecionar">Escolher</Link></Button></CardContent></Card>
          )}

          <div className="grid grid-cols-2 gap-2.5">
            <Indicador icon={Clock3} label="Pendentes" valor={resumo.pendentes} detalhe="para lançar" tone="amber" />
            <Indicador icon={PackageCheck} label="Lançados" valor={resumo.lancados} detalhe="no Protheus" tone="green" />
            <Indicador icon={Boxes} label={setorFitas ? "Apontamentos" : "PLTs fechados"} valor={setorFitas ? resumo.registros : resumo.plts} detalhe="neste turno" tone="slate" />
            <Indicador icon={Gauge} label={setorFitas || setorMantas ? "Metragem Protheus" : "Unidades produzidas"} valor={setorFitas ? formatarNumero(resumo.area) : setorMantas ? formatarNumero(resumo.metragem) : resumo.rolos.toLocaleString("pt-BR")} detalhe={setorFitas ? "m²" : setorMantas ? "m" : "unidades"} tone="slate" destaque={setorFitas || setorMantas} />
          </div>

          {isAutorizado && gruposProtheus.length > 0 && (
            <section className="rounded-2xl border border-primary/20 bg-white p-3 shadow-sm">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div><h2 className="font-bold text-slate-950">Lançar no Protheus</h2><p className="text-xs text-slate-500">Valores já agrupados para reduzir lançamentos</p></div>
                <Button asChild variant="ghost" size="sm"><Link to="/controle-apontamentos">Abrir controle <ArrowRight className="size-4" /></Link></Button>
              </div>
              <div className="space-y-2">
                {gruposProtheus.slice(0, 4).map((grupo) => (
                  <div key={grupo.chave} className="flex items-center gap-2 rounded-xl bg-slate-50 p-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{tituloGrupo(grupo, setor)}</p>
                      <p className="truncate text-xs text-slate-500">{resumoGrupo(grupo, setor)}</p>
                    </div>
                    <Button size="sm" className="shrink-0" disabled={confirmandoChave !== null} onClick={() => void confirmarGrupo(grupo)}>
                      {confirmandoChave === grupo.chave ? "Lançando..." : "Lançar"}
                    </Button>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="px-3 pb-2 pt-3"><h2 className="text-lg font-extrabold text-slate-950">Apontamentos do turno</h2><p className="text-xs text-slate-500">Horário e produção de cada registro</p></div>
            <div className="grid grid-cols-[1fr_112px] gap-2 border-b border-slate-100 px-3 pb-3">
              <div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="OP, lote ou produto" className="h-10 rounded-xl pl-9 text-sm" /></div>
              <select value={statusFiltro} onChange={(event) => setStatusFiltro(event.target.value as "todos" | "pendente" | "lancado")} className="h-10 w-full rounded-xl border bg-white px-2 text-sm"><option value="todos">Todos</option><option value="pendente">Pendentes</option><option value="lancado">Lançados</option></select>
            </div>
            <div className="px-3 py-2">
              {filtrados.length === 0 ? (
                <div className="rounded-xl border border-dashed bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">Nenhum apontamento neste turno.</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {filtrados.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-2 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-950">{tituloRegistro(item, setor)}</p>
                        <p className="truncate text-xs text-slate-500"><strong>{formatarHora(item.created_at)}</strong> · {resumoRegistro(item, setor)}</p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold ${item.status === "lancado" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{item.status === "lancado" ? "Lançado" : "Pendente"}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3 shadow-sm">
            <div className="flex items-center gap-3"><div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700"><CheckCircle2 className="size-5" /></div><div className="min-w-0 flex-1"><h2 className="font-bold text-slate-950">Turno aberto</h2><p className="text-xs text-slate-500">{resumo.registros} apontamento(s) · {resumo.pendentes} pendente(s)</p></div><Button asChild variant="secondary" size="sm"><Link to="/passagem-turno"><LockKeyhole className="size-4" /> Encerrar</Link></Button></div>
          </section>
        </div>
      </AppShell>

      <ApontamentoRapido open={apontarAberto} onOpenChange={setApontarAberto} repeatLatest={modoApontamento === "repetir"} onSaved={carregarPainel} />

      <Dialog open={notificacoesAbertas} onOpenChange={setNotificacoesAbertas}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto rounded-2xl p-4 sm:max-w-xl">
          <DialogHeader><DialogTitle>Pendências de turnos anteriores</DialogTitle><DialogDescription>Apontamentos ainda não lançados no Protheus.</DialogDescription></DialogHeader>
          <div className="space-y-2">
            {gruposAnteriores.length === 0 ? (
              <div className="rounded-xl bg-slate-50 p-4 text-center text-sm text-slate-500">Nenhuma pendência anterior.</div>
            ) : gruposAnteriores.map((grupo) => (
              <article key={grupo.chave} className="rounded-xl border bg-slate-50/50 p-3">
                <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="font-bold">{tituloGrupo(grupo, setor)}</p><p className="text-xs text-slate-500">{formatarData(grupo.item.data_local)} · {nomeTurno(grupo.item.turno)} · {formatarHora(grupo.item.created_at)}</p></div><span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-700">Pendente</span></div>
                <p className="mt-2 text-sm font-medium text-slate-600">{resumoGrupo(grupo, setor)}</p>
                {isAutorizado && <Button type="button" variant="outline" size="sm" className="mt-2 w-full border-primary text-primary" disabled={confirmandoChave !== null} onClick={() => void confirmarGrupo(grupo)}>{confirmandoChave === grupo.chave ? "Lançando..." : grupo.ids.length > 1 ? `Lançar agrupado (${grupo.ids.length})` : "Conferir e lançar"}</Button>}
              </article>
            ))}
          </div>
          <DialogFooter className="grid grid-cols-2 gap-2 sm:flex"><Button variant="outline" onClick={() => setNotificacoesAbertas(false)}>Fechar</Button><Button asChild><Link to="/controle-apontamentos" onClick={() => setNotificacoesAbertas(false)}>Controle Protheus</Link></Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function agruparPendencias(itens: Pendencia[], setor: string, incluirTurnoNaChave: boolean) {
  const mapa = new Map<string, GrupoProtheus>();
  for (const item of itens) {
    const sufixoTurno = incluirTurnoNaChave ? `:${item.data_local}:${item.turno}` : "";
    let chave = `item:${item.id}`;
    if (setor === "mantas" && item.lote) chave = `manta:${item.produto_nome}:${item.lote}${sufixoTurno}`;
    if (setor === "corte" && item.op) chave = `corte:${item.produto_nome}:${item.op}${sufixoTurno}`;
    if (setor === "fitas" && item.op) chave = `fitas:${item.produto_nome}:${item.op}${sufixoTurno}`;

    const atual = mapa.get(chave);
    if (!atual) {
      mapa.set(chave, {
        chave,
        ids: [item.id],
        item,
        registros: 1,
        plts: Number(item.quantidade_plts ?? 0),
        rolos: Number(item.total_rolos ?? 0),
        metragem: Number(item.metragem ?? 0),
        area: Number(item.area_m2 ?? 0),
      });
      continue;
    }
    atual.ids.push(item.id);
    atual.registros += 1;
    atual.plts += Number(item.quantidade_plts ?? 0);
    atual.rolos += Number(item.total_rolos ?? 0);
    atual.metragem += Number(item.metragem ?? 0);
    atual.area += Number(item.area_m2 ?? 0);
  }
  return [...mapa.values()];
}

function Indicador({ icon: Icon, label, valor, detalhe, tone, destaque = false }: { icon: typeof Clock3; label: string; valor: string | number; detalhe: string; tone: "amber" | "green" | "slate"; destaque?: boolean }) {
  const toneClasses = tone === "amber" ? "bg-amber-50 text-amber-700" : tone === "green" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600";
  return <Card className={`rounded-2xl border-slate-200 shadow-sm ${destaque ? "border-primary/25 bg-primary/[0.025]" : ""}`}><CardContent className="flex min-h-[94px] items-center gap-2.5 p-3"><div className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${toneClasses}`}><Icon className="size-5" /></div><div className="min-w-0"><p className="truncate text-xs font-semibold text-slate-500">{label}</p><p className="truncate text-2xl font-extrabold leading-none text-slate-950">{valor}</p><p className="mt-1 text-xs text-slate-400">{detalhe}</p></div></CardContent></Card>;
}

function tituloRegistro(item: Registro, setor: string) {
  if (setor === "mantas") return `Lote ${item.lote ?? "—"} · ${item.produto_nome}`;
  return `${item.op ? `OP ${item.op} · ` : ""}${item.produto_nome}`;
}

function tituloGrupo(grupo: GrupoProtheus, setor: string) {
  if (setor === "mantas") return `Lote ${grupo.item.lote ?? "—"} · ${grupo.item.produto_nome}`;
  return `${grupo.item.op ? `OP ${grupo.item.op} · ` : ""}${grupo.item.produto_nome}`;
}

function resumoRegistro(item: Registro, setor: string) {
  if (setor === "fitas") return `${formatarNumero(Number(item.area_m2 ?? 0))} m² para Protheus`;
  if (setor === "mantas") return `${formatarNumero(Number(item.metragem ?? 0))} m · ${item.quantidade_plts ?? 0} PLTs · ${item.total_rolos ?? 0} rolos`;
  return `${item.quantidade_plts ?? 0} PLTs · ${item.total_rolos ?? 0} unidades`;
}

function resumoGrupo(grupo: GrupoProtheus, setor: string) {
  if (setor === "fitas") return `${formatarNumero(grupo.area)} m² para lançar${grupo.registros > 1 ? ` · ${grupo.registros} registros` : ""}`;
  if (setor === "mantas") return `${formatarNumero(grupo.metragem)} m · ${grupo.plts} PLTs · ${grupo.rolos} rolos${grupo.registros > 1 ? ` · ${grupo.registros} registros agrupados` : ""}`;
  return `${grupo.plts} PLTs para lançar · ${grupo.rolos} unidades${grupo.registros > 1 ? ` · ${grupo.registros} registros agrupados` : ""}`;
}

function formatarNumero(valor: number) { return valor.toLocaleString("pt-BR", { maximumFractionDigits: 2 }); }
function formatarData(valor: string) { const [ano, mes, dia] = valor.split("-"); return ano && mes && dia ? `${dia}/${mes}/${ano}` : valor; }
function formatarHora(valor: string) { return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(new Date(valor)); }
