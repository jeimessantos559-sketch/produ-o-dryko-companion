import assert from "node:assert/strict";
import { test } from "node:test";
import { calcularLiquidos } from "../src/lib/liquidos.ts";
import {
  contagemPorProduto,
  sequenciasDoTurno,
  type ApontamentoTurno,
} from "../src/lib/apontamentos-turno.ts";
import { agruparRevisaoDoTurno, quantidadeDaRevisao } from "../src/lib/fechamento-turno.ts";
import { agruparProtheus } from "../src/lib/protheus.ts";
import { gerarPdfRelatorio } from "../src/lib/relatorio-pdf.ts";
import type { Json } from "../src/integrations/supabase/types.ts";

const balde = { embalagem_liquido: "balde", unidades_por_plt: 36, semi_kg_por_unidade: 18 };
const qtd = { quantidadePlts: 12, picadoUnidades: "" as const, unidades: 0 };

test("12 PLTs de baldes e galões produzem 432 unidades e consomem 7776 kg de semi", () => {
  for (const embalagem of ["balde", "galao"]) {
    const total = calcularLiquidos({ ...balde, embalagem_liquido: embalagem }, qtd);
    assert.equal(total.valido, true);
    assert.equal(total.unidades, 432);
    assert.equal(total.semiKg, 7776);
    assert.equal(total.plts, 12);
  }
});

test("picados somam unidades e semi, sem aumentar a contagem de PLTs fechados", () => {
  const adicional = calcularLiquidos(balde, { ...qtd, picadoUnidades: 6 });
  assert.equal(adicional.unidades, 438);
  assert.equal(adicional.semiKg, 7884);
  assert.equal(adicional.plts, 12);
  const isolado = calcularLiquidos(balde, { ...qtd, quantidadePlts: 0, picadoUnidades: 6 });
  assert.equal(isolado.valido, true);
  assert.equal(isolado.plts, 0);
  assert.equal(isolado.unidades, 6);
  assert.equal(isolado.semiKg, 108);
});

test("pouch sem padrão por PLT conta unidades e calcula o semi pelo peso", () => {
  const total = calcularLiquidos(
    { embalagem_liquido: "unidade", unidades_por_plt: null, semi_kg_por_unidade: 1 },
    { quantidadePlts: 12, picadoUnidades: 6, unidades: 432 },
  );
  assert.equal(total.valido, true);
  assert.equal(total.unidades, 432);
  assert.equal(total.plts, 0);
  assert.equal(total.picado, 0);
  assert.equal(total.semiKg, 432);
});

test("configuração incompleta, quantidades fracionadas, negativas e picado cheio são rejeitados", () => {
  assert.equal(calcularLiquidos({ embalagem_liquido: "galao" }, qtd).valido, false);
  for (const quantidade of [
    { ...qtd, quantidadePlts: -1 },
    { ...qtd, quantidadePlts: 1.5 },
    { ...qtd, quantidadePlts: 21 },
    { ...qtd, quantidadePlts: 0 },
    { ...qtd, picadoUnidades: -1 },
    { ...qtd, picadoUnidades: 0.5 },
    { ...qtd, picadoUnidades: 36 },
  ])
    assert.equal(calcularLiquidos(balde, quantidade).valido, false);
  for (const unidades of [-1, 0, 0.5, Infinity, 2_147_483_648])
    assert.equal(
      calcularLiquidos({ embalagem_liquido: "unidade", semi_kg_por_unidade: 1 }, { ...qtd, unidades }).valido,
      false,
    );
  assert.equal(calcularLiquidos({ ...balde, semi_kg_por_unidade: NaN }, qtd).valido, false);
});

function registro(dados: Partial<ApontamentoTurno> = {}): ApontamentoTurno {
  return {
    id: "1",
    produto_id: "prikol-bd",
    produto_nome: "Prikol BD",
    op: "173254",
    setor: "liquidos",
    turno: "T2",
    data_local: "2026-10-06",
    created_at: "2026-10-07T01:00:00Z",
    quantidade_plts: 12,
    total_unidades: 432,
    picado_unidades: 0,
    semi_consumido_kg: 7776,
    embalagem_liquido: "balde",
    unidades_por_plt: 36,
    semi_kg_por_unidade: 18,
    grupos: null,
    total_rolos: null,
    metragem: null,
    area_m2: null,
    status: "pendente",
    ...dados,
  } as ApontamentoTurno;
}

