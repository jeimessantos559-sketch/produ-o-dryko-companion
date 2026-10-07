import { createFileRoute, Link } from "@tanstack/react-router";
import { Download, FileText, LockKeyhole, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { pltsFechados } from "@/lib/apontamentos-turno";
import { enviarRelatorio } from "@/lib/enviar-relatorio";
import {
  agruparRevisaoDoTurno,
  opsFinalizadasDoTurno,
  quantidadeDaRevisao,
  type FonteFinalizacao,
} from "@/lib/fechamento-turno";
import { dataOperacional } from "@/lib/producao";
import { baixarPdf } from "@/lib/relatorio-pdf";
import { realizadoNaUnidade, type SetorGerencial } from "@/lib/indicadores";

export const Route = createFileRoute("/_authenticated/passagem-turno")({
  component: PassagemTurno,
});

type Apontamento = Database["public"]["Tables"]["apontamentos"]["Row"];
type Fechamento = Database["public"]["Tables"]["fechamentos_turno"]["Row"];

function PassagemTurno() {
  const { profile, user, isAdmin } = useAuth();
  const [data, setData] = useState(() => dataOperacional(profile?.turno_atual));
  const [apontamentos, setApontamentos] = useState<Apontamento[]>([]);
  const [finalizacoes, setFinalizacoes] = useState<FonteFinalizacao[]>([]);
  const [fechamento, setFechamento] = useState<Fechamento | null>(null);
  const [anteriores, setAnteriores] = useState<Fechamento[]>([]);
  const [nomes, setNomes] = useState<Record<string, string>>({});
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState(false);
  const [processando, setProcessando] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [justificativa, setJustificativa] = useState("");
  const [programadosAbertos, setProgramadosAbertos] = useState<number | null>(null);
  const cargaAtual = useRef(0);

  useEffect(() => {
    if (profile?.turno_atual) setData(dataOperacional(profile.turno_atual));
  }, [profile?.turno_atual]);

  const carregar = useCallback(async () => {
    const carga = ++cargaAtual.current;
    if (!profile?.setor_atual || !profile.turno_atual) {
      setCarregando(false);
      return;
    }
    setCarregando(true);
    setErroCarga(false);
    const [
      consultaApontamentos,
      consultaMetas,
      consultaProgramacao,
      consultaFechamentos,
      consultaPerfis,
    ] = await Promise.all([
      supabase
        .from("apontamentos")
        .select("*")
        .eq("setor", profile.setor_atual)
        .eq("turno", profile.turno_atual)
        .eq("data_local", data)
        .order("data_hora_producao"),
      supabase
        .from("metas_op")
        .select("*")
        .eq("setor", profile.setor_atual)
        .eq("status", "finalizada")
        .order("created_at"),
      supabase
        .from("programacao_producao")
        .select("*")
        .eq("setor", profile.setor_atual)
        .eq("data_local", data)
        .not("finalizado_em", "is", null),
      supabase
        .from("fechamentos_turno")
        .select("*")
        .eq("setor", profile.setor_atual)
        .order("data_local", { ascending: false })
        .order("turno", { ascending: false })
        .limit(8),
      supabase.from("profiles").select("id, nome"),
    ]);
    if (carga !== cargaAtual.current) return;
    if (
      [
        consultaApontamentos,
        consultaMetas,
        consultaProgramacao,
        consultaFechamentos,
        consultaPerfis,
      ].some((resposta) => resposta.error)
    ) {
      setErroCarga(true);
      setCarregando(false);
      return;
    }
    const setorAtual = profile.setor_atual;
    if (setorAtual === "corte" || setorAtual === "fitas" || setorAtual === "mantas") {
      const [consultaProg, consultaDia] = await Promise.all([
        supabase
          .from("programacao_producao")
          .select("produto_id, quantidade_prevista, unidade")
          .eq("setor", setorAtual)
          .eq("data_local", data)
          .eq("global_dia", true),
        supabase
          .from("apontamentos")
          .select("produto_id, status, created_at, lancado_em, quantidade_plts, metragem, area_m2")
          .eq("setor", setorAtual)
          .eq("data_local", data),
      ]);
      if (carga !== cargaAtual.current) return;
      if (consultaProg.error || consultaDia.error) {
        setErroCarga(true);
        setCarregando(false);
        return;
      }
      const prog = consultaProg.data;
      const doDia = consultaDia.data;
      const abertos = (
        (prog ?? []) as { produto_id: string; quantidade_prevista: number; unidade: string }[]
      ).filter((p) => {
        const real = realizadoNaUnidade(
          setorAtual as SetorGerencial,
          p.unidade,
          (doDia ?? []).filter((a) => a.produto_id === p.produto_id),
        );
        return real === null || real < Number(p.quantidade_prevista);
      }).length;
      setProgramadosAbertos(abertos);
    } else {
      setProgramadosAbertos(null);
    }
    setApontamentos(consultaApontamentos.data ?? []);
    setFinalizacoes([...(consultaMetas.data ?? []), ...(consultaProgramacao.data ?? [])]);
    const listaFechamentos = consultaFechamentos.data ?? [];
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
    setNomes(
      Object.fromEntries(
        (consultaPerfis.data ?? []).map((item) => [item.id, item.nome || "Sem nome"]),
      ),
    );
    setCarregando(false);
  }, [data, profile?.setor_atual, profile?.turno_atual]);

  useEffect(() => {
    void carregar();
    const atualizar = () => {
      void carregar();
    };
    window.addEventListener("apontamento-salvo", atualizar);
    return () => {
      window.removeEventListener("apontamento-salvo", atualizar);
    };
  }, [carregar]);

  const revisao = useMemo(() => agruparRevisaoDoTurno(apontamentos), [apontamentos]);
  const opsFinalizadas = useMemo(
    () =>
      profile?.turno_atual
        ? opsFinalizadasDoTurno(apontamentos, finalizacoes, data, profile.turno_atual, nomes)
        : [],
    [apontamentos, finalizacoes, data, profile?.turno_atual, nomes],
  );

  const totais = useMemo(
    () =>
      apontamentos.reduce(
        (acc, item) => ({
          apontamentos: acc.apontamentos + 1,
          pendentes: acc.pendentes + (item.status === "pendente" ? 1 : 0),
          lancados: acc.lancados + (item.status === "lancado" ? 1 : 0),
          plts: acc.plts + pltsFechados(item),
          rolos: acc.rolos + (item.total_rolos ?? 0),
          metragem: acc.metragem + Number(item.metragem ?? 0),
          area: acc.area + Number(item.area_m2 ?? 0),
          unidades: acc.unidades + Number(item.total_unidades ?? 0),
          semiKg: acc.semiKg + Number(item.semi_consumido_kg ?? 0),
        }),
        {
          apontamentos: 0,
          pendentes: 0,
          lancados: 0,
          plts: 0,
          rolos: 0,
          metragem: 0,
          area: 0,
          unidades: 0,
          semiKg: 0,
        },
      ),
    [apontamentos],
  );

  function montarResumo(): Json {
    return {
      setor: profile?.setor_atual ? nomeSetor(profile.setor_atual) : "",
      turno: profile?.turno_atual ?? "",
      data,
      responsavel: profile?.nome || (user ? nomes[user.id] : "") || "Usuário",
      geradoEm: new Date().toISOString(),
      totais,
      ops_finalizadas: opsFinalizadas as unknown as Json,
      apontamentos: apontamentos as unknown as Json,
    };
  }

  function nomeArquivo() {
    return `relatorio-${profile?.setor_atual ?? "setor"}-${data}-${profile?.turno_atual ?? "turno"}.pdf`;
  }

  async function baixarRelatorioPorId(relatorioId: string) {
    const { data: relatorio, error } = await supabase
      .from("relatorios")
      .select("id, resumo")
      .eq("id", relatorioId)
      .single();
    if (error || !relatorio)
      throw new Error("O relatório foi criado, mas não foi possível abrir o PDF.");
    baixarPdf(relatorio.resumo, nomeArquivo());
  }

  async function enviarAutomaticamente(relatorioId: string) {
    const { data: grupo } = await supabase
      .from("grupos_email_relatorio")
      .select("nome, emails")
      .eq("automatico", true)
      .eq("ativo", true)
      .maybeSingle();

    const emails = Array.isArray(grupo?.emails) ? grupo.emails.filter(Boolean) : [];
    if (emails.length === 0) {
      toast.info("Turno fechado. Nenhum grupo automático de e-mail está configurado.");
      return;
    }

    try {
      await enviarRelatorio({ data: { relatorioId, destinatarios: emails } });
      toast.success(
        `Relatório enviado automaticamente para ${grupo?.nome ?? "o grupo automático"}.`,
      );
    } catch (erro) {
      toast.warning(
        `Turno fechado, mas o envio automático falhou. ${erro instanceof Error ? erro.message : "Você pode reenviar pela tela de Relatórios."}`,
      );
    }
  }

  async function fechar() {
    if (
      !profile?.setor_atual ||
      !profile.turno_atual ||
      !user ||
      processando ||
      carregando ||
      erroCarga
    )
      return;
    if (apontamentos.length === 0) {
      toast.error("Registre ao menos um apontamento antes de encerrar e gerar o relatório.");
      return;
    }

    setProcessando(true);
    const { data: relatorioId, error } = await supabase.rpc("fechar_turno", {
      p_setor: profile.setor_atual,
      p_turno: profile.turno_atual,
      p_data: data,
      p_resumo: montarResumo(),
    });
    if (error) {
      setProcessando(false);
      toast.error(error.message || "Não foi possível fechar o turno.");
      return;
    }

    await carregar();
    if (relatorioId) await enviarAutomaticamente(relatorioId);
    setProcessando(false);
    toast.success("Turno fechado e relatório gerado. O PDF fica disponível no histórico.");
  }

  async function gerarRelatorio() {
    if (
      !profile?.setor_atual ||
      !profile.turno_atual ||
      !fechamento ||
      gerando ||
      carregando ||
      erroCarga
    )
      return;
    setGerando(true);
    try {
      const { data: relatorioId, error } = await supabase.rpc("gerar_relatorio_turno", {
        p_setor: profile.setor_atual,
        p_turno: profile.turno_atual,
        p_data: data,
        p_resumo: montarResumo(),
      });
      if (error || !relatorioId)
        throw new Error(error?.message || "Não foi possível gerar o relatório.");
      await baixarRelatorioPorId(relatorioId);
      toast.success("Relatório PDF gerado com sucesso.");
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível gerar o relatório.");
    } finally {
      setGerando(false);
    }
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
    <AppShell
      title="Fechamento do turno"
      eyebrow={profile?.setor_atual ? nomeSetor(profile.setor_atual) : undefined}
    >
      <div className="mx-auto max-w-5xl space-y-4">
        <div>
          <h2 className="text-2xl font-bold">Passagem e fechamento de turno</h2>
          <p className="text-sm text-muted-foreground">
            Confira os totais por produto e lote antes de encerrar. Ao fechar, o relatório detalhado
            é gerado e enviado ao grupo automático salvo. O PDF não é baixado automaticamente.
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
              <Label htmlFor="data-fechamento">Data da produção</Label>
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
        ) : erroCarga ? (
          <Card>
            <CardContent className="space-y-3 pt-6">
              <p className="text-sm text-muted-foreground">
                Não foi possível carregar a revisão completa do turno.
              </p>
              <Button variant="outline" onClick={() => void carregar()}>
                Tentar novamente
              </Button>
            </CardContent>
          </Card>
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
              <Indicador label="OPs / lotes finalizados" valor={opsFinalizadas.length} />
              <Indicador label="PLTs" valor={totais.plts} />
              {profile?.setor_atual === "liquidos" ? (
                <>
                  <Indicador label="Unidades" valor={totais.unidades.toLocaleString("pt-BR")} />
                  <Indicador
                    label="Semi consumido"
                    valor={`${totais.semiKg.toLocaleString("pt-BR")} kg`}
                  />
                </>
              ) : (
                <>
                  <Indicador label="Rolos" valor={totais.rolos} />
                  <Indicador
                    label="Metragem"
                    valor={`${totais.metragem.toLocaleString("pt-BR")} m`}
                  />
                  <Indicador
                    label="Área"
                    valor={`${totais.area.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m²`}
                  />
                </>
              )}
            </div>

            {totais.pendentes > 0 && !fechado && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
                Há {totais.pendentes} apontamento(s) ainda pendente(s) de confirmação no Protheus. A
                pendência continuará registrada no relatório.
              </div>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Revisão dos apontamentos</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Totais do turno por produto e lote. Os lançamentos individuais ficam no relatório.
                </p>
              </CardHeader>
              <CardContent className="space-y-2">
                {apontamentos.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum apontamento neste turno.</p>
                ) : (
                  revisao.map((grupo) => (
                    <div key={grupo.chave} className="space-y-2 rounded-xl border p-4 text-sm">
                      <p className="font-semibold">
                        {grupo.produtoNome}
                        {grupo.lote ? ` · Lote ${grupo.lote}` : ""}
                      </p>
                      <p className="text-base font-bold">{quantidadeDaRevisao(grupo)}</p>
                      <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                        {grupo.ops.length > 0 && (
                          <span>
                            {grupo.ops.length === 1 ? "OP" : "OPs"} {grupo.ops.join(", ")}
                          </span>
                        )}
                        <span
                          className={
                            grupo.pendentes > 0 ? "font-medium text-amber-700" : "text-green-700"
                          }
                        >
                          {grupo.pendentes > 0
                            ? `${grupo.pendentes} pendente(s) · ${grupo.lancados} lançado(s)`
                            : "Todos lançados no Protheus"}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {!fechado && (totais.pendentes > 0 || (programadosAbertos ?? 0) > 0) && (
              <Card className="border-amber-500/50">
                <CardHeader>
                  <CardTitle className="text-base">Atenção antes de fechar</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <ul className="space-y-1 text-foreground">
                    <li>• {totais.pendentes} apontamento(s) pendente(s) no Protheus</li>
                    {programadosAbertos !== null && (
                      <li>• {programadosAbertos} produto(s) programado(s) não concluído(s)</li>
                    )}
                  </ul>
                </CardContent>
              </Card>
            )}

            {!fechado ? (
              <Button
                className="h-14 w-full text-base"
                disabled={
                  !profile?.setor_atual ||
                  !profile.turno_atual ||
                  processando ||
                  apontamentos.length === 0
                }
                onClick={fechar}
              >
                <LockKeyhole />{" "}
                {processando ? "Encerrando e enviando..." : "Encerrar e enviar relatório"}
              </Button>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <Button className="h-12" disabled={gerando} onClick={gerarRelatorio}>
                  {gerando ? <FileText className="animate-pulse" /> : <Download />}
                  {gerando ? "Gerando..." : "Baixar relatório PDF"}
                </Button>
                <Button asChild variant="outline" className="h-12">
                  <Link to="/relatorios">Histórico de relatórios</Link>
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

function formatar(valor: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(valor));
}
