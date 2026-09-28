import { createFileRoute } from "@tanstack/react-router";
import { Clock3, PackageCheck, Save, Target } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { AppShell, nomeSetor, nomeTurno } from "@/components/dryko/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";
import { dataOperacional, horasProdutivasTurno, ordemHoraTurno } from "@/lib/producao";

export const Route = createFileRoute("/_authenticated/contagem")({ component: Contagem });

type Registro = {
  produto_nome: string;
  quantidade_plts: number | null;
  total_rolos: number | null;
  metragem: number | null;
  area_m2: number | null;
  created_at: string;
};

type MetaTurno = Database["public"]["Tables"]["metas_turno"]["Row"];

type Linha = {
  produto: string;
  apontamentos: number;
  plts: number;
  rolos: number;
  metragem: number;
  area: number;
};

type ProdutoHora = Linha;

type Hora = {
  hora: string;
  apontamentos: number;
  plts: number;
  rolos: number;
  metragem: number;
  area: number;
  produtos: ProdutoHora[];
};

type HoraInterna = Omit<Hora, "produtos"> & {
  produtos: Map<string, ProdutoHora>;
};

type HoraPlanejada = Hora & {
  metaHora: number;
  metaAcumulada: number;
  realizadoHora: number;
  realizadoAcumulado: number;
  saldoAcumulado: number;
};

