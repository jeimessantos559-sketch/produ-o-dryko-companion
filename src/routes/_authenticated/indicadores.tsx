import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft, BarChart3, Clock3, PauseCircle, Target } from "lucide-react";
import { useEffect, useState } from "react";

import { AppShell } from "@/components/dryko/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  aderencias, realizadoNaUnidade, tempoMedioConfirmacaoMin, UNIDADE_PRINCIPAL,
  type Aderencia, type ApontamentoIndicador, type SetorGerencial,
} from "@/lib/indicadores";
import { dataSaoPaulo } from "@/lib/producao";

export const Route = createFileRoute("/_authenticated/indicadores")({
  head: () => ({
    meta: [
      { title: "Painel gerencial — Aponta Produção DRYKO" },
      { name: "description", content: "Indicadores de produção por setor: metas, programação, paradas e Protheus." },
      { property: "og:title", content: "Painel gerencial — Aponta Produção DRYKO" },
      { property: "og:description", content: "Indicadores de produção por setor." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Indicadores,
});

const SETORES: { codigo: SetorGerencial; nome: string }[] = [
  { codigo: "corte", nome: "Corte" },
  { codigo: "fitas", nome: "Fitas" },
  { codigo: "mantas", nome: "Mantas" },
];
const PERIODOS = [1, 7, 30] as const;

type Dados = {
  registros: number;
  realizado: number;
  plts: number | null;
  meta: Aderencia[];
  programacao: Aderencia[];
  ocorrencias: number;
  paradaMin: number;
  pendentesAntigas: number;
  tempoMedioMin: number | null;
};

const fmt = (n: number, d = 1) => n.toLocaleString("pt-BR", { maximumFractionDigits: d });

function desdeDias(dias: number) {
  const d = new Date(Date.now() - (dias - 1) * 86_400_000);
  return dataSaoPaulo(d);
}

async function carregar(setor: SetorGerencial, dias: number): Promise<Dados> {
  const desde = desdeDias(dias);
  const limiteAntigo = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const [aps, metas, prog, ocorr, horas, antigas] = await Promise.all([
    supabase.from("apontamentos").select("status, created_at, lancado_em, quantidade_plts, metragem, area_m2").eq("setor", setor).gte("data_local", desde).limit(5000),
    supabase.from("metas_turno").select("quantidade_meta, unidade").eq("setor", setor).gte("data_local", desde),
    supabase.from("programacao_producao").select("quantidade_prevista, unidade").eq("setor", setor).gte("data_local", desde),
    supabase.from("ocorrencias_turno").select("id", { count: "exact", head: true }).eq("setor", setor).gte("data_local", desde),
    supabase.from("programacao_hora").select("parada_minutos").eq("setor", setor).gte("data_local", desde),
    supabase.from("apontamentos").select("id", { count: "exact", head: true }).eq("setor", setor).eq("status", "pendente").lt("created_at", limiteAntigo),
  ]);
  const lista = (aps.data ?? []) as ApontamentoIndicador[];
  return {
    registros: lista.length,
    realizado: realizadoNaUnidade(setor, UNIDADE_PRINCIPAL[setor], lista) ?? 0,
    plts: setor === "corte" ? realizadoNaUnidade(setor, "PLTs", lista) : null,
    meta: aderencias(setor, (metas.data ?? []).map((m) => ({ quantidade: Number(m.quantidade_meta), unidade: m.unidade })), lista),
    programacao: aderencias(setor, (prog.data ?? []).map((p) => ({ quantidade: Number(p.quantidade_prevista), unidade: p.unidade })), lista),
    ocorrencias: ocorr.count ?? 0,
    paradaMin: (horas.data ?? []).reduce((t, h) => t + Number(h.parada_minutos ?? 0), 0),
    pendentesAntigas: antigas.count ?? 0,
    tempoMedioMin: tempoMedioConfirmacaoMin(lista),
  };
}

function Indicadores() {
  const { isAdmin } = useAuth();
  const [setor, setSetor] = useState<SetorGerencial>("corte");
  const [dias, setDias] = useState<(typeof PERIODOS)[number]>(7);
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    let ativo = true;
    setDados(null);
    setErro(false);
    carregar(setor, dias).then((d) => ativo && setDados(d)).catch(() => ativo && setErro(true));
    return () => { ativo = false; };
  }, [isAdmin, setor, dias]);

  if (!isAdmin) {
    return (
      <AppShell title="Painel gerencial" eyebrow="ACESSO RESTRITO">
        <Card className="mx-auto max-w-xl"><CardContent className="p-4 text-sm text-muted-foreground">Esta área é exclusiva do administrador.</CardContent></Card>
      </AppShell>
    );
  }

  const unidade = UNIDADE_PRINCIPAL[setor];

  return (
    <AppShell title="Painel gerencial" eyebrow="INDICADORES POR SETOR">
      <div className="mx-auto max-w-4xl space-y-3">
        <Link to="/administracao" className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Administração</Link>

        <div className="grid grid-cols-3 gap-1.5 rounded-2xl border bg-card p-1.5 shadow-sm">
          {SETORES.map((s) => (
            <button key={s.codigo} type="button" onClick={() => setSetor(s.codigo)}
              className={`h-11 rounded-xl text-sm font-bold ${setor === s.codigo ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>
              {s.nome}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          {PERIODOS.map((p) => (
            <button key={p} type="button" onClick={() => setDias(p)}
              className={`h-9 flex-1 rounded-xl border text-xs font-semibold ${dias === p ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground"}`}>
              {p === 1 ? "Hoje" : `${p} dias`}
            </button>
          ))}
        </div>

        {erro ? (
          <Card><CardContent className="p-4 text-sm text-destructive">Não foi possível carregar os indicadores.</CardContent></Card>
        ) : !dados ? (
          <Card><CardContent className="p-4 text-sm text-muted-foreground">Carregando indicadores...</CardContent></Card>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2.5">
              <Bloco icon={BarChart3} label={`Produção (${unidade})`} valor={dados.registros ? fmt(dados.realizado) : "—"} detalhe={`${dados.registros} apontamento(s)`} />
              {dados.plts !== null && <Bloco icon={BarChart3} label="PLTs fechados" valor={dados.registros ? fmt(dados.plts, 0) : "—"} detalhe="Somente Corte" />}
              <Bloco icon={AlertTriangle} label="Pendências Protheus +24h" valor={dados.pendentesAntigas} detalhe="Aguardando lançamento" />
              <Bloco icon={Clock3} label="Tempo até Protheus" valor={dados.tempoMedioMin === null ? "—" : duracao(dados.tempoMedioMin)} detalhe={dados.tempoMedioMin === null ? "Sem lançamentos no período" : "Média apontamento → confirmação"} />
              <Bloco icon={PauseCircle} label="Paradas registradas" valor={dados.paradaMin ? `${fmt(dados.paradaMin, 0)} min` : "—"} detalhe={`${dados.ocorrencias} ocorrência(s)`} />
            </div>

            <Aderencias titulo="Aderência à meta do turno" itens={dados.meta} vazio="Nenhuma meta de turno definida neste período." />
            <Aderencias titulo="Aderência à programação" itens={dados.programacao} vazio="Nenhuma programação cadastrada neste período." />
            <p className="text-xs text-muted-foreground">Metas e programações só são comparadas com a produção na mesma unidade ({setor === "corte" ? "m² ou PLTs" : unidade}).</p>
          </>
        )}
      </div>
    </AppShell>
  );
}

function duracao(min: number) {
  if (min < 60) return `${fmt(min, 0)} min`;
  if (min < 1440) return `${fmt(min / 60)} h`;
  return `${fmt(min / 1440)} dias`;
}

function Bloco({ icon: Icon, label, valor, detalhe }: { icon: typeof BarChart3; label: string; valor: string | number; detalhe: string }) {
  return (
    <Card className="rounded-2xl shadow-sm">
      <CardContent className="flex min-h-24 items-center gap-3 p-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="size-5" /></div>
        <div className="min-w-0"><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="truncate text-xl font-extrabold text-foreground">{valor}</p><p className="text-[11px] text-muted-foreground">{detalhe}</p></div>
      </CardContent>
    </Card>
  );
}

function Aderencias({ titulo, itens, vazio }: { titulo: string; itens: Aderencia[]; vazio: string }) {
  return (
    <section className="rounded-2xl border bg-card p-4 shadow-sm">
      <h2 className="flex items-center gap-2 font-extrabold text-foreground"><Target className="size-4 text-primary" /> {titulo}</h2>
      {itens.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{vazio}</p>
      ) : (
        <div className="mt-3 space-y-3">
          {itens.map((a) => (
            <div key={a.unidade}>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">{fmt(a.realizado)} de {fmt(a.alvo)} {a.unidade}</span><strong className="text-foreground">{fmt(a.percentual, 0)}%</strong></div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, a.percentual)}%` }} /></div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
