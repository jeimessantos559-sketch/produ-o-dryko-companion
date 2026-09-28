import { createFileRoute } from "@tanstack/react-router";
import { Clock3, PackageCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/dryko/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { dataSaoPaulo } from "@/lib/producao";

export const Route = createFileRoute("/_authenticated/contagem")({ component: Contagem });

type Registro = {
  produto_nome: string;
  quantidade_plts: number | null;
  total_rolos: number | null;
  metragem: number | null;
  area_m2: number | null;
  created_at: string;
};

type Linha = {
  produto: string;
  apontamentos: number;
  plts: number;
  rolos: number;
  metragem: number;
  area: number;
};

type Hora = {
  hora: string;
  apontamentos: number;
  plts: number;
  rolos: number;
  metragem: number;
  area: number;
};

function Contagem() {
  const { profile } = useAuth();
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let ativo = true;
    setErro(false);
    if (!profile?.setor_atual || !profile.turno_atual) {
      setRegistros([]);
      return () => {
        ativo = false;
      };
    }

    void supabase
      .from("apontamentos")
      .select("produto_nome, quantidade_plts, total_rolos, metragem, area_m2, created_at")
      .eq("setor", profile.setor_atual)
      .eq("turno", profile.turno_atual)
      .eq("data_local", dataSaoPaulo())
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (!ativo) return;
        if (error) {
          setErro(true);
          setRegistros([]);
          return;
        }
        setRegistros((data ?? []) as Registro[]);
      });

    return () => {
      ativo = false;
    };
  }, [profile?.setor_atual, profile?.turno_atual]);

  const linhas = useMemo(() => {
    const mapa = new Map<string, Linha>();
    for (const item of registros) {
      const atual = mapa.get(item.produto_nome) ?? {
        produto: item.produto_nome,
        apontamentos: 0,
        plts: 0,
        rolos: 0,
        metragem: 0,
        area: 0,
      };
      atual.apontamentos += 1;
      atual.plts += Number(item.quantidade_plts ?? 0);
      atual.rolos += Number(item.total_rolos ?? 0);
      atual.metragem += Number(item.metragem ?? 0);
      atual.area += Number(item.area_m2 ?? 0);
      mapa.set(item.produto_nome, atual);
    }
    return [...mapa.values()].sort((a, b) => a.produto.localeCompare(b.produto));
  }, [registros]);

  const porHora = useMemo(() => {
    const mapa = new Map<string, Hora>();
    for (const item of registros) {
      const hora = new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
        hour: "2-digit",
        hour12: false,
      }).format(new Date(item.created_at));
      const chave = `${hora}:00`;
      const atual = mapa.get(chave) ?? {
        hora: chave,
        apontamentos: 0,
        plts: 0,
        rolos: 0,
        metragem: 0,
        area: 0,
      };
      atual.apontamentos += 1;
      atual.plts += Number(item.quantidade_plts ?? 0);
      atual.rolos += Number(item.total_rolos ?? 0);
      atual.metragem += Number(item.metragem ?? 0);
      atual.area += Number(item.area_m2 ?? 0);
      mapa.set(chave, atual);
    }
    return [...mapa.values()].sort((a, b) => a.hora.localeCompare(b.hora));
  }, [registros]);

  const fitas = profile?.setor_atual === "fitas";
  const mantas = profile?.setor_atual === "mantas";
  const corte = profile?.setor_atual === "corte";

  return (
    <AppShell title="Contagem" eyebrow="PRODUÇÃO · CONTROLE DO TURNO">
      <div className="mx-auto max-w-4xl space-y-3">
        <div>
          <h2 className="text-xl font-extrabold">Produção do turno</h2>
          <p className="text-xs text-muted-foreground">Totais por produto e por hora no turno {profile?.turno_atual ?? "—"}.</p>
        </div>

        {erro && <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm font-medium text-red-800">Não foi possível carregar a contagem.</div>}

        {(corte || mantas) && (
          <Card className="rounded-2xl border-slate-200 shadow-sm">
            <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Clock3 className="size-5 text-primary" /> PLTs por hora</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {porHora.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum apontamento registrado.</p>
              ) : porHora.map((item) => (
                <div key={item.hora} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                  <div><p className="font-bold">{item.hora}</p><p className="text-xs text-slate-500">{item.apontamentos} apontamento(s)</p></div>
                  <div className="text-right"><p className="text-xl font-extrabold text-primary">{item.plts} PLTs</p><p className="text-xs text-slate-500">{mantas ? `${fmt(item.metragem)} m` : `${item.rolos} rolos`}</p></div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {fitas && (
          <Card className="rounded-2xl border-slate-200 shadow-sm">
            <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Clock3 className="size-5 text-primary" /> Metragem por hora</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {porHora.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum apontamento registrado.</p> : porHora.map((item) => (
                <div key={item.hora} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5"><span className="font-bold">{item.hora}</span><span className="text-xl font-extrabold text-primary">{fmt(item.area)} m²</span></div>
              ))}
            </CardContent>
          </Card>
        )}

        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><PackageCheck className="size-5 text-primary" /> Produção por produto</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {linhas.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum apontamento registrado.</p>
            ) : linhas.map((linha) => (
              <div key={linha.produto} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-3"><strong>{linha.produto}</strong><span className="text-xs text-slate-500">{linha.apontamentos} apontamento(s)</span></div>
                {fitas ? (
                  <p className="mt-2 text-2xl font-extrabold text-primary">{fmt(linha.area)} m²</p>
                ) : mantas ? (
                  <div className="mt-2 grid grid-cols-3 gap-2 text-center"><Mini label="Metragem" valor={`${fmt(linha.metragem)} m`} destaque /><Mini label="PLTs" valor={String(linha.plts)} /><Mini label="Rolos" valor={String(linha.rolos)} /></div>
                ) : corte ? (
                  <div className="mt-2 grid grid-cols-3 gap-2 text-center"><Mini label="PLTs" valor={String(linha.plts)} destaque /><Mini label="Unidades" valor={String(linha.rolos)} /><Mini label="Metragem" valor={`${fmt(linha.metragem)} m²`} /></div>
                ) : (
                  <div className="mt-2 grid grid-cols-2 gap-2 text-center"><Mini label="PLTs" valor={String(linha.plts)} /><Mini label="Rolos" valor={String(linha.rolos)} /></div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function Mini({ label, valor, destaque = false }: { label: string; valor: string; destaque?: boolean }) {
  return <div className={`rounded-lg p-2 ${destaque ? "bg-primary/10 text-primary" : "bg-slate-50"}`}><p className="text-[10px] uppercase text-slate-500">{label}</p><p className="font-bold">{valor}</p></div>;
}

function fmt(valor: number) {
  return valor.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}