function Contagem() {
  const { profile, user, canFinalizeGoals } = useAuth();
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [metaTurno, setMetaTurno] = useState<MetaTurno | null>(null);
  const [metaDigitada, setMetaDigitada] = useState("");
  const [horasDigitadas, setHorasDigitadas] = useState(1);
  const [erro, setErro] = useState(false);
  const [erroMeta, setErroMeta] = useState(false);
  const [salvandoMeta, setSalvandoMeta] = useState(false);
  const carregamentoAtual = useRef(0);

  const setor = profile?.setor_atual;
  const turno = profile?.turno_atual;
  const dataAtual = turno ? dataOperacional(turno) : "";
  const horasDisponiveis = useMemo(() => horasProdutivasTurno(turno), [turno]);
  const unidade = unidadeDoSetor(setor);

  useEffect(() => {
    const carga = ++carregamentoAtual.current;
    setErro(false);
    setErroMeta(false);

    if (!setor || !turno || !dataAtual) {
      setRegistros([]);
      setMetaTurno(null);
      setMetaDigitada("");
      return;
    }

    void Promise.all([
      supabase
        .from("apontamentos")
        .select("produto_nome, quantidade_plts, total_rolos, metragem, area_m2, created_at")
        .eq("setor", setor)
        .eq("turno", turno)
        .eq("data_local", dataAtual)
        .order("created_at", { ascending: true }),
      supabase
        .from("metas_turno")
        .select("*")
        .eq("setor", setor)
        .eq("turno", turno)
        .eq("data_local", dataAtual)
        .maybeSingle(),
    ]).then(([resultadoApontamentos, resultadoMeta]) => {
      if (carga !== carregamentoAtual.current) return;

      if (resultadoApontamentos.error) {
        setErro(true);
        setRegistros([]);
      } else {
        setRegistros((resultadoApontamentos.data ?? []) as Registro[]);
      }

      if (resultadoMeta.error) {
        setErroMeta(true);
        setMetaTurno(null);
        setMetaDigitada("");
        setHorasDigitadas(horasDisponiveis.length || 1);
      } else {
        const meta = (resultadoMeta.data as MetaTurno | null) ?? null;
        setMetaTurno(meta);
        setMetaDigitada(meta ? formatarCampoNumero(Number(meta.quantidade_meta)) : "");
        setHorasDigitadas(meta?.horas_produtivas ?? horasDisponiveis.length ?? 1);
      }
    });
  }, [dataAtual, horasDisponiveis, setor, turno]);

  const linhas = useMemo(() => {
    const mapa = new Map<string, Linha>();
    for (const item of registros) {
      const atual = mapa.get(item.produto_nome) ?? linhaVazia(item.produto_nome);
      somarRegistro(atual, item);
      mapa.set(item.produto_nome, atual);
    }
    return [...mapa.values()].sort((a, b) => a.produto.localeCompare(b.produto));
  }, [registros]);

  const porHora = useMemo(() => {
    const mapa = new Map<string, HoraInterna>();

    for (const item of registros) {
      const hora = new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
        hour: "2-digit",
        hourCycle: "h23",
      }).format(new Date(item.created_at));
      const chave = `${hora}:00`;
      const atual = mapa.get(chave) ?? horaVazia(chave);

      atual.apontamentos += 1;
      atual.plts += Number(item.quantidade_plts ?? 0);
      atual.rolos += Number(item.total_rolos ?? 0);
      atual.metragem += Number(item.metragem ?? 0);
      atual.area += Number(item.area_m2 ?? 0);

      const produto = atual.produtos.get(item.produto_nome) ?? linhaVazia(item.produto_nome);
      somarRegistro(produto, item);
      atual.produtos.set(item.produto_nome, produto);
      mapa.set(chave, atual);
    }

    return [...mapa.values()]
      .sort((a, b) => ordemHoraTurno(a.hora, turno) - ordemHoraTurno(b.hora, turno))
      .map((item) => ({
        ...item,
        produtos: [...item.produtos.values()].sort((a, b) => a.produto.localeCompare(b.produto)),
      }));
  }, [registros, turno]);

  const metaTotal = Number(metaTurno?.quantidade_meta ?? 0);
  const quantidadeHoras = Math.min(
    Number(metaTurno?.horas_produtivas ?? 0),
    horasDisponiveis.length,
  );
  const metaPorHora = quantidadeHoras > 0 ? metaTotal / quantidadeHoras : 0;

  const horasComMeta = useMemo<HoraPlanejada[]>(() => {
    const mapa = new Map(porHora.map((item) => [item.hora, item]));
    const horasPlanejadas = metaTurno ? horasDisponiveis.slice(0, quantidadeHoras) : [];
    const chaves = [...new Set([...horasPlanejadas, ...porHora.map((item) => item.hora)])].sort(
      (a, b) => ordemHoraTurno(a, turno) - ordemHoraTurno(b, turno),
    );
    const planejadas = new Set(horasPlanejadas);
    let metaAcumulada = 0;
    let realizadoAcumulado = 0;

    return chaves.map((hora) => {
      const item = mapa.get(hora) ?? horaVaziaFinal(hora);
      const alvoHora = planejadas.has(hora) ? metaPorHora : 0;
      const realizadoHora = valorDaHora(item, setor);
      metaAcumulada += alvoHora;
      realizadoAcumulado += realizadoHora;
      return {
        ...item,
        metaHora: alvoHora,
        metaAcumulada,
        realizadoHora,
        realizadoAcumulado,
        saldoAcumulado: realizadoAcumulado - metaAcumulada,
      };
    });
  }, [metaPorHora, metaTurno, horasDisponiveis, quantidadeHoras, porHora, setor, turno]);

  const realizadoTurno = useMemo(
    () => porHora.reduce((total, item) => total + valorDaHora(item, setor), 0),
    [porHora, setor],
  );
  const atingimento = metaTotal > 0 ? (realizadoTurno / metaTotal) * 100 : 0;
  const percentualBarra = Math.min(100, Math.max(0, atingimento));

  const metaInformada = numeroDoCampo(metaDigitada);
  const metaSimulada = Number.isFinite(metaInformada) ? metaInformada : 0;
  const horasSimuladas = Math.min(
    Math.max(1, Number(horasDigitadas) || 1),
    Math.max(1, horasDisponiveis.length),
  );
  const metaHoraSimulada = metaSimulada > 0 ? metaSimulada / horasSimuladas : 0;

  async function salvarMeta() {
    if (!canFinalizeGoals || !user || !setor || !turno || salvandoMeta) return;
    if (!Number.isFinite(metaSimulada) || metaSimulada <= 0) {
      toast.error("Informe uma meta maior que zero.");
      return;
    }
    if (
      !Number.isInteger(horasDigitadas) ||
      horasDigitadas < 1 ||
      horasDigitadas > horasDisponiveis.length
    ) {
      toast.error(`Informe entre 1 e ${horasDisponiveis.length} horas produtivas.`);
      return;
    }

    setSalvandoMeta(true);
    const { data, error } = await supabase
      .from("metas_turno")
      .upsert(
        {
          setor,
          turno,
          data_local: dataAtual,
          quantidade_meta: metaSimulada,
          unidade,
          horas_produtivas: horasDigitadas,
          criado_por: user.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "setor,turno,data_local" },
      )
      .select("*")
      .single();
    setSalvandoMeta(false);

    if (error) {
      toast.error(error.message || "Não foi possível salvar a meta do turno.");
      return;
    }

    const metaSalva = data as MetaTurno;
    setMetaTurno(metaSalva);
    setMetaDigitada(formatarCampoNumero(Number(metaSalva.quantidade_meta)));
    setHorasDigitadas(metaSalva.horas_produtivas);
    setErroMeta(false);
    toast.success("Meta do turno salva.");
  }

  return (
    <AppShell title="Contagem" eyebrow="PRODUÇÃO · CONTROLE DO TURNO">
      <div className="mx-auto max-w-4xl space-y-3">
        <div>
          <h2 className="text-xl font-extrabold">Produção do turno</h2>
          <p className="text-xs text-muted-foreground">
            {nomeSetor(setor ?? "")} · {nomeTurno(turno)} · {formatarData(dataAtual)}
          </p>
        </div>

        {erro && (
          <div
            role="alert"
            className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm font-medium text-red-800"
          >
            Não foi possível carregar a contagem.
          </div>
        )}

        <Tabs defaultValue="producao">
          <TabsList className="grid h-11 w-full grid-cols-2 rounded-xl">
            <TabsTrigger value="producao" className="h-9 rounded-lg text-xs sm:text-sm">
              Hora a hora
            </TabsTrigger>
            <TabsTrigger value="meta" className="h-9 rounded-lg text-xs sm:text-sm">
              Meta do turno
            </TabsTrigger>
          </TabsList>

          <TabsContent value="producao" className="space-y-3">
            {metaTurno && (
              <Card className="rounded-2xl border-slate-200 shadow-sm">
                <CardContent className="space-y-3 p-3.5">
                  <div className="grid grid-cols-3 gap-1.5 text-center">
                    <Resumo label="Meta" valor={`${fmt(metaTotal)} ${unidade}`} />
                    <Resumo
                      label="Produzido"
                      valor={`${fmt(realizadoTurno)} ${unidade}`}
                      destaque
                    />
                    <Resumo label="Atingimento" valor={`${fmt(atingimento)}%`} />
                  </div>
                  <div>
                    <div className="mb-1 flex justify-between gap-2 text-[11px] text-slate-500">
                      <span>Progresso do turno</span>
                      <span>
                        {fmt(realizadoTurno)} / {fmt(metaTotal)} {unidade}
                      </span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full bg-primary transition-[width]"
                        style={{ width: `${percentualBarra}%` }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {!metaTurno && !erroMeta && (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
                A meta deste turno ainda não foi definida. Use a aba “Meta do turno”.
              </div>
            )}

            {erroMeta && (
              <div
                role="alert"
                className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs font-medium text-amber-900"
              >
                Não foi possível carregar a meta do turno.
              </div>
            )}

            <Card className="rounded-2xl border-slate-200 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Clock3 className="size-5 text-primary" /> Produção por hora
                </CardTitle>
                <p className="text-xs text-slate-500">
                  Produção real comparada automaticamente com a meta acumulada.
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                {horasComMeta.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum apontamento registrado.</p>
                ) : (
                  horasComMeta.map((item) => (
                    <HoraCard
                      key={item.hora}
                      item={item}
                      setor={setor}
                      unidade={unidade}
                      mostrarMeta={Boolean(metaTurno)}
                    />
                  ))
                )}
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-slate-200 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <PackageCheck className="size-5 text-primary" /> Produção por produto
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {linhas.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum apontamento registrado.</p>
                ) : (
                  linhas.map((linha) => (
                    <ProdutoCard key={linha.produto} linha={linha} setor={setor} />
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="meta" className="space-y-3">
            <Card className="rounded-2xl border-slate-200 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Target className="size-5 text-primary" /> Definir meta do turno
                </CardTitle>
                <p className="text-xs text-slate-500">
                  O sistema divide a meta igualmente pelas horas produtivas e acompanha o acumulado.
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-xl bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
                  <strong className="text-slate-900">{formatarData(dataAtual)}</strong> ·{" "}
                  {nomeSetor(setor ?? "")} · {nomeTurno(turno)}
                </div>

                {canFinalizeGoals ? (
                  <>
                    <div className="grid grid-cols-[minmax(0,1fr)_104px] gap-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="meta-turno">Meta total ({unidade})</Label>
                        <Input
                          id="meta-turno"
                          inputMode="decimal"
                          value={metaDigitada}
                          onChange={(event) => setMetaDigitada(event.target.value)}
                          placeholder={unidade === "m²" ? "27.391" : "0"}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="horas-meta">Horas</Label>
                        <Input
                          id="horas-meta"
                          type="number"
                          min={1}
                          max={horasDisponiveis.length}
                          value={horasDigitadas}
                          onChange={(event) => setHorasDigitadas(Number(event.target.value))}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3 text-center">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                          Meta por hora
                        </p>
                        <p className="mt-1 text-lg font-black text-primary">
                          {fmt(metaHoraSimulada)} {unidade}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                          Meta do turno
                        </p>
                        <p className="mt-1 text-lg font-black text-slate-950">
                          {fmt(metaSimulada)} {unidade}
                        </p>
                      </div>
                    </div>

                    <Button
                      className="w-full"
                      disabled={salvandoMeta || metaSimulada <= 0}
                      onClick={() => void salvarMeta()}
                    >
                      <Save className="size-4" />{" "}
                      {salvandoMeta ? "Salvando..." : "Salvar meta do turno"}
                    </Button>
                  </>
                ) : metaTurno ? (
                  <div className="grid grid-cols-2 gap-2 text-center">
                    <Resumo label="Meta do turno" valor={`${fmt(metaTotal)} ${unidade}`} destaque />
                    <Resumo label="Meta por hora" valor={`${fmt(metaPorHora)} ${unidade}`} />
                  </div>
                ) : (
                  <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
                    A meta ainda não foi definida por um usuário autorizado.
                  </p>
                )}

                {!canFinalizeGoals && (
                  <p className="text-xs text-slate-500">
                    Somente o administrador ou quem possui permissão para metas pode alterar este
                    valor.
                  </p>
                )}
              </CardContent>
            </Card>

            {metaSimulada > 0 && horasDisponiveis.length > 0 && (
              <Card className="rounded-2xl border-slate-200 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Simulação automática</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5">
                  {horasDisponiveis.slice(0, horasSimuladas).map((hora, index) => (
                    <div
                      key={hora}
                      className="grid grid-cols-[62px_1fr_1fr] items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-sm"
                    >
                      <strong>{hora}</strong>
                      <span className="text-right text-xs text-slate-500">
                        + {fmt(metaHoraSimulada)} {unidade}
                      </span>
                      <span className="text-right font-bold text-primary">
                        {fmt(Math.min(metaSimulada, metaHoraSimulada * (index + 1)))} {unidade}
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}

function HoraCard({
  item,
  setor,
  unidade,
  mostrarMeta,
}: {
  item: HoraPlanejada;
  setor: string | null | undefined;
  unidade: string;
  mostrarMeta: boolean;
}) {
  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-start justify-between gap-3 bg-slate-50 px-3 py-2.5">
        <div>
          <p className="text-lg font-black text-slate-950">{item.hora}</p>
          <p className="text-[11px] text-slate-500">
            {item.apontamentos > 0
              ? `${item.apontamentos} apontamento(s)`
              : "Sem produção registrada"}
          </p>
        </div>
        <div className="text-right">
          <p className="text-base font-black text-primary">
            {fmt(item.realizadoHora)} {unidade}
          </p>
          <p className="text-[11px] text-slate-500">{apoioDaHora(item, setor)}</p>
        </div>
      </div>

      <div className="divide-y divide-slate-100 px-3">
        {item.produtos.length === 0 ? (
          <p className="py-2.5 text-xs text-slate-500">Nenhum produto apontado neste horário.</p>
        ) : (
          item.produtos.map((produto) => (
            <div key={produto.produto} className="flex items-center justify-between gap-3 py-2.5">
              <span className="min-w-0 truncate font-semibold text-slate-900">
                {produto.produto}
              </span>
              <span className="shrink-0 font-bold text-slate-700">
                {fmt(valorDaLinha(produto, setor))} {unidade}
              </span>
            </div>
          ))
        )}
      </div>

      {mostrarMeta && (
        <div className="grid grid-cols-2 gap-px border-t border-slate-200 bg-slate-200 text-center">
          <MetricaHora label="Meta da hora" valor={`${fmt(item.metaHora)} ${unidade}`} />
          <MetricaHora label="Meta acumulada" valor={`${fmt(item.metaAcumulada)} ${unidade}`} />
          <MetricaHora
            label="Realizado acumulado"
            valor={`${fmt(item.realizadoAcumulado)} ${unidade}`}
          />
          <MetricaHora
            label="Saldo acumulado"
            valor={`${item.saldoAcumulado > 0 ? "+" : ""}${fmt(item.saldoAcumulado)} ${unidade}`}
            negativo={item.saldoAcumulado < 0}
          />
        </div>
      )}
    </article>
  );
}

function ProdutoCard({ linha, setor }: { linha: Linha; setor: string | null | undefined }) {
  const fitas = setor === "fitas";
  const mantas = setor === "mantas";
  const corte = setor === "corte";

  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="flex items-start justify-between gap-3">
        <strong>{linha.produto}</strong>
        <span className="text-xs text-slate-500">{linha.apontamentos} apontamento(s)</span>
      </div>
      {fitas ? (
        <p className="mt-2 text-2xl font-extrabold text-primary">{fmt(linha.area)} m²</p>
      ) : mantas ? (
        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
          <Mini label="Metragem" valor={`${fmt(linha.metragem)} m`} destaque />
          <Mini label="PLTs" valor={String(linha.plts)} />
          <Mini label="Rolos" valor={String(linha.rolos)} />
        </div>
      ) : corte ? (
        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
          <Mini label="PLTs" valor={String(linha.plts)} destaque />
          <Mini label="Unidades" valor={String(linha.rolos)} />
          <Mini label="Metragem" valor={`${fmt(linha.metragem)} m²`} />
        </div>
      ) : (
        <div className="mt-2 grid grid-cols-2 gap-2 text-center">
          <Mini label="PLTs" valor={String(linha.plts)} />
          <Mini label="Rolos" valor={String(linha.rolos)} />
        </div>
      )}
    </div>
  );
}

function Resumo({
  label,
  valor,
  destaque = false,
}: {
  label: string;
  valor: string;
  destaque?: boolean;
}) {
  return (
    <div className={`min-w-0 rounded-xl p-2 ${destaque ? "bg-primary/10" : "bg-slate-50"}`}>
      <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p
        className={`mt-1 truncate text-sm font-black ${destaque ? "text-primary" : "text-slate-950"}`}
      >
        {valor}
      </p>
    </div>
  );
}

function MetricaHora({
  label,
  valor,
  negativo = false,
}: {
  label: string;
  valor: string;
  negativo?: boolean;
}) {
  return (
    <div className="bg-slate-50 px-2 py-2.5">
      <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-0.5 text-xs font-black ${negativo ? "text-red-600" : "text-slate-900"}`}>
        {valor}
      </p>
    </div>
  );
}

function Mini({
  label,
  valor,
  destaque = false,
}: {
  label: string;
  valor: string;
  destaque?: boolean;
}) {
  return (
    <div className={`rounded-lg p-2 ${destaque ? "bg-primary/10 text-primary" : "bg-slate-50"}`}>
      <p className="text-[10px] uppercase text-slate-500">{label}</p>
      <p className="font-bold">{valor}</p>
    </div>
  );
}

function linhaVazia(produto: string): Linha {
  return { produto, apontamentos: 0, plts: 0, rolos: 0, metragem: 0, area: 0 };
}

function horaVazia(hora: string): HoraInterna {
  return { hora, apontamentos: 0, plts: 0, rolos: 0, metragem: 0, area: 0, produtos: new Map() };
}

function horaVaziaFinal(hora: string): Hora {
  return { hora, apontamentos: 0, plts: 0, rolos: 0, metragem: 0, area: 0, produtos: [] };
}

function somarRegistro(linha: Linha, item: Registro) {
  linha.apontamentos += 1;
  linha.plts += Number(item.quantidade_plts ?? 0);
  linha.rolos += Number(item.total_rolos ?? 0);
  linha.metragem += Number(item.metragem ?? 0);
  linha.area += Number(item.area_m2 ?? 0);
}

function unidadeDoSetor(setor: string | null | undefined) {
  if (setor === "fitas") return "m²";
  if (setor === "mantas") return "m";
  return "PLTs";
}

function valorDaHora(
  item: Pick<Hora, "plts" | "metragem" | "area">,
  setor: string | null | undefined,
) {
  if (setor === "fitas") return Number(item.area ?? 0);
  if (setor === "mantas") return Number(item.metragem ?? 0);
  return Number(item.plts ?? 0);
}

function valorDaLinha(item: Linha, setor: string | null | undefined) {
  if (setor === "fitas") return item.area;
  if (setor === "mantas") return item.metragem;
  return item.plts;
}

function apoioDaHora(item: Hora, setor: string | null | undefined) {
  if (setor === "corte") return `${fmt(item.rolos)} unidades · ${fmt(item.metragem)} m²`;
  if (setor === "mantas") return `${fmt(item.plts)} PLTs · ${fmt(item.rolos)} rolos`;
  if (setor === "fitas") return `${item.produtos.length} produto(s)`;
  return `${fmt(item.rolos)} unidades`;
}

function numeroDoCampo(valor: string) {
  const limpo = valor.trim().replace(/\s/g, "");
  if (!limpo) return 0;
  if (limpo.includes(",")) return Number(limpo.replace(/\./g, "").replace(",", "."));
  if (/^\d{1,3}(\.\d{3})+$/.test(limpo)) return Number(limpo.replace(/\./g, ""));
  return Number(limpo);
}

function formatarCampoNumero(valor: number) {
  return valor.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function formatarData(valor: string) {
  const [ano, mes, dia] = valor.split("-");
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : "—";
}

function fmt(valor: number) {
  return valor.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}
