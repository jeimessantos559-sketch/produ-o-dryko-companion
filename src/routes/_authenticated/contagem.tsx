import { createFileRoute } from "@tanstack/react-router";
import { Clock3, PackageCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/dryko/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { dataOperacional } from "@/lib/producao";

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

type ProdutoHora = {
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
  produtos: ProdutoHora[];
};

type HoraInterna = Omit<Hora, "produtos"> & {
  produtos: Map<string, ProdutoHora>;
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

    const dataAtual = dataOperacional(profile.turno_atual);
    void supabase
      .from("apontamentos")
      .select("produto_nome, quantidade_plts, total_rolos, metragem, area_m2, created_at")
      .eq("setor", profile.setor_atual)
      .eq("turno", profile.turno_atual)
      .eq("data_local", dataAtual)
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
    const mapa = new Map<string, HoraInterna>();

    for (const item of registros) {
      const hora = new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
        hour: "2-digit",
        hourCycle: "h23",
      }).format(new Date(item.created_at));
      const chave = `${hora}:00`;

      const atual = mapa.get(chave) ?? {
        hora: chave,
        apontamentos: 0,
        plts: 0,
        rolos: 0,
        metragem: 0,
        area: 0,
        produtos: new Map<string, ProdutoHora>(),
      };

      atual.apontamentos += 1;
      atual.plts += Number(item.quantidade_plts ?? 0);
      atual.rolos += Number(item.total_rolos ?? 0);
      atual.metragem += Number(item.metragem ?? 0);
      atual.area += Number(item.area_m2 ?? 0);

      const produto = atual.produtos.get(item.produto_nome) ?? {
        produto: item.produto_nome,
        apontamentos: 0,
        plts: 0,
        rolos: 0,
        metragem: 0,
        area: 0,
      };
      produto.apontamentos += 1;
      produto.plts += Number(item.quantidade_plts ?? 0);
      produto.rolos += Number(item.total_rolos ?? 0);
      produto.metragem += Number(item.metragem ?? 0);
      produto.area += Number(item.area_m2 ?? 0);
      atual.produtos.set(item.produto_nome, produto);
      mapa.set(chave, atual);
    }

    // O Map preserva a ordem de inserção. Como a consulta vem ordenada por created_at,
    // a sequência continua correta mesmo quando o turno atravessa a meia-noite.
    return [...mapa.values()].map((item) => ({
      ...item,
      produtos: [...item.produtos.values()].sort((a, b) => a.produto.localeCompare(b.produto)),
    }));
  }, [registros]);

  const fitas = profile?.setor_atual === "fitas";
  const mantas = profile?.setor_atual === "mantas";
  const corte = profile?.setor_atual === "corte";

  return (
    <AppShell title="Contagem" eyebrow="PRODUÇÃO · CONTROLE DO TURNO">
      <div className="mx-auto max-w-4xl space-y-3">
        <div>
          <h2 className="text-xl font-extrabold">Produção do turno</h2>
          <p className="text-xs text-muted-foreground">Produção separada por horário e produto no turno {profile?.turno_atual ?? "—"}.</p>
        </div>

        {erro && <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm font-medium text-red-800">Não foi possível carregar a contagem.</div>}

        {(corte || mantas) && (
          <Card className="rounded-2xl border-slate-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base"><Clock3 className="size-5 text-primary" /> Produção por hora</CardTitle>
              <p className="text-xs text-slate-500">Produtos produzidos em cada horário, com o total pronto para copiar para a planilha.</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {porHora.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum apontamento registrado.</p>
              ) : porHora.map((item) => (
                <article key={item.hora} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  <div className="flex items-center justify-between bg-slate-50 px-3 py-2.5">
                    <div>
                      <p className="text-lg font-black text-slate-950">{item.hora}</p>
                      <p className="text-[11px] text-slate-500">{item.apontamentos} apontamento(s)</p>
                    </div>
                    <span className="rounded-xl bg-primary/10 px-3 py-1.5 text-sm font-black text-primary">{item.plts} PLTs</span>
                  </div>

                  <div className="divide-y divide-slate-100 px-3">
                    {item.produtos.map((produto) => (
                      <div key={produto.produto} className="flex items-center justify-between gap-3 py-2.5">
                        <span className="min-w-0 truncate font-semibold text-slate-900">{produto.produto}</span>
                        <span className="shrink-0 font-bold text-slate-700">{produto.plts} PLTs</span>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-2 border-t border-slate-200 bg-slate-50/70 p-3 text-center">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Total da hora</p>
                      <p className="text-lg font-black text-slate-950">{item.plts} PLTs</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Metragem total</p>
                      <p className="text-lg font-black text-primary">{fmt(item.metragem)} {mantas ? "m" : "m²"}</p>
                    </div>
                  </div>
                </article>
              ))}
            </CardContent>
          </Card>
        )}

        {fitas && (
          <Card className="rounded-2xl border-slate-200 shadow-sm">
            <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Clock3 className="size-5 text-primary" /> Produção por hora</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {porHora.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum apontamento registrado.</p> : porHora.map((item) => (
                <article key={item.hora} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  <div className="flex items-center justify-between bg-slate-50 px-3 py-2.5">
                    <span className="text-lg font-black">{item.hora}</span>
                    <span className="font-black text-primary">{fmt(item.area)} m²</span>
                  </div>
                  <div className="divide-y divide-slate-100 px-3">
                    {item.produtos.map((produto) => (
                      <div key={produto.produto} className="flex items-center justify-between gap-3 py-2.5">
                        <span className="font-semibold text-slate-900">{produto.produto}</span>
                        <span className="font-bold text-slate-700">{fmt(produto.area)} m²</span>
                      </div>
                    ))}
                  </div>
                </article>
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
