import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AppShell, nomeSetor } from "@/components/dryko/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { dataSaoPaulo } from "@/lib/producao";

export const Route = createFileRoute("/_authenticated/painel")({ component: Painel });

type Resumo = { registros: number; plts: number; rolos: number; area: number };

function Painel() {
  const { profile, loading } = useAuth();
  const [resumo, setResumo] = useState<Resumo>({ registros: 0, plts: 0, rolos: 0, area: 0 });
  const [recentes, setRecentes] = useState<
    Array<{
      id: string;
      produto_nome: string;
      quantidade_plts: number | null;
      total_rolos: number | null;
      area_m2: number | null;
      created_at: string;
    }>
  >([]);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let ativo = true;
    setErro(false);
    if (!profile?.setor_atual || !profile.turno_atual) {
      setRecentes([]);
      setResumo({ registros: 0, plts: 0, rolos: 0, area: 0 });
      return () => {
        ativo = false;
      };
    }
    void supabase
      .from("apontamentos")
      .select("id, produto_nome, quantidade_plts, total_rolos, area_m2, created_at")
      .eq("setor", profile.setor_atual)
      .eq("turno", profile.turno_atual)
      .eq("data_local", dataSaoPaulo())
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (!ativo) return;
        if (error) {
          setErro(true);
          setRecentes([]);
          setResumo({ registros: 0, plts: 0, rolos: 0, area: 0 });
          return;
        }
        const itens = data ?? [];
        setRecentes(itens.slice(0, 20));
        setResumo(
          itens.reduce(
            (acc, item) => ({
              registros: acc.registros + 1,
              plts: acc.plts + (item.quantidade_plts ?? 0),
              rolos: acc.rolos + (item.total_rolos ?? 0),
              area: acc.area + Number(item.area_m2 ?? 0),
            }),
            { registros: 0, plts: 0, rolos: 0, area: 0 },
          ),
        );
      });
    return () => {
      ativo = false;
    };
  }, [profile?.setor_atual, profile?.turno_atual]);

  const setorFitas = profile?.setor_atual === "fitas";
  const dataAtual = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-4">
        <div>
          <h1 className="text-2xl font-bold">Painel do turno</h1>
          <p className="text-sm text-muted-foreground">
            {loading
              ? "Carregando..."
              : profile?.setor_atual && profile.turno_atual
                ? `${nomeSetor(profile.setor_atual)} · Turno ${profile.turno_atual} · ${dataAtual} · ${profile.nome || "Usuário"}`
                : "Escolha um setor e um turno para começar."}
          </p>
        </div>
        {erro && (
          <div
            role="alert"
            className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm font-medium text-red-800"
          >
            Não foi possível carregar os apontamentos do turno.
          </div>
        )}
        {!loading && (!profile?.setor_atual || !profile.turno_atual) && (
          <Card>
            <CardContent className="flex flex-col gap-3 pt-6">
              <p className="text-sm">Você ainda não escolheu setor e turno.</p>
              <Button asChild className="h-12 w-fit">
                <Link to="/selecionar">Escolher agora</Link>
              </Button>
            </CardContent>
          </Card>
        )}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Indicador label="Apontamentos" valor={resumo.registros} />
          <Indicador
            label={setorFitas ? "Área" : "PLTs"}
            valor={
              setorFitas
                ? `${resumo.area.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m²`
                : resumo.plts
            }
          />
          {!setorFitas && <Indicador label="Rolos" valor={resumo.rolos} />}
          {!setorFitas && <Indicador label="Metragem" valor="Aguardando largura" />}
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Apontamentos de hoje</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum apontamento registrado neste turno.
              </p>
            ) : (
              recentes.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-md border p-3 text-sm"
                >
                  <span className="font-medium">{item.produto_nome}</span>
                  <span className="text-muted-foreground">
                    {setorFitas
                      ? `${Number(item.area_m2).toLocaleString("pt-BR")} m²`
                      : `${item.quantidade_plts} PLTs · ${item.total_rolos} rolos`}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function Indicador({ label, valor }: { label: string; valor: string | number }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-xl font-bold">{valor}</p>
      </CardContent>
    </Card>
  );
}
