import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Download, FileSpreadsheet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/dryko/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  CAMPOS_OCORRENCIA,
  csvOcorrencias,
  formatarDuracaoOcorrencia,
  rankingParadas,
  resumoParadas,
  type OcorrenciaOperacional,
} from "@/lib/ocorrencias-operacionais";
import { dataSaoPaulo } from "@/lib/producao";

export const Route = createFileRoute("/_authenticated/paradas")({
  head: () => ({
    meta: [
      { title: "Paradas e ocorrências | Aponta Produção DRYKO" },
      { name: "description", content: "Tempo parado por equipamento, motivo e turno, com exportação CSV." },
      { property: "og:title", content: "Paradas e ocorrências | Aponta Produção DRYKO" },
      { property: "og:description", content: "Tempo parado por equipamento, motivo e turno." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Paradas,
});

const SETORES = [
  ["", "Todos"], ["corte", "Corte"], ["fitas", "Fitas"], ["mantas", "Mantas"],
  ["asfox", "Asfox"], ["misturadores", "Misturadores"], ["liquidos", "Líquidos"], ["pos", "Pós"], ["avulsos", "Avulsos"],
] as const;
type Periodo = "1" | "7" | "30" | "custom";
type Visao = "equipamento" | "motivo" | "turno";

const diasAtras = (n: number) => dataSaoPaulo(new Date(Date.now() - n * 86_400_000));

function Paradas() {
  const { isAdmin } = useAuth();
  const [periodo, setPeriodo] = useState<Periodo>("7");
  const [inicio, setInicio] = useState(diasAtras(6));
  const [fim, setFim] = useState(diasAtras(0));
  const [setor, setSetor] = useState("");
  const [visao, setVisao] = useState<Visao>("equipamento");
  const [lista, setLista] = useState<OcorrenciaOperacional[] | null>(null);
  const [erro, setErro] = useState(false);

  const intervalo = useMemo(() => {
    if (periodo === "custom") return { de: inicio <= fim ? inicio : fim, ate: inicio <= fim ? fim : inicio };
    return { de: diasAtras(Number(periodo) - 1), ate: diasAtras(0) };
  }, [periodo, inicio, fim]);

  useEffect(() => {
    if (!isAdmin) return;
    let ativo = true;
    setLista(null);
    setErro(false);
    let q = (supabase as any).from("ocorrencias_turno").select(CAMPOS_OCORRENCIA)
      .gte("data_local", intervalo.de).lte("data_local", intervalo.ate)
      .order("data_local", { ascending: true }).limit(5000);
    if (setor) q = q.eq("setor", setor);
    q.then(({ data, error }: { data: OcorrenciaOperacional[] | null; error: unknown }) => {
      if (!ativo) return;
      if (error) setErro(true); else setLista(data ?? []);
    });
    return () => { ativo = false; };
  }, [isAdmin, intervalo, setor]);

  const resumo = useMemo(() => resumoParadas(lista ?? []), [lista]);
  const ranking = useMemo(() => rankingParadas(lista ?? [], visao), [lista, visao]);
  const incluiHoje = intervalo.ate >= diasAtras(0);

  async function exportarCsv() {
    if (!lista?.length) return void toast.info("Não há ocorrências no período.");
    const { data: perfis } = await supabase.from("profiles").select("id, nome");
    const nomes = Object.fromEntries((perfis ?? []).map((p) => [p.id, p.nome]));
    const blob = new Blob(["\ufeff" + csvOcorrencias(lista, nomes)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `paradas-${setor || "todos"}-${intervalo.de}_${intervalo.ate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!isAdmin) {
    return (
      <AppShell title="Paradas e ocorrências" eyebrow="ACESSO RESTRITO">
        <Card className="mx-auto max-w-xl"><CardContent className="p-4 text-sm text-muted-foreground">Esta área é exclusiva do administrador.</CardContent></Card>
      </AppShell>
    );
  }

  const botao = (ativo: boolean) =>
    `h-10 flex-1 rounded-xl border text-xs font-semibold ${ativo ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground"}`;

  return (
    <AppShell title="Paradas e ocorrências" eyebrow="GERENCIAL">
      <div className="mx-auto max-w-4xl space-y-3">
        <Link to="/administracao" className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Administração</Link>

        <div className="flex gap-1.5">
          {(["1", "7", "30", "custom"] as const).map((p) => (
            <button key={p} type="button" className={botao(periodo === p)} onClick={() => setPeriodo(p)}>
              {p === "1" ? "Hoje" : p === "custom" ? "Período" : `${p} dias`}
            </button>
          ))}
        </div>
        {periodo === "custom" && (
          <div className="grid grid-cols-2 gap-2">
            <input type="date" aria-label="Data inicial" className="h-11 rounded-xl border border-input bg-background px-3 text-foreground" value={inicio} onChange={(e) => setInicio(e.target.value)} />
            <input type="date" aria-label="Data final" className="h-11 rounded-xl border border-input bg-background px-3 text-foreground" value={fim} onChange={(e) => setFim(e.target.value)} />
          </div>
        )}
        <select aria-label="Setor" className="h-11 w-full rounded-xl border border-input bg-background px-3 text-foreground" value={setor} onChange={(e) => setSetor(e.target.value)}>
          {SETORES.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
        </select>

        {erro ? (
          <Card><CardContent className="p-4 text-sm text-destructive">Não foi possível carregar as ocorrências.</CardContent></Card>
        ) : !lista ? (
          <Card><CardContent className="p-4 text-sm text-muted-foreground">Carregando...</CardContent></Card>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2.5">
              <Bloco label="Tempo total parado" valor={formatarDuracaoOcorrencia(resumo.totalMin) || "—"} />
              <Bloco label="Ocorrências finalizadas" valor={String(resumo.finalizadas)} />
              {incluiHoje && <Bloco label="Em andamento" valor={String(resumo.emAndamento)} />}
              <Bloco label="Maior tempo parado" valor={resumo.maiorEquipamento ? resumo.maiorEquipamento.chave : "—"}
                detalhe={resumo.maiorEquipamento ? formatarDuracaoOcorrencia(resumo.maiorEquipamento.minutos) : undefined} />
            </div>

            <div className="grid grid-cols-3 gap-1.5 rounded-2xl border bg-card p-1.5">
              {([["equipamento", "Por equipamento"], ["motivo", "Por motivo"], ["turno", "Por turno"]] as const).map(([v, r]) => (
                <button key={v} type="button" onClick={() => setVisao(v)}
                  className={`h-10 rounded-xl text-xs font-bold ${visao === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>{r}</button>
              ))}
            </div>

            <section className="rounded-2xl border bg-card p-3 shadow-sm">
              <div className="mb-3">
                <h2 className="font-extrabold text-foreground">Pareto de paradas</h2>
                <p className="text-xs text-muted-foreground">Ranking do maior para o menor tempo parado.</p>
              </div>
              {ranking.length === 0 ? (
                <p className="p-2 text-sm text-muted-foreground">Nenhuma parada finalizada com tempo registrado neste período.</p>
              ) : (
                <div className="divide-y divide-border">
                  {ranking.map((r) => (
                    <div key={r.chave} className="py-2 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate font-medium text-foreground">{r.chave}</span>
                        <span className="shrink-0 text-muted-foreground"><strong className="text-destructive">{formatarDuracaoOcorrencia(r.minutos)}</strong> · {r.quantidade} ocorr.</span>
                      </div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted" aria-label={`${r.chave}: ${formatarDuracaoOcorrencia(r.minutos)}`}>
                        <div className="h-full rounded-full bg-destructive" style={{ width: `${ranking[0] ? (r.minutos / ranking[0].minutos) * 100 : 0}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
            <p className="text-xs text-muted-foreground">O tempo considera somente ocorrências finalizadas. Em andamento e "Sem ocorrências" não entram no total.</p>

            <div className="grid grid-cols-2 gap-2">
              <Button className="h-12" onClick={() => void exportarCsv()}><Download className="size-4" /> Exportar CSV</Button>
              <Button className="h-12" variant="outline" disabled><FileSpreadsheet className="size-4" /> Excel em breve</Button>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

function Bloco({ label, valor, detalhe }: { label: string; valor: string; detalhe?: string | undefined }) {
  return (
    <Card className="rounded-2xl shadow-sm">
      <CardContent className="p-3">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="truncate text-xl font-extrabold text-foreground">{valor}</p>
        {detalhe && <p className="text-[11px] text-muted-foreground">{detalhe}</p>}
      </CardContent>
    </Card>
  );
}
