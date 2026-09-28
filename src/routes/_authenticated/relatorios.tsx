import { createFileRoute, Link } from "@tanstack/react-router";
import { Download, Eye, Mail, Printer, Share2, Star, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell, nomeSetor } from "@/components/dryko/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";
import { enviarRelatorio } from "@/lib/enviar-relatorio";
import { baixarPdf, compartilharPdf, imprimirPdf } from "@/lib/relatorio-pdf";

export const Route = createFileRoute("/_authenticated/relatorios")({ component: Relatorios });

type Relatorio = Database["public"]["Tables"]["relatorios"]["Row"];
type GrupoEmail = { id: string; nome: string; emails: string[]; automatico: boolean; ativo: boolean };
type Objeto = Record<string, Json | undefined> & {
  totais?: Json;
  area?: Json;
  metragem?: Json;
  apontamentos?: Json;
  plts?: Json;
  pendentes?: Json;
};

function objeto(valor: Json | undefined): Objeto {
  return valor && typeof valor === "object" && !Array.isArray(valor) ? (valor as Objeto) : {};
}

function numero(valor: Json | undefined) {
  const n = Number(valor ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function formatarNumero(valor: number, casas = 2) {
  return valor.toLocaleString("pt-BR", { maximumFractionDigits: casas });
}

function normalizarEmails(valor: string) {
  return [...new Set(valor.split(/[;,\s]+/).map((email) => email.trim().toLowerCase()).filter(Boolean))].slice(0, 10);
}

function Relatorios() {
  const { profile, isAdmin } = useAuth();
  const [relatorios, setRelatorios] = useState<Relatorio[]>([]);
  const [grupos, setGrupos] = useState<GrupoEmail[]>([]);
  const [turno, setTurno] = useState("");
  const [status, setStatus] = useState("");
  const [destinatarios, setDestinatarios] = useState("");
  const [nomeGrupo, setNomeGrupo] = useState("");
  const [usarAutomatico, setUsarAutomatico] = useState(false);
  const [salvandoGrupo, setSalvandoGrupo] = useState(false);
  const [enviandoId, setEnviandoId] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    if (!profile?.setor_atual) {
      setCarregando(false);
      return;
    }
    setCarregando(true);
    const [resultadoRelatorios, resultadoGrupos] = await Promise.all([
      supabase
        .from("relatorios")
        .select("*")
        .eq("setor", profile.setor_atual)
        .order("data_local", { ascending: false })
        .order("turno", { ascending: false })
        .limit(40),
      (supabase as any)
        .from("grupos_email_relatorio")
        .select("id, nome, emails, automatico, ativo")
        .eq("ativo", true)
        .order("automatico", { ascending: false })
        .order("created_at", { ascending: true }),
    ]);

    if (resultadoRelatorios.error) toast.error("Não foi possível carregar os relatórios.");
    const lista = resultadoRelatorios.data ?? [];
    const gruposSalvos = (resultadoGrupos.data ?? []) as GrupoEmail[];
    setRelatorios(lista);
    setGrupos(gruposSalvos);

    const automatico = gruposSalvos.find((grupo) => grupo.automatico);
    setDestinatarios((atual) => {
      if (atual) return atual;
      if (automatico?.emails?.length) return automatico.emails.join("; ");
      if (lista[0]?.destinatarios?.length) return lista[0].destinatarios.join("; ");
      return atual;
    });
    setCarregando(false);
  }, [profile?.setor_atual]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const visiveis = useMemo(
    () => relatorios.filter((item) => (!turno || item.turno === turno) && (!status || item.status_envio === status)),
    [relatorios, status, turno],
  );

  function nomeArquivo(item: Relatorio) {
    return `relatorio-${item.setor}-${item.data_local}-${item.turno}.pdf`;
  }

  async function compartilhar(item: Relatorio) {
    try {
      const compartilhou = await compartilharPdf(item.resumo, nomeArquivo(item));
      if (!compartilhou) toast.info("O compartilhamento não é suportado neste aparelho; o PDF foi baixado.");
    } catch {
      toast.error("Não foi possível compartilhar o PDF.");
    }
  }

  async function enviar(item: Relatorio) {
    const lista = normalizarEmails(destinatarios);
    if (lista.length === 0) {
      toast.error("Informe ao menos um e-mail destinatário.");
      return;
    }
    setEnviandoId(item.id);
    try {
      await enviarRelatorio({ data: { relatorioId: item.id, destinatarios: lista } });
      toast.success(`E-mail enviado para ${lista.length} destinatário(s).`);
      await carregar();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível enviar o relatório.");
      await carregar();
    } finally {
      setEnviandoId(null);
    }
  }

  async function salvarGrupo() {
    if (!isAdmin || salvandoGrupo) return;
    const emails = normalizarEmails(destinatarios);
    if (emails.length === 0) {
      toast.error("Informe ao menos um e-mail válido para salvar.");
      return;
    }
    const nome = nomeGrupo.trim() || (emails.length === 1 ? emails[0] : `Grupo com ${emails.length} e-mails`);
    setSalvandoGrupo(true);
    try {
      if (usarAutomatico) {
        const { error } = await (supabase as any)
          .from("grupos_email_relatorio")
          .update({ automatico: false, updated_at: new Date().toISOString() })
          .eq("automatico", true);
        if (error) throw error;
      }
      const { error } = await (supabase as any).from("grupos_email_relatorio").insert({
        nome,
        emails,
        automatico: usarAutomatico,
        ativo: true,
      });
      if (error) throw error;
      setNomeGrupo("");
      setUsarAutomatico(false);
      toast.success(emails.length === 1 ? "E-mail salvo." : "Grupo de e-mails salvo.");
      await carregar();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível salvar os destinatários.");
    } finally {
      setSalvandoGrupo(false);
    }
  }

  async function definirAutomatico(grupo: GrupoEmail) {
    if (!isAdmin) return;
    try {
      await (supabase as any).from("grupos_email_relatorio").update({ automatico: false, updated_at: new Date().toISOString() }).eq("automatico", true);
      const { error } = await (supabase as any).from("grupos_email_relatorio").update({ automatico: true, updated_at: new Date().toISOString() }).eq("id", grupo.id);
      if (error) throw error;
      setDestinatarios(grupo.emails.join("; "));
      toast.success(`${grupo.nome} será usado no envio automático ao fechar o turno.`);
      await carregar();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível definir o grupo automático.");
    }
  }

  async function excluirGrupo(grupo: GrupoEmail) {
    if (!isAdmin || !window.confirm(`Excluir ${grupo.nome}?`)) return;
    const { error } = await (supabase as any).from("grupos_email_relatorio").delete().eq("id", grupo.id);
    if (error) {
      toast.error("Não foi possível excluir o grupo.");
      return;
    }
    toast.success("Destinatário salvo removido.");
    await carregar();
  }

  return (
    <AppShell title="Relatórios" eyebrow="PRODUÇÃO · HISTÓRICO">
      <div className="mx-auto max-w-5xl space-y-5">
        <div>
          <h2 className="text-2xl font-black text-slate-950">Relatórios de turno</h2>
          <p className="text-sm text-slate-500">Visualize o relatório, envie manualmente ou deixe um grupo salvo para envio automático no fechamento.</p>
        </div>

        <Card className="rounded-3xl border-slate-200 shadow-sm">
          <CardContent className="grid gap-3 pt-6 sm:grid-cols-3">
            <div className="space-y-1">
              <Label>Turno</Label>
              <select className="h-11 w-full rounded-xl border bg-background px-3" value={turno} onChange={(e) => setTurno(e.target.value)}>
                <option value="">Todos</option><option value="T1">1º turno</option><option value="T2">2º turno</option><option value="T3">3º turno</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label>Situação do envio</Label>
              <select className="h-11 w-full rounded-xl border bg-background px-3" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">Todas</option><option value="aguardando">Aguardando</option><option value="enviando">Enviando</option><option value="enviado">Enviado</option><option value="falhou">Falhou</option>
              </select>
            </div>
            <div className="space-y-1 sm:col-span-3">
              <Label htmlFor="emails-relatorio">Destinatário ou grupo de e-mails (até 10)</Label>
              <Input id="emails-relatorio" className="h-11" value={destinatarios} onChange={(e) => setDestinatarios(e.target.value)} placeholder="producao@empresa.com; qualidade@empresa.com" />
              <p className="text-xs text-slate-500">Um único e-mail também pode ser salvo. Separe vários por ponto e vírgula, vírgula ou espaço.</p>
            </div>

            {isAdmin && (
              <div className="grid gap-2 rounded-2xl border bg-slate-50 p-3 sm:col-span-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
                <div className="space-y-1">
                  <Label htmlFor="nome-grupo-email">Nome para salvar</Label>
                  <Input id="nome-grupo-email" className="h-10 bg-white" value={nomeGrupo} onChange={(e) => setNomeGrupo(e.target.value)} placeholder="Ex.: Produção / Gestores" />
                </div>
                <label className="flex h-10 items-center gap-2 rounded-xl border bg-white px-3 text-sm font-medium">
                  <input type="checkbox" checked={usarAutomatico} onChange={(e) => setUsarAutomatico(e.target.checked)} /> Envio automático
                </label>
                <Button className="h-10" disabled={salvandoGrupo} onClick={() => void salvarGrupo()}>{salvandoGrupo ? "Salvando..." : "Salvar"}</Button>
              </div>
            )}
          </CardContent>
        </Card>

        {grupos.length > 0 && (
          <Card className="rounded-3xl border-slate-200 shadow-sm">
            <CardContent className="space-y-2 pt-6">
              <div><h3 className="font-black text-slate-950">Destinatários salvos</h3><p className="text-xs text-slate-500">O grupo marcado como automático recebe o PDF ao encerrar o turno.</p></div>
              {grupos.map((grupo) => (
                <div key={grupo.id} className={`flex flex-wrap items-center gap-2 rounded-2xl border p-3 ${grupo.automatico ? "border-emerald-300 bg-emerald-50" : "bg-white"}`}>
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setDestinatarios(grupo.emails.join("; "))}>
                    <p className="font-bold text-slate-950">{grupo.nome}{grupo.automatico ? " · Automático" : ""}</p>
                    <p className="truncate text-xs text-slate-500">{grupo.emails.join(", ")}</p>
                  </button>
                  {isAdmin && !grupo.automatico && <Button size="sm" variant="outline" onClick={() => void definirAutomatico(grupo)}><Star className="size-4" /> Automático</Button>}
                  {isAdmin && <Button size="icon" variant="ghost" onClick={() => void excluirGrupo(grupo)} aria-label={`Excluir ${grupo.nome}`}><Trash2 className="size-4" /></Button>}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {carregando ? (
          <p className="text-sm text-slate-500">Carregando relatórios...</p>
        ) : visiveis.length === 0 ? (
          <Card className="rounded-3xl"><CardContent className="p-6 text-sm text-slate-500">Nenhum relatório encontrado. Um relatório é criado quando o turno é encerrado.</CardContent></Card>
        ) : (
          <div className="space-y-4">
            {visiveis.map((item) => {
              const raiz = objeto(item.resumo);
              const totais = objeto(raiz.totais);
              const producao = item.setor === "fitas" ? numero(totais.area) : numero(totais.metragem);
              const unidade = item.setor === "mantas" ? "m" : "m²";
              return (
                <Card key={item.id} className="overflow-hidden rounded-3xl border-slate-200 shadow-sm">
                  <div className="h-1.5 bg-[#d10b16]" />
                  <CardContent className="space-y-4 p-5 sm:p-6">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-extrabold uppercase tracking-[0.17em] text-[#c70812]">Aponta Produção · {nomeSetor(item.setor)}</p>
                        <h3 className="mt-1 text-xl font-black text-slate-950">{formatarData(item.data_local)} · {turnoNome(item.turno)}</h3>
                        <p className="mt-1 text-xs text-slate-500">Gerado em {formatarDataHora(item.created_at)} · ID {item.id.slice(0, 8).toUpperCase()}</p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-bold ${corStatus(item.status_envio)}`}>{nomeStatus(item.status_envio)}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <MiniIndicador titulo="Apontamentos" valor={formatarNumero(numero(totais.apontamentos), 0)} />
                      <MiniIndicador titulo="PLTs" valor={item.setor === "fitas" ? "—" : formatarNumero(numero(totais.plts), 0)} />
                      <MiniIndicador titulo="Produção" valor={`${formatarNumero(producao)} ${unidade}`} />
                      <MiniIndicador titulo="Pendentes" valor={formatarNumero(numero(totais.pendentes), 0)} alerta={numero(totais.pendentes) > 0} />
                    </div>

                    {item.status_envio === "enviado" && item.destinatarios.length > 0 && (
                      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                        <strong>E-mail enviado:</strong> {item.destinatarios.join(", ")} · {formatarDataHora(item.enviado_em)}
                      </div>
                    )}
                    {item.erro_envio && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{item.erro_envio}</div>}

                    <div className="flex flex-wrap gap-2">
                      <Button asChild className="h-11 rounded-xl"><Link to="/relatorio/$relatorioId" params={{ relatorioId: item.id }}><Eye /> Visualizar relatório</Link></Button>
                      <Button variant="outline" className="h-11 rounded-xl" onClick={() => baixarPdf(item.resumo, nomeArquivo(item))}><Download /> PDF</Button>
                      <Button variant="outline" className="h-11 rounded-xl" onClick={() => compartilhar(item)}><Share2 /> Compartilhar</Button>
                      <Button variant="outline" className="h-11 rounded-xl" onClick={() => { if (!imprimirPdf(item.resumo, nomeArquivo(item))) toast.error("O navegador bloqueou a janela de impressão."); }}><Printer /> Imprimir</Button>
                      <Button className="h-11 rounded-xl" disabled={enviandoId === item.id || item.status_envio === "enviando"} onClick={() => enviar(item)}><Mail /> {enviandoId === item.id ? "Enviando..." : item.status_envio === "enviado" ? "Enviar novamente" : item.status_envio === "falhou" ? "Tentar novamente" : "Enviar por e-mail"}</Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function MiniIndicador({ titulo, valor, alerta }: { titulo: string; valor: string; alerta?: boolean }) {
  return <div className={`rounded-2xl border p-3 ${alerta ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50"}`}><p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{titulo}</p><p className={`mt-1 text-lg font-black ${alerta ? "text-amber-800" : "text-slate-950"}`}>{valor}</p></div>;
}

function nomeStatus(status: Relatorio["status_envio"]) {
  return { aguardando: "Aguardando envio", enviando: "Enviando", enviado: "Enviado", falhou: "Falhou" }[status];
}

function corStatus(status: Relatorio["status_envio"]) {
  if (status === "enviado") return "bg-emerald-100 text-emerald-800";
  if (status === "falhou") return "bg-red-100 text-red-800";
  return "bg-amber-100 text-amber-900";
}

function turnoNome(turno: string) {
  if (turno === "T1") return "1º turno";
  if (turno === "T2") return "2º turno";
  if (turno === "T3") return "3º turno";
  return turno;
}

function formatarData(valor: string) {
  const [ano, mes, dia] = valor.split("-");
  return `${dia}/${mes}/${ano}`;
}

function formatarDataHora(valor?: string | null) {
  if (!valor) return "—";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(valor));
}
