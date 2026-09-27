import { createFileRoute, Link } from "@tanstack/react-router";
import { LockKeyhole, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell, nomeSetor } from "@/components/dryko/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";
import { dataSaoPaulo } from "@/lib/producao";

export const Route = createFileRoute("/_authenticated/passagem-turno")({
  component: PassagemTurno,
});

type Apontamento = Database["public"]["Tables"]["apontamentos"]["Row"];
type Meta = Database["public"]["Tables"]["metas_op"]["Row"];
type Fechamento = Database["public"]["Tables"]["fechamentos_turno"]["Row"];

function PassagemTurno() {
  const { profile, user, isAdmin } = useAuth();
  const [data, setData] = useState(dataSaoPaulo());
  const [apontamentos, setApontamentos] = useState<Apontamento[]>([]);
  const [metas, setMetas] = useState<Meta[]>([]);
  const [fechamento, setFechamento] = useState<Fechamento | null>(null);
  const [anteriores, setAnteriores] = useState<Fechamento[]>([]);
  const [nomes, setNomes] = useState<Record<string, string>>({});
  const [carregando, setCarregando] = useState(true);
  const [processando, setProcessando] = useState(false);
  const [justificativa, setJustificativa] = useState("");

  const carregar = useCallback(async () => {
    if (!profile?.setor_atual || !profile.turno_atual) {
      setCarregando(false);
      return;
    }
    setCarregando(true);
    const [{ data: registros }, { data: listaMetas }, { data: fechamentos }, { data: perfis }] =
      await Promise.all([
        supabase
          .from("apontamentos")
          .select("*")
          .eq("setor", profile.setor_atual)
          .eq("turno", profile.turno_atual)
          .eq("data_local", data)
          .order("created_at"),
        supabase
          .from("metas_op")
          .select("*")
          .eq("setor", profile.setor_atual)
          .eq("status", "ativa")
          .order("created_at"),
        supabase
          .from("fechamentos_turno")
          .select("*")
          .eq("setor", profile.setor_atual)
          .order("data_local", { ascending: false })
          .order("turno", { ascending: false })
          .limit(8),
        supabase.from("profiles").select("id, nome"),
      ]);
    setApontamentos(registros ?? []);
    setMetas(listaMetas ?? []);
    const listaFechamentos = fechamentos ?? [];
    setFechamento(
      listaFechamentos.find(
        (item) => item.data_local === data && item.turno === profile.turno_atual,
      ) ?? null,
    );
    setAnteriores(
      listaFechamentos.filter(
        (item) => !(item.data_local === data && item.turno === profile.turno_atual),
      ),
    );
    setNomes(Object.fromEntries((perfis ?? []).map((item) => [item.id, item.nome || "Sem nome"])));
    setCarregando(false);
  }, [data, profile?.setor_atual, profile?.turno_atual]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const totais = useMemo(
    () =>
      apontamentos.reduce(
        (acc, item) => ({
          apontamentos: acc.apontamentos + 1,
          pendentes: acc.pendentes + (item.status === "pendente" ? 1 : 0),
          lancados: acc.lancados + (item.status === "lancado" ? 1 : 0),
          plts: acc.plts + (item.quantidade_plts ?? 0),
          rolos: acc.rolos + (item.total_rolos ?? 0),
          metragem: acc.metragem + Number(item.metragem ?? 0),
          area: acc.area + Number(item.area_m2 ?? 0),
        }),
        { apontamentos: 0, pendentes: 0, lancados: 0, plts: 0, rolos: 0, metragem: 0, area: 0 },
      ),
    [apontamentos],
  );

  async function fechar() {
    if (!profile?.setor_atual || !profile.turno_atual || !user || processando) return;
    const resumo: Json = {
      setor: nomeSetor(profile.setor_atual),
      turno: profile.turno_atual,
      data,
      responsavel: profile.nome || nomes[user.id] || "Usuário",
      geradoEm: new Date().toISOString(),
      totais,
      metas: metas as unknown as Json,
      apontamentos: apontamentos as unknown as Json,
    };
    setProcessando(true);
    const { error } = await supabase.rpc("fechar_turno", {
      p_setor: profile.setor_atual,
      p_turno: profile.turno_atual,
      p_data: data,
      p_resumo: resumo,
    });
    setProcessando(false);
    if (error) {
      toast.error(error.message || "Não foi possível fechar o turno.");
      return;
    }
    toast.success("Turno fechado e relatório gerado.");
    await carregar();
  }

  async function reabrir() {
    if (!fechamento || justificativa.trim().length < 3 || processando) return;
    setProcessando(true);
    const { error } = await supabase.rpc("reabrir_turno", {
      p_fechamento_id: fechamento.id,
      p_justificativa: justificativa.trim(),
    });
    setProcessando(false);
    if (error) {
      toast.error(error.message || "Não foi possível reabrir o turno.");
      return;
    }
    setJustificativa("");
    toast.success("Turno reaberto. Novos apontamentos estão liberados.");
    await carregar();
  }

  const fechado = fechamento?.status === "fechado";
  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-4">
        <div>
          <h1 className="text-2xl font-bold">Passagem e fechamento de turno</h1>
          <p className="text-sm text-muted-foreground">
            Revise produção, metas e pendências antes de encerrar. O fechamento bloqueia novos
            apontamentos.
          </p>
        </div>

        <Card>
          <CardContent className="grid gap-3 pt-6 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Setor</p>
              <p className="font-semibold">
                {profile?.setor_atual ? nomeSetor(profile.setor_atual) : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Turno</p>
              <p className="font-semibold">{profile?.turno_atual ?? "—"}</p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="data-fechamento">Data</Label>
              <Input
                id="data-fechamento"
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {carregando ? (
          <p className="text-sm text-muted-foreground">Montando revisão do turno...</p>
        ) : (
          <>
            {fechado && (
              <div className="rounded-lg border border-green-300 bg-green-50 p-4 text-sm text-green-900">
                <p className="font-semibold">Turno fechado</p>
                <p>
                  Por {nomes[fechamento.fechado_por] ?? "usuário"} em{" "}
                  {formatar(fechamento.fechado_em)}. Novos apontamentos estão bloqueados.
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Indicador label="Apontamentos" valor={totais.apontamentos} />
              <Indicador
                label="Pendentes"
                valor={totais.pendentes}
                destaque={totais.pendentes > 0}
              />
              <Indicador label="Lançados" valor={totais.lancados} />
              <Indicador label="Metas ativas" valor={metas.length} />
              <Indicador label="PLTs" valor={totais.plts} />
              <Indicador label="Rolos" valor={totais.rolos} />
              <Indicador label="Metragem" valor={`${totais.metragem.toLocaleString("pt-BR")} m`} />
              <Indicador
                label="Área"
                valor={`${totais.area.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m²`}
              />
            </div>

            {totais.pendentes > 0 && !fechado && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
                Há {totais.pendentes} apontamento(s) ainda pendente(s) de confirmação no Protheus. O
                fechamento é permitido, mas esta pendência ficará registrada no relatório.
              </div>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Revisão dos apontamentos</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {apontamentos.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum apontamento neste turno.</p>
                ) : (
                  apontamentos.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-wrap justify-between gap-2 rounded-md border p-3 text-sm"
                    >
                      <span className="font-medium">
                        {item.op ? `OP ${item.op} · ` : ""}
                        {item.produto_nome}
                      </span>
                      <span className="text-muted-foreground">
                        {resumoApontamento(item)} ·{" "}
                        {item.status === "lancado" ? "Lançado" : "Pendente"}
                      </span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {!fechado ? (
              <Button
                className="h-14 w-full text-base"
                disabled={!profile?.setor_atual || !profile.turno_atual || processando}
                onClick={fechar}
              >
                <LockKeyhole /> {processando ? "Fechando..." : "Encerrar turno e gerar relatório"}
              </Button>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <Button asChild className="h-12">
                  <Link to="/relatorios">Abrir relatório</Link>
                </Button>
                {isAdmin && (
                  <Card className="sm:col-span-2">
                    <CardHeader>
                      <CardTitle className="text-base">Reabrir turno</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <Textarea
                        value={justificativa}
                        onChange={(e) => setJustificativa(e.target.value)}
                        placeholder="Justificativa obrigatória"
                      />
                      <Button
                        variant="outline"
                        disabled={justificativa.trim().length < 3 || processando}
                        onClick={reabrir}
                      >
                        <RotateCcw /> Reabrir e liberar apontamentos
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {anteriores.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Fechamentos anteriores</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {anteriores.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-wrap justify-between gap-2 rounded-md border p-3 text-sm"
                    >
                      <span>
                        {item.data_local} · {item.turno}
                      </span>
                      <span className="text-muted-foreground">
                        {item.status === "fechado" ? "Fechado" : "Reaberto"} ·{" "}
                        {nomes[item.fechado_por] ?? "Usuário"}
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}

function Indicador({
  label,
  valor,
  destaque = false,
}: {
  label: string;
  valor: string | number;
  destaque?: boolean;
}) {
  return (
    <Card className={destaque ? "border-amber-400" : undefined}>
      <CardContent className="pt-5">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-xl font-bold">{valor}</p>
      </CardContent>
    </Card>
  );
}

function resumoApontamento(item: Apontamento) {
  if (item.setor === "fitas") return `${Number(item.area_m2 ?? 0).toLocaleString("pt-BR")} m²`;
  return `${item.quantidade_plts ?? 0} PLTs · ${item.total_rolos ?? 0} rolos`;
}

function formatar(valor: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(valor));
}
