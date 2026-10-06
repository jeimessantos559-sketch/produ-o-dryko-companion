import assert from "node:assert/strict";
import { test } from "node:test";
import { consultarComCache, invalidarCache, lerCache } from "../src/lib/cache-consultas.ts";

function pendente<T>() {
  let resolver!: (valor: T) => void;
  const promessa = new Promise<T>((resolve) => {
    resolver = resolve;
  });
  return { promessa, resolver };
}

test("uma resposta iniciada antes de corrigir não substitui o painel atualizado", async () => {
  const anterior = pendente<number>();
  const corrigido = pendente<number>();
  const cargaAnterior = consultarComCache("painel:teste", 15000, () => anterior.promessa);
  invalidarCache("painel:");
  const cargaNova = consultarComCache("painel:teste", 15000, () => corrigido.promessa);
  corrigido.resolver(3);
  await cargaNova;
  anterior.resolver(4);
  await cargaAnterior;
  assert.equal(lerCache<number>("painel:teste")?.valor, 3);
});

test("recarregar forçando não reutiliza uma consulta antiga em andamento", async () => {
  const anterior = pendente<number>();
  const nova = pendente<number>();
  const primeira = consultarComCache("painel:forcar", 15000, () => anterior.promessa);
  const segunda = consultarComCache("painel:forcar", 15000, () => nova.promessa, { forcar: true });
  anterior.resolver(1);
  await primeira;
  nova.resolver(2);
  await segunda;
  assert.equal(lerCache<number>("painel:forcar")?.valor, 2);
});
