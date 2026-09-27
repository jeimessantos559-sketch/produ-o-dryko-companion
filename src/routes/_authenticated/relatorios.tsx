import { createFileRoute } from "@tanstack/react-router";
import { Download, Mail, Printer, Share2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell, nomeSetor } from "@/components/dryko/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";
import { enviarRelatorio } from "@/lib/enviar-relatorio";
import { baixarPdf, compartilharPdf, imprimirPdf } from "@/lib/relatorio-pdf";

export const Route = createFileRoute("/_authenticated/relatorios")({ component: Relatorios });

type Relatorio = Database["public"]["Tables"]["relatorios"]["Row"];

function Relatorios() {
  const { profile } = useAuth();
  const [relatorios, setRelatorios] = useState<Relatorio[]>([]);
  const [turno, setTurno] = useState("");
  const [status, setStatus] = useState("");
  const [destinatarios, setDestinatarios] = useState("");
  const [enviandoId, setEnviandoId] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    if (!profile?.setor_atual) {
      setCarregando(false);
      return;
    }
    setCarregando(true);
    const { data, error } = await supabase
      .from("relatorios")
      .select("*")
      .eq("setor", profile.setor_atual)
      .order("data_local", { ascending: false })
      .order("turno", { ascending: false });
    if (error) toast.error("Não foi possível carregar os relatórios.");
    setRelatorios(data ?? []);
    setCarregando(false);
  }, [profile?.setor_atual]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const visiveis = useMemo(
    () =>
      relatorios.filter(
        (item) => (!turno || item.turno === turno) && (!status || item.status_envio === status),
      ),
    [relatorios, status, turno],
  );

  function nomeArquivo(item: Relatorio) {
    return `relatorio-${item.setor}-${item.data_local}-${item.turno}.pdf`;
  }

  async function compartilhar(item: Relatorio) {
    try {
      const compartilhou = await compartilharPdf(item.resumo, nomeArquivo(item));
      if (!compartilhou)
        toast.info("O compartilhamento não é suportado neste aparelho; o PDF foi baixado.");
    } catch {
      toast.error("Não foi possível compartilhar o PDF.");
    }
  }

  async function enviar(item: Relatorio) {
    const lista = destinatarios
      .split(/[;,\s]+/)
      .map((valor) => valor.trim().toLowerCase())
      .filter(Boolean);
    if (lista.length === 0) {
      toast.error("Informe ao menos um e-mail destinatário.");
      return;
    }
    setEnviandoId(item.id);
    try {
      await enviarRelatorio({ data: { relatorioId: item.id, destinatarios: lista } });
      toast.success("Relatório enviado por e-mail.");
      await carregar();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível enviar o relatório.");
      await carregar();
    } finally {
      setEnviandoId(null);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-4">
        <div>
          <h1 className="text-2xl font-bold">Relatórios de turno</h1>
          <p className="text-sm text-muted-foreground">
            Baixe, compartilhe ou envie o PDF gerado no fechamento do turno.
          </p>
        </div>

        <Card>
          <CardContent className="grid gap-3 pt-6 sm:grid-cols-3">
            <div className="space-y-1">
              <Label>Turno</Label>
              <select
                className="h-10 w-full rounded-md border bg-background px-3"
                value={turno}
                onChange={(e) => setTurno(e.target.value)}
              >
                <option value="">Todos</option>
                <option value="T1">T1</option>
                <option value="T2">T2</option>
                <option value="T3">T3</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label>Situação do envio</Label>
              <select
                className="h-10 w-full rounded-md border bg-background px-3"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="">Todas</option>
                <option value="aguardando">Aguardando</option>
                <option value="enviando">Enviando</option>
                <option value="enviado">Enviado</option>
                <option value="falhou">Falhou</option>
              </select>
            </div>
            <div className="space-y-1 sm:col-span-3">
              <Label htmlFor="emails-relatorio">E-mails para envio (até 10)</Label>
              <Input
                id="emails-relatorio"
                type="text"
                value={destinatarios}
                onChange={(e) => setDestinatarios(e.target.value)}
                placeholder="qualidade@empresa.com; producao@empresa.com"
              />
              <p className="text-xs text-muted-foreground">
                O envio só acontece quando você tocar no botão. O serviço seguro de e-mail precisa
                estar configurado no ambiente.
              </p>
            </div>
          </CardContent>
        </Card>

        {carregando ? (
          <p className="text-sm text-muted-foreground">Carregando relatórios...</p>
        ) : visiveis.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">
              Nenhum relatório encontrado. Ele é criado ao encerrar um turno.
            </CardContent>
          </Card>
        ) : (
          visiveis.map((item) => (
            <Card key={item.id}>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">
                      {nomeSetor(item.setor)} · {item.turno} · {formatarData(item.data_local)}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Gerado em {formatarDataHora(item.created_at)} · {item.tentativas_envio}{" "}
                      tentativa(s)
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-semibold ${corStatus(item.status_envio)}`}
                  >
                    {nomeStatus(item.status_envio)}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {item.destinatarios.length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    Destinatários: {item.destinatarios.join(", ")}
                  </p>
                )}
                {item.erro_envio && (
                  <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
                    {item.erro_envio}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={() => baixarPdf(item.resumo, nomeArquivo(item))}
                  >
                    <Download /> Baixar PDF
                  </Button>
                  <Button variant="outline" onClick={() => compartilhar(item)}>
                    <Share2 /> Compartilhar
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (!imprimirPdf(item.resumo, nomeArquivo(item))) {
                        toast.error("O navegador bloqueou a janela de impressão.");
                      }
                    }}
                  >
                    <Printer /> Imprimir
                  </Button>
                  <Button
                    disabled={
                      enviandoId === item.id ||
                      item.status_envio === "enviando" ||
                      item.status_envio === "enviado"
                    }
                    onClick={() => enviar(item)}
                  >
                    <Mail />
                    {enviandoId === item.id
                      ? "Enviando..."
                      : item.status_envio === "enviado"
                        ? "E-mail já enviado"
                        : item.status_envio === "falhou"
                          ? "Tentar novamente"
                          : "Enviar por e-mail"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </AppShell>
  );
}

function nomeStatus(status: Relatorio["status_envio"]) {
  return { aguardando: "Aguardando", enviando: "Enviando", enviado: "Enviado", falhou: "Falhou" }[
    status
  ];
}

function corStatus(status: Relatorio["status_envio"]) {
  if (status === "enviado") return "bg-green-100 text-green-800";
  if (status === "falhou") return "bg-red-100 text-red-800";
  return "bg-amber-100 text-amber-900";
}

function formatarData(valor: string) {
  const [ano, mes, dia] = valor.split("-");
  return `${dia}/${mes}/${ano}`;
}

function formatarDataHora(valor: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(valor));
}
