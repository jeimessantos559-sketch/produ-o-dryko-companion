import { createFileRoute } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, Pencil, Power, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { invalidarCacheProdutos } from "@/components/dryko/apontamento-rapido";
import { AppShell, nomeSetor } from "@/components/dryko/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth, type SetorCodigo } from "@/lib/auth";
import { ordenarProdutosPorMarca } from "@/lib/catalogo-produtos";
import { rolosManta } from "@/lib/producao";

export const Route = createFileRoute("/_authenticated/produtos")({ component: Produtos });

type Produto = Database["public"]["Tables"]["produtos"]["Row"];
type Marca = Database["public"]["Tables"]["marcas_produto"]["Row"];

const SETORES: SetorCodigo[] = [
  "corte",
  "fitas",
  "mantas",
  "asfox",
  "misturadores",
  "liquidos",
  "pos",
  "avulsos",
];

function Produtos() {
  const { isAdmin, loading } = useAuth();
  const [setor, setSetor] = useState<SetorCodigo>("corte");
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [marcas, setMarcas] = useState<Marca[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [categoria, setCategoria] = useState("");
  const [rolosPorPlt, setRolosPorPlt] = useState(0);
  const [largura, setLargura] = useState(0);
  const [metragemPorPlt, setMetragemPorPlt] = useState(250);
  const [metrosPorRolo, setMetrosPorRolo] = useState(10);

  async function carregarProdutos(setorSelecionado: SetorCodigo) {
    setCarregando(true);
    const [{ data, error }, { data: listaMarcas, error: erroMarcas }] = await Promise.all([
      supabase.from("produtos").select("*").eq("setor", setorSelecionado).order("nome"),
      supabase.from("marcas_produto").select("*").eq("setor", setorSelecionado).order("ordem"),
    ]);
    if (error || erroMarcas) {
      setProdutos([]);
      setMarcas([]);
      toast.error("Não foi possível carregar os produtos.");
    } else {
      setProdutos(ordenarProdutosPorMarca(data ?? [], listaMarcas ?? []));
      setMarcas(listaMarcas ?? []);
    }
    setCarregando(false);
  }

  useEffect(() => {
    if (!isAdmin) {
      setCarregando(false);
      return;
    }
    void carregarProdutos(setor);
  }, [isAdmin, setor]);

  const rolosCalculados = useMemo(
    () => rolosManta(metragemPorPlt, metrosPorRolo),
    [metragemPorPlt, metrosPorRolo],
  );
  const mantaValida =
    categoria.trim() &&
    metragemPorPlt > 0 &&
    metrosPorRolo > 0 &&
    Number.isInteger(rolosCalculados) &&
    rolosCalculados > 0;
  const configuracaoValida =
    setor === "corte"
      ? Number.isInteger(rolosPorPlt) && rolosPorPlt > 0 && largura > 0
      : setor === "fitas"
        ? largura > 0
        : setor === "mantas"
          ? Boolean(mantaValida)
          : true;
  const valido = Boolean(nome.trim() && categoria.trim() && configuracaoValida);

  function limparFormulario(novoSetor = setor) {
    setEditandoId(null);
    setNome("");
    setCategoria(novoSetor === "mantas" ? "DRYKO" : "");
    setRolosPorPlt(0);
    setLargura(novoSetor === "fitas" ? 0.93 : 0);
    setMetragemPorPlt(250);
    setMetrosPorRolo(10);
  }

  function trocarSetor(novoSetor: SetorCodigo) {
    setSetor(novoSetor);
    limparFormulario(novoSetor);
  }

  function alterarNome(valor: string) {
    setNome(valor);
    if (setor === "corte") {
      const tamanho = valor.match(/(?:^|\s)(5|10|15|20|30|45|60|90)(?:$|\D)/)?.[1];
      if (tamanho) setLargura(Number(tamanho));
      return;
    }
    if (setor === "mantas") {
      if (/4/.test(valor)) setMetragemPorPlt(200);
      else if (/3/.test(valor)) setMetragemPorPlt(250);
    }
  }

  function editar(produto: Produto) {
    setEditandoId(produto.id);
    setNome(produto.nome);
    setCategoria((produto.categoria ?? "").toUpperCase());
    setRolosPorPlt(Number(produto.rolos_por_plt ?? 0));
    setLargura(Number(produto.largura ?? (setor === "fitas" ? 0.93 : 0)));
    setMetragemPorPlt(Number(produto.metragem_por_plt ?? 250));
    setMetrosPorRolo(Number(produto.metros_por_rolo ?? 10));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function salvar() {
    if (!valido || salvando) return;
    setSalvando(true);
    const marca = categoria.trim().toUpperCase();

    if (!marcas.some((item) => item.nome === marca)) {
      const { error: erroMarca } = await supabase
        .from("marcas_produto")
        .insert({ setor, nome: marca, ordem: marcas.length + 1 });
      if (erroMarca && erroMarca.code !== "23505") {
        setSalvando(false);
        toast.error("Não foi possível cadastrar a marca do produto.");
        return;
      }
    }

    const valores = {
      setor,
      nome: nome.trim(),
      categoria: marca,
      rolos_por_plt: setor === "corte" ? rolosPorPlt : setor === "mantas" ? rolosCalculados : null,
      largura: setor === "corte" || setor === "fitas" ? largura : null,
      metragem_por_plt: setor === "mantas" ? metragemPorPlt : null,
      metros_por_rolo: setor === "mantas" ? metrosPorRolo : null,
      ativo: true,
    };

    const resultado = editandoId
      ? await supabase.from("produtos").update(valores).eq("id", editandoId)
      : await supabase.from("produtos").insert(valores);

    setSalvando(false);
    if (resultado.error) {
      toast.error(
        resultado.error.code === "23505"
          ? "Já existe um produto com esse nome neste setor."
          : "Não foi possível salvar o produto.",
      );
      return;
    }

    invalidarCacheProdutos(setor);
    toast.success(editandoId ? "Produto atualizado." : "Produto cadastrado.");
    limparFormulario();
    await carregarProdutos(setor);
  }

  async function alternarAtivo(produto: Produto) {
    const { error } = await supabase
      .from("produtos")
      .update({ ativo: !produto.ativo })
      .eq("id", produto.id);
    if (error) {
      toast.error("Não foi possível alterar o status do produto.");
      return;
    }
    invalidarCacheProdutos(setor);
    toast.success(
      produto.ativo ? "Produto desativado. O histórico foi mantido." : "Produto ativado.",
    );
    await carregarProdutos(setor);
  }

  async function excluir(produto: Produto) {
    if (
      !window.confirm(
        `Excluir definitivamente ${produto.nome}? Se houver histórico de produção, use Desativar.`,
      )
    )
      return;
    const { error } = await supabase.from("produtos").delete().eq("id", produto.id);
    if (error) {
      toast.error(
        error.code === "23503"
          ? "Este produto possui histórico e não pode ser apagado. Desative-o para preservar os registros."
          : "Não foi possível excluir o produto.",
      );
      return;
    }
    invalidarCacheProdutos(setor);
    toast.success("Produto excluído.");
    if (editandoId === produto.id) limparFormulario();
    await carregarProdutos(setor);
  }

  async function moverMarca(indice: number, direcao: -1 | 1) {
    const destino = indice + direcao;
    if (destino < 0 || destino >= marcas.length) return;
    const atual = marcas[indice];
    const outra = marcas[destino];
    if (!atual || !outra) return;
    const anteriores = marcas;
    const reordenadas = [...marcas];
    reordenadas[indice] = outra;
    reordenadas[destino] = atual;
    const normalizadas = reordenadas.map((marca, posicao) => ({ ...marca, ordem: posicao + 1 }));
    setMarcas(normalizadas);
    setProdutos((atuais) => ordenarProdutosPorMarca(atuais, normalizadas));

    const { error } = await supabase.from("marcas_produto").upsert(
      normalizadas.map((marca) => ({
        id: marca.id,
        setor: marca.setor,
        nome: marca.nome,
        ordem: marca.ordem,
      })),
    );
    if (error) {
      setMarcas(anteriores);
      setProdutos((atuais) => ordenarProdutosPorMarca(atuais, anteriores));
      toast.error("Não foi possível alterar a ordem das marcas.");
      return;
    }
    invalidarCacheProdutos(setor);
    toast.success("Ordem das marcas atualizada.");
    await carregarProdutos(setor);
  }

  return (
    <AppShell title="Produtos" eyebrow="ADMINISTRAÇÃO · CATÁLOGO">
      <div className="mx-auto max-w-4xl space-y-6">
        {loading || carregando ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : !isAdmin ? (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">
              Você não tem permissão para gerenciar produtos.
            </CardContent>
          </Card>
        ) : (
          <>
            <Card className="rounded-3xl border-slate-200 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle className="text-xl">
                  {editandoId ? "Editar produto" : "Cadastrar novo produto"}
                </CardTitle>
                {editandoId && (
                  <Button size="sm" variant="ghost" onClick={() => limparFormulario()}>
                    <X /> Cancelar edição
                  </Button>
                )}
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="setor-produto">Setor *</Label>
                  <select
                    id="setor-produto"
                    className="h-12 w-full rounded-xl border border-input bg-white px-3 [color-scheme:light]"
                    value={setor}
                    onChange={(e) => trocarSetor(e.target.value as SetorCodigo)}
                    disabled={Boolean(editandoId)}
                  >
                    {SETORES.map((codigo) => (
                      <option key={codigo} value={codigo}>
                        {nomeSetor(codigo)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="categoria-produto">Marca ou família *</Label>
                  <Input
                    id="categoria-produto"
                    value={categoria}
                    onChange={(e) => setCategoria(e.target.value.toUpperCase())}
                    placeholder="Ex.: DRYKO"
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="nome-produto">Nome *</Label>
                  <Input
                    id="nome-produto"
                    value={nome}
                    onChange={(e) => alterarNome(e.target.value)}
                    placeholder={setor === "corte" ? "Ex.: FVD 10" : undefined}
                  />
                </div>

                {setor === "corte" && (
                  <>
                    <div className="space-y-1">
                      <Label htmlFor="largura-corte">Largura (cm) *</Label>
                      <Input
                        id="largura-corte"
                        type="number"
                        min={0.01}
                        step="0.01"
                        value={largura || ""}
                        onChange={(e) => setLargura(Number(e.target.value))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="rolos-produto">Rolos por PLT *</Label>
                      <Input
                        id="rolos-produto"
                        type="number"
                        min={1}
                        step={1}
                        value={rolosPorPlt || ""}
                        onChange={(e) => setRolosPorPlt(Number(e.target.value))}
                      />
                    </div>
                    {largura > 0 && rolosPorPlt > 0 && (
                      <div className="rounded-xl bg-muted p-3 sm:col-span-2">
                        <span className="text-xs text-muted-foreground">Metragem por PLT</span>
                        <p className="text-xl font-bold">
                          {((largura * rolosPorPlt) / 10).toLocaleString("pt-BR", {
                            maximumFractionDigits: 2,
                          })}{" "}
                          m²
                        </p>
                      </div>
                    )}
                  </>
                )}

                {setor === "fitas" && (
                  <div className="space-y-1 sm:col-span-2">
                    <Label htmlFor="largura-produto">Largura padrão (m) *</Label>
                    <Input
                      id="largura-produto"
                      type="number"
                      min={0.01}
                      step="0.01"
                      value={largura || ""}
                      onChange={(e) => setLargura(Number(e.target.value))}
                    />
                  </div>
                )}

                {setor === "mantas" && (
                  <>
                    <div className="space-y-1">
                      <Label htmlFor="metragem-produto">Metragem por PLT *</Label>
                      <Input
                        id="metragem-produto"
                        type="number"
                        min={1}
                        step={10}
                        value={metragemPorPlt || ""}
                        onChange={(e) => setMetragemPorPlt(Number(e.target.value))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="metros-rolo-produto">Metros por rolo *</Label>
                      <Input
                        id="metros-rolo-produto"
                        type="number"
                        min={0.01}
                        step="0.01"
                        value={metrosPorRolo || ""}
                        onChange={(e) => setMetrosPorRolo(Number(e.target.value))}
                      />
                    </div>
                    <div className="rounded-md bg-muted p-3 sm:col-span-2">
                      <span className="text-xs text-muted-foreground">Rolos por PLT</span>
                      <p className="text-xl font-bold">
                        {Number.isInteger(rolosCalculados) ? rolosCalculados : "Revise a metragem"}
                      </p>
                    </div>
                  </>
                )}

                <Button
                  className="h-12 sm:col-span-2"
                  disabled={!valido || salvando}
                  onClick={salvar}
                >
                  {salvando
                    ? "Salvando..."
                    : editandoId
                      ? "Salvar alterações"
                      : "Cadastrar produto"}
                </Button>
              </CardContent>
            </Card>

            <Card className="rounded-3xl border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-2xl">Ordem das marcas</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Esta prioridade é aplicada imediatamente nos seletores de apontamento.
                </p>
              </CardHeader>
              <CardContent className="space-y-2">
                {marcas.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma marca cadastrada.</p>
                ) : (
                  marcas.map((marca, indice) => (
                    <div
                      key={marca.id}
                      className="flex min-h-20 items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"
                    >
                      <span className="text-lg font-semibold">
                        {indice + 1}. {marca.nome}
                      </span>
                      <div className="flex gap-2">
                        <Button
                          className="size-12 rounded-xl"
                          size="icon"
                          variant="outline"
                          disabled={indice === 0}
                          onClick={() => moverMarca(indice, -1)}
                          aria-label={`Subir ${marca.nome}`}
                        >
                          <ArrowUp className="size-5" />
                        </Button>
                        <Button
                          className="size-12 rounded-xl"
                          size="icon"
                          variant="outline"
                          disabled={indice === marcas.length - 1}
                          onClick={() => moverMarca(indice, 1)}
                          aria-label={`Descer ${marca.nome}`}
                        >
                          <ArrowDown className="size-5" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card className="rounded-3xl border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-2xl">Produtos de {nomeSetor(setor)}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {produtos.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum produto cadastrado.</p>
                ) : (
                  produtos.map((produto) => (
                    <div
                      key={produto.id}
                      className={`rounded-2xl border p-4 text-sm sm:p-5 ${produto.ativo ? "bg-white" : "bg-slate-50 opacity-70"}`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-lg font-bold">{produto.nome}</p>
                          <p className="mt-1 text-base text-muted-foreground">
                            {descricaoProduto(produto)}
                          </p>
                          <p
                            className={`mt-1 text-sm font-semibold ${produto.ativo ? "text-emerald-700" : "text-slate-500"}`}
                          >
                            {produto.ativo ? "Ativo" : "Inativo"}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" onClick={() => editar(produto)}>
                            <Pencil /> Editar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void alternarAtivo(produto)}
                          >
                            <Power /> {produto.ativo ? "Desativar" : "Ativar"}
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => void excluir(produto)}
                          >
                            <Trash2 /> Excluir
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}

function descricaoProduto(produto: Produto) {
  if (produto.setor === "corte") {
    const largura = Number(produto.largura ?? 0);
    const rolos = Number(produto.rolos_por_plt ?? 0);
    const metragem = largura > 0 && rolos > 0 ? (largura * rolos) / 10 : null;
    return `${produto.categoria ?? "Sem marca"} · ${largura > 0 ? `${largura.toLocaleString("pt-BR")} cm · ` : ""}${rolos} rolos/PLT${metragem == null ? "" : ` · ${metragem.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m²/PLT`}`;
  }
  if (produto.setor === "fitas")
    return `${produto.categoria ?? "Fitas"} · largura ${produto.largura} m`;
  if (produto.setor === "mantas")
    return `${produto.categoria ?? "Sem categoria"} · ${produto.metragem_por_plt} m/PLT · ${produto.rolos_por_plt} rolos/PLT · ${produto.metros_por_rolo} m/rolo`;
  return `${produto.categoria ?? "Produtos"} · ${produto.ativo ? "Ativo" : "Inativo"}`;
}