test("contagem, sequência, conferência e Protheus preservam a mesma quantidade do turno", () => {
  const itens = [
    registro(),
    registro({
      id: "2",
      quantidade_plts: 0,
      total_unidades: 6,
      picado_unidades: 6,
      semi_consumido_kg: 108,
    }),
    registro({
      id: "3",
      produto_id: "kal-pouch",
      produto_nome: "Kal pouch",
      embalagem_liquido: "unidade",
      unidades_por_plt: null,
      semi_kg_por_unidade: null,
      quantidade_plts: 0,
      total_unidades: 100,
      semi_consumido_kg: 0,
    }),
    registro({ id: "4", turno: "T1", quantidade_plts: 2 }),
  ];
  const contagem = contagemPorProduto(itens, "liquidos", "T2", "2026-10-06");
  const bd = contagem.find((p) => p.produtoId === "prikol-bd")!;
  assert.equal(bd.plts, 12);
  assert.equal(bd.unidades, 438);
  assert.equal(bd.semiKg, 7884);
  assert.equal(bd.rolos, 0);
  assert.equal(bd.metragem, 0);
  assert.equal(sequenciasDoTurno(itens).get("2")?.inicio, null);
  assert.equal(sequenciasDoTurno(itens).get("3")?.inicio, null);
  const revisao = agruparRevisaoDoTurno(itens.slice(0, 3));
  assert.deepEqual(revisao.map(quantidadeDaRevisao), [
    "100 unidades",
    "12 PLTs e 1 picado de 6 unidades",
  ]);
  const protheus = agruparProtheus(itens.slice(0, 3), "liquidos");
  assert.equal(protheus.length, 2);
  const grupo = protheus.find((p) => p.item.produto_id === "prikol-bd")!;
  assert.equal(grupo.unidades, 438);
  assert.equal(grupo.semiKg, 7884);
});

test("PDF de Líquidos mostra unidades e semi sem metragem nem rolos", () => {
  const resumo = {
    setor: "Líquidos",
    turno: "T2",
    data: "2026-10-06",
    responsavel: "Jeimes Santos",
    totais: { apontamentos: 2, plts: 12, unidades: 532, semiKg: 7776, pendentes: 2, lancados: 0 },
    apontamentos: [
      registro(),
      registro({
        id: "2",
        produto_nome: "Kal pouch",
        embalagem_liquido: "unidade",
        unidades_por_plt: null,
        semi_kg_por_unidade: null,
        quantidade_plts: 0,
        total_unidades: 100,
        semi_consumido_kg: 0,
      }),
    ],
  } as unknown as Json;
  const pdf = new TextDecoder().decode(gerarPdfRelatorio(resumo));
  assert.match(pdf, /UNIDADES PRODUZIDAS/);
  assert.match(pdf, /SEMI CONSUMIDO/);
  assert.match(pdf, /7\.776 kg/);
  assert.match(pdf, /Prikol BD/);
  assert.match(pdf, /Kal pouch/);
  assert.doesNotMatch(pdf, /ROLOS PRODUZIDOS|AREA PRODUZIDA|\(Rolos\)|0 m2/);
});

test("PDF detalha o semi de pouch novo e preserva o registro histórico sem peso", () => {
  const novo = registro({
    produto_nome: "Kal pouch",
    embalagem_liquido: "unidade",
    unidades_por_plt: 648,
    semi_kg_por_unidade: 1,
    quantidade_plts: 1,
    total_unidades: 648,
    semi_consumido_kg: 648,
  });
  const galao = registro({
    id: "2", produto_nome: "Prikol GL", embalagem_liquido: "galao",
    unidades_por_plt: 144, semi_kg_por_unidade: 3.6,
    quantidade_plts: 1, total_unidades: 144, semi_consumido_kg: 518.4,
  });
  const antigo = registro({
    id: "3", produto_nome: "Pouch historico", embalagem_liquido: "unidade",
    unidades_por_plt: null, semi_kg_por_unidade: null,
    quantidade_plts: 0, total_unidades: 100, semi_consumido_kg: 0,
  });
  const pdf = new TextDecoder().decode(gerarPdfRelatorio({
    setor: "Líquidos", turno: "T2", data: "2026-10-07", responsavel: "Jeimes Santos",
    totais: { apontamentos: 3, plts: 2, unidades: 892, semiKg: 1166.4, pendentes: 3, lancados: 0 },
    apontamentos: [novo, galao, antigo],
  } as unknown as Json));
  const detalhe = pdf.slice(pdf.indexOf("APONTADO POR"));
  assert.match(detalhe, /648 kg/);
  assert.match(detalhe, /518,4 kg/);
  assert.match(detalhe, /Pouch historico/);
  assert.equal(antigo.semi_kg_por_unidade, null);
  assert.equal(antigo.semi_consumido_kg, 0);
});
