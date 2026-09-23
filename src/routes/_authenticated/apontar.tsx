import { createFileRoute } from "@tanstack/react-router";
import { Plus, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/dryko/app-shell";
import { EmDefinicao } from "@/components/dryko/em-definicao";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";
import { areaFitas, rolosManta, totalPlts, totalRolos, type GrupoCorte } from "@/lib/producao";

export const Route = createFileRoute("/_authenticated/apontar")({ component: Apontar });

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
    void supabase
      .from("produtos")
      .select("id, nome, categoria, rolos_por_plt, largura, metragem_por_plt, metros_por_rolo")
      .eq("setor", setor)
      .eq("ativo", true)
      .order("nome")
      .then(({ data, error }) => {
        setProdutos(error ? [] : ((data ?? []) as Produto[]));
        setErro(Boolean(error));
        setCarregando(false);
      });
  }, [setor]);
  return { produtos, carregando, erro };
}

function ApontarCorte() {
  const { user, profile } = useAuth();
  const { produtos, carregando, erro } = useProdutos("corte");
  const [op, setOp] = useState("");
  const [produtoId, setProdutoId] = useState("");
  const [grupos, setGrupos] = useState<GrupoCorte[]>([grupoInicial()]);
  const [salvando, setSalvando] = useState(false);
  const [ultimoSalvo, setUltimoSalvo] = useState<string | null>(null);
  const enviando = useRef(false);
  const produto = produtos.find((item) => item.id === produtoId);
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
    op.trim() && produto && gruposValidos && quantidade >= 1 && quantidade <= 20 && rolos > 0,
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
    enviando.current = true;
    setSalvando(true);
    const { data, error } = await supabase
      .from("apontamentos")
      .insert({
        usuario_id: user.id,
        setor: "corte",
        turno: profile.turno_atual,
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
      toast.error("Não foi possível salvar o apontamento. Revise os dados.");
      return;
    }
    setUltimoSalvo(`PLTs ${data.sequencia_inicio}–${data.sequencia_fim} registrados com sucesso.`);
    setOp("");
    setProdutoId("");
    setGrupos([grupoInicial()]);
    toast.success("Apontamento salvo e painel atualizado.");
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold">Apontamento de Corte</h1>
            <p className="text-sm text-muted-foreground">De 1 a 20 PLTs por apontamento</p>
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
            Não foi possível carregar o catálogo. Tente novamente em instantes.
          </div>
        )}
        <Card>
          <CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="op">OP *</Label>
              <Input
                id="op"
                value={op}
                onChange={(e) => setOp(e.target.value)}
                className="h-12 text-base"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="produto">Produto *</Label>
              <select
                id="produto"
                className="h-12 w-full rounded-md border bg-background px-3 text-base"
                value={produtoId}
                onChange={(e) => escolherProduto(e.target.value)}
                disabled={carregando}
              >
                <option value="">Selecione</option>
                {produtos.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nome}
                  </option>
                ))}
              </select>
            </div>
            {produto && (
              <div className="sm:col-span-2 rounded-md bg-muted p-3 text-sm">
                <strong>Padrão:</strong> {produto.rolos_por_plt} rolos/PLT ·{" "}
                <strong>Largura aguardando definição</strong>
              </div>
            )}
          </CardContent>
        </Card>

        {produto && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Grupos de PLTs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {grupos.map((grupo, indice) => (
                <div key={indice} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label>Quantidade de PLTs</Label>
                    <Input
                      type="number"
                      min={1}
                      max={20}
                      value={grupo.quantidadePlts}
                      onChange={(e) =>
                        atualizarGrupo(indice, { quantidadePlts: Number(e.target.value) })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Rolos por PLT</Label>
                    <Input
                      type="number"
                      min={1}
                      value={grupo.rolosPorPlt}
                      onChange={(e) =>
                        atualizarGrupo(indice, { rolosPorPlt: Number(e.target.value) })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>PLT picado (rolos reais)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={Math.max(1, grupo.rolosPorPlt - 1)}
                      placeholder="Sem PLT picado"
                      value={grupo.pltPicadoRolos ?? ""}
                      onChange={(e) =>
                        atualizarGrupo(indice, {
                          pltPicadoRolos: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                    />
                  </div>
                  {grupos.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      className="sm:col-span-3 justify-self-start"
                      onClick={() => setGrupos((atuais) => atuais.filter((_, i) => i !== indice))}
                    >
                      <Trash2 /> Remover grupo
                    </Button>
                  )}
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                disabled={quantidade >= 20}
                onClick={() =>
                  setGrupos((atuais) => [...atuais, grupoInicial(produto.rolos_por_plt ?? 1)])
                }
              >
                <Plus /> Adicionar grupo
              </Button>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resumo antes de salvar</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <Resumo label="PLTs" valor={quantidade} />
            <Resumo label="Rolos" valor={rolos} />
            <Resumo label="Metragem" valor="Aguardando largura" />
            <Resumo label="Turno" valor={profile?.turno_atual ?? "—"} />
          </CardContent>
        </Card>
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
        <Button className="h-14 w-full text-base" disabled={!valido || salvando} onClick={salvar}>
          {salvando ? "Apontando..." : "Apontar"}
        </Button>
      </div>
    </AppShell>
  );
}

function ApontarMantas() {
  const { user, profile } = useAuth();
  const { produtos, carregando, erro } = useProdutos("mantas");
  const [produtoId, setProdutoId] = useState("");
  const [lote, setLote] = useState("");
  const [metragem, setMetragem] = useState(0);
  const [quantidadePlts, setQuantidadePlts] = useState(1);
  const [salvando, setSalvando] = useState(false);
  const [ultimoSalvo, setUltimoSalvo] = useState<string | null>(null);
  const enviando = useRef(false);
  const produto = produtos.find((item) => item.id === produtoId);
  const metrosPorRolo = produto?.metros_por_rolo ?? 10;
  const rolos = rolosManta(metragem, metrosPorRolo);
  const rolosInteiros = Number.isInteger(rolos) && rolos > 0;
  const valido = Boolean(
    produto &&
    lote.trim() &&
    metragem > 0 &&
    Number.isInteger(quantidadePlts) &&
    quantidadePlts > 0 &&
    rolosInteiros,
  );
  const produtosPorCategoria = useMemo(() => {
    const grupos = new Map<string, Produto[]>();
    for (const item of produtos) {
      const categoria = item.categoria ?? "Outros";
      grupos.set(categoria, [...(grupos.get(categoria) ?? []), item]);
    }
    return [...grupos.entries()];
  }, [produtos]);

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

  async function salvar() {
    if (!valido || !user || !profile?.turno_atual || !produto || enviando.current) return;
    enviando.current = true;
    setSalvando(true);
    const { data, error } = await supabase
      .from("apontamentos")
      .insert({
        usuario_id: user.id,
        setor: "mantas",
        turno: profile.turno_atual,
        lote: lote.trim(),
        produto_id: produto.id,
        produto_nome: produto.nome,
        quantidade_plts: quantidadePlts,
        rolos_por_plt: produto.rolos_por_plt,
        total_rolos: rolos,
        metragem,
      })
      .select("sequencia_inicio, sequencia_fim")
      .single();
    setSalvando(false);
    enviando.current = false;
    if (error) {
      toast.error("Não foi possível salvar o apontamento de Mantas.");
      return;
    }
    setUltimoSalvo(`PLTs ${data.sequencia_inicio}–${data.sequencia_fim} registrados com sucesso.`);
    setProdutoId("");
    setLote("");
    setMetragem(0);
    setQuantidadePlts(1);
    toast.success("Apontamento de Mantas salvo.");
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-4">
        <div>
          <h1 className="text-2xl font-bold">Apontamento de Mantas</h1>
          <p className="text-sm text-muted-foreground">
            Informe a metragem; cada rolo de manta corresponde a {metrosPorRolo} m.
          </p>
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
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="produto-manta">Produto *</Label>
              <select
                id="produto-manta"
                className="h-12 w-full rounded-md border bg-background px-3 text-base"
                value={produtoId}
                onChange={(e) => escolherProduto(e.target.value)}
                disabled={carregando}
              >
                <option value="">{carregando ? "Carregando..." : "Selecione"}</option>
                {produtosPorCategoria.map(([categoria, itens]) => (
                  <optgroup key={categoria} label={categoria}>
                    {itens.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.nome}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
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
  const enviando = useRef(false);
  const area = areaFitas(tempo, velocidade, largura);
  const produto = produtos.find((item) => item.id === produtoId);

  function escolherProduto(id: string) {
    setProdutoId(id);
    const escolhido = produtos.find((item) => item.id === id);
    setLargura(escolhido?.largura ?? 0.93);
  }

  async function salvar() {
    if (!user || !profile?.turno_atual || !produto || !op.trim() || area <= 0 || enviando.current)
      return;
    enviando.current = true;
    setSalvando(true);
    const { error } = await supabase.from("apontamentos").insert({
      usuario_id: user.id,
      setor: "fitas",
      turno: profile.turno_atual,
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
      toast.error("Não foi possível salvar o apontamento.");
      return;
    }
    toast.success("Apontamento de Fitas salvo.");
    setOp("");
    setProdutoId("");
    setTempo(0);
    setVelocidade(0);
    setLargura(0.93);
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
            <div className="space-y-1">
              <Label>OP *</Label>
              <Input value={op} onChange={(e) => setOp(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Produto *</Label>
              <select
                className="h-10 w-full rounded-md border bg-background px-3"
                value={produtoId}
                onChange={(e) => escolherProduto(e.target.value)}
                disabled={carregando}
              >
                <option value="">{carregando ? "Carregando..." : "Aguardando catálogo"}</option>
                {produtos.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nome}
                  </option>
                ))}
              </select>
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
          </CardContent>
        </Card>
        <Button
          className="h-14 w-full"
          disabled={!produto || !op.trim() || area <= 0 || salvando}
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
