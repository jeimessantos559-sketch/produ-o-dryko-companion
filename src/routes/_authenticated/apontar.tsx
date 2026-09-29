import { createFileRoute } from "@tanstack/react-router";
import { Plus, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/dryko/app-shell";
import { EmDefinicao } from "@/components/dryko/em-definicao";
import { HoraProducaoField } from "@/components/dryko/hora-producao-field";
import { ProdutoSelect } from "@/components/dryko/produto-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";
import { preencherLoteProgramacaoMantas } from "@/lib/programacao-lote";
import { ordenarProdutosPorMarca } from "@/lib/catalogo-produtos";
import {
  areaFitas,
  dataHoraProducaoPadrao,
  metragemCorte,
  rolosManta,
  totalPlts,
  totalRolos,
  type GrupoCorte,
} from "@/lib/producao";

export const Route = createFileRoute("/_authenticated/apontar")({
  component: Apontar,
  head: () => ({
    meta: [
      { title: "Apontar produção — DRYKO" },
      { name: "description", content: "Registrar apontamento de produção do turno." },
    ],
  }),
});

function ResumoEscuro({
  label,
  valor,
  pequeno,
}: {
  label: string;
  valor: string;
  pequeno?: boolean;
}) {
  return (
    <div className="px-2 py-3 text-center">
      <p className="text-[11px] font-bold uppercase opacity-70">{label}</p>
      <p className={pequeno ? "text-xs font-semibold" : "text-xl font-extrabold"}>{valor}</p>
    </div>
  );
}

type Produto = {
  id: string;
  nome: string;
  categoria: string | null;
  rolos_por_plt: number | null;
  largura: number | null;
  metragem_por_plt: number | null;
  metros_por_rolo: number | null;
};

const grupoInicial = (rolosPorPlt = 1): GrupoCorte => ({
  quantidadePlts: 1,
  rolosPorPlt,
  pltPicadoRolos: null,
});

function Apontar() {
  const { profile } = useAuth();
  if (profile?.setor_atual === "corte") return <ApontarCorte />;
  if (profile?.setor_atual === "fitas") return <ApontarFitas />;
  if (profile?.setor_atual === "mantas") return <ApontarMantas />;
  return (
    <AppShell>
      <EmDefinicao
        titulo="Apontar produção"
        descricao="As regras deste setor ainda aguardam definição. Nenhum campo ou cálculo foi inventado."
      />
    </AppShell>
  );
}

function useProdutos(setor: "corte" | "fitas" | "mantas") {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  useEffect(() => {
    setCarregando(true);
    setErro(false);
    void Promise.all([
      supabase
        .from("produtos")
        .select("id, nome, categoria, rolos_por_plt, largura, metragem_por_plt, metros_por_rolo")
        .eq("setor", setor)
        .eq("ativo", true),
      supabase.from("marcas_produto").select("nome, ordem").eq("setor", setor),
    ]).then(([resultadoProdutos, resultadoMarcas]) => {
      const falhou = Boolean(resultadoProdutos.error || resultadoMarcas.error);
      const lista = ordenarProdutosPorMarca(
        (resultadoProdutos.data ?? []) as Produto[],
        resultadoMarcas.data ?? [],
      );
      setProdutos(falhou ? [] : lista);
      setErro(falhou);
      setCarregando(false);
    });
  }, [setor]);
  return { produtos, carregando, erro };
}

type MetaAtiva = {
  id: string;
  quantidade_meta: number;
  unidade: string;
  created_at: string;
};

function useMetaAtiva(setor: "corte" | "fitas" | "mantas", op: string, produtoId: string) {
  const [meta, setMeta] = useState<MetaAtiva | null>(null);
  const [apontado, setApontado] = useState(0);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    let ativo = true;
    if (!op.trim() || !produtoId) {
      setMeta(null);
      setApontado(0);
      return () => {
        ativo = false;
      };
    }
    setCarregando(true);
    void supabase
      .from("metas_op")
      .select("id, quantidade_meta, unidade, created_at")
      .eq("setor", setor)
      .eq("op", op.trim())
      .eq("produto_id", produtoId)
      .eq("status", "ativa")
      .maybeSingle()
      .then(async ({ data }) => {
        if (!ativo) return;
        setMeta(data ?? null);
        if (data) {
          const { data: registros } = await supabase
            .from("apontamentos")
            .select("quantidade_plts, area_m2")
            .eq("setor", setor)
            .eq("op", op.trim())
            .eq("produto_id", produtoId)
            .gte("created_at", data.created_at);
          if (!ativo) return;
          setApontado(
            (registros ?? []).reduce(
              (total, item) =>
                total +
                (setor === "fitas" ? Number(item.area_m2 ?? 0) : (item.quantidade_plts ?? 0)),
              0,
            ),
          );
        } else {
          setApontado(0);
        }
        setCarregando(false);
      });
    return () => {
      ativo = false;
    };
  }, [op, produtoId, setor]);

  return { meta, apontado, carregando };
}

