import { createFileRoute } from "@tanstack/react-router";
import { CalendarSearch, ClipboardCopy, MessageSquare, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { AppShell, nomeSetor, nomeTurno } from "@/components/dryko/app-shell";
import { OcorrenciasOperacionaisForm } from "@/components/dryko/ocorrencias-operacionais-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  CAMPOS_OCORRENCIA,
  textoOcorrencias,
  type OcorrenciaOperacional,
} from "@/lib/ocorrencias-operacionais";
import { dataOperacional } from "@/lib/producao";

export const Route = createFileRoute("/_authenticated/ocorrencias")({
  head: () => ({
    meta: [
      { title: "Ocorrências do turno | Aponta Produção DRYKO" },
      { name: "description", content: "Ocorrências em andamento e finalizadas do turno, com finalização rápida." },
      { property: "og:title", content: "Ocorrências do turno | Aponta Produção DRYKO" },
      { property: "og:description", content: "Ocorrências em andamento e finalizadas do turno." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Ocorrencias,
});

function Ocorrencias() {
  const { profile, user } = useAuth();
  const setor = profile?.setor_atual;
  const turno = profile?.turno_atual;
  const dataAtual = turno ? dataOperacional(turno) : "";
  const [ocorrencias, setOcorrencias] = useState<OcorrenciaOperacional[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [textoGerado, setTextoGerado] = useState("");
  const cargaAtual = useRef(0);

  useEffect(() => {
    const carga = ++cargaAtual.current;
    if (!setor || !turno || !dataAtual) {
      setOcorrencias([]);
      setCarregando(false);
      return;
    }
    setCarregando(true);
    void (supabase as any)
      .from("ocorrencias_turno")
      .select(CAMPOS_OCORRENCIA)
      .eq("setor", setor)
      .eq("turno", turno)
      .eq("data_local", dataAtual)
      .order("created_at", { ascending: true })
      .then(({ data, error }: { data: unknown[] | null; error: { message?: string } | null }) => {
        if (carga !== cargaAtual.current) return;
        if (error) {
          toast.error("Não foi possível carregar as ocorrências do turno.");
          return;
        }
        setOcorrencias((data ?? []) as OcorrenciaOperacional[]);
      })
      .finally(() => {
        if (carga === cargaAtual.current) setCarregando(false);
      });
  }, [dataAtual, setor, turno]);

  function gerarOcorrencias() {
    if (!setor || !turno) return;
    const linhas = [
      `OCORRÊNCIAS - ${nomeSetor(setor)} - ${nomeTurno(turno)} - ${formatarData(dataAtual)}`,
      "",
      textoOcorrencias(ocorrencias, true, setor),
      "",
    ];
    setTextoGerado(linhas.join("\n").trim());
  }

  async function copiarOcorrencias() {
    if (!textoGerado) return;
    try {
      await navigator.clipboard.writeText(textoGerado);
      toast.success("Ocorrências copiadas.");
    } catch {
      toast.error("Não foi possível copiar automaticamente.");
    }
  }

  if (!setor || !turno) {
    return (
      <AppShell title="Ocorrências" eyebrow="PRODUÇÃO · OCORRÊNCIAS">
        <Card>
          <CardContent className="p-5 text-sm text-muted-foreground">
            Escolha setor e turno antes de registrar ocorrências.
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell title="Ocorrências" eyebrow={`${nomeSetor(setor).toUpperCase()} · ${turno}`}>
      <Tabs defaultValue="atual" className="mx-auto max-w-2xl">
        <TabsList className="mb-4 grid h-11 w-full grid-cols-2">
          <TabsTrigger value="atual">Turno atual</TabsTrigger>
          <TabsTrigger value="anteriores">Consultar anteriores</TabsTrigger>
        </TabsList>
        <TabsContent value="anteriores">
          <ConsultaAnteriores setor={setor} dataAtual={dataAtual} />
        </TabsContent>
        <TabsContent value="atual" className="space-y-4">
        <Card className="rounded-2xl border-border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquare className="size-5 text-primary" /> Registrar ocorrência
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {setor === "corte" || setor === "fitas"
                ? "Escolha o equipamento e a situação. Equipamentos sem registro saem como “Sem ocorrências”."
                : "Digite a ocorrência do turno em texto livre."}
            </p>
          </CardHeader>
          <CardContent>
            {carregando ? (
              <p className="text-sm text-muted-foreground">Carregando ocorrências...</p>
            ) : (
              <OcorrenciasOperacionaisForm
                setor={setor}
                turno={turno}
                dataLocal={dataAtual}
                userId={user?.id}
                ocorrencias={ocorrencias}
                permitirExcluir
                onChange={(lista) => {
                  setOcorrencias(lista);
                  setTextoGerado("");
                }}
              />
            )}
          </CardContent>
        </Card>

        <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-200">
          <div className="flex gap-2">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <p>
              {setor === "corte" || setor === "fitas"
                ? "Ao gerar, o sistema cria o resumo no padrão por equipamentos, com “Sem ocorrências” para os equipamentos sem registro."
                : "Ao gerar, o sistema cria uma lista simples das ocorrências registradas no turno."}
            </p>
          </div>
        </div>

        <Button className="h-12 w-full text-base font-bold" onClick={gerarOcorrencias} disabled={carregando}>
          <MessageSquare className="size-5" /> Gerar ocorrências
        </Button>

        {textoGerado && (
          <Card className="rounded-2xl border-primary/30 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-base">Resumo gerado</CardTitle>
              <Button variant="outline" size="sm" onClick={() => void copiarOcorrencias()}>
                <ClipboardCopy className="size-4" /> Copiar
              </Button>
            </CardHeader>
            <CardContent>
              <textarea
                readOnly
                value={textoGerado}
                rows={12}
                className="w-full resize-y rounded-xl border border-input bg-muted/30 px-3 py-2 font-mono text-xs text-foreground"
              />
            </CardContent>
          </Card>
        )}
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

function formatarData(valor: string) {
  const [ano, mes, dia] = valor.split("-");
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : valor;
}

function diaAnterior(valor: string) {
  const d = new Date(`${valor}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

const TURNOS = ["T1", "T2", "T3"] as const;

function ConsultaAnteriores({ setor, dataAtual }: { setor: string; dataAtual: string }) {
  const [data, setData] = useState(() => diaAnterior(dataAtual));
  const [lista, setLista] = useState<OcorrenciaOperacional[]>([]);
  const [carregando, setCarregando] = useState(false);
  const carga = useRef(0);

  useEffect(() => {
    const atual = ++carga.current;
    if (!data || data > dataAtual) {
      setLista([]);
      return;
    }
    setCarregando(true);
    void (supabase as any)
      .from("ocorrencias_turno")
      .select(CAMPOS_OCORRENCIA)
      .eq("setor", setor)
      .eq("data_local", data)
      .order("created_at", { ascending: true })
      .then(({ data: linhas, error }: { data: unknown[] | null; error: unknown }) => {
        if (atual !== carga.current) return;
        if (error) {
          toast.error("Não foi possível consultar as ocorrências.");
          setLista([]);
          return;
        }
        setLista((linhas ?? []) as OcorrenciaOperacional[]);
      })
      .finally(() => {
        if (atual === carga.current) setCarregando(false);
      });
  }, [data, dataAtual, setor]);

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl border-border shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarSearch className="size-5 text-primary" /> Consultar dias anteriores
          </CardTitle>
          <p className="text-xs text-muted-foreground">Somente leitura. Mostra T1, T2 e T3 do setor {nomeSetor(setor)}.</p>
        </CardHeader>
        <CardContent>
          <label className="text-sm font-medium" htmlFor="data-consulta">Data</label>
          <Input
            id="data-consulta"
            type="date"
            className="mt-1 h-11"
            value={data}
            max={dataAtual}
            onChange={(e) => {
              const v = e.target.value;
              setData(v && v > dataAtual ? dataAtual : v);
            }}
          />
        </CardContent>
      </Card>

      {carregando ? (
        <p className="text-sm text-muted-foreground">Carregando ocorrências...</p>
      ) : lista.length === 0 ? (
        <Card className="rounded-2xl">
          <CardContent className="p-5 text-sm text-muted-foreground">Nenhuma ocorrência registrada nesta data.</CardContent>
        </Card>
      ) : (
        TURNOS.map((t) => {
          const doTurno = lista.filter((o) => (o as { turno?: string }).turno === t);
          return (
            <Card key={t} className="rounded-2xl border-border shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{nomeTurno(t)} · {formatarData(data)}</CardTitle>
              </CardHeader>
              <CardContent>
                {doTurno.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma ocorrência neste turno.</p>
                ) : (
                  <pre className="whitespace-pre-wrap break-words rounded-xl border border-input bg-muted/30 px-3 py-2 font-sans text-sm text-foreground">
                    {textoOcorrencias(doTurno, false, setor)}
                  </pre>
                )}
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
