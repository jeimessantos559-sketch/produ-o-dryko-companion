import { createFileRoute, Link } from "@tanstack/react-router";
import { Download, FileText, LockKeyhole, RotateCcw } from "lucide-react";
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
import { enviarRelatorio } from "@/lib/enviar-relatorio";
import { dataOperacional } from "@/lib/producao";
import { baixarPdf } from "@/lib/relatorio-pdf";
import { consolidarOcorrencias, linhasOcorrenciasLivres, usaOcorrenciasEstruturadas, type OcorrenciaOperacional } from "@/lib/ocorrencias-operacionais";
import { CAMPOS_OCORRENCIA, formatarDuracaoOcorrencia, linhasTotalParado } from "@/lib/ocorrencias-operacionais";
import { ocorrenciaEmAndamento } from "@/lib/ocorrencias-operacionais";
import { realizadoNaUnidade, type SetorGerencial } from "@/lib/indicadores";

export const Route = createFileRoute("/_authenticated/passagem-turno")({
  component: PassagemTurno,
});

type Apontamento = Database["public"]["Tables"]["apontamentos"]["Row"];
type Meta = Database["public"]["Tables"]["metas_op"]["Row"];
type Fechamento = Database["public"]["Tables"]["fechamentos_turno"]["Row"];

function PassagemTurno() {
  const { profile, user, isAdmin } = useAuth();
  const [data, setData] = useState(() => dataOperacional(profile?.turno_atual));
  const [apontamentos, setApontamentos] = useState<Apontamento[]>([]);
  const [metas, setMetas] = useState<Meta[]>([]);
  const [fechamento, setFechamento] = useState<Fechamento | null>(null);
  const [anteriores, setAnteriores] = useState<Fechamento[]>([]);
  const [ocorrencias, setOcorrencias] = useState<OcorrenciaOperacional[]>([]);
  const [nomes, setNomes] = useState<Record<string, string>>({});
  const [carregando, setCarregando] = useState(true);
  const [processando, setProcessando] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [justificativa, setJustificativa] = useState("");
  const [programadosAbertos, setProgramadosAbertos] = useState<number | null>(null);

  useEffect(() => {
    if (profile?.turno_atual) setData(dataOperacional(profile.turno_atual));
  }, [profile?.turno_atual]);

  const carregar = useCallback(async () => {
    if (!profile?.setor_atual || !profile.turno_atual) {
      setCarregando(false);
      return;
    }
    setCarregando(true);
    const [{ data: registros }, { data: listaMetas }, { data: fechamentos }, { data: perfis }, { data: listaOcorrencias }] =
      await Promise.all([
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
        (supabase as any)
          .from("ocorrencias_turno")
          .select(CAMPOS_OCORRENCIA)
          .eq("setor", profile.setor_atual)
          .eq("turno", profile.turno_atual)
          .eq("data_local", data)
          .order("created_at", { ascending: true }),
      ]);
    setOcorrencias((listaOcorrencias ?? []) as OcorrenciaOperacional[]);
    const setorAtual = profile.setor_atual;
    if (setorAtual === "corte" || setorAtual === "fitas" || setorAtual === "mantas") {
      const [{ data: prog }, { data: doDia }] = await Promise.all([
        (supabase as any).from("programacao_producao").select("produto_id, quantidade_prevista, unidade")
          .eq("setor", setorAtual).eq("data_local", data).eq("global_dia", true),
        supabase.from("apontamentos").select("produto_id, status, created_at, lancado_em, quantidade_plts, metragem, area_m2")
          .eq("setor", setorAtual).eq("data_local", data),
      ]);
      const abertos = ((prog ?? []) as { produto_id: string; quantidade_prevista: number; unidade: string }[]).filter((p) => {
        const real = realizadoNaUnidade(setorAtual as SetorGerencial, p.unidade, (doDia ?? []).filter((a) => a.produto_id === p.produto_id));
        return real === null || real < Number(p.quantidade_prevista);
      }).length;
      setProgramadosAbertos(abertos);
    } else {
      setProgramadosAbertos(null);
    }
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

  function montarResumo(): Json {
    return {
      setor: profile?.setor_atual ? nomeSetor(profile.setor_atual) : "",
      turno: profile?.turno_atual ?? "",
      data,
      responsavel: profile?.nome || (user ? nomes[user.id] : "") || "Usuário",
      geradoEm: new Date().toISOString(),
      totais,
      metas: metas as unknown as Json,
      apontamentos: apontamentos as unknown as Json,
      ocorrencias: ocorrencias.map((o) => ({
        id: o.id,
        equipamento: o.equipamento,
        tipo_status: o.tipo_status,
        mensagem: o.mensagem,
        created_at: o.created_at,
      })) as unknown as Json,
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
    if (error || !relatorio) throw new Error("O relatório foi criado, mas não foi possível abrir o PDF.");
    baixarPdf(relatorio.resumo, nomeArquivo());
  }

  async function enviarAutomaticamente(relatorioId: string) {
    const { data: grupo } = await (supabase as any)
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
      toast.success(`Relatório enviado automaticamente para ${grupo.nome}.`);
    } catch (erro) {
      toast.warning(
        `Turno fechado, mas o envio automático falhou. ${erro instanceof Error ? erro.message : "Você pode reenviar pela tela de Relatórios."}`,
      );
    }
  }

  async function fechar() {
    if (!profile?.setor_atual || !profile.turno_atual || !user || processando) return;
    if (ocorrencias.some((o) => ocorrenciaEmAndamento(o))) {
      toast.error("Finalize ou transfira as ocorrências em andamento antes de fechar o turno.");
      return;
    }
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
    if (!profile?.setor_atual || !profile.turno_atual || !fechamento || gerando) return;
    setGerando(true);
    try {
      const { data: relatorioId, error } = await (supabase as any).rpc("gerar_relatorio_turno", {
        p_setor: profile.setor_atual,
        p_turno: profile.turno_atual,
        p_data: data,
        p_resumo: montarResumo(),
      });
      if (error || !relatorioId) throw new Error(error?.message || "Não foi possível gerar o relatório.");
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
  const abertas = ocorrencias.filter((o) => ocorrenciaEmAndamento(o));
  const destino = profile?.turno_atual ? proximoTurnoOperacional(profile.turno_atual as TurnoCod, data) : null;

  async function transferir(ids: string[]) {
    if (transferindo || ids.length === 0) return;
    setTransferindo(true);
    let ok = 0;
    for (const id of ids) {
      try { await transferirOcorrenciaServidor(id); ok += 1; } catch (erro) {
        toast.error(erro instanceof Error ? erro.message : "Não foi possível transferir.");
      }
    }
    setTransferindo(false);
    if (ok) {
      setOcorrencias((l) => l.filter((o) => !ids.includes(o.id) || !ocorrenciaEmAndamento(o)));
      toast.success(`${ok} ocorrência(s) transferida(s) para o ${destino?.turno ?? "próximo turno"}.`);
      await carregar();
    }
  }
  return (
    <AppShell title="Fechamento do turno" eyebrow={profile?.setor_atual ? nomeSetor(profile.setor_atual) : undefined}>
      <div className="mx-auto max-w-5xl space-y-4">
        <div>
          <h2 className="text-2xl font-bold">Passagem e fechamento de turno</h2>
          <p className="text-sm text-muted-foreground">
            Revise produção, metas e pendências antes de encerrar. Ao fechar, o relatório é gerado e enviado ao grupo automático salvo. O PDF não é baixado automaticamente.
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
              <Indicador label="Pendentes" valor={totais.pendentes} destaque={totais.pendentes > 0} />
              <Indicador label="Lançados" valor={totais.lancados} />
              <Indicador label="Metas ativas" valor={metas.length} />
              <Indicador label="PLTs" valor={totais.plts} />
              <Indicador label="Rolos" valor={totais.rolos} />
              <Indicador label="Metragem" valor={`${totais.metragem.toLocaleString("pt-BR")} m`} />
              <Indicador label="Área" valor={`${totais.area.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m²`} />
            </div>

            {totais.pendentes > 0 && !fechado && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
                Há {totais.pendentes} apontamento(s) ainda pendente(s) de confirmação no Protheus. A pendência continuará registrada no relatório.
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
                    <div key={item.id} className="flex flex-wrap justify-between gap-2 rounded-md border p-3 text-sm">
                      <span className="font-medium">
                        {item.op ? `OP ${item.op} · ` : item.lote ? `Lote ${item.lote} · ` : ""}
                        {item.produto_nome}
                      </span>
                      <span className="text-muted-foreground">
                        {resumoApontamento(item)} · {item.status === "lancado" ? "Lançado" : "Pendente"}
                      </span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {!fechado && profile?.setor_atual && profile.turno_atual && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Registrar ocorrência operacional</CardTitle>
                </CardHeader>
                <CardContent>
                  <OcorrenciasOperacionaisForm
                    setor={profile.setor_atual}
                    turno={profile.turno_atual}
                    dataLocal={data}
                    userId={user?.id}
                    ocorrencias={ocorrencias}
                    onChange={setOcorrencias}
                  />
                </CardContent>
              </Card>
            )}

            <OcorrenciasRevisao lista={ocorrencias} setor={profile?.setor_atual} />

            {!fechado && (abertas.length > 0 || totais.pendentes > 0 || (programadosAbertos ?? 0) > 0) && (
              <Card className="border-amber-500/50">
                <CardHeader>
                  <CardTitle className="text-base">Atenção antes de fechar</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <ul className="space-y-1 text-foreground">
                    <li>• {abertas.length} ocorrência(s) em andamento</li>
                    <li>• {totais.pendentes} apontamento(s) pendente(s) no Protheus</li>
                    {programadosAbertos !== null && <li>• {programadosAbertos} produto(s) programado(s) não concluído(s)</li>}
                  </ul>
                  {abertas.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-muted-foreground">
                        Finalize ou transfira cada ocorrência em andamento. A transferência mantém a mesma ocorrência e a hora inicial original
                        {destino ? ` (vai para ${destino.turno} de ${destino.data.split("-").reverse().join("/")})` : ""}.
                      </p>
                      {abertas.map((o) => (
                        <div key={o.id} className="rounded-xl border border-border bg-muted/40 p-3">
                          <p className="font-semibold text-foreground">{o.equipamento ?? "Ocorrência geral"} · desde {hhmm(o.hora_inicio)}</p>
                          {o.tipo_status === "ocorrencia" && <p className="text-xs text-muted-foreground">{o.mensagem}</p>}
                          {finalizandoId === o.id ? (
                            <FinalizarOcorrencia
                              item={o}
                              onCancelar={() => setFinalizandoId(null)}
                              onFinalizada={(a) => { setOcorrencias((l) => l.map((x) => (x.id === a.id ? a : x))); setFinalizandoId(null); }}
                            />
                          ) : (
                            <div className="mt-2 grid grid-cols-2 gap-2">
                              <Button className="h-11" onClick={() => setFinalizandoId(o.id)}>Finalizar agora</Button>
                              <Button className="h-11" variant="outline" disabled={transferindo} onClick={() => void transferir([o.id])}>Transferir</Button>
                            </div>
                          )}
                        </div>
                      ))}
                      {abertas.length > 1 && (
                        <Button variant="outline" className="h-11 w-full" disabled={transferindo} onClick={() => void transferir(abertas.map((o) => o.id))}>
                          {transferindo ? "Transferindo..." : "Transferir todas para o próximo turno"}
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {!fechado ? (
              <Button
                className="h-14 w-full text-base"
                disabled={!profile?.setor_atual || !profile.turno_atual || processando || apontamentos.length === 0 || abertas.length > 0}
                onClick={fechar}
              >
                <LockKeyhole /> {processando ? "Encerrando e enviando..." : "Encerrar e enviar relatório"}
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
                    <div key={item.id} className="flex flex-wrap justify-between gap-2 rounded-md border p-3 text-sm">
                      <span>{item.data_local} · {item.turno}</span>
                      <span className="text-muted-foreground">
                        {item.status === "fechado" ? "Fechado" : "Reaberto"} · {nomes[item.fechado_por] ?? "Usuário"}
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

function OcorrenciasRevisao({ lista, setor }: { lista: OcorrenciaOperacional[]; setor?: string | null | undefined }) {
  const estruturado = usaOcorrenciasEstruturadas(setor);
  const { grupos, outras } = estruturado ? consolidarOcorrencias(lista) : { grupos: [], outras: [...linhasOcorrenciasLivres(lista), ...linhasTotalParado(lista)] };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{estruturado ? "Ocorrências operacionais" : "Ocorrências gerais do turno"}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {grupos.map((grupo) => (
          <div key={grupo.titulo}>
            <p className="mb-1 text-xs font-bold uppercase text-primary">{grupo.titulo}</p>
            <div className="divide-y rounded-md border">
              {grupo.itens.map((item) => (
                <div key={item.equipamento} className="flex flex-wrap justify-between gap-2 p-2 text-sm">
                  <span className="font-medium">{item.equipamento}{formatarDuracaoOcorrencia(item.totalMin) && <span className="text-destructive"> — Total parado: {formatarDuracaoOcorrencia(item.totalMin)}</span>}</span>
                  <span className={item.comProblema ? "font-semibold text-destructive" : "text-muted-foreground"}>
                    {item.linhas.join(" · ")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
        {!estruturado && outras.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma ocorrência registrada.</p>
        )}
        {outras.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-bold uppercase text-primary">{estruturado ? "Outras ocorrências" : "Ocorrências registradas"}</p>
            {outras.map((o, i) => (
              <p key={i} className="rounded-md border p-2 text-sm">{o}</p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Indicador({ label, valor, destaque = false }: { label: string; valor: string | number; destaque?: boolean }) {
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
  if (item.setor === "mantas") return `${item.quantidade_plts ?? 0} PLTs · ${Number(item.metragem ?? 0).toLocaleString("pt-BR")} m · ${item.total_rolos ?? 0} rolos`;
  return `${item.quantidade_plts ?? 0} PLTs · ${item.total_rolos ?? 0} unidades · ${Number(item.metragem ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m²`;
}

function formatar(valor: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(valor));
}
