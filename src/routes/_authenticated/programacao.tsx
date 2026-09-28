import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarDays, Clock3, PackageCheck, Save, Trash2, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { AppShell, nomeSetor, nomeTurno } from "@/components/dryko/app-shell";
import { ProdutoSelect } from "@/components/dryko/produto-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { dataOperacional, horasProdutivasTurno, ordemHoraTurno } from "@/lib/producao";
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
  created_at: string;
};

type MetaTurno = {
  quantidade_meta: number;
  horas_produtivas: number;
};

type EdicaoHora = {
  meta: string;
  parada: string;
  motivo: string;
};

function Programacao() {
  const { profile, user } = useAuth();
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
  const [metaTurno, setMetaTurno] = useState<MetaTurno | null>(null);
  const [produtoId, setProdutoId] = useState("");
  const [referencia, setReferencia] = useState("");
  const [quantidade, setQuantidade] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [salvandoHora, setSalvandoHora] = useState<string | null>(null);
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
        .eq("turno", turno)
        .eq("data_local", dataAtual)
        .order("created_at", { ascending: true }),
      (supabase as any)
        .from("programacao_hora")
        .select("id, hora, meta_hora, parada_minutos, motivo_parada")
        .eq("setor", setor)
        .eq("turno", turno)
        .eq("data_local", dataAtual),
      supabase
        .from("apontamentos")
        .select("produto_id, produto_nome, op, lote, quantidade_plts, metragem, area_m2, created_at")
        .eq("setor", setor)
        .eq("turno", turno)
        .eq("data_local", dataAtual),
      (supabase as any)
        .from("metas_turno")
        .select("quantidade_meta, horas_produtivas")
        .eq("setor", setor)
        .eq("turno", turno)
        .eq("data_local", dataAtual)
        .maybeSingle(),
    ])
      .then(([listaProdutos, resultadoProgramacao, resultadoHoras, resultadoRegistros, resultadoMeta]) => {
        if (carga !== cargaAtual.current) return;
        if (resultadoProgramacao.error || resultadoHoras.error || resultadoRegistros.error) {
          throw resultadoProgramacao.error || resultadoHoras.error || resultadoRegistros.error;
        }

        setProdutos(listaProdutos);
        setProgramacao((resultadoProgramacao.data ?? []) as ProgramacaoItem[]);
        const horas = (resultadoHoras.data ?? []) as AjusteHora[];
        setAjustesHora(horas);
        setRegistros((resultadoRegistros.data ?? []) as Registro[]);
        setMetaTurno((resultadoMeta.data as MetaTurno | null) ?? null);

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
      })
      .catch(() => {
        if (carga === cargaAtual.current) {
          toast.error("Não foi possível carregar a programação do turno.");
        }
      })
      .finally(() => {
        if (carga === cargaAtual.current) setCarregando(false);
      });
  }, [dataAtual, setor, suportado, turno]);

  const resumoProgramacao = useMemo(() => {
    return programacao.map((item) => {
      const realizado = registros
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
  }, [programacao, registros, setor]);

  const totais = useMemo(
    () => resumoProgramacao.reduce(
      (acc, item) => ({ previsto: acc.previsto + item.previsto, realizado: acc.realizado + item.realizado }),
      { previsto: 0, realizado: 0 },
    ),
    [resumoProgramacao],
  );

  const horasExibidas = useMemo(() => {
    const horasApontadas = registros.map((item) => horaLocal(item.created_at));
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
    const ref = referencia.trim();
    if (!ref || !Number.isFinite(qtd) || qtd <= 0) {
      toast.error(`Informe ${setor === "mantas" ? "o lote" : "a OP"}, produto e quantidade prevista.`);
      return;
    }

    setSalvando(true);
    const valores = {
      setor,
      turno,
      data_local: dataAtual,
      produto_id: produto.id,
      produto_nome: produto.nome,
      op: setor === "mantas" ? null : ref,
      lote: setor === "mantas" ? ref : null,
      quantidade_prevista: qtd,
      unidade,
      updated_at: new Date().toISOString(),
    };

    let consulta = (supabase as any)
      .from("programacao_producao")
      .update(valores)
      .eq("setor", setor)
      .eq("turno", turno)
      .eq("data_local", dataAtual)
      .eq("produto_id", produto.id);
    consulta = setor === "mantas" ? consulta.eq("lote", ref) : consulta.eq("op", ref);
    const atualizado = await consulta.select("*").maybeSingle();

    let resultado = atualizado;
    if (!atualizado.error && !atualizado.data) {
      resultado = await (supabase as any)
        .from("programacao_producao")
        .insert({ ...valores, criado_por: user.id })
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

  async function excluirProgramacao(item: ProgramacaoItem) {
    if (!window.confirm(`Excluir a programação de ${item.produto_nome}?`)) return;
    const { error } = await (supabase as any).from("programacao_producao").delete().eq("id", item.id);
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

    if ((meta != null && (!Number.isFinite(meta) || meta < 0)) || !Number.isInteger(parada) || parada < 0 || parada > 60) {
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
    setAjustesHora((atuais) => [...atuais.filter((item) => item.hora !== salvo.hora), salvo]);
    toast.success(`${hora} atualizado.`);
  }

  const previsaoSelecionada = useMemo(() => {
    const qtd = numeroCampo(quantidade);
    if (!produto || !Number.isFinite(qtd) || qtd <= 0) return null;
    if (setor === "corte") {
      const unidades = qtd * Number(produto.rolos_por_plt ?? 0);
      const area = Number(produto.largura ?? 0) * unidades / 10;
      return `${fmt(qtd)} PLTs · ${fmt(unidades)} unidades · ${fmt(area)} m²`;
    }
    if (setor === "mantas") {
      const plts = Number(produto.metragem_por_plt ?? 0) > 0 ? qtd / Number(produto.metragem_por_plt) : 0;
      const rolos = Number(produto.metros_por_rolo ?? 0) > 0 ? qtd / Number(produto.metros_por_rolo) : 0;
      return `${fmt(qtd)} m · ${fmt(plts)} PLTs · ${fmt(rolos)} rolos`;
    }
    return `${fmt(qtd)} m² previstos`;
  }, [produto, quantidade, setor]);

  if (!setor || !turno) {
    return (
      <AppShell title="Programação" eyebrow="PRODUÇÃO · PLANEJAMENTO">
        <Card><CardContent className="p-5 text-sm text-slate-500">Escolha setor e turno antes de programar a produção.</CardContent></Card>
      </AppShell>
    );
  }

  if (!suportado) {
    return (
      <AppShell title="Programação" eyebrow="PRODUÇÃO · PLANEJAMENTO">
        <Card><CardContent className="p-5 text-sm text-slate-500">A Programação está pronta para Corte, Fitas e Mantas. Os demais setores entram quando suas regras de produção forem definidas.</CardContent></Card>
      </AppShell>
    );
  }

  return (
    <AppShell title="Programação" eyebrow="PRODUÇÃO · PLANEJAMENTO">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-xl font-extrabold">Programação da produção</h2>
            <p className="text-xs text-slate-500">{nomeSetor(setor)} · {nomeTurno(turno)} · {formatarData(dataAtual)}</p>
          </div>
          <Button asChild variant="outline" size="sm"><Link to="/contagem"><Clock3 className="size-4" /> Hora a hora</Link></Button>
        </div>

        {carregando ? (
          <Card><CardContent className="p-5 text-sm text-slate-500">Carregando programação...</CardContent></Card>
        ) : (
          <>
            <Card className="rounded-2xl border-slate-200 shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><CalendarDays className="size-5 text-primary" /> Programar item</CardTitle></CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>{setor === "mantas" ? "Lote" : "OP"} *</Label>
                  <Input value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder={setor === "mantas" ? "Informe o lote" : "Informe a OP"} />
                </div>
                <div className="space-y-1">
                  <Label>Produto *</Label>
                  <ProdutoSelect produtos={produtos} value={produtoId} onValueChange={setProdutoId} placeholder="Selecione o produto" />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label>Quantidade prevista ({unidade}) *</Label>
                  <Input inputMode="decimal" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} placeholder="0" />
                </div>
                {previsaoSelecionada && <div className="rounded-xl bg-slate-50 p-3 text-sm font-semibold sm:col-span-2">{previsaoSelecionada}</div>}
                <Button className="h-11 sm:col-span-2" disabled={salvando || !produtoId || !referencia.trim() || !quantidade.trim()} onClick={() => void salvarProgramacao()}><Save className="size-4" /> {salvando ? "Salvando..." : "Salvar programação"}</Button>
              </CardContent>
            </Card>

            <div className="grid grid-cols-3 gap-2">
              <Resumo label="Previsto" valor={`${fmt(totais.previsto)} ${unidade}`} />
              <Resumo label="Realizado" valor={`${fmt(totais.realizado)} ${unidade}`} destaque />
              <Resumo label="Saldo" valor={`${fmt(totais.previsto - totais.realizado)} ${unidade}`} alerta={totais.realizado < totais.previsto} />
            </div>

            <Card className="rounded-2xl border-slate-200 shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><PackageCheck className="size-5 text-primary" /> Previsto × realizado</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {resumoProgramacao.length === 0 ? (
                  <p className="text-sm text-slate-500">Nenhum produto programado para este turno.</p>
                ) : resumoProgramacao.map((item) => (
                  <div key={item.id} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0"><p className="truncate font-bold">{item.produto_nome}</p><p className="text-xs text-slate-500">{item.lote ? `Lote ${item.lote}` : `OP ${item.op ?? "—"}`}</p></div>
                      <Button size="icon" variant="ghost" className="size-8 shrink-0 text-red-600" onClick={() => void excluirProgramacao(item)} aria-label="Excluir programação"><Trash2 className="size-4" /></Button>
                    </div>
                    <div className="mt-3 grid grid-cols-4 gap-1.5 text-center">
                      <Mini label="Previsto" valor={`${fmt(item.previsto)} ${item.unidade}`} />
                      <Mini label="Realizado" valor={`${fmt(item.realizado)} ${item.unidade}`} destaque />
                      <Mini label="Saldo" valor={`${fmt(item.saldo)} ${item.unidade}`} alerta={item.saldo > 0} />
                      <Mini label="Aderência" valor={`${fmt(item.aderencia)}%`} />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-slate-200 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base"><Clock3 className="size-5 text-primary" /> Planejamento hora a hora</CardTitle>
                <p className="text-xs text-slate-500">A meta vem automaticamente da Meta do turno. Preencha somente quando precisar ajustar uma hora ou registrar uma parada.</p>
              </CardHeader>
              <CardContent className="space-y-3">
                {horasExibidas.map((hora) => {
                  const ajuste = ajustesHora.find((item) => item.hora === Number(hora.slice(0, 2)));
                  const edicao = edicoesHora[hora] ?? { meta: ajuste?.meta_hora == null ? "" : String(Number(ajuste.meta_hora)), parada: String(Number(ajuste?.parada_minutos ?? 0)), motivo: ajuste?.motivo_parada ?? "" };
                  const dentroMeta = metaTurno && horasBase.slice(0, Math.min(Number(metaTurno.horas_produtivas), horasBase.length)).includes(hora);
                  const previstoHora = ajuste?.meta_hora == null ? (dentroMeta ? metaAutomatica : 0) : Number(ajuste.meta_hora);
                  const realizadoHora = registros.filter((item) => horaLocal(item.created_at) === hora).reduce((total, item) => total + valorRealizado(item, setor), 0);
                  const saldoHora = previstoHora - realizadoHora;
                  return (
                    <div key={hora} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                      <div className="mb-2 flex items-center justify-between gap-2"><div><p className="text-lg font-black">{hora}</p><p className="text-[11px] text-slate-500">Previsto {fmt(previstoHora)} · Realizado {fmt(realizadoHora)} · Saldo {fmt(saldoHora)} {unidade}</p></div>{Number(ajuste?.parada_minutos ?? 0) > 0 && <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold text-amber-800">Parada {ajuste?.parada_minutos} min</span>}</div>
                      <div className="grid gap-2 sm:grid-cols-[1fr_120px_1.5fr_auto]">
                        <div className="space-y-1"><Label className="text-[11px]">Meta da hora ({unidade})</Label><Input className="h-9 bg-white" inputMode="decimal" value={edicao.meta} onChange={(e) => editarHora(hora, "meta", e.target.value)} placeholder={metaAutomatica > 0 ? `Auto ${fmt(metaAutomatica)}` : "Automática"} /></div>
                        <div className="space-y-1"><Label className="text-[11px]">Parada (min)</Label><Input className="h-9 bg-white" type="number" min={0} max={60} step={1} value={edicao.parada} onChange={(e) => editarHora(hora, "parada", e.target.value)} /></div>
                        <div className="space-y-1"><Label className="text-[11px]">Motivo da parada</Label><Input className="h-9 bg-white" value={edicao.motivo} onChange={(e) => editarHora(hora, "motivo", e.target.value)} placeholder="Ex.: ajuste de máquina" /></div>
                        <Button className="h-9 self-end" size="sm" disabled={salvandoHora !== null} onClick={() => void salvarAjusteHora(hora)}>{salvandoHora === hora ? "..." : <Save className="size-4" />}</Button>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
              <div className="flex gap-2"><TriangleAlert className="mt-0.5 size-4 shrink-0" /><p>Os apontamentos continuam sendo o realizado oficial. A Programação só define o previsto e registra as paradas, sem alterar a produção já apontada.</p></div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

function correspondeProgramacao(registro: Registro, item: ProgramacaoItem, setor?: string | null) {
  if (registro.produto_id !== item.produto_id) return false;
  if (setor === "mantas") return normalizar(registro.lote) === normalizar(item.lote);
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

function horaLocal(valor: string) {
  const hora = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", hourCycle: "h23" }).format(new Date(valor));
  return `${hora}:00`;
}

function chaveHora(hora: number) {
  return `${String(hora).padStart(2, "0")}:00`;
}

function numeroCampo(valor: string) {
  const normalizado = valor.trim().replace(/\s/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
  return Number(normalizado);
}

function fmt(valor: number) {
  return Number(valor || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function formatarData(valor: string) {
  const [ano, mes, dia] = valor.split("-");
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : valor;
}

function Resumo({ label, valor, destaque = false, alerta = false }: { label: string; valor: string; destaque?: boolean; alerta?: boolean }) {
  return <Card className={`rounded-xl ${alerta ? "border-amber-200 bg-amber-50" : destaque ? "border-primary/20 bg-primary/[0.04]" : "border-slate-200"}`}><CardContent className="p-2.5 text-center"><p className="text-[10px] font-bold uppercase text-slate-500">{label}</p><p className={`mt-1 truncate text-sm font-black ${alerta ? "text-amber-800" : destaque ? "text-primary" : "text-slate-950"}`}>{valor}</p></CardContent></Card>;
}

function Mini({ label, valor, destaque = false, alerta = false }: { label: string; valor: string; destaque?: boolean; alerta?: boolean }) {
  return <div className={`rounded-lg p-2 ${alerta ? "bg-amber-50 text-amber-800" : destaque ? "bg-primary/10 text-primary" : "bg-slate-50"}`}><p className="text-[9px] uppercase text-slate-500">{label}</p><p className="truncate text-xs font-bold">{valor}</p></div>;
}
