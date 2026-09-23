import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell, nomeSetor } from "@/components/dryko/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth, type SetorCodigo } from "@/lib/auth";
import { rolosManta } from "@/lib/producao";

export const Route = createFileRoute("/_authenticated/produtos")({
  component: Produtos,
});

type Produto = Database["public"]["Tables"]["produtos"]["Row"];

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
  const [setor, setSetor] = useState<SetorCodigo>("mantas");
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [nome, setNome] = useState("");
  const [categoria, setCategoria] = useState("Dryko");
  const [rolosPorPlt, setRolosPorPlt] = useState(0);
  const [largura, setLargura] = useState(0.93);
  const [metragemPorPlt, setMetragemPorPlt] = useState(250);
  const [metrosPorRolo, setMetrosPorRolo] = useState(10);

  async function carregarProdutos(setorSelecionado: SetorCodigo) {
    setCarregando(true);
    const { data, error } = await supabase
      .from("produtos")
      .select("*")
      .eq("setor", setorSelecionado)
      .order("categoria", { nullsFirst: false })
      .order("nome");
    if (error) {
      setProdutos([]);
      toast.error("Não foi possível carregar os produtos.");
    } else {
      setProdutos(data ?? []);
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
      ? Number.isInteger(rolosPorPlt) && rolosPorPlt > 0
      : setor === "fitas"
        ? largura > 0
        : setor === "mantas"
          ? Boolean(mantaValida)
          : true;
  const valido = Boolean(nome.trim() && configuracaoValida);

  function trocarSetor(novoSetor: SetorCodigo) {
    setSetor(novoSetor);
    setNome("");
    setCategoria("Dryko");
    setRolosPorPlt(0);
    setLargura(0.93);
    setMetragemPorPlt(250);
    setMetrosPorRolo(10);
  }

  function alterarNome(valor: string) {
    setNome(valor);
    if (setor !== "mantas") return;
    if (/4/.test(valor)) setMetragemPorPlt(200);
    else if (/3/.test(valor)) setMetragemPorPlt(250);
  }

  async function salvar() {
    if (!valido || salvando) return;
    setSalvando(true);
    const { error } = await supabase.from("produtos").insert({
      setor,
      nome: nome.trim(),
      categoria: setor === "mantas" ? categoria.trim() : null,
      rolos_por_plt: setor === "corte" ? rolosPorPlt : setor === "mantas" ? rolosCalculados : null,
      largura: setor === "fitas" ? largura : null,
      metragem_por_plt: setor === "mantas" ? metragemPorPlt : null,
      metros_por_rolo: setor === "mantas" ? metrosPorRolo : null,
      ativo: true,
    });
    setSalvando(false);
    if (error) {
      toast.error(
        error.code === "23505"
          ? "Este produto já está cadastrado no setor."
          : "Não foi possível cadastrar o produto.",
      );
      return;
    }
    toast.success("Produto cadastrado.");
    setNome("");
    await carregarProdutos(setor);
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-4">
        <div>
          <h1 className="text-2xl font-bold">Produtos</h1>
          <p className="text-sm text-muted-foreground">
            Cadastro disponível somente para administradores.
          </p>
        </div>

        {loading || carregando ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : !isAdmin ? (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">
              Esta tela é exclusiva do administrador.
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Cadastrar novo produto</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="setor-produto">Setor *</Label>
                  <select
                    id="setor-produto"
                    className="h-11 w-full rounded-md border bg-background px-3"
                    value={setor}
                    onChange={(e) => trocarSetor(e.target.value as SetorCodigo)}
                  >
                    {SETORES.map((codigo) => (
                      <option key={codigo} value={codigo}>
                        {nomeSetor(codigo)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="nome-produto">Nome *</Label>
                  <Input
                    id="nome-produto"
                    value={nome}
                    onChange={(e) => alterarNome(e.target.value)}
                  />
                </div>

                {setor === "corte" && (
                  <div className="space-y-1 sm:col-span-2">
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
                      <Label htmlFor="categoria-produto">Categoria *</Label>
                      <Input
                        id="categoria-produto"
                        value={categoria}
                        onChange={(e) => setCategoria(e.target.value)}
                        placeholder="Ex.: Dryko"
                      />
                    </div>
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
                    <div className="rounded-md bg-muted p-3">
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
                  {salvando ? "Cadastrando..." : "Cadastrar produto"}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Produtos de {nomeSetor(setor)}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {produtos.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum produto cadastrado.</p>
                ) : (
                  produtos.map((produto) => (
                    <div
                      key={produto.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
                    >
                      <span className="font-medium">{produto.nome}</span>
                      <span className="text-muted-foreground">{descricaoProduto(produto)}</span>
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
  if (produto.setor === "corte") return `${produto.rolos_por_plt} rolos/PLT`;
  if (produto.setor === "fitas") return `largura ${produto.largura} m`;
  if (produto.setor === "mantas") {
    return `${produto.categoria ?? "Sem categoria"} · ${produto.metragem_por_plt} m/PLT · ${produto.rolos_por_plt} rolos/PLT`;
  }
  return produto.ativo ? "Ativo" : "Inativo";
}
