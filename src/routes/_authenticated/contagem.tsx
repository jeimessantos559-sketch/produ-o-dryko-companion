import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AppShell } from "@/components/dryko/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { dataSaoPaulo } from "@/lib/producao";

export const Route = createFileRoute("/_authenticated/contagem")({ component: Contagem });

type Linha = {
  produto: string;
  apontamentos: number;
  plts: number;
  rolos: number;
  metragem: number;
  area: number;
};

function Contagem() {
  const { profile } = useAuth();
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [erro, setErro] = useState(false);
  useEffect(() => {
    let ativo = true;
    setErro(false);
    if (!profile?.setor_atual || !profile.turno_atual) {
      setLinhas([]);
      return () => {
        ativo = false;
      };
    }
    void supabase
      .from("apontamentos")
      .select("produto_nome, quantidade_plts, total_rolos, metragem, area_m2")
      .eq("setor", profile.setor_atual)
      .eq("turno", profile.turno_atual)
      .eq("data_local", dataSaoPaulo())
      .then(({ data, error }) => {
        if (!ativo) return;
        if (error) {
          setErro(true);
          setLinhas([]);
          return;
        }
        const mapa = new Map<string, Linha>();
        for (const item of data ?? []) {
          const atual = mapa.get(item.produto_nome) ?? {
            produto: item.produto_nome,
            apontamentos: 0,
            plts: 0,
            rolos: 0,
            metragem: 0,
            area: 0,
          };
          atual.apontamentos += 1;
          atual.plts += item.quantidade_plts ?? 0;
          atual.rolos += item.total_rolos ?? 0;
          atual.metragem += Number(item.metragem ?? 0);
          atual.area += Number(item.area_m2 ?? 0);
          mapa.set(item.produto_nome, atual);
        }
        setLinhas([...mapa.values()].sort((a, b) => a.produto.localeCompare(b.produto)));
      });
    return () => {
      ativo = false;
    };
  }, [profile?.setor_atual, profile?.turno_atual]);

  const fitas = profile?.setor_atual === "fitas";
  const mantas = profile?.setor_atual === "mantas";
  const corte = profile?.setor_atual === "corte";
  return (
    <AppShell title="Contagem por produto" eyebrow="PRODUÇÃO · ACUMULADO DO TURNO">
      <div className="mx-auto max-w-3xl space-y-4">
        <p className="text-sm text-muted-foreground">
          Totais de hoje no turno {profile?.turno_atual ?? "—"}
        </p>
        {erro && (
          <div
            role="alert"
            className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm font-medium text-red-800"
          >
            Não foi possível carregar a contagem.
          </div>
        )}
        <Card className="rounded-3xl border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Produção acumulada</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {linhas.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum apontamento registrado.</p>
            ) : (
              linhas.map((linha) => (
                <div
                  key={linha.produto}
                  className={`grid grid-cols-2 gap-2 rounded-xl border border-slate-200 p-3 text-sm ${mantas || corte ? "sm:grid-cols-5" : "sm:grid-cols-4"}`}
                >
                  <strong>{linha.produto}</strong>
                  <span>{linha.apontamentos} apontamento(s)</span>
                  {fitas ? (
                    <span>
                      {linha.area.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m²
                    </span>
                  ) : mantas ? (
                    <>
                      <span>{linha.plts} PLTs</span>
                      <span>
                        {linha.metragem.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m
                      </span>
                      <span>{linha.rolos} rolos</span>
                    </>
                  ) : corte ? (
                    <>
                      <span>{linha.plts} PLTs</span>
                      <span>{linha.rolos} rolos</span>
                      <span>
                        {linha.metragem.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m²
                      </span>
                    </>
                  ) : (
                    <>
                      <span>{linha.plts} PLTs</span>
                      <span>{linha.rolos} rolos</span>
                    </>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
