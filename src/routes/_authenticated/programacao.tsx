import { createFileRoute, Link } from "@tanstack/react-router";
import {
  CalendarDays,
  ClipboardCopy,
  Clock3,
  MessageSquare,
  PackageCheck,
  Save,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

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

export const Route = createFileRoute("/_authenticated/programacao")({ component: Programacao });

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

type AjusteHora = {
  id: string;
  hora: number;
  meta_hora: number | null;
  parada_minutos: number;
  motivo_parada: string | null;
};

type Registro = {
  produto_id: string;
  produto_nome: string;
  op: string | null;
  lote: string | null;
  quantidade_plts: number | null;
  metragem: number | null;
  area_m2: number | null;
  data_hora_producao: string;
};

type MetaTurno = {
  quantidade_meta: number;
  horas_produtivas: number;
};

type Ocorrencia = {
  id: string;
  mensagem: string;
  created_at: string;
};

type EdicaoHora = {
  meta: string;
  parada: string;
  motivo: string;
};

function Programacao() {
  const { profile, user, canProgramProduction } = useAuth();
  const setor = profile?.setor_atual;
  const turno = profile?.turno_atual;
  const dataAtual = turno ? dataOperacional(turno) : "";
  const suportado = setor === "corte" || setor === "fitas" || setor === "mantas";
  const unidade = unidadeDoSetor(setor);
  const horasBase = useMemo(() => horasProdutivasTurno(turno), [turno]);

  const [produtos, setProdutos] = useState<ProdutoCatalogo[]>([]);
  const [programacao, setProgramacao] = useState<ProgramacaoItem[]>([]);
  const [ajustesHora, setAjustesHora] = useState<AjusteHora[]>([]);
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [registrosDia, setRegistrosDia] = useState<Registro[]>([]);
  const [metaTurno, setMetaTurno] = useState<MetaTurno | null>(null);
  const [ocorrencias, setOcorrencias] = useState<Ocorrencia[]>([]);
  const [produtoId, setProdutoId] = useState("");
  const [referencia, setReferencia] = useState("");
  const [quantidade, setQuantidade] = useState("");
  const [mensagemOcorrencia, setMensagemOcorrencia] = useState("");
  const [textoGerado, setTextoGerado] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [salvandoHora, setSalvandoHora] = useState<string | null>(null);
  const [salvandoOcorrencia, setSalvandoOcorrencia] = useState(false);
  const [edicoesHora, setEdicoesHora] = useState<Record<string, EdicaoHora>>({});
  const cargaAtual = useRef(0);

  const produto = produtos.find((item) => item.id === produtoId) ?? null;

  useEffect(() => {
    const carga = ++cargaAtual.current;
    if (!setor || !turno || !dataAtual || !suportado) {
      setProdutos([]);
      setProgramacao([]);
      setAjustesHora([]);
      setRegistros([]);
      setRegistrosDia([]);
      setMetaTurno(null);
      setOcorrencias([]);
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
      (supabase as any)
        .from("programacao_hora")
        .select("id, hora, meta_hora, parada_minutos, motivo_parada")
        .eq("setor", setor)
        .eq("turno", turno)
        .eq("data_local", dataAtual),
      supabase
        .from("apontamentos")
        .select("turno, produto_id, produto_nome, op, lote, quantidade_plts, metragem, area_m2, data_hora_producao")
        .eq("setor", setor)
        .eq("data_local", dataAtual),
      (supabase as any)
        .from("metas_turno")
        .select("quantidade_meta, horas_produtivas")
        .eq("setor", setor)
        .eq("turno", turno)
        .eq("data_local", dataAtual)
        .maybeSingle(),
      (supabase as any)
        .from("ocorrencias_turno")
        .select("id, mensagem, created_at")
        .eq("setor", setor)
        .eq("turno", turno)
        .eq("data_local", dataAtual)
        .order("created_at", { ascending: true }),
    ])
      .then(
        ([
          listaProdutos,
          resultadoProgramacao,
          resultadoHoras,
          resultadoRegistros,
          resultadoMeta,
          resultadoOcorrencias,
        ]) => {
          if (carga !== cargaAtual.current) return;
          if (
            resultadoProgramacao.error ||
            resultadoHoras.error ||
            resultadoRegistros.error ||
            resultadoOcorrencias.error
          ) {
            throw (
              resultadoProgramacao.error ||
              resultadoHoras.error ||
              resultadoRegistros.error ||
              resultadoOcorrencias.error
            );
          }

          setProdutos(listaProdutos);
          setProgramacao((resultadoProgramacao.data ?? []) as ProgramacaoItem[]);
          const horas = (resultadoHoras.data ?? []) as AjusteHora[];
          setAjustesHora(horas);
          const todosDia = (resultadoRegistros.data ?? []) as (Registro & { turno: string })[];
          setRegistrosDia(todosDia);
          setRegistros(todosDia.filter((item) => item.turno === turno));
          setMetaTurno((resultadoMeta.data as MetaTurno | null) ?? null);
          setOcorrencias((resultadoOcorrencias.data ?? []) as Ocorrencia[]);

          const edicoes: Record<string, EdicaoHora> = {};
          for (const item of horas) {
            const chave = chaveHora(item.hora);
            edicoes[chave] = {
              meta: item.meta_hora == null ? "" : String(Number(item.meta_hora)),
              parada: String(Number(item.parada_minutos ?? 0)),
              motivo: item.motivo_parada ?? "",
            };
          }
          setEdicoesHora(edicoes);
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
  }, [dataAtual, setor, suportado, turno]);

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

  const horasExibidas = useMemo(() => {
    const horasApontadas = registros.map((item) => horaCheiaProducao(item.data_hora_producao));
    const horasAjustadas = ajustesHora.map((item) => chaveHora(item.hora));
    return [...new Set([...horasBase, ...horasApontadas, ...horasAjustadas])].sort(
      (a, b) => ordemHoraTurno(a, turno) - ordemHoraTurno(b, turno),
    );
  }, [ajustesHora, horasBase, registros, turno]);

  const metaAutomatica = useMemo(() => {
    const total = Number(metaTurno?.quantidade_meta ?? 0);
    const horas = Math.min(Number(metaTurno?.horas_produtivas ?? 0), horasBase.length);
    return horas > 0 ? total / horas : 0;
  }, [horasBase.length, metaTurno]);

  function limparFormulario() {
    setProdutoId("");
    setReferencia("");
    setQuantidade("");
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
    setTextoGerado("");
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
    setTextoGerado("");
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
    setTextoGerado("");
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
    setTextoGerado("");
    toast.success(`${hora} atualizado.`);
  }

  async function salvarOcorrencia() {
    if (!user || !setor || !turno || salvandoOcorrencia) return;
    const mensagem = mensagemOcorrencia.trim();
    if (!mensagem) {
      toast.error("Digite a ocorrência antes de salvar.");
      return;
    }

    setSalvandoOcorrencia(true);
    const { data, error } = await (supabase as any)
      .from("ocorrencias_turno")
      .insert({
        setor,
        turno,
        data_local: dataAtual,
        mensagem,
        criado_por: user.id,
      })
      .select("id, mensagem, created_at")
      .single();
    setSalvandoOcorrencia(false);

    if (error || !data) {
      toast.error(error?.message || "Não foi possível salvar a ocorrência.");
      return;
    }

    setOcorrencias((atuais) => [...atuais, data as Ocorrencia]);
    setMensagemOcorrencia("");
    setTextoGerado("");
    toast.success("Ocorrência registrada.");
  }

  async function excluirOcorrencia(id: string) {
    const { error } = await (supabase as any).from("ocorrencias_turno").delete().eq("id", id);
    if (error) {
      toast.error("Não foi possível excluir a ocorrência.");
      return;
    }
    setOcorrencias((atuais) => atuais.filter((item) => item.id !== id));
    setTextoGerado("");
  }

  function gerarOcorrencias() {
    if (!setor || !turno) return;
    const linhas: string[] = [
      `OCORRÊNCIAS - ${nomeSetor(setor)} - ${nomeTurno(turno)} - ${formatarData(dataAtual)}`,
      "",
    ];

    if (ocorrencias.length > 0) {
      linhas.push("Ocorrências registradas:");
      for (const item of ocorrencias) {
        linhas.push(`• ${horaMinutoLocal(item.created_at)} - ${item.mensagem}`);
      }
      linhas.push("");
    }

    const paradas = [...ajustesHora]
      .filter((item) => Number(item.parada_minutos ?? 0) > 0)
      .sort((a, b) => ordemHoraTurno(chaveHora(a.hora), turno) - ordemHoraTurno(chaveHora(b.hora), turno));
    if (paradas.length > 0) {
      linhas.push("Paradas:");
      for (const item of paradas) {
        linhas.push(
          `• ${chaveHora(item.hora)} - ${item.parada_minutos} min - ${item.motivo_parada || "Sem motivo informado"}`,
        );
      }
      linhas.push("");
    }

    const comSaldo = resumoProgramacao.filter((item) => item.saldo > 0.0001);
    if (comSaldo.length > 0) {
      linhas.push("Programação com saldo:");
      for (const item of comSaldo) {
        const ref = item.lote ? ` - Lote ${item.lote}` : setor === "mantas" ? "" : ` - OP ${item.op ?? "—"}`;
        linhas.push(
          `• ${item.produto_nome}${ref}: previsto ${fmt(item.previsto)} ${item.unidade}, realizado ${fmt(item.realizado)} ${item.unidade}, saldo ${fmt(item.saldo)} ${item.unidade}`,
        );
      }
      linhas.push("");
    }

    if (ocorrencias.length === 0 && paradas.length === 0 && comSaldo.length === 0) {
      linhas.push("Sem ocorrências registradas no turno.");
    }

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
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-xl font-extrabold">Controle do turno</h2>
            <p className="text-xs text-muted-foreground">
              {nomeSetor(setor)} · {nomeTurno(turno)} · {formatarData(dataAtual)}
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/contagem">
              <Clock3 className="size-4" /> Contagem detalhada
            </Link>
          </Button>
        </div>

        {carregando ? (
          <Card>
            <CardContent className="p-5 text-sm text-muted-foreground">
              Carregando controle do turno...
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue="programacao" className="space-y-4">
            <TabsList className="grid h-auto w-full grid-cols-3 rounded-xl p-1">
              <TabsTrigger value="programacao" className="min-h-10 px-1 text-[11px] sm:text-sm">
                Programação do dia
              </TabsTrigger>
              <TabsTrigger value="hora" className="min-h-10 px-1 text-[11px] sm:text-sm">
                Hora a hora
              </TabsTrigger>
              <TabsTrigger value="ocorrencias" className="min-h-10 px-1 text-[11px] sm:text-sm">
                Ocorrências
              </TabsTrigger>
            </TabsList>

            <TabsContent value="programacao" className="space-y-4">
              {canProgramProduction ? (
              <Card className="rounded-2xl border-border shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <CalendarDays className="size-5 text-primary" /> Produtos que vão rodar no dia
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Cadastre a sequência planejada do turno por produto e OP/lote.
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
                            {setor === "mantas" ? (
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
                            ) : (
                              <p className="text-xs text-muted-foreground">OP {item.op ?? "—"}</p>
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
              <Card className="rounded-2xl border-border shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Clock3 className="size-5 text-primary" /> Planejamento hora a hora
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    A meta vem automaticamente da Meta do turno. Ajuste somente quando necessário e
                    registre paradas por horário.
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  {horasExibidas.map((hora) => {
                    const ajuste = ajustesHora.find(
                      (item) => item.hora === Number(hora.slice(0, 2)),
                    );
                    const edicao = edicoesHora[hora] ?? {
                      meta:
                        ajuste?.meta_hora == null ? "" : String(Number(ajuste.meta_hora)),
                      parada: String(Number(ajuste?.parada_minutos ?? 0)),
                      motivo: ajuste?.motivo_parada ?? "",
                    };
                    const dentroMeta =
                      metaTurno &&
                      horasBase
                        .slice(
                          0,
                          Math.min(Number(metaTurno.horas_produtivas), horasBase.length),
                        )
                        .includes(hora);
                    const previstoHora =
                      ajuste?.meta_hora == null
                        ? dentroMeta
                          ? metaAutomatica
                          : 0
                        : Number(ajuste.meta_hora);
                    const realizadoHora = registros
                      .filter((item) => horaCheiaProducao(item.data_hora_producao) === hora)
                      .reduce((total, item) => total + valorRealizado(item, setor), 0);
                    const saldoHora = previstoHora - realizadoHora;
                    return (
                      <div key={hora} className="rounded-xl border border-border bg-muted/40 p-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <div>
                            <p className="text-lg font-black">{hora}</p>
                            <p className="text-[11px] text-muted-foreground">
                              Previsto {fmt(previstoHora)} · Realizado {fmt(realizadoHora)} · Saldo{" "}
                              {fmt(saldoHora)} {unidade}
                            </p>
                          </div>
                          {Number(ajuste?.parada_minutos ?? 0) > 0 && (
                            <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                              Parada {ajuste?.parada_minutos} min
                            </span>
                          )}
                        </div>
                        <div className="grid gap-2 sm:grid-cols-[1fr_120px_1.5fr_auto]">
                          <div className="space-y-1">
                            <Label className="text-[11px]">Meta da hora ({unidade})</Label>
                            <Input
                              className="h-9"
                              inputMode="decimal"
                              value={edicao.meta}
                              onChange={(e) => editarHora(hora, "meta", e.target.value)}
                              placeholder={
                                metaAutomatica > 0 ? `Auto ${fmt(metaAutomatica)}` : "Automática"
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[11px]">Parada (min)</Label>
                            <Input
                              className="h-9"
                              type="number"
                              min={0}
                              max={60}
                              step={1}
                              value={edicao.parada}
                              onChange={(e) => editarHora(hora, "parada", e.target.value)}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[11px]">Motivo da parada</Label>
                            <Input
                              className="h-9"
                              value={edicao.motivo}
                              onChange={(e) => editarHora(hora, "motivo", e.target.value)}
                              placeholder="Ex.: ajuste de máquina"
                            />
                          </div>
                          <Button
                            className="h-9 self-end"
                            size="sm"
                            disabled={salvandoHora !== null}
                            onClick={() => void salvarAjusteHora(hora)}
                          >
                            {salvandoHora === hora ? "..." : <Save className="size-4" />}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="ocorrencias" className="space-y-4">
              <Card className="rounded-2xl border-border shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <MessageSquare className="size-5 text-primary" /> Registrar ocorrência
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Digite aqui qualquer observação importante do turno, como falha, retrabalho,
                    material, equipamento ou informação para a próxima equipe.
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <textarea
                    value={mensagemOcorrencia}
                    onChange={(e) => setMensagemOcorrencia(e.target.value)}
                    maxLength={1500}
                    rows={4}
                    placeholder="Ex.: L2 parada para ajuste técnico no equipamento..."
                    className="w-full resize-y rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-muted-foreground">
                      {mensagemOcorrencia.length}/1500
                    </span>
                    <Button
                      disabled={salvandoOcorrencia || !mensagemOcorrencia.trim()}
                      onClick={() => void salvarOcorrencia()}
                    >
                      <Save className="size-4" />
                      {salvandoOcorrencia ? "Salvando..." : "Registrar ocorrência"}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-2xl border-border shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Ocorrências registradas</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {ocorrencias.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Nenhuma ocorrência manual registrada neste turno.
                    </p>
                  ) : (
                    ocorrencias.map((item) => (
                      <div key={item.id} className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 p-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-primary">
                            {horaMinutoLocal(item.created_at)}
                          </p>
                          <p className="mt-1 whitespace-pre-wrap text-sm">{item.mensagem}</p>
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-8 shrink-0 text-red-600"
                          onClick={() => void excluirOcorrencia(item.id)}
                          aria-label="Excluir ocorrência"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-200">
                <div className="flex gap-2">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                  <p>
                    Ao gerar, o sistema reúne as mensagens acima, as paradas registradas no Hora a
                    hora e os produtos programados que ainda ficaram com saldo.
                  </p>
                </div>
              </div>

              <Button className="h-12 w-full text-base font-bold" onClick={gerarOcorrencias}>
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
  return normalizar(registro.op) === normalizar(item.op);
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
