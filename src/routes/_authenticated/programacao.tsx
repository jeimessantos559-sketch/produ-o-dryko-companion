import { createFileRoute } from "@tanstack/react-router";
import {
  CalendarDays,
  PackageCheck,
  Save,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { AjustarHorarioApontamentos } from "@/components/dryko/ajustar-horario-apontamentos";
import { AppShell, nomeSetor, nomeTurno } from "@/components/dryko/app-shell";
import { ProdutoSelect } from "@/components/dryko/produto-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { dataOperacional, horaCheiaProducao, horasProdutivasTurno, ordemHoraTurno } from "@/lib/producao";
import { obterProdutosAtivos, type ProdutoCatalogo } from "@/lib/produtos-cache";

export const Route = createFileRoute("/_authenticated/programacao")({
  head: () => ({
    meta: [
      { title: "Programação | Aponta Produção DRYKO" },
      { name: "description", content: "Planejamento hora a hora e programação diária da produção." },
      { property: "og:title", content: "Programação | Aponta Produção DRYKO" },
      { property: "og:description", content: "Planejamento hora a hora e programação diária da produção." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Programacao,
});

type ProgramacaoItem = {
  id: string;
  setor: string;
  turno: "T1" | "T2" | "T3";
  data_local: string;
  produto_id: string;
  produto_nome: string;
  op: string | null;
  lote: string | null;
  quantidade_prevista: number;
  unidade: string;
};

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

type MetaTurno = {
  quantidade_meta: number;
  horas_produtivas: number;
  unidade: string;
};

type LinhaHora = {
  produto: string;
  plts: number;
  rolos: number;
  metragem: number;
  area: number;
};

type ResumoHora = {
  hora: string;
  plts: number;
  rolos: number;
  metragem: number;
  area: number;
  produtos: LinhaHora[];
  metaHora: number;
  realizadoAcumulado: number;
  saldoAcumulado: number;
};

function Programacao() {
  const { profile, user, canFinalizeGoals, canProgramProduction } = useAuth();
  const setor = profile?.setor_atual;
  const turno = profile?.turno_atual;
  const dataAtual = turno ? dataOperacional(turno) : "";
  const suportado = setor === "corte" || setor === "fitas" || setor === "mantas";
  const unidade = unidadeDoSetor(setor);
  const unidadeMeta = unidadeMetaTurno(setor);
  const horasBase = useMemo(() => horasProdutivasTurno(turno), [turno]);

  const [produtos, setProdutos] = useState<ProdutoCatalogo[]>([]);
  const [programacao, setProgramacao] = useState<ProgramacaoItem[]>([]);
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [registrosDia, setRegistrosDia] = useState<Registro[]>([]);
  const [metaTurno, setMetaTurno] = useState<MetaTurno | null>(null);
  const [produtoId, setProdutoId] = useState("");
  const [quantidade, setQuantidade] = useState("");
  const [metaDigitada, setMetaDigitada] = useState("");
  const [horasDigitadas, setHorasDigitadas] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [salvandoMeta, setSalvandoMeta] = useState(false);
  const cargaAtual = useRef(0);
  const [recarga, setRecarga] = useState(0);

  const produto = produtos.find((item) => item.id === produtoId) ?? null;

  useEffect(() => {
    const carga = ++cargaAtual.current;
    if (!setor || !turno || !dataAtual || !suportado) {
      setProdutos([]);
      setProgramacao([]);
      setRegistros([]);
      setRegistrosDia([]);
      setMetaTurno(null);
      setCarregando(false);
      return;
    }

    setCarregando(true);
    void Promise.all([
      obterProdutosAtivos(setor),
      (supabase as any)
        .from("programacao_producao")
        .select("id, setor, turno, data_local, produto_id, produto_nome, op, lote, quantidade_prevista, unidade")
        .eq("setor", setor)
        .eq("data_local", dataAtual)
        .eq("global_dia", true)
        .order("created_at", { ascending: true }),
      supabase
        .from("apontamentos")
        .select("id, turno, produto_id, produto_nome, op, lote, quantidade_plts, total_rolos, metragem, area_m2, data_hora_producao")
        .eq("setor", setor)
        .eq("data_local", dataAtual),
      (supabase as any)
        .from("metas_turno")
        .select("quantidade_meta, horas_produtivas, unidade")
        .eq("setor", setor)
        .eq("turno", turno)
        .eq("data_local", dataAtual)
        .maybeSingle(),
    ])
      .then(
        ([
          listaProdutos,
          resultadoProgramacao,
          resultadoRegistros,
          resultadoMeta,
        ]) => {
          if (carga !== cargaAtual.current) return;
          if (
            resultadoProgramacao.error ||
            resultadoRegistros.error
          ) {
            throw (
              resultadoProgramacao.error ||
              resultadoRegistros.error
            );
          }

          setProdutos(listaProdutos);
          setProgramacao((resultadoProgramacao.data ?? []) as ProgramacaoItem[]);
          const todosDia = (resultadoRegistros.data ?? []) as (Registro & { turno: string })[];
          setRegistrosDia(todosDia);
          setRegistros(todosDia.filter((item) => item.turno === turno));
          const meta = (resultadoMeta.data as MetaTurno | null) ?? null;
          setMetaTurno(meta);
          setMetaDigitada(meta ? formatarCampoNumero(Number(meta.quantidade_meta)) : "");
          setHorasDigitadas(meta ? formatarDuracaoHoras(Number(meta.horas_produtivas)) : "");
        },
      )
      .catch(() => {
        if (carga === cargaAtual.current) {
          toast.error("Não foi possível carregar o controle do turno.");
        }
      })
      .finally(() => {
        if (carga === cargaAtual.current) setCarregando(false);
      });
  }, [dataAtual, setor, suportado, turno, recarga]);

  const resumoProgramacao = useMemo(() => {
    return programacao.map((item) => {
      const realizado = registrosDia
        .filter((registro) => correspondeProgramacao(registro, item, setor))
        .reduce((total, registro) => total + valorRealizado(registro, setor), 0);
      const previsto = Number(item.quantidade_prevista ?? 0);
      return {
        ...item,
        previsto,
        realizado,
        saldo: previsto - realizado,
        aderencia: previsto > 0 ? (realizado / previsto) * 100 : 0,
      };
    });
  }, [programacao, registrosDia, setor]);

  const totais = useMemo(
    () =>
      resumoProgramacao.reduce(
        (acc, item) => ({
          previsto: acc.previsto + item.previsto,
          realizado: acc.realizado + item.realizado,
        }),
        { previsto: 0, realizado: 0 },
      ),
    [resumoProgramacao],
  );

  const metaTotal = Number(metaTurno?.quantidade_meta ?? 0);
  const duracaoProdutiva = Number(metaTurno?.horas_produtivas ?? 0);
  const metaPorHora = duracaoProdutiva > 0 ? metaTotal / duracaoProdutiva : 0;

  const horasAutomaticas = useMemo<ResumoHora[]>(() => {
    const mapa = new Map<string, Omit<ResumoHora, "metaHora" | "realizadoAcumulado" | "saldoAcumulado"> & { produtosMap: Map<string, LinhaHora> }>();
    for (const registro of registros) {
      const hora = horaCheiaProducao(registro.data_hora_producao);
      const atual = mapa.get(hora) ?? horaVazia(hora);
      atual.plts += Number(registro.quantidade_plts ?? 0);
      atual.rolos += Number(registro.total_rolos ?? 0);
      atual.metragem += Number(registro.metragem ?? 0);
      atual.area += Number(registro.area_m2 ?? 0);
      const linha = atual.produtosMap.get(registro.produto_nome) ?? linhaVazia(registro.produto_nome);
      linha.plts += Number(registro.quantidade_plts ?? 0);
      linha.rolos += Number(registro.total_rolos ?? 0);
      linha.metragem += Number(registro.metragem ?? 0);
      linha.area += Number(registro.area_m2 ?? 0);
      atual.produtosMap.set(registro.produto_nome, linha);
      mapa.set(hora, atual);
    }

    const horas = [...new Set([...(metaTurno ? horasBase : []), ...mapa.keys()])].sort(
      (a, b) => ordemHoraTurno(a, turno) - ordemHoraTurno(b, turno),
    );
    const horasPlanejadas = new Set(metaTurno ? horasBase : []);
    let metaAcumulada = 0;
    let realizadoAcumulado = 0;
    return horas.map((hora) => {
      const base = mapa.get(hora) ?? horaVazia(hora);
      const metaHora = horasPlanejadas.has(hora) ? metaPorHora : 0;
      const realizadoHora = valorMetaHora(base, setor);
      metaAcumulada += metaHora;
      realizadoAcumulado += realizadoHora;
      return {
        hora,
        plts: base.plts,
        rolos: base.rolos,
        metragem: base.metragem,
        area: base.area,
        produtos: [...base.produtosMap.values()].sort((a, b) => a.produto.localeCompare(b.produto)),
        metaHora,
        realizadoAcumulado,
        saldoAcumulado: realizadoAcumulado - metaAcumulada,
      };
    });
  }, [horasBase, metaPorHora, metaTurno, registros, setor, turno]);

  const realizadoTurno = useMemo(
    () => registros.reduce((total, registro) => total + valorMetaRegistro(registro, setor), 0),
    [registros, setor],
  );
  const atingimento = metaTotal > 0 ? (realizadoTurno / metaTotal) * 100 : 0;
  const percentualBarra = Math.min(100, Math.max(0, atingimento));
  const metaSimulada = numeroCampo(metaDigitada);
  const horasSimuladas = duracaoDoCampo(horasDigitadas);
  const metaHoraSimulada = metaSimulada > 0 && horasSimuladas > 0 ? metaSimulada / horasSimuladas : 0;

  function limparFormulario() {
    setProdutoId("");
    setQuantidade("");
  }

  async function salvarMetaTurno() {
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
    const { data, error } = await (supabase as any)
      .from("metas_turno")
      .upsert(
        {
          setor,
          turno,
          data_local: dataAtual,
          quantidade_meta: metaSimulada,
          unidade: unidadeMeta,
          horas_produtivas: Number(horasSimuladas.toFixed(2)),
          criado_por: user.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "setor,turno,data_local" },
      )
      .select("quantidade_meta, horas_produtivas, unidade")
      .single();
    setSalvandoMeta(false);

    if (error || !data) {
      toast.error(error?.message || "Não foi possível salvar a meta do turno.");
      return;
    }
    const metaSalva = data as MetaTurno;
    setMetaTurno(metaSalva);
    setMetaDigitada(formatarCampoNumero(Number(metaSalva.quantidade_meta)));
    setHorasDigitadas(formatarDuracaoHoras(Number(metaSalva.horas_produtivas)));
    toast.success("Meta do turno salva.");
  }

  async function salvarProgramacao() {
    if (!user || !setor || !turno || !produto || salvando) return;
    const qtd = numeroCampo(quantidade);
    if (!Number.isFinite(qtd) || qtd <= 0) {
      toast.error("Informe produto e quantidade prevista.");
      return;
    }

    setSalvando(true);
    const valores = {
      setor,
      turno,
      data_local: dataAtual,
      produto_id: produto.id,
      produto_nome: produto.nome,
      quantidade_prevista: qtd,
      unidade,
      global_dia: true,
      updated_at: new Date().toISOString(),
    };

    const consulta = (supabase as any)
      .from("programacao_producao")
      .update(valores)
      .eq("setor", setor)
      .eq("data_local", dataAtual)
      .eq("global_dia", true)
      .eq("produto_id", produto.id);
    const atualizado = await consulta.select("*").limit(1).maybeSingle();

    let resultado = atualizado;
    if (!atualizado.error && !atualizado.data) {
      resultado = await (supabase as any)
        .from("programacao_producao")
        .insert({ ...valores, op: null, lote: null, criado_por: user.id })
        .select("*")
        .single();
    }
    setSalvando(false);

    if (resultado.error || !resultado.data) {
      toast.error(resultado.error?.message || "Não foi possível salvar a programação.");
      return;
    }

    const salvo = resultado.data as ProgramacaoItem;
    setProgramacao((atuais) => {
      const semAtual = atuais.filter((item) => item.id !== salvo.id);
      return [...semAtual, salvo];
    });
    limparFormulario();
    toast.success("Programação salva.");
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
    toast.success(valor ? `${nome} atualizado${coluna === "op" ? "a" : ""}.` : `${nome} removid${coluna === "op" ? "a" : "o"}.`);
  }

  async function excluirProgramacao(item: ProgramacaoItem) {
    if (!window.confirm(`Excluir a programação de ${item.produto_nome}?`)) return;
    const { error } = await (supabase as any)
      .from("programacao_producao")
      .delete()
      .eq("id", item.id);
    if (error) {
      toast.error("Não foi possível excluir a programação.");
      return;
    }
    setProgramacao((atuais) => atuais.filter((atual) => atual.id !== item.id));
    toast.success("Programação removida.");
  }

  function editarHora(hora: string, campo: keyof EdicaoHora, valor: string) {
    setEdicoesHora((atuais) => ({
      ...atuais,
      [hora]: {
        meta: atuais[hora]?.meta ?? "",
        parada: atuais[hora]?.parada ?? "0",
        motivo: atuais[hora]?.motivo ?? "",
        [campo]: valor,
      },
    }));
  }

  async function salvarAjusteHora(hora: string) {
    if (!user || !setor || !turno || salvandoHora) return;
    const edicao = edicoesHora[hora] ?? { meta: "", parada: "0", motivo: "" };
    const meta = edicao.meta.trim() ? numeroCampo(edicao.meta) : null;
    const parada = Number(edicao.parada || 0);

    if (
      (meta != null && (!Number.isFinite(meta) || meta < 0)) ||
      !Number.isInteger(parada) ||
      parada < 0 ||
      parada > 60
    ) {
      toast.error("Revise a meta da hora e os minutos de parada.");
      return;
    }
    if (parada > 0 && !edicao.motivo.trim()) {
      toast.error("Informe o motivo da parada.");
      return;
    }

    setSalvandoHora(hora);
    const { data, error } = await (supabase as any)
      .from("programacao_hora")
      .upsert(
        {
          setor,
          turno,
          data_local: dataAtual,
          hora: Number(hora.slice(0, 2)),
          meta_hora: meta,
          parada_minutos: parada,
          motivo_parada: parada > 0 ? edicao.motivo.trim() : null,
          criado_por: user.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "setor,turno,data_local,hora" },
      )
      .select("id, hora, meta_hora, parada_minutos, motivo_parada")
      .single();
    setSalvandoHora(null);

    if (error || !data) {
      toast.error(error?.message || "Não foi possível salvar o controle da hora.");
      return;
    }
    const salvo = data as AjusteHora;
    setAjustesHora((atuais) => [
      ...atuais.filter((item) => item.hora !== salvo.hora),
      salvo,
    ]);
    toast.success(`${hora} atualizado.`);
  }

  const previsaoSelecionada = useMemo(() => {
    const qtd = numeroCampo(quantidade);
    if (!produto || !Number.isFinite(qtd) || qtd <= 0) return null;
    if (setor === "corte") {
      const unidades = qtd * Number(produto.rolos_por_plt ?? 0);
      const area = (Number(produto.largura ?? 0) * unidades) / 10;
      return `${fmt(qtd)} PLTs · ${fmt(unidades)} unidades · ${fmt(area)} m²`;
    }
    if (setor === "mantas") {
      const plts =
        Number(produto.metragem_por_plt ?? 0) > 0
          ? qtd / Number(produto.metragem_por_plt)
          : 0;
      const rolos =
        Number(produto.metros_por_rolo ?? 0) > 0 ? qtd / Number(produto.metros_por_rolo) : 0;
      return `${fmt(qtd)} m · ${fmt(plts)} PLTs · ${fmt(rolos)} rolos`;
    }
    return `${fmt(qtd)} m² previstos`;
  }, [produto, quantidade, setor]);

  if (!setor || !turno) {
    return (
      <AppShell title="Programação" eyebrow="PRODUÇÃO · PLANEJAMENTO">
        <Card>
          <CardContent className="p-5 text-sm text-muted-foreground">
            Escolha setor e turno antes de programar a produção.
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  if (!suportado) {
    return (
      <AppShell title="Programação" eyebrow="PRODUÇÃO · PLANEJAMENTO">
        <Card>
          <CardContent className="p-5 text-sm text-muted-foreground">
            A Programação está pronta para Corte, Fitas e Mantas. Os demais setores entram quando
            suas regras de produção forem definidas.
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell title="Programação" eyebrow="PRODUÇÃO · PLANEJAMENTO">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-extrabold sm:text-2xl">Produção hora a hora</h2>
            <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
              {formatarData(dataAtual)} · dados vindos dos apontamentos · {nomeSetor(setor)} · {nomeTurno(turno)}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-emerald-100 px-3 py-2 text-xs font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            Automático
          </span>
        </div>

        {carregando ? (
          <Card>
            <CardContent className="p-5 text-sm text-muted-foreground">
              Carregando controle do turno...
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue="hora" className="space-y-4">
            <TabsList className="grid h-auto w-full grid-cols-2 rounded-xl p-1">
              <TabsTrigger value="hora" className="min-h-10 px-1 text-[11px] sm:text-sm">
                Hora a hora
              </TabsTrigger>
              <TabsTrigger value="programacao" className="min-h-10 px-1 text-[11px] sm:text-sm">
                Programação
              </TabsTrigger>
            </TabsList>

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
                          <Label>Meta total ({unidadeMeta})</Label>
                          <Input
                            inputMode="decimal"
                            value={metaDigitada}
                            onChange={(event) => setMetaDigitada(event.target.value)}
                            placeholder="0"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Tempo produtivo</Label>
                          <Input
                            inputMode="decimal"
                            value={horasDigitadas}
                            onChange={(event) => setHorasDigitadas(normalizarDuracaoDigitada(event.target.value))}
                            placeholder="Ex.: 9:28"
                          />
                        </div>
                      </div>
                      <div className="rounded-xl bg-muted p-3 text-center">
                        <p className="text-[10px] font-bold uppercase text-muted-foreground">Previsto por hora</p>
                        <p className="mt-1 text-xl font-black text-primary">{fmt(metaHoraSimulada)} {unidadeMeta}</p>
                      </div>
                      <Button
                        className="w-full touch-manipulation"
                        disabled={salvandoMeta || metaSimulada <= 0 || horasSimuladas <= 0}
                        onClick={() => void salvarMetaTurno()}
                      >
                        <Save className="size-4" /> {salvandoMeta ? "Salvando..." : "Salvar meta do turno"}
                      </Button>
                    </>
                  ) : metaTurno ? (
                    <div className="grid grid-cols-2 gap-2">
                      <Resumo label="Meta" valor={`${fmt(metaTotal)} ${unidadeMeta}`} />
                      <Resumo label="Previsto por hora" valor={`${fmt(metaPorHora)} ${unidadeMeta}`} />
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">A meta deste turno ainda não foi definida.</p>
                  )}
                </CardContent>
              </Card>

              {canProgramProduction ? (
              <Card className="rounded-2xl border-border shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <CalendarDays className="size-5 text-primary" /> Produtos que vão rodar no dia
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Cadastre produto e quantidade prevista. A OP/lote é preenchida no primeiro apontamento.
                  </p>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label>Produto *</Label>
                    <ProdutoSelect
                      produtos={produtos}
                      value={produtoId}
                      onValueChange={setProdutoId}
                      placeholder="Selecione o produto"
                    />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label>Quantidade prevista ({unidade}) *</Label>
                    <Input
                      inputMode="decimal"
                      value={quantidade}
                      onChange={(e) => setQuantidade(e.target.value)}
                      placeholder="0"
                    />
                  </div>
                  {previsaoSelecionada && (
                    <div className="rounded-xl bg-muted p-3 text-sm font-semibold sm:col-span-2">
                      {previsaoSelecionada}
                    </div>
                  )}
                  <Button
                    className="h-11 sm:col-span-2"
                    disabled={salvando || !produtoId || !quantidade.trim()}
                    onClick={() => void salvarProgramacao()}
                  >
                    <Save className="size-4" /> {salvando ? "Salvando..." : "Adicionar à programação"}
                  </Button>
                </CardContent>
              </Card>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Programação global do dia (acumulada entre turnos). Somente administrador ou Programador de Produção pode alterar.
                </p>
              )}

              <div className="grid grid-cols-3 gap-2">
                <Resumo label="Previsto" valor={`${fmt(totais.previsto)} ${unidade}`} />
                <Resumo label="Realizado" valor={`${fmt(totais.realizado)} ${unidade}`} destaque />
                <Resumo
                  label="Saldo"
                  valor={`${fmt(totais.previsto - totais.realizado)} ${unidade}`}
                  alerta={totais.realizado < totais.previsto}
                />
              </div>

              <Card className="rounded-2xl border-border shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <PackageCheck className="size-5 text-primary" /> Programação do turno
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {resumoProgramacao.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Nenhum produto programado para este turno.
                    </p>
                  ) : (
                    resumoProgramacao.map((item) => (
                      <div key={item.id} className="rounded-xl border border-border bg-card p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate font-bold">{item.produto_nome}</p>
                            {(
                              <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                                <span>{setor === "mantas" ? (item.lote ? `Lote ${item.lote}` : "Lote: aguardando primeiro apontamento") : (item.op ? `OP ${item.op}` : "OP: aguardando primeiro apontamento")}</span>
                                {canProgramProduction && (
                                  <button
                                    type="button"
                                    className="font-semibold text-primary hover:underline"
                                    onClick={() => void editarReferencia(item.id, setor === "mantas" ? item.lote : item.op)}
                                  >
                                    {setor === "mantas" ? "Editar lote" : "Editar OP"}
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                          {canProgramProduction && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-8 shrink-0 text-red-600"
                            onClick={() => void excluirProgramacao(item)}
                            aria-label="Excluir programação"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                          )}
                        </div>
                        <div className="mt-3 grid grid-cols-4 gap-1.5 text-center">
                          <Mini label="Programado" valor={`${fmt(item.previsto)} ${item.unidade}`} />
                          <Mini label="Produzido no dia" valor={`${fmt(item.realizado)} ${item.unidade}`} destaque />
                          <Mini
                            label="Saldo"
                            valor={`${fmt(item.saldo)} ${item.unidade}`}
                            alerta={item.saldo > 0}
                          />
                          <Mini label="Aderência" valor={`${fmt(item.aderencia)}%`} />
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="hora" className="space-y-4">
              {setor ? (
                <AjustarHorarioApontamentos
                  registros={registros}
                  setor={setor}
                  onAjustado={() => setRecarga((v) => v + 1)}
                />
              ) : null}
              <div className="grid grid-cols-2 gap-3">
                <ResumoGrande label="Previsto" valor={`${fmt(metaTotal)} ${unidadeMeta}`} />
                <ResumoGrande label="Realizado" valor={`${fmt(realizadoTurno)} ${unidadeMeta}`} destaque />
                <ResumoGrande label="Atingimento" valor={`${fmt(atingimento)}%`} className="col-span-2" />
              </div>

              <Card className="rounded-2xl border-border shadow-sm">
                <CardContent className="p-4">
                  <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                    <strong>Produção acumulada do turno</strong>
                    <strong className="text-right text-primary">{fmt(realizadoTurno)} / {fmt(metaTotal)} {unidadeMeta}</strong>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${percentualBarra}%` }} />
                  </div>
                </CardContent>
              </Card>

              {!metaTurno && (
                <div className="rounded-xl border border-dashed border-border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
                  A meta deste turno ainda não foi definida. Use a aba Programação.
                </div>
              )}

              <div className="space-y-3">
                {horasAutomaticas.length === 0 ? (
                  <Card><CardContent className="p-5 text-sm text-muted-foreground">Nenhum apontamento registrado.</CardContent></Card>
                ) : horasAutomaticas.map((item) => (
                  <HoraCard key={item.hora} item={item} setor={setor} unidade={unidadeMeta} mostrarMeta={Boolean(metaTurno)} />
                ))}
              </div>
            </TabsContent>

          </Tabs>
        )}
      </div>
    </AppShell>
  );
}

function correspondeProgramacao(
  registro: Registro,
  item: ProgramacaoItem,
  setor?: string | null,
) {
  if (registro.produto_id !== item.produto_id) return false;
  if (setor === "mantas") return true;
  const opItem = normalizar(item.op);
  if (!opItem) return true;
  return normalizar(registro.op) === opItem;
}

function normalizar(valor: string | null | undefined) {
  return (valor ?? "").trim().toLocaleUpperCase("pt-BR");
}

function valorRealizado(item: Registro, setor?: string | null) {
  if (setor === "corte") return Number(item.quantidade_plts ?? 0);
  if (setor === "mantas") return Number(item.metragem ?? 0);
  if (setor === "fitas") return Number(item.area_m2 ?? 0);
  return 0;
}

function unidadeDoSetor(setor?: string | null) {
  if (setor === "corte") return "PLTs";
  if (setor === "mantas") return "m";
  return "m²";
}

function horaMinutoLocal(valor: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(valor));
}

function chaveHora(hora: number) {
  return `${String(hora).padStart(2, "0")}:00`;
}

function numeroCampo(valor: string) {
  const normalizado = valor
    .trim()
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  return Number(normalizado);
}

function fmt(valor: number) {
  return Number(valor || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function formatarData(valor: string) {
  const [ano, mes, dia] = valor.split("-");
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : valor;
}

function Resumo({
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
    <Card
      className={`rounded-xl ${
        alerta
          ? "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40"
          : destaque
            ? "border-primary/20 bg-primary/[0.04]"
            : "border-border"
      }`}
    >
      <CardContent className="p-2.5 text-center">
        <p className="text-[10px] font-bold uppercase text-muted-foreground">{label}</p>
        <p
          className={`mt-1 truncate text-sm font-black ${
            alerta ? "text-amber-800 dark:text-amber-200" : destaque ? "text-primary" : "text-foreground"
          }`}
        >
          {valor}
        </p>
      </CardContent>
    </Card>
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
        alerta
          ? "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
          : destaque
            ? "bg-primary/10 text-primary"
            : "bg-muted"
      }`}
    >
      <p className="text-[9px] uppercase text-muted-foreground">{label}</p>
      <p className="truncate text-xs font-bold">{valor}</p>
    </div>
  );
}
