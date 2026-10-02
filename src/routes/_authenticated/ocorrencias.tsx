import { createFileRoute } from "@tanstack/react-router";
import { ClipboardCopy, MessageSquare, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { AppShell, nomeSetor, nomeTurno } from "@/components/dryko/app-shell";
import { OcorrenciasOperacionaisForm } from "@/components/dryko/ocorrencias-operacionais-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
      <div className="mx-auto max-w-2xl space-y-4">
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
      </div>
    </AppShell>
  );
}

function formatarData(valor: string) {
  const [ano, mes, dia] = valor.split("-");
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : valor;
}
