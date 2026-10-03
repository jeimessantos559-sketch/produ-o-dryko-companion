import { createFileRoute } from "@tanstack/react-router";
import { CalendarDays, PackageCheck, Pencil, Save, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { AjustarHorarioApontamentos } from "@/components/dryko/ajustar-horario-apontamentos";
import { AppShell } from "@/components/dryko/app-shell";
import { ProdutoSelect } from "@/components/dryko/produto-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";
import { dataOperacional, horaCheiaProducao, horasProdutivasTurno, ordemHoraTurno } from "@/lib/producao";
import { obterProdutosAtivos, type ProdutoCatalogo } from "@/lib/produtos-cache";

export const Route = createFileRoute("/_authenticated/programacao")({
  head: () => ({
    meta: [
      { title: "Programação | Aponta Produção DRYKO" },
      { name: "description", content: "Produção automática hora a hora e programação diária." },
    ],
  }),
  component: Programacao,
});

type Registro = {
  id: string;
  produto_id: string;
  produto_nome: string;
  op: string | null;
  lote: string | null;
  quantidade_plts: number | null;
  total_rolos: number | null;
  metragem: number | null;
  area_m2: number | null;
  data_hora_producao: string;
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

type Hora = {
  hora: string;
  apontamentos: number;
  plts: number;
  rolos: number;
  metragem: number;
  area: number;
  produtos: Linha[];
};

type HoraInterna = Omit<Hora, "produtos"> & { produtos: Map<string, Linha> };

type HoraPlanejada = Hora & {
  metaHora: number;
  realizadoAcumulado: number;
  saldoAcumulado: number;
};

type ProgramacaoItem = {
  id: string;
  produto_id: string;
  produto_nome: string;
  op: string | null;
  lote: string | null;
  quantidade_prevista: number;
  unidade: string;
};

type AbaProgramacao = "hora" | "programacao";

function Programacao() {
  const { profile, user, canFinalizeGoals, canProgramProduction } = useAuth();
  const [recarga, setRecarga] = useState(0);
  const setor = profile?.setor_atual;
  const turno = profile?.turno_atual;
  const dataAtual = turno ? dataOperacional(turno) : "";
  const horasDisponiveis = useMemo(() => horasProdutivasTurno(turno), [turno]);
  const unidade = unidadeMetaTurno(setor);
  const unidadeProg = unidadeProgramacao(setor);
  const programacaoSuportada = setor === "corte" || setor === "fitas" || setor === "mantas";

  const [abaAtiva, setAbaAtiva] = useState<AbaProgramacao>("hora");
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [metaTurno, setMetaTurno] = useState<MetaTurno | null>(null);
  const [programacao, setProgramacao] = useState<ProgramacaoItem[]>([]);
  const [registrosDia, setRegistrosDia] = useState<Registro[]>([]);
  const [produtos, setProdutos] = useState<ProdutoCatalogo[]>([]);
  const [metaDigitada, setMetaDigitada] = useState("");
  const [horasDigitadas, setHorasDigitadas] = useState("");
  const [produtoId, setProdutoId] = useState("");
  const [quantidadePrevista, setQuantidadePrevista] = useState("");
  const [erro, setErro] = useState(false);
  const [erroMeta, setErroMeta] = useState(false);
  const [carregandoProgramacao, setCarregandoProgramacao] = useState(false);
  const [salvandoMeta, setSalvandoMeta] = useState(false);
  const [salvandoProgramacao, setSalvandoProgramacao] = useState(false);
  const carregamentoAtual = useRef(0);
  const carregamentoProgramacaoAtual = useRef(0);
  const cacheProgramacao = useRef<{ chave: string; at: number } | null>(null);

  const produtoSelecionado = useMemo(
    () => produtos.find((item) => item.id === produtoId) ?? null,
    [produtoId, produtos],
  );

  useEffect(() => {
    const carga = ++carregamentoAtual.current;
    setErro(false);
    setErroMeta(false);
    setProgramacao([]);
    setRegistrosDia([]);
    setProdutos([]);
    setProdutoId("");
    setQuantidadePrevista("");
    cacheProgramacao.current = null;

    if (!setor || !turno || !dataAtual) {
      setRegistros([]);
      setMetaTurno(null);
      setMetaDigitada("");
      setHorasDigitadas("");
      return;
    }

    void Promise.all([
      supabase
        .from("apontamentos")
        .select(
          "id, produto_id, produto_nome, op, lote, quantidade_plts, total_rolos, metragem, area_m2, data_hora_producao",
        )
        .eq("setor", setor)
        .eq("turno", turno)
        .eq("data_local", dataAtual)
        .order("data_hora_producao", { ascending: true }),
      supabase
        .from("metas_turno")
        .select("*")
        .eq("setor", setor)
        .eq("turno", turno)
        .eq("data_local", dataAtual)
        .maybeSingle(),
    ]).then(([resultadoApontamentos, resultadoMeta]) => {
      if (carga !== carregamentoAtual.current) return;

      if (resultadoApontamentos.error) setErro(true);
      setRegistros((resultadoApontamentos.data ?? []) as Registro[]);

      if (resultadoMeta.error) {
        setErroMeta(true);
        setMetaTurno(null);
        setMetaDigitada("");
        setHorasDigitadas("");
      } else {
        const meta = (resultadoMeta.data as MetaTurno | null) ?? null;
        setMetaTurno(meta);
        setMetaDigitada(meta ? formatarCampoNumero(Number(meta.quantidade_meta)) : "");
        setHorasDigitadas(meta ? formatarDuracaoHoras(Number(meta.horas_produtivas)) : "");
      }
    });
  }, [dataAtual, setor, turno, recarga]);

  useEffect(() => {
    if (abaAtiva !== "programacao" || !programacaoSuportada || !setor || !turno || !dataAtual) {
      return;
    }

    const chave = `${setor}:${dataAtual}`;
    if (cacheProgramacao.current?.chave === chave && Date.now() - cacheProgramacao.current.at < 30_000) {
      return;
    }

    const carga = ++carregamentoProgramacaoAtual.current;
    setCarregandoProgramacao(true);

    void Promise.all([
      (supabase as any)
        .from("programacao_producao")
        .select("id, produto_id, produto_nome, op, lote, quantidade_prevista, unidade")
        .eq("setor", setor)
        .eq("data_local", dataAtual)
        .eq("global_dia", true)
        .order("created_at", { ascending: true }),
      obterProdutosAtivos(setor),
      supabase
        .from("apontamentos")
        .select(
          "id, produto_id, produto_nome, op, lote, quantidade_plts, total_rolos, metragem, area_m2, data_hora_producao",
        )
        .eq("setor", setor)
        .eq("data_local", dataAtual),
    ])
      .then(([resultadoProgramacao, listaProdutos, resultadoDia]) => {
        if (carga !== carregamentoProgramacaoAtual.current) return;
        if (resultadoProgramacao.error || resultadoDia.error) {
          setErro(true);
          return;
        }
        setProgramacao((resultadoProgramacao.data ?? []) as ProgramacaoItem[]);
        setProdutos(listaProdutos as ProdutoCatalogo[]);
        setRegistrosDia((resultadoDia.data ?? []) as Registro[]);
        cacheProgramacao.current = { chave, at: Date.now() };
      })
      .catch(() => {
        if (carga === carregamentoProgramacaoAtual.current) setErro(true);
      })
      .finally(() => {
        if (carga === carregamentoProgramacaoAtual.current) setCarregandoProgramacao(false);
      });
  }, [abaAtiva, dataAtual, programacaoSuportada, setor, turno]);

  const porHora = useMemo(() => {
    const mapa = new Map<string, HoraInterna>();
    for (const item of registros) {
      const chave = horaCheiaProducao(item.data_hora_producao);
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
  const duracaoProdutiva = Number(metaTurno?.horas_produtivas ?? 0);
  const metaPorHora = duracaoProdutiva > 0 ? metaTotal / duracaoProdutiva : 0;

  const horasComMeta = useMemo<HoraPlanejada[]>(() => {
    const producaoPorHora = new Map(porHora.map((item) => [item.hora, item]));
    const horasPlanejadas = metaTurno ? horasDisponiveis : [];
    const horasPlanejadasSet = new Set(horasPlanejadas);
    const chaves = [...new Set([...horasPlanejadas, ...porHora.map((item) => item.hora)])].sort(
      (a, b) => ordemHoraTurno(a, turno) - ordemHoraTurno(b, turno),
    );

    let realizadoAcumulado = 0;
    let previstoAcumulado = 0;

    return chaves.map((hora) => {
      const item = producaoPorHora.get(hora) ?? horaVaziaFinal(hora);
      const metaHora = horasPlanejadasSet.has(hora) ? metaPorHora : 0;
      const realizadoHora = valorMetaHora(item, setor);
      previstoAcumulado += metaHora;
      realizadoAcumulado += realizadoHora;

      return {
        ...item,
        metaHora,
        realizadoAcumulado,
        saldoAcumulado: realizadoAcumulado - previstoAcumulado,
      };
    });
  }, [horasDisponiveis, metaPorHora, metaTurno, porHora, setor, turno]);

  const realizadoTurno = useMemo(
    () => porHora.reduce((total, item) => total + valorMetaHora(item, setor), 0),
    [porHora, setor],
  );
  const atingimento = metaTotal > 0 ? (realizadoTurno / metaTotal) * 100 : 0;
  const percentualBarra = Math.min(100, Math.max(0, atingimento));

  const metaInformada = numeroDoCampo(metaDigitada);
  const metaSimulada = Number.isFinite(metaInformada) ? metaInformada : 0;
  const horasSimuladas = duracaoDoCampo(horasDigitadas);
  const metaHoraSimulada = metaSimulada > 0 && horasSimuladas > 0 ? metaSimulada / horasSimuladas : 0;

  const resumoProgramacao = useMemo(() => {
    return programacao.map((item) => {
      const previsto = Number(item.quantidade_prevista ?? 0);
      const realizado = registrosDia
        .filter((registro) => correspondeProgramacaoItem(registro, item, setor))
        .reduce((total, registro) => total + valorRealizadoRegistro(registro, setor), 0);
      return { ...item, previsto, realizado, saldo: previsto - realizado };
    });
  }, [programacao, registrosDia, setor]);

  async function salvarMeta() {
    if (!canFinalizeGoals || !user || !setor || !turno || salvandoMeta) return;
    if (!Number.isFinite(metaSimulada) || metaSimulada <= 0) {
      toast.error("Informe uma meta maior que zero.");
      return;
    }
    if (!Number.isFinite(horasSimuladas) || horasSimuladas <= 0 || horasSimuladas > 24) {
      toast.error("Informe um tempo produtivo válido, por exemplo 9:28.");
      return;
    }

    setSalvandoMeta(true);
    const duracaoParaSalvar = Number(horasSimuladas.toFixed(2));
    const { data, error } = await supabase
      .from("metas_turno")
      .upsert(
        {
          setor,
          turno,
          data_local: dataAtual,
          quantidade_meta: metaSimulada,
          unidade,
          horas_produtivas: duracaoParaSalvar,
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
    setHorasDigitadas(formatarDuracaoHoras(Number(metaSalva.horas_produtivas)));
    toast.success("Meta do turno salva.");
  }

  async function salvarProgramacao() {
    if (!user || !setor || !turno || !produtoSelecionado || salvandoProgramacao) return;
    const quantidade = numeroDoCampo(quantidadePrevista);
    if (!Number.isFinite(quantidade) || quantidade <= 0) {
      toast.error("Informe produto e quantidade prevista.");
      return;
    }

    setSalvandoProgramacao(true);
    const valores = {
      setor,
      turno,
      data_local: dataAtual,
      produto_id: produtoSelecionado.id,
      produto_nome: produtoSelecionado.nome,
      quantidade_prevista: quantidade,
      unidade: unidadeProg,
      global_dia: true,
      updated_at: new Date().toISOString(),
    };

    const consulta = (supabase as any)
      .from("programacao_producao")
      .update(valores)
      .eq("setor", setor)
      .eq("data_local", dataAtual)
      .eq("global_dia", true)
      .eq("produto_id", produtoSelecionado.id);
    const existente = await consulta
      .select("id, produto_id, produto_nome, op, lote, quantidade_prevista, unidade")
      .limit(1)
      .maybeSingle();

    let resultado = existente;
    if (!existente.error && !existente.data) {
      resultado = await (supabase as any)
        .from("programacao_producao")
        .insert({ ...valores, op: null, lote: null, criado_por: user.id })
        .select("id, produto_id, produto_nome, op, lote, quantidade_prevista, unidade")
        .single();
    }
    setSalvandoProgramacao(false);

    if (resultado.error || !resultado.data) {
      toast.error(resultado.error?.message || "Não foi possível salvar a programação.");
      return;
    }

    const salvo = resultado.data as ProgramacaoItem;
    setProgramacao((atuais) => [...atuais.filter((item) => item.id !== salvo.id), salvo]);
    setProdutoId("");
    setQuantidadePrevista("");
    cacheProgramacao.current = { chave: `${setor}:${dataAtual}`, at: Date.now() };
    toast.success("Produto adicionado à programação.");
  }

  async function editarReferencia(id: string, atual: string | null) {
    if (!canProgramProduction) return;
    const coluna = setor === "mantas" ? "lote" : "op";
    const nome = coluna === "lote" ? "Lote" : "OP";
    const digitado = window.prompt(`${nome} da programação (deixe vazio para limpar):`, atual ?? "");
    if (digitado === null) return;
    const valor = digitado.trim() || null;
    const { error } = await (supabase as any)
      .from("programacao_producao")
      .update({ [coluna]: valor, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      toast.error(`Não foi possível atualizar ${coluna === "lote" ? "o lote" : "a OP"}.`);
      return;
    }
    setProgramacao((atuais) => atuais.map((item) => (item.id === id ? { ...item, [coluna]: valor } : item)));
    toast.success(valor ? `${nome} atualizado.` : `${nome} removido.`);
  }

  async function excluirProgramacao(id: string) {
    const { error } = await (supabase as any).from("programacao_producao").delete().eq("id", id);
    if (error) {
      toast.error("Não foi possível remover este item.");
      return;
    }
    setProgramacao((atuais) => atuais.filter((item) => item.id !== id));
    if (setor) cacheProgramacao.current = { chave: `${setor}:${dataAtual}`, at: Date.now() };
  }

  if (!setor || !turno) {
    return (
      <AppShell title="Programação" eyebrow="PRODUÇÃO · PLANEJAMENTO">
        <Card>
          <CardContent className="p-5 text-sm text-muted-foreground">
            Escolha setor e turno antes de abrir a Programação.
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell title="Programação" eyebrow="PRODUÇÃO · CONTROLE DO TURNO">
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-extrabold">Produção hora a hora</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatarData(dataAtual)} · dados vindos dos apontamentos
            </p>
          </div>
          <span className="rounded-full bg-emerald-100 px-3 py-2 text-xs font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            Automático
          </span>
        </div>

        {erro && (
          <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm font-medium text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
            Parte dos dados do turno não pôde ser carregada.
          </div>
        )}

        <Tabs value={abaAtiva} onValueChange={(valor) => setAbaAtiva(valor as AbaProgramacao)}>
          <TabsList className="grid h-14 w-full grid-cols-2 rounded-2xl p-1.5">
            <TabsTrigger value="hora" className="h-11 touch-manipulation rounded-xl text-sm font-bold">
              Hora a hora
            </TabsTrigger>
            <TabsTrigger value="programacao" className="h-11 touch-manipulation rounded-xl text-sm font-bold">
              Programação
            </TabsTrigger>
          </TabsList>

          <TabsContent value="hora" className="space-y-4">
            <AjustarHorarioApontamentos
              registros={registros}
              setor={setor}
              onAjustado={() => setRecarga((v) => v + 1)}
            />

            <div className="grid grid-cols-2 gap-3">
              <ResumoGrande label="Previsto" valor={`${fmt(metaTotal)} ${unidade}`} />
              <ResumoGrande label="Realizado" valor={`${fmt(realizadoTurno)} ${unidade}`} destaque />
              <ResumoGrande label="Atingimento" valor={`${fmt(atingimento)}%`} className="col-span-2" />
            </div>

            <Card className="rounded-2xl border-border shadow-sm">
              <CardContent className="p-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <strong>Produção acumulada do turno</strong>
                  <strong className="text-primary">
                    {fmt(realizadoTurno)} / {fmt(metaTotal)} {unidade}
                  </strong>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-[width]"
                    style={{ width: `${percentualBarra}%` }}
                  />
                </div>
              </CardContent>
            </Card>

            {!metaTurno && !erroMeta && (
              <div className="rounded-xl border border-dashed border-border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
                A meta deste turno ainda não foi definida. Use a aba Programação.
              </div>
            )}

            <div className="space-y-3">
              {horasComMeta.length === 0 ? (
                <Card>
                  <CardContent className="p-5 text-sm text-muted-foreground">
                    Nenhum apontamento registrado.
                  </CardContent>
                </Card>
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
            </div>
          </TabsContent>

          <TabsContent value="programacao" className="space-y-4">
            <Card className="rounded-2xl border-border shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <CalendarDays className="size-5 text-primary" /> Meta do turno
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {canFinalizeGoals ? (
                  <>
                    <div className="grid grid-cols-[minmax(0,1fr)_132px] gap-2">
                      <div className="space-y-1.5">
                        <Label>Meta total ({unidade})</Label>
                        <Input
                          inputMode="decimal"
                          value={metaDigitada}
                          onChange={(e) => setMetaDigitada(e.target.value)}
                          placeholder="0"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Tempo produtivo</Label>
                        <Input
                          inputMode="decimal"
                          value={horasDigitadas}
                          onChange={(e) => setHorasDigitadas(normalizarDuracaoDigitada(e.target.value))}
                          placeholder="Ex.: 9:28"
                        />
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Digite o tempo que quiser, como 9:28, 8:45 ou 7,5 horas.
                    </p>
                    <div className="rounded-xl bg-muted p-3 text-center">
                      <p className="text-[10px] font-bold uppercase text-muted-foreground">Previsto por hora</p>
                      <p className="mt-1 text-xl font-black text-primary">
                        {fmt(metaHoraSimulada)} {unidade}
                      </p>
                    </div>
                    <Button
                      className="w-full touch-manipulation"
                      disabled={salvandoMeta || metaSimulada <= 0 || horasSimuladas <= 0}
                      onClick={() => void salvarMeta()}
                    >
                      <Save className="size-4" /> {salvandoMeta ? "Salvando..." : "Salvar meta"}
                    </Button>
                  </>
                ) : metaTurno ? (
                  <div className="grid grid-cols-2 gap-2">
                    <ResumoGrande label="Meta" valor={`${fmt(metaTotal)} ${unidade}`} />
                    <ResumoGrande label="Por hora" valor={`${fmt(metaPorHora)} ${unidade}`} />
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">A meta ainda não foi definida.</p>
                )}
              </CardContent>
            </Card>

            {programacaoSuportada && (
              <>
                {canProgramProduction ? (
                  <Card className="rounded-2xl border-border shadow-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <PackageCheck className="size-5 text-primary" /> Produtos que vão rodar no dia
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label>Produto</Label>
                        <ProdutoSelect
                          produtos={produtos}
                          value={produtoId}
                          onValueChange={setProdutoId}
                          carregando={carregandoProgramacao}
                          placeholder="Selecione"
                        />
                      </div>
                      <div className="space-y-1 sm:col-span-2">
                        <Label>Quantidade prevista ({unidadeProg})</Label>
                        <Input
                          inputMode="decimal"
                          value={quantidadePrevista}
                          onChange={(e) => setQuantidadePrevista(e.target.value)}
                          placeholder="0"
                        />
                      </div>
                      <Button
                        className="touch-manipulation sm:col-span-2"
                        disabled={
                          carregandoProgramacao || salvandoProgramacao || !produtoId || !quantidadePrevista.trim()
                        }
                        onClick={() => void salvarProgramacao()}
                      >
                        <Save className="size-4" />
                        {salvandoProgramacao ? "Salvando..." : "Adicionar à programação"}
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Somente administrador ou Programador de Produção pode alterar a programação.
                  </p>
                )}

                <Card className="rounded-2xl border-border shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">
                      Programação do dia{" "}
                      <span className="text-xs font-normal text-muted-foreground">
                        · produção acumulada entre turnos
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {carregandoProgramacao ? (
                      <p className="text-sm text-muted-foreground">Carregando programação...</p>
                    ) : resumoProgramacao.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Nenhum produto programado.</p>
                    ) : (
                      resumoProgramacao.map((item) => (
                        <div key={item.id} className="rounded-xl border border-border bg-muted/30 p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-bold">{item.produto_nome}</p>
                              <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                                <span>
                                  {setor === "mantas"
                                    ? item.lote
                                      ? `Lote ${item.lote}`
                                      : "Lote: aguardando primeiro apontamento"
                                    : item.op
                                      ? `OP ${item.op}`
                                      : "OP: aguardando primeiro apontamento"}
                                </span>
                                {canProgramProduction && (
                                  <button
                                    type="button"
                                    className="inline-flex items-center gap-1 font-semibold text-primary underline-offset-2 hover:underline"
                                    onClick={() =>
                                      void editarReferencia(item.id, setor === "mantas" ? item.lote : item.op)
                                    }
                                  >
                                    <Pencil className="size-3" />
                                    {setor === "mantas" ? "Editar lote" : "Editar OP"}
                                  </button>
                                )}
                              </div>
                            </div>
                            {canProgramProduction && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-8 touch-manipulation text-red-600"
                                onClick={() => void excluirProgramacao(item.id)}
                                aria-label="Excluir programação"
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            )}
                          </div>
                          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                            <Mini label="Programado" valor={`${fmt(item.previsto)} ${item.unidade}`} />
                            <Mini label="Produzido no dia" valor={`${fmt(item.realizado)} ${item.unidade}`} destaque />
                            <Mini label="Saldo" valor={`${fmt(item.saldo)} ${item.unidade}`} alerta={item.saldo > 0} />
                          </div>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </>
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
    <article className="overflow-hidden rounded-[1.6rem] border border-border bg-card shadow-sm">
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xl font-black text-foreground">{intervaloHora(item.hora)}</p>
            <p className="mt-2 text-sm font-semibold text-muted-foreground">{resumoProdutosHora(item, setor)}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-2xl font-black text-primary">{destaqueHora(item, setor)}</p>
            <p className="mt-1 text-sm font-bold text-muted-foreground">{secundarioHora(item, setor)}</p>
          </div>
        </div>

        {mostrarMeta && (
          <>
            <div className="my-4 border-t border-border" />
            <div className="grid grid-cols-3 gap-3">
              <MetricaHora label="Previsto" valor={`${fmt(item.metaHora)} ${unidade}`} />
              <MetricaHora label="Acumulado" valor={`${fmt(item.realizadoAcumulado)} ${unidade}`} />
              <MetricaHora
                label="Δ acumulado"
                valor={`${item.saldoAcumulado > 0 ? "+" : ""}${fmt(item.saldoAcumulado)} ${unidade}`}
                negativo={item.saldoAcumulado < 0}
              />
            </div>
          </>
        )}
      </div>
    </article>
  );
}

function ResumoGrande({
  label,
  valor,
  destaque = false,
  className = "",
}: {
  label: string;
  valor: string;
  destaque?: boolean;
  className?: string;
}) {
  return (
    <Card className={`rounded-2xl border-border ${destaque ? "border-primary/40 bg-primary/10" : ""} ${className}`}>
      <CardContent className="p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={`mt-2 text-2xl font-black ${destaque ? "text-primary" : "text-foreground"}`}>{valor}</p>
      </CardContent>
    </Card>
  );
}

function MetricaHora({ label, valor, negativo = false }: { label: string; valor: string; negativo?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className={`mt-1 break-words text-base font-black ${negativo ? "text-primary" : "text-foreground"}`}>
        {valor}
      </p>
    </div>
  );
}

function Mini({
  label,
  valor,
  destaque = false,
  alerta = false,
}: {
  label: string;
  valor: string;
  destaque?: boolean;
  alerta?: boolean;
}) {
  return (
    <div
      className={`rounded-lg p-2 ${
        alerta ? "bg-amber-100/80 dark:bg-amber-950/50" : destaque ? "bg-primary/10" : "bg-muted"
      }`}
    >
      <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
      <p className={`font-bold ${alerta ? "text-amber-900 dark:text-amber-100" : destaque ? "text-primary" : ""}`}>
        {valor}
      </p>
    </div>
  );
}

function linhaVazia(produto: string): Linha {
  return { produto, apontamentos: 0, plts: 0, rolos: 0, metragem: 0, area: 0 };
}

function horaVazia(hora: string): HoraInterna {
  return {
    hora,
    apontamentos: 0,
    plts: 0,
    rolos: 0,
    metragem: 0,
    area: 0,
    produtos: new Map(),
  };
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

function unidadeMetaTurno(setor: string | null | undefined) {
  if (setor === "mantas") return "m";
  return "m²";
}

function unidadeProgramacao(setor: string | null | undefined) {
  if (setor === "fitas") return "m²";
  if (setor === "mantas") return "m";
  return "PLTs";
}

function valorMetaHora(item: Pick<Hora, "plts" | "metragem" | "area">, setor: string | null | undefined) {
  if (setor === "fitas") return Number(item.area ?? 0);
  return Number(item.metragem ?? 0);
}

function correspondeProgramacaoItem(registro: Registro, item: ProgramacaoItem, setor: string | null | undefined) {
  if (registro.produto_id !== item.produto_id) return false;
  if (setor === "mantas") return true;
  const opItem = normalizar(item.op);
  if (!opItem) return true;
  return normalizar(registro.op) === opItem;
}

function valorRealizadoRegistro(item: Registro, setor: string | null | undefined) {
  if (setor === "fitas") return Number(item.area_m2 ?? 0);
  if (setor === "mantas") return Number(item.metragem ?? 0);
  return Number(item.quantidade_plts ?? 0);
}

function normalizar(valor: string | null | undefined) {
  return (valor ?? "").trim().toLocaleUpperCase("pt-BR");
}

function resumoProdutosHora(item: Hora, setor: string | null | undefined) {
  if (!item.produtos.length) return "Sem produção registrada";
  return item.produtos
    .map((produto) => {
      if (setor === "corte") return `${produto.produto}: ${fmt(produto.plts)} PLT${produto.plts === 1 ? "" : "s"}`;
      if (setor === "mantas") return `${produto.produto}: ${fmt(produto.metragem)} m`;
      if (setor === "fitas") return `${produto.produto}: ${fmt(produto.area)} m²`;
      return `${produto.produto}: ${fmt(produto.plts)}`;
    })
    .join(" · ");
}

function destaqueHora(item: Hora, setor: string | null | undefined) {
  if (setor === "corte") return `${fmt(item.plts)} PLT${item.plts === 1 ? "" : "s"}`;
  if (setor === "mantas") return `${fmt(item.metragem)} m`;
  if (setor === "fitas") return `${fmt(item.area)} m²`;
  return `${fmt(item.plts)} PLTs`;
}

function secundarioHora(item: Hora, setor: string | null | undefined) {
  if (setor === "corte") return `${fmt(item.metragem)} m²`;
  if (setor === "mantas") return `${fmt(item.plts)} PLTs · ${fmt(item.rolos)} rolos`;
  if (setor === "fitas") return `${item.produtos.length} produto(s)`;
  return `${fmt(item.rolos)} unidades`;
}

function intervaloHora(hora: string) {
  const inicio = Number(hora.slice(0, 2));
  const fim = (inicio + 1) % 24;
  return `${String(inicio).padStart(2, "0")}:00–${String(fim).padStart(2, "0")}:00`;
}

function duracaoDoCampo(valor: string) {
  const limpo = valor.trim().toLowerCase().replace(/\s/g, "").replace("h", ":");
  if (!limpo) return 0;
  if (limpo.includes(":")) {
    const [horasTexto, minutosTexto = "0"] = limpo.split(":", 2);
    const horas = Number(horasTexto);
    const minutos = Number(minutosTexto);
    if (!Number.isFinite(horas) || !Number.isFinite(minutos) || horas < 0 || minutos < 0 || minutos >= 60) {
      return Number.NaN;
    }
    return horas + minutos / 60;
  }
  return numeroDoCampo(limpo);
}

function formatarDuracaoHoras(valor: number) {
  if (!Number.isFinite(valor) || valor <= 0) return "";
  let horas = Math.floor(valor);
  let minutos = Math.round((valor - horas) * 60);
  if (minutos === 60) {
    horas += 1;
    minutos = 0;
  }
  return `${horas}:${String(minutos).padStart(2, "0")}`;
}

function normalizarDuracaoDigitada(valor: string) {
  return valor.replace(/[^0-9:,.hH]/g, "").slice(0, 8);
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
  return ano && mes && dia ? `${dia}/${mes}` : "—";
}

function fmt(valor: number) {
  return Number(valor || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}