function confirmarExcessoDaMeta(meta: MetaAtiva | null, apontado: number, incremento: number) {
  if (!meta || apontado + incremento <= Number(meta.quantidade_meta)) return true;
  const excesso = apontado + incremento - Number(meta.quantidade_meta);
  return window.confirm(
    `Este apontamento ultrapassa a meta em ${excesso.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ${meta.unidade}. Deseja continuar?`,
  );
}

async function cadastrarMetaOpcional({
  userId,
  setor,
  op,
  produto,
  unidade,
  quantidade,
  metaExistente,
}: {
  userId: string;
  setor: "corte" | "fitas" | "mantas";
  op: string;
  produto: Produto;
  unidade: "PLTs" | "m²";
  quantidade: number;
  metaExistente: MetaAtiva | null;
}) {
  if (quantidade <= 0 || metaExistente) return true;
  const { error } = await supabase.from("metas_op").insert({
    setor,
    op: op.trim(),
    produto_id: produto.id,
    produto_nome: produto.nome,
    unidade,
    quantidade_meta: quantidade,
    criado_por: userId,
  });
  if (error && error.code !== "23505") {
    toast.warning("O apontamento foi salvo, mas não foi possível cadastrar a meta da OP.");
    return false;
  }
  return true;
}

function CampoMeta({
  meta,
  carregando,
  valor,
  onChange,
  unidade,
}: {
  meta: MetaAtiva | null;
  carregando: boolean;
  valor: number;
  onChange: (valor: number) => void;
  unidade: "PLTs" | "m²";
}) {
  return (
    <div className="space-y-1 sm:col-span-2">
      <Label htmlFor={`meta-${unidade}`}>Meta da OP (opcional)</Label>
      {carregando ? (
        <div className="rounded-md bg-muted p-3 text-sm">Consultando meta ativa...</div>
      ) : meta ? (
        <div className="rounded-md border border-green-300 bg-green-50 p-3 text-sm font-medium text-green-800">
          Meta ativa nos três turnos: {Number(meta.quantidade_meta).toLocaleString("pt-BR")}{" "}
          {meta.unidade}
        </div>
      ) : (
        <Input
          id={`meta-${unidade}`}
          type="number"
          min={0}
          step={unidade === "PLTs" ? 1 : 0.01}
          placeholder={`Ex.: ${unidade === "PLTs" ? "20" : "1500"}`}
          value={valor || ""}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      )}
    </div>
  );
}

function mensagemApontamento(error: { message?: string } | null) {
  const mensagem = error?.message ?? "";
  const normalizada = mensagem.toLocaleLowerCase("pt-BR");
  if (normalizada.includes("turno esta fechado")) {
    return "Este turno está fechado. Peça a reabertura ao administrador.";
  }
  if (normalizada.includes("horario") && normalizada.includes("turno")) return "A hora real informada não pertence ao turno selecionado.";
  if (normalizada.includes("futuro")) return "A hora real da produção não pode estar no futuro.";
  return "Não foi possível salvar o apontamento. Revise os dados e tente novamente.";
}

