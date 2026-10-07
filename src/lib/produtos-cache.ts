import { supabase } from "@/integrations/supabase/client";
import { ordenarProdutosPorMarca } from "@/lib/catalogo-produtos";
import type { ParametrosLiquido } from "@/lib/liquidos";

export type ProdutoCatalogo = ParametrosLiquido & {
  id: string;
  nome: string;
  categoria: string | null;
  rolos_por_plt: number | null;
  largura: number | null;
  metragem_por_plt: number | null;
  metros_por_rolo: number | null;
};

type CacheItem = {
  expiresAt: number;
  produtos: ProdutoCatalogo[];
};

const CACHE_MS = 15 * 60_000;
const cacheProdutos = new Map<string, CacheItem>();
const requisicoes = new Map<string, Promise<ProdutoCatalogo[]>>();

export async function obterProdutosAtivos(setor: string) {
  const cache = cacheProdutos.get(setor);
  if (cache && cache.expiresAt > Date.now()) return cache.produtos;

  const emAndamento = requisicoes.get(setor);
  if (emAndamento) return emAndamento;

  const requisicao = Promise.all([
    supabase
      .from("produtos")
      .select(
        "id, nome, categoria, rolos_por_plt, largura, metragem_por_plt, metros_por_rolo, embalagem_liquido, unidades_por_plt, semi_kg_por_unidade",
      )
      .eq("setor", setor as never)
      .eq("ativo", true),
    supabase
      .from("marcas_produto")
      .select("nome, ordem")
      .eq("setor", setor as never),
  ])
    .then(([resultadoProdutos, resultadoMarcas]) => {
      if (resultadoProdutos.error) throw resultadoProdutos.error;
      if (resultadoMarcas.error) throw resultadoMarcas.error;

      const produtos = ordenarProdutosPorMarca(
        (resultadoProdutos.data ?? []) as ProdutoCatalogo[],
        resultadoMarcas.data ?? [],
      );
      cacheProdutos.set(setor, { expiresAt: Date.now() + CACHE_MS, produtos });
      return produtos;
    })
    .finally(() => {
      requisicoes.delete(setor);
    });

  requisicoes.set(setor, requisicao);
  return requisicao;
}

export function invalidarCacheProdutos(setor?: string) {
  if (setor) {
    cacheProdutos.delete(setor);
    requisicoes.delete(setor);
    return;
  }
  cacheProdutos.clear();
  requisicoes.clear();
}
