import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  BarChart3,
  Clock3,
  Factory,
  MailWarning,
  RefreshCcw,
  Target,
  TimerOff,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell, nomeSetor } from "@/components/dryko/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import {
  carregarIndicadoresGerenciais,
  type IndicadoresGerenciais,
  type IndicadorSetor,
} from "@/lib/indicadores-gerenciais";

export const Route = createFileRoute("/_authenticated/indicadores")({
  head: () => ({
    meta: [
      { title: "Indicadores gerenciais | Aponta Produção DRYKO" },
      { name: "description", content: "Indicadores operacionais consolidados por setor." },
    ],
  }),
  component: Indicadores,
});

function Indicadores() {
  const { isAdmin } = useAuth();
  const [dias, setDias] = useState<7 | 30 | 90>(7);
  const [dados, setDados] = useState<IndicadoresGerenciais | null>(null);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    if (!isAdmin) {
      setCarregando(false);
      return;
    }
    setCarregando(true);
    try {
      setDados(await carregarIndicadoresGerenciais({ data: { dias } }));
    } catch (erro) {
      toast.error(
        erro instanceof Error ? erro.message : "Não foi possível carregar os indicadores.",
      );
    } finally {
      setCarregando(false);
    }
  }, [dias, isAdmin]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (!isAdmin) {
    return (
      <AppShell title="Indicadores" eyebrow="ACESSO RESTRITO">
        <Card className="mx-auto max-w-xl">
          <CardContent className="p-4 text-sm text-muted-foreground">
            Esta área é exclusiva do administrador.
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell title="Indicadores gerenciais" eyebrow="GESTÃO · OPERAÇÃO DE FÁBRICA">
      <div className="mx-auto max-w-6xl space-y-3">
        <div className="flex items-center justify-between gap-2 rounded-2xl border bg-card p-2 shadow-sm">
          <div className="grid flex-1 grid-cols-3 gap-1">
            {([7, 30, 90] as const).map((periodo) => (
              <Button
                key={periodo}
                size="sm"
                variant={dias === periodo ? "default" : "ghost"}
                onClick={() => setDias(periodo)}
              >
                {periodo} dias
              </Button>
            ))}
          </div>
          <Button
            size="icon"
            variant="outline"
            aria-label="Atualizar indicadores"
            disabled={carregando}
            onClick={() => void carregar()}
          >
            <RefreshCcw className={`size-4 ${carregando ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {carregando && !dados ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              Consolidando os dados da fábrica...
            </CardContent>
          </Card>
        ) : dados ? (
          <>
            <p className="px-1 text-xs text-muted-foreground">
              Período operacional: {formatarData(dados.inicio)} a {formatarData(dados.fim)}
            </p>

            {dados.avisoLimite && (
              <div className="rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                O período atingiu o limite de segurança da consulta. Reduza o filtro para visualizar
                todos os registros.
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              <Kpi
                icon={AlertTriangle}
                label="Pendências Protheus"
                valor={fmt(dados.totais.pendentes)}
                detalhe={`${fmt(dados.totais.pendentesAntigos)} há mais de 8h`}
                alerta={dados.totais.pendentesAntigos > 0}
              />
              <Kpi
                icon={Clock3}
                label="Tempo até Protheus"
                valor={formatarHoras(dados.totais.tempoMedioProtheusHoras)}
                detalhe="média dos lançados"
              />
              <Kpi
                icon={TimerOff}
                label="Tempo de parada"
                valor={formatarMinutos(dados.totais.paradaMinutos)}
                detalhe={`${fmt(dados.totais.ocorrencias)} ocorrências`}
              />
              <Kpi
                icon={MailWarning}
                label="Falhas de relatório"
                valor={fmt(dados.totais.emailsFalhos)}
                detalhe={`${fmt(dados.totais.emailsAguardando)} aguardando`}
                alerta={dados.totais.emailsFalhos > 0}
              />
            </div>

            <section className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <Factory className="size-5 text-primary" />
                <h2 className="text-lg font-extrabold">Resultado por setor</h2>
              </div>
              <div className="grid gap-2 lg:grid-cols-3">
                {dados.setores.map((item) => (
                  <SetorCard key={item.setor} item={item} />
                ))}
              </div>
            </section>

            <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
              <Tendencia dados={dados} />
              <Card className="rounded-2xl">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <TimerOff className="size-5 text-primary" />
                    <h2 className="font-extrabold">Principais causas de parada</h2>
                  </div>
                  {dados.causasParada.length ? (
                    <div className="mt-3 space-y-2">
                      {dados.causasParada.map((item) => (
                        <div key={item.motivo} className="rounded-xl bg-muted p-3">
                          <div className="flex items-start justify-between gap-3">
                            <p className="min-w-0 text-sm font-semibold">{item.motivo}</p>
                            <strong className="shrink-0 text-primary">
                              {formatarMinutos(item.minutos)}
                            </strong>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {item.registros} registro(s)
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-muted-foreground">
                      Nenhuma parada registrada no período.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>

            {dados.totais.problemasAbertos > 0 && (
              <div className="rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                Há {dados.totais.problemasAbertos} problema(s) aberto(s) aguardando tratamento.
              </div>
            )}
          </>
        ) : null}
      </div>
    </AppShell>
  );
}

function Kpi({
  icon: Icon,
  label,
  valor,
  detalhe,
  alerta = false,
}: {
  icon: typeof Clock3;
  label: string;
  valor: string;
  detalhe: string;
  alerta?: boolean;
}) {
  return (
    <Card className={`rounded-2xl ${alerta ? "border-amber-300" : ""}`}>
      <CardContent className="flex min-h-28 items-center gap-3 p-3">
        <div
          className={`grid size-10 shrink-0 place-items-center rounded-xl ${alerta ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200" : "bg-primary/10 text-primary"}`}
        >
          <Icon className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-muted-foreground">{label}</p>
          <p className="truncate text-2xl font-black">{valor}</p>
          <p className="truncate text-[11px] text-muted-foreground">{detalhe}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function SetorCard({ item }: { item: IndicadorSetor }) {
  const aderencia = item.aderenciaMeta;
  return (
    <Card className="rounded-2xl">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-lg font-black">{nomeSetor(item.setor)}</h3>
          <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-bold text-primary">
            {fmt(item.apontamentos)} apont.
          </span>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Produção / meta
          </p>
          <p className="mt-1 text-2xl font-black text-primary">
            {fmt(item.producao)} {item.unidade}
          </p>
          <p className="text-xs text-muted-foreground">
            Meta: {fmt(item.meta)} {item.unidade}
          </p>
        </div>
        <Barra valor={aderencia ?? 0} />
        <div className="grid grid-cols-2 gap-2 text-sm">
          <Mini
            label="Aderência meta"
            valor={aderencia === null ? "Sem meta" : `${fmt(aderencia)}%`}
          />
          <Mini
            label="Média por hora"
            valor={item.mediaPorHora === null ? "—" : `${fmt(item.mediaPorHora)} ${item.unidade}`}
          />
          <Mini
            label="Programação"
            valor={
              item.aderenciaProgramacao === null
                ? "Sem programação"
                : `${fmt(item.aderenciaProgramacao)}%`
            }
          />
          <Mini label="Paradas" valor={formatarMinutos(item.paradaMinutos)} />
        </div>
        <p className="text-xs text-muted-foreground">
          Programado: {fmt(item.programado)} {item.unidadeProgramacao} · realizado:{" "}
          {fmt(item.realizadoProgramacao)} {item.unidadeProgramacao}
        </p>
      </CardContent>
    </Card>
  );
}

function Tendencia({ dados }: { dados: IndicadoresGerenciais }) {
  const ultimos = dados.dias.slice(-7);
  const maiores = useMemo(
    () =>
      Object.fromEntries(
        (["corte", "fitas", "mantas"] as const).map((setor) => [
          setor,
          Math.max(
            1,
            ...ultimos.flatMap((dia) =>
              dia.setores
                .filter((item) => item.setor === setor)
                .map((item) => Math.max(item.producao, item.meta)),
            ),
          ),
        ]),
      ),
    [ultimos],
  );
  return (
    <Card className="rounded-2xl">
      <CardContent className="p-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="size-5 text-primary" />
          <h2 className="font-extrabold">Produção diária · últimos 7 dias</h2>
        </div>
        <div className="mt-3 space-y-3">
          {ultimos.map((dia) => (
            <div key={dia.data}>
              <p className="mb-1 text-xs font-bold text-muted-foreground">
                {formatarData(dia.data)}
              </p>
              <div className="space-y-1.5">
                {dia.setores.map((item) => (
                  <div
                    key={item.setor}
                    className="grid grid-cols-[62px_1fr_auto] items-center gap-2 text-xs"
                  >
                    <span className="font-semibold">{nomeSetor(item.setor)}</span>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{
                          width: `${Math.min(100, (item.producao / (maiores[item.setor] ?? 1)) * 100)}%`,
                        }}
                      />
                    </div>
                    <span className="min-w-16 text-right font-bold">{fmt(item.producao)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function Barra({ valor }: { valor: number }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-muted">
      <div
        className={`h-full rounded-full ${valor >= 100 ? "bg-emerald-500" : "bg-primary"}`}
        style={{ width: `${Math.min(100, Math.max(0, valor))}%` }}
      />
    </div>
  );
}
function Mini({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="rounded-xl bg-muted p-2">
      <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-bold">{valor}</p>
    </div>
  );
}
function fmt(valor: number) {
  return Number(valor || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}
function formatarData(valor: string) {
  const [ano, mes, dia] = valor.split("-");
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : valor;
}
function formatarHoras(valor: number | null) {
  if (valor === null) return "—";
  if (valor < 1) return `${Math.round(valor * 60)} min`;
  return `${fmt(valor)} h`;
}
function formatarMinutos(valor: number) {
  if (valor < 60) return `${fmt(valor)} min`;
  return `${fmt(valor / 60)} h`;
}
