import assert from "node:assert/strict";
import { test } from "node:test";
import { gerarPdfRelatorio, linhasDoRelatorio } from "../src/lib/relatorio-pdf.ts";
import type { Json } from "../src/integrations/supabase/types.ts";

for (const quantidade of [1, 30]) {
  test(`PDF de Asfox com ${quantidade} registro(s) mostra unidades e semi em todas as páginas`, () => {
    const resumo = {
      setor: "Asfox",
      turno: "T2",
      data: "2026-10-08",
      responsavel: "Jeimes Santos",
      totais: {
        apontamentos: quantidade,
        plts: quantidade,
        unidades: quantidade * 100,
        semiKg: quantidade * 1000,
        pendentes: quantidade,
        lancados: 0,
      },
      apontamentos: Array.from({ length: quantidade }, (_, i) => ({
        id: String(i + 1),
        setor: "asfox",
        produto_nome: "Asfox SC",
        op: "173254",
        quantidade_plts: 1,
        total_unidades: 100,
        picado_unidades: 0,
        embalagem_liquido: "saco",
        unidades_por_plt: 100,
        semi_kg_por_unidade: 10,
        semi_consumido_kg: 1000,
        status: "pendente",
      })),
    } as unknown as Json;
    const pdf = new TextDecoder().decode(gerarPdfRelatorio(resumo));
    assert.match(pdf, /UNIDADES PRODUZIDAS/);
    assert.match(pdf, /SEMI CONSUMIDO/);
    assert.match(pdf, /Asfox SC/);
    assert.match(pdf, /1\.000 kg/);
    assert.doesNotMatch(pdf, /ROLOS PRODUZIDOS|AREA PRODUZIDA|\(Rolos\)|0 m2/);
    assert.match(linhasDoRelatorio(resumo).join("\n"), /Unidades: .*Semi consumido:/);
    if (quantidade > 1) {
      assert.match(pdf, /DETALHAMENTO DO TURNO/);
      assert.ok((pdf.match(/\(1\.000 kg\)/g) ?? []).length >= quantidade);
    }
  });
}