function ApontarCorte() {
  const { user, profile } = useAuth();
  const { produtos, carregando, erro } = useProdutos("corte");
  const [op, setOp] = useState("");
  const [produtoId, setProdutoId] = useState("");
  const [grupos, setGrupos] = useState<GrupoCorte[]>([grupoInicial()]);
  const [salvando, setSalvando] = useState(false);
  const [metaNova, setMetaNova] = useState(0);
  const [ultimoSalvo, setUltimoSalvo] = useState<string | null>(null);
  const [dataHoraProducao, setDataHoraProducao] = useState(dataHoraProducaoPadrao);
  const enviando = useRef(false);
  const produto = produtos.find((item) => item.id === produtoId);
  const { meta, apontado, carregando: carregandoMeta } = useMetaAtiva("corte", op, produtoId);
  const quantidade = useMemo(() => totalPlts(grupos), [grupos]);
  const rolos = useMemo(() => totalRolos(grupos), [grupos]);
  const gruposValidos = grupos.every(
    (grupo) =>
      Number.isInteger(grupo.quantidadePlts) &&
      grupo.quantidadePlts >= 1 &&
      Number.isInteger(grupo.rolosPorPlt) &&
      grupo.rolosPorPlt >= 1 &&
      (grupo.pltPicadoRolos === null ||
        (Number.isInteger(grupo.pltPicadoRolos) &&
          grupo.pltPicadoRolos >= 1 &&
          grupo.pltPicadoRolos < grupo.rolosPorPlt)),
  );
  const valido = Boolean(
    dataHoraProducao && op.trim() && produto && gruposValidos && quantidade >= 1 && quantidade <= 20 && rolos > 0,
  );

  function escolherProduto(id: string) {
    setProdutoId(id);
    const escolhido = produtos.find((item) => item.id === id);
    setGrupos([grupoInicial(escolhido?.rolos_por_plt ?? 1)]);
  }

  function atualizarGrupo(indice: number, alteracao: Partial<GrupoCorte>) {
    setGrupos((atuais) =>
      atuais.map((grupo, i) => (i === indice ? { ...grupo, ...alteracao } : grupo)),
    );
  }

  async function repetirUltimo() {
    if (!user || !profile?.turno_atual) return;
    const { data, error } = await supabase
      .from("apontamentos")
      .select("op, produto_id, grupos")
      .eq("usuario_id", user.id)
      .eq("setor", "corte")
      .eq("turno", profile.turno_atual)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      toast.error("Não foi possível consultar o último apontamento.");
      return;
    }
    if (!data || !Array.isArray(data.grupos)) {
      toast.info("Ainda não há apontamento para repetir.");
      return;
    }
    setOp(data.op ?? "");
    setProdutoId(data.produto_id);
    setGrupos(data.grupos as unknown as GrupoCorte[]);
    setUltimoSalvo(null);
    toast.info("Dados copiados para um novo formulário. Revise e toque em Salvar.");
  }

  async function salvar() {
    if (!valido || !user || !profile?.turno_atual || enviando.current) return;
    if (!confirmarExcessoDaMeta(meta, apontado, quantidade)) return;
    enviando.current = true;
    setSalvando(true);
    const { data, error } = await supabase
      .from("apontamentos")
      .insert({
        usuario_id: user.id,
        setor: "corte",
        turno: profile.turno_atual,
        data_hora_producao: dataHoraProducao,
        op: op.trim(),
        produto_id: produtoId,
        produto_nome: produto!.nome,
        quantidade_plts: quantidade,
        rolos_por_plt: produto!.rolos_por_plt,
        total_rolos: rolos,
        largura: produto!.largura,
        grupos: grupos as unknown as Json,
      })
      .select("sequencia_inicio, sequencia_fim")
      .single();
    setSalvando(false);
    enviando.current = false;
    if (error) {
      toast.error(mensagemApontamento(error));
      return;
    }
    await cadastrarMetaOpcional({
      userId: user.id,
      setor: "corte",
      op,
      produto: produto!,
      unidade: "PLTs",
      quantidade: metaNova,
      metaExistente: meta,
    });
    setUltimoSalvo(`PLTs ${data.sequencia_inicio}–${data.sequencia_fim} registrados com sucesso.`);
    setOp("");
    setProdutoId("");
    setGrupos([grupoInicial()]);
    setMetaNova(0);
    setDataHoraProducao(dataHoraProducaoPadrao());
    toast.success("Apontamento salvo e painel atualizado.");
  }

  const largura =
    produto?.largura != null && Number(produto.largura) > 0 ? Number(produto.largura) : null;
  const metragem = largura === null ? null : metragemCorte(largura, rolos);
  const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-3">
        <div className="flex items-center justify-between gap-2 border-b-2 border-primary pb-2">
          <div>
            <h1 className="text-xl font-extrabold uppercase tracking-tight">Apontar Corte</h1>
            <p className="text-xs text-muted-foreground">
              Turno {profile?.turno_atual ?? "—"} · 1 a 20 PLTs
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={repetirUltimo}>
            <RotateCcw /> Repetir último
          </Button>
        </div>
        {ultimoSalvo && (
          <div
            role="status"
            className="rounded-md border-l-4 border-green-600 bg-green-50 px-3 py-2 text-sm font-semibold text-green-800"
          >
            {ultimoSalvo}
          </div>
        )}
        {erro && (
          <div
            role="alert"
            className="rounded-md border-l-4 border-destructive bg-red-50 px-3 py-2 text-sm font-medium text-red-800"
          >
            Não foi possível carregar o catálogo. Tente novamente em instantes.
          </div>
        )}

        <section className="space-y-3">
          <HoraProducaoField id="hora-producao-corte" value={dataHoraProducao} onChange={setDataHoraProducao} />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="op" className="text-xs font-bold uppercase">
                OP *
              </Label>
              <Input
                id="op"
                inputMode="numeric"
                value={op}
                onChange={(e) => setOp(e.target.value)}
                className="h-12 text-base font-semibold"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="produto" className="text-xs font-bold uppercase">
                Produto *
              </Label>
              <ProdutoSelect
                id="produto"
                produtos={produtos}
                value={produtoId}
                onValueChange={escolherProduto}
                carregando={carregando}
              />
            </div>
          </div>
          {produto && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-md bg-muted px-3 py-2 text-sm">
              <span>
                Padrão: <strong>{produto.rolos_por_plt} rolos/PLT</strong>
              </span>
              <span data-testid="largura-produto">
                Largura:{" "}
                {largura === null ? (
                  <strong className="text-amber-700">aguardando definição</strong>
                ) : (
                  <strong>{fmt(largura)} cm</strong>
                )}
              </span>
            </div>
          )}
          <CampoMeta
            meta={meta}
            carregando={carregandoMeta}
            valor={metaNova}
            onChange={setMetaNova}
            unidade="PLTs"
          />
        </section>

        {produto && (
          <section className="space-y-2">
            <h2 className="text-xs font-bold uppercase text-muted-foreground">PLTs</h2>
            {grupos.map((grupo, indice) => (
              <div key={indice} className="rounded-md border border-input p-2">
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[11px] uppercase">Qtd. PLTs</Label>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={20}
                      className="h-11 text-base font-semibold"
                      value={grupo.quantidadePlts}
                      onChange={(e) =>
                        atualizarGrupo(indice, { quantidadePlts: Number(e.target.value) })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] uppercase">Rolos/PLT</Label>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      className="h-11 text-base font-semibold"
                      value={grupo.rolosPorPlt}
                      onChange={(e) =>
                        atualizarGrupo(indice, { rolosPorPlt: Number(e.target.value) })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] uppercase">PLT picado</Label>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={Math.max(1, grupo.rolosPorPlt - 1)}
                      placeholder="—"
                      className="h-11 text-base font-semibold"
                      value={grupo.pltPicadoRolos ?? ""}
                      onChange={(e) =>
                        atualizarGrupo(indice, {
                          pltPicadoRolos: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                    />
                  </div>
                </div>
                {grupos.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mt-1 text-destructive"
                    onClick={() => setGrupos((atuais) => atuais.filter((_, i) => i !== indice))}
                  >
                    <Trash2 /> Remover
                  </Button>
                )}
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={quantidade >= 20}
              onClick={() =>
                setGrupos((atuais) => [...atuais, grupoInicial(produto.rolos_por_plt ?? 1)])
              }
            >
              <Plus /> Grupo com outra quantidade
            </Button>
          </section>
        )}

        <section className="grid grid-cols-3 divide-x divide-sidebar-border overflow-hidden rounded-md bg-sidebar text-sidebar-foreground">
          <ResumoEscuro label="PLTs" valor={String(quantidade)} />
          <ResumoEscuro label="Rolos" valor={rolos.toLocaleString("pt-BR")} />
          <ResumoEscuro
            label="Produção"
            valor={metragem === null ? "Aguardando largura" : `${fmt(metragem)} m²`}
            pequeno={metragem === null}
          />
        </section>
        {largura !== null && rolos > 0 && (
          <p className="text-xs text-muted-foreground">
            {fmt(largura)} cm × {rolos.toLocaleString("pt-BR")} rolos ÷ 10 = {fmt(metragem ?? 0)} m²
          </p>
        )}
        {quantidade > 20 && (
          <p className="text-sm font-medium text-destructive">
            O limite é de 20 PLTs por apontamento.
          </p>
        )}
        {!gruposValidos && (
          <p className="text-sm font-medium text-destructive">
            Revise as quantidades. O PLT picado deve ter menos rolos que o padrão do grupo.
          </p>
        )}
        <Button
          className="sticky bottom-3 h-14 w-full text-lg font-extrabold uppercase shadow-lg"
          disabled={!valido || salvando}
          onClick={salvar}
        >
          {salvando ? "Apontando..." : "Apontar"}
        </Button>
      </div>
    </AppShell>
  );
}

function ApontarMantas() {
  const { user, profile } = useAuth();
  const { produtos, carregando, erro } = useProdutos("mantas");
  const [op, setOp] = useState("");
  const [produtoId, setProdutoId] = useState("");
  const [lote, setLote] = useState("");
  const [metragem, setMetragem] = useState(0);
  const [quantidadePlts, setQuantidadePlts] = useState(1);
  const [salvando, setSalvando] = useState(false);
  const [metaNova, setMetaNova] = useState(0);
  const [ultimoSalvo, setUltimoSalvo] = useState<string | null>(null);
  const [dataHoraProducao, setDataHoraProducao] = useState(dataHoraProducaoPadrao);
  const enviando = useRef(false);
  const produto = produtos.find((item) => item.id === produtoId);
  const { meta, apontado, carregando: carregandoMeta } = useMetaAtiva("mantas", op, produtoId);
  const metrosPorRolo = produto?.metros_por_rolo ?? 10;
  const rolos = rolosManta(metragem, metrosPorRolo);
  const rolosInteiros = Number.isInteger(rolos) && rolos > 0;
  const valido = Boolean(
    dataHoraProducao &&
    op.trim() &&
    produto &&
    lote.trim() &&
    metragem > 0 &&
    Number.isInteger(quantidadePlts) &&
    quantidadePlts > 0 &&
    rolosInteiros,
  );
  function escolherProduto(id: string) {
    setProdutoId(id);
    const escolhido = produtos.find((item) => item.id === id);
    setQuantidadePlts(1);
    setMetragem(escolhido?.metragem_por_plt ?? 0);
    setUltimoSalvo(null);
  }

  function alterarPlts(valor: number) {
    setQuantidadePlts(valor);
    if (produto?.metragem_por_plt && valor > 0) {
      setMetragem(produto.metragem_por_plt * valor);
    }
  }

  async function repetirUltimo() {
    if (!user || !profile?.turno_atual) return;
    const { data, error } = await supabase
      .from("apontamentos")
      .select("op, lote, produto_id, quantidade_plts, metragem")
      .eq("usuario_id", user.id)
      .eq("setor", "mantas")
      .eq("turno", profile.turno_atual)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      toast.error("Não foi possível consultar o último apontamento.");
      return;
    }
    if (!data) {
      toast.info("Ainda não há apontamento de Mantas para repetir.");
      return;
    }
    setOp(data.op ?? "");
    setLote(data.lote ?? "");
    setProdutoId(data.produto_id);
    setQuantidadePlts(data.quantidade_plts ?? 1);
    setMetragem(Number(data.metragem ?? 0));
    setMetaNova(0);
    setUltimoSalvo(null);
    toast.info("Dados copiados. Revise lote e quantidades antes de salvar.");
  }

  async function salvar() {
    if (!valido || !user || !profile?.turno_atual || !produto || enviando.current) return;
    if (!confirmarExcessoDaMeta(meta, apontado, quantidadePlts)) return;
    enviando.current = true;
    setSalvando(true);
    const { data, error } = await supabase
      .from("apontamentos")
      .insert({
        usuario_id: user.id,
        setor: "mantas",
        turno: profile.turno_atual,
        data_hora_producao: dataHoraProducao,
        op: op.trim(),
        lote: lote.trim(),
        produto_id: produto.id,
        produto_nome: produto.nome,
        quantidade_plts: quantidadePlts,
        rolos_por_plt: produto.rolos_por_plt,
        total_rolos: rolos,
        metragem,
      })
      .select("sequencia_inicio, sequencia_fim, data_local")
      .single();
    setSalvando(false);
    enviando.current = false;
    if (error) {
      toast.error(mensagemApontamento(error));
      return;
    }
    void preencherLoteProgramacaoMantas({
      dataLocal: (data as { data_local?: string | null }).data_local,
      produtoId: produto.id,
      lote,
    });
    await cadastrarMetaOpcional({
      userId: user.id,
      setor: "mantas",
      op,
      produto,
      unidade: "PLTs",
      quantidade: metaNova,
      metaExistente: meta,
    });
    setUltimoSalvo(`PLTs ${data.sequencia_inicio}–${data.sequencia_fim} registrados com sucesso.`);
    setProdutoId("");
    setOp("");
    setLote("");
    setMetragem(0);
    setQuantidadePlts(1);
    setMetaNova(0);
    setDataHoraProducao(dataHoraProducaoPadrao());
    toast.success("Apontamento de Mantas salvo.");
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold">Apontamento de Mantas</h1>
            <p className="text-sm text-muted-foreground">
              Informe a metragem; cada rolo de manta corresponde a {metrosPorRolo} m.
            </p>
          </div>
          <Button variant="outline" onClick={repetirUltimo}>
            <RotateCcw /> Repetir último
          </Button>
        </div>
        {ultimoSalvo && (
          <div
            role="status"
            className="rounded-lg border border-green-300 bg-green-50 p-3 text-sm font-medium text-green-800"
          >
            {ultimoSalvo}
          </div>
        )}
        {erro && (
          <div
            role="alert"
            className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm font-medium text-red-800"
          >
            Não foi possível carregar o catálogo de Mantas.
          </div>
        )}
        <Card>
          <CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
            <div className="sm:col-span-2"><HoraProducaoField id="hora-producao-mantas" value={dataHoraProducao} onChange={setDataHoraProducao} /></div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="op-manta">OP *</Label>
              <Input
                id="op-manta"
                value={op}
                onChange={(e) => setOp(e.target.value)}
                className="h-12 text-base"
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="produto-manta">Produto *</Label>
              <ProdutoSelect
                id="produto-manta"
                produtos={produtos}
                value={produtoId}
                onValueChange={escolherProduto}
                carregando={carregando}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="lote-manta">Lote *</Label>
              <Input
                id="lote-manta"
                value={lote}
                onChange={(e) => setLote(e.target.value)}
                className="h-12 text-base"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="metragem-manta">Metragem *</Label>
              <Input
                id="metragem-manta"
                type="number"
                min={metrosPorRolo}
                step={metrosPorRolo}
                value={metragem || ""}
                onChange={(e) => setMetragem(Number(e.target.value))}
                className="h-12 text-base"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="plts-manta">PLT(s) *</Label>
              <Input
                id="plts-manta"
                type="number"
                min={1}
                step={1}
                value={quantidadePlts || ""}
                onChange={(e) => alterarPlts(Number(e.target.value))}
                className="h-12 text-base"
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="rolos-manta">Rolos de manta</Label>
              <Input
                id="rolos-manta"
                value={rolosInteiros ? rolos : ""}
                readOnly
                className="h-12 bg-muted text-base font-semibold"
              />
            </div>
            {produto && (
              <div className="rounded-md bg-muted p-3 text-sm sm:col-span-2">
                <strong>{produto.categoria ?? "Mantas"}:</strong>{" "}
                {produto.metragem_por_plt?.toLocaleString("pt-BR")} m/PLT · {produto.rolos_por_plt}{" "}
                rolos/PLT
              </div>
            )}
            <CampoMeta
              meta={meta}
              carregando={carregandoMeta}
              valor={metaNova}
              onChange={setMetaNova}
              unidade="PLTs"
            />
          </CardContent>
        </Card>
        {metragem > 0 && !rolosInteiros && (
          <p className="text-sm font-medium text-destructive">
            A metragem deve ser múltipla de {metrosPorRolo} m para formar rolos inteiros.
          </p>
        )}
        <Button className="h-14 w-full text-base" disabled={!valido || salvando} onClick={salvar}>
          {salvando ? "Apontando..." : "Apontar"}
        </Button>
      </div>
    </AppShell>
  );
}

function ApontarFitas() {
  const { user, profile } = useAuth();
  const { produtos, carregando, erro } = useProdutos("fitas");
  const [op, setOp] = useState("");
  const [produtoId, setProdutoId] = useState("");
  const [tempo, setTempo] = useState(0);
  const [velocidade, setVelocidade] = useState(0);
  const [largura, setLargura] = useState(0.93);
  const [salvando, setSalvando] = useState(false);
  const [metaNova, setMetaNova] = useState(0);
  const [dataHoraProducao, setDataHoraProducao] = useState(dataHoraProducaoPadrao);
  const enviando = useRef(false);
  const area = areaFitas(tempo, velocidade, largura);
  const produto = produtos.find((item) => item.id === produtoId);
  const { meta, apontado, carregando: carregandoMeta } = useMetaAtiva("fitas", op, produtoId);

  function escolherProduto(id: string) {
    setProdutoId(id);
    const escolhido = produtos.find((item) => item.id === id);
    setLargura(escolhido?.largura ?? 0.93);
  }

  async function salvar() {
    if (!user || !profile?.turno_atual || !produto || !op.trim() || !dataHoraProducao || area <= 0 || enviando.current)
      return;
    if (!confirmarExcessoDaMeta(meta, apontado, area)) return;
    enviando.current = true;
    setSalvando(true);
    const { error } = await supabase.from("apontamentos").insert({
      usuario_id: user.id,
      setor: "fitas",
      turno: profile.turno_atual,
      data_hora_producao: dataHoraProducao,
      op: op.trim(),
      produto_id: produto.id,
      produto_nome: produto.nome,
      tempo,
      velocidade,
      largura,
      area_m2: area,
    });
    setSalvando(false);
    enviando.current = false;
    if (error) {
      toast.error(mensagemApontamento(error));
      return;
    }
    await cadastrarMetaOpcional({
      userId: user.id,
      setor: "fitas",
      op,
      produto,
      unidade: "m²",
      quantidade: metaNova,
      metaExistente: meta,
    });
    toast.success("Apontamento de Fitas salvo.");
    setOp("");
    setProdutoId("");
    setTempo(0);
    setVelocidade(0);
    setLargura(0.93);
    setMetaNova(0);
    setDataHoraProducao(dataHoraProducaoPadrao());
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-4">
        <div>
          <h1 className="text-2xl font-bold">Apontamento de Fitas</h1>
          <p className="text-sm text-muted-foreground">
            Fórmula própria: tempo × velocidade × largura = m²
          </p>
        </div>
        {erro && (
          <div
            role="alert"
            className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm font-medium text-red-800"
          >
            Não foi possível carregar o catálogo. Tente novamente em instantes.
          </div>
        )}
        {!carregando && produtos.length === 0 && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm font-medium text-amber-900">
            Catálogo de produtos aguardando definição. O cálculo pode ser testado, mas o salvamento
            final permanece bloqueado.
          </div>
        )}
        <Card>
          <CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
            <div className="sm:col-span-2"><HoraProducaoField id="hora-producao-fitas" value={dataHoraProducao} onChange={setDataHoraProducao} /></div>
            <div className="space-y-1">
              <Label>OP *</Label>
              <Input value={op} onChange={(e) => setOp(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Produto *</Label>
              <ProdutoSelect
                produtos={produtos}
                value={produtoId}
                onValueChange={escolherProduto}
                carregando={carregando}
                placeholder="Aguardando catálogo"
              />
            </div>
            <div className="space-y-1">
              <Label>Tempo</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={tempo || ""}
                onChange={(e) => setTempo(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1">
              <Label>Velocidade</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={velocidade || ""}
                onChange={(e) => setVelocidade(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1">
              <Label>Largura (m)</Label>
              <Input
                type="number"
                min={0.01}
                step="0.01"
                value={largura}
                onChange={(e) => setLargura(Number(e.target.value))}
              />
            </div>
            <div className="rounded-md bg-muted p-3">
              <span className="text-xs text-muted-foreground">Resultado</span>
              <p className="text-2xl font-bold">
                {area.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m²
              </p>
            </div>
            <CampoMeta
              meta={meta}
              carregando={carregandoMeta}
              valor={metaNova}
              onChange={setMetaNova}
              unidade="m²"
            />
          </CardContent>
        </Card>
        <Button
          className="h-14 w-full"
          disabled={!produto || !op.trim() || !dataHoraProducao || area <= 0 || salvando}
          onClick={salvar}
        >
          {salvando ? "Apontando..." : "Apontar"}
        </Button>
      </div>
    </AppShell>
  );
}

function Resumo({ label, valor }: { label: string; valor: string | number }) {
  return (
    <div className="rounded-md bg-muted p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-semibold">{valor}</p>
    </div>
  );
}
