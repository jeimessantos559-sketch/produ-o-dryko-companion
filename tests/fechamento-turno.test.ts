import assert from "node:assert/strict";
import { test } from "node:test";
import type { Json } from "../src/integrations/supabase/types.ts";
import type { ApontamentoTurno } from "../src/lib/apontamentos-turno.ts";
import {
  agruparRevisaoDoTurno,
  opsFinalizadasDoTurno,
  opsFinalizadasNoRelatorio,
  quantidadeDaRevisao,
  type FonteFinalizacao,
} from "../src/lib/fechamento-turno.ts";
import { gerarPdfRelatorio, linhasDoRelatorio } from "../src/lib/relatorio-pdf.ts";

function registro(plts: number, dados: Partial<ApontamentoTurno> = {}): ApontamentoTurno {
  return {
    id: "1",
    produto_id: "fvd90",
    produto_nome: "FVD90-TBT",
    setor: "corte",
    turno: "T2",
    data_local: "2026-10-05",
    op: "173274",
    lote: null,
    quantidade_plts: plts,
    total_rolos: plts * 72,
    metragem: plts * 648,
    grupos: [
      { quantidadePlts: plts, rolosPorPlt: 72, pltPicadoRolos: null, picadoAdicional: true },
    ],
    status: "lancado",
    created_at: "2026-10-05T19:42:00Z",
    apontado_por_nome: "Jeimes dos Santos",
    lancado_por_nome: "Amauri Silva Junior",
    lancado_em: "2026-10-05T19:43:00Z",
    ...dados,
  } as ApontamentoTurno;
}

function fonte(dados: Partial<FonteFinalizacao> = {}): FonteFinalizacao {
  return {
    produto_id: "fvd90",
    produto_nome: "FVD90-TBT",
    op: "173274",
    status: "finalizada",
    finalizado_em: "2026-10-06T04:30:00Z",
    finalizado_por: "autor",
    ...dados,
  };
}

test("conferência reúne o exemplo de 7 PLTs e um picado, sem separar pela OP", () => {
  const itens = [
    registro(4),
    registro(3),
    registro(0, {
      op: "133274",
      total_rolos: 6,
      grupos: [{ quantidadePlts: 0, rolosPorPlt: 72, pltPicadoRolos: 6, picadoAdicional: true }],
      status: "pendente",
    }),
    registro(19, { produto_id: "dryko30", produto_nome: "DRYKO 30" }),
    registro(2, { produto_id: "dryko30", produto_nome: "DRYKO 30" }),
    registro(5, { produto_id: "dryko15", produto_nome: "DRYKO 15" }),
  ];
  const antes = JSON.stringify(itens);
  const grupos = agruparRevisaoDoTurno(itens);
  assert.equal(grupos.length, 3);
  assert.deepEqual(grupos.map(quantidadeDaRevisao), [
    "5 PLTs",
    "21 PLTs",
    "7 PLTs e 1 picado de 6 unidades",
  ]);
  const fvd = grupos.find((g) => g.produtoNome === "FVD90-TBT")!;
  assert.deepEqual(fvd.ops, ["173274", "133274"]);
  assert.equal(fvd.pendentes, 1);
  assert.equal(fvd.lancados, 2);
  assert.equal(JSON.stringify(itens), antes, "o relatório conserva cada registro original");
});

test("picados adicionais, isolados e legados não são somados aos pallets fechados", () => {
  const grupos = agruparRevisaoDoTurno([
    registro(3, { grupos: [{ quantidadePlts: 3, rolosPorPlt: 72, pltPicadoRolos: 20 }] }),
    registro(2, {
      grupos: [{ quantidadePlts: 2, rolosPorPlt: 72, pltPicadoRolos: 30, picadoAdicional: true }],
    }),
    registro(0, { grupos: null, total_rolos: 6 }),
  ]);
  assert.equal(quantidadeDaRevisao(grupos[0]!), "4 PLTs e 3 picados de 56 unidades");
});

test("produto e lote iguais consolidam sem misturar produtos, lotes, datas ou turnos distintos", () => {
  const manta = registro(2, { setor: "mantas", op: null, lote: " abc ", grupos: null });
  const grupos = agruparRevisaoDoTurno([
    manta,
    { ...manta, quantidade_plts: 3, lote: "ABC" },
    { ...manta, lote: "DEF" },
    { ...manta, produto_id: "outro-produto" },
    { ...manta, turno: "T1" },
    { ...manta, data_local: "2026-10-04" },
  ]);
  assert.equal(grupos.length, 5);
  assert.equal(grupos.filter((g) => g.plts === 5).length, 1);
  const fitas = agruparRevisaoDoTurno([
    registro(0, { setor: "fitas", area_m2: 150 }),
    registro(0, { setor: "fitas", area_m2: 25.5 }),
  ]);
  assert.equal(quantidadeDaRevisao(fitas[0]!), "175,5 m²");
});

test("relatório registra apenas finalizações explícitas da produção e da data operacional selecionada", () => {
  const finais = opsFinalizadasDoTurno(
    [registro(7)],
    [
      fonte(),
      fonte({ status: "ativa", finalizado_em: "2026-10-06T04:40:00Z" }),
      fonte({ finalizado_em: null }),
      fonte({ status: undefined, finalizado_em: "2026-10-06T04:35:00Z" }),
      fonte({ op: "outra-op" }),
      fonte({ produto_id: "outro-produto" }),
      fonte({ finalizado_em: "2026-10-05T04:30:00Z" }),
      fonte({ finalizado_em: "2026-10-07T04:30:00Z" }),
    ],
    "2026-10-05",
    "T2",
    { autor: "Jeimes Santos" },
  );
  assert.equal(finais.length, 1);
  assert.equal(finais[0]?.finalizado_em, "2026-10-06T04:35:00Z");
  assert.equal(finais[0]?.finalizado_por_nome, "Jeimes Santos");
  const resumo = { ops_finalizadas: finais } as unknown as Json;
  assert.deepEqual(opsFinalizadasNoRelatorio(resumo), finais);
  const lotes = opsFinalizadasDoTurno(
    [registro(3, { setor: "mantas", op: null, lote: " abc " })],
    [fonte({ op: null, lote: "ABC" })],
    "2026-10-05",
    "T2",
  );
  assert.equal(lotes[0]?.lote, "ABC");
});

test("metas antigas ativas desaparecem; uma lista salva vazia não ressuscita metas do histórico", () => {
  assert.deepEqual(
    opsFinalizadasNoRelatorio({ metas: [{ op: "123", status: "ativa", quantidade_meta: 10 }] }),
    [],
  );
  const legada = {
    op: "123",
    produto_id: "fvd90",
    produto_nome: "FVD90-TBT",
    status: "finalizada",
  };
  assert.equal(opsFinalizadasNoRelatorio({ metas: [legada] }).length, 1);
  assert.deepEqual(opsFinalizadasNoRelatorio({ ops_finalizadas: [], metas: [legada] }), []);
});

function resumoPdf(ops: number): Json {
  return {
    setor: "Corte",
    turno: "T2",
    data: "2026-10-05",
    responsavel: "Jeimes dos Santos",
    geradoEm: "2026-10-06T05:41:00Z",
    totais: { apontamentos: 9, plts: 35, rolos: 6798, metragem: 18470, pendentes: 1, lancados: 8 },
    metas: [
      {
        op: "META-ATIVA",
        produto_nome: "FVD 20",
        status: "ativa",
        quantidade_meta: 20,
        unidade: "PLTs",
      },
    ],
    ops_finalizadas: Array.from({ length: ops }, (_, i) => ({
      produto_id: "fvd90",
      produto_nome: "FVD90-TBT",
      op: `9${String(i).padStart(5, "0")}`,
      status: "finalizada",
    })),
    apontamentos: Array.from({ length: 9 }, (_, i) =>
      registro(4, {
        op: `8${String(i).padStart(5, "0")}`,
        status: i === 8 ? "pendente" : "lancado",
      }),
    ) as unknown as Json,
  };
}

test("PDF sem metas ativas conserva os nove apontamentos detalhados e os nomes abreviados", () => {
  const resumo = resumoPdf(1);
  const pdf = new TextDecoder().decode(gerarPdfRelatorio(resumo));
  assert.doesNotMatch(pdf, /METAS ATIVAS|META-ATIVA|Meta:/);
  assert.match(pdf, /OPS FINALIZADAS/);
  assert.match(pdf, /OP 900000/);
  for (let i = 0; i < 9; i++)
    assert.equal(pdf.split(`(8${String(i).padStart(5, "0")}) Tj`).length - 1, 1);
  assert.match(pdf, /APONTADO POR/);
  assert.match(pdf, /PROTHEUS \/ LANCADO POR/);
  assert.match(pdf, /Jeimes Santos/);
  assert.match(pdf, /Amauri Junior/);
  assert.match(pdf, /Aguardando lancamento/);
  assert.doesNotMatch(pdf, /Jeimes dos Santos|Amauri Silva Junior/);
  assert(
    linhasDoRelatorio(resumo).some((l) => l.includes("OP 900000") && l.includes("OP finalizada")),
  );
  assert.doesNotMatch(new TextDecoder().decode(gerarPdfRelatorio(resumoPdf(0))), /OPS FINALIZADAS/);
});

test("muitas OPs finalizadas são paginadas integralmente antes do detalhamento", () => {
  const pdf = new TextDecoder().decode(gerarPdfRelatorio(resumoPdf(70)));
  for (let i = 0; i < 70; i++)
    assert.equal(pdf.split(`OP 9${String(i).padStart(5, "0")}`).length - 1, 1);
  for (let i = 0; i < 9; i++)
    assert.equal(pdf.split(`(8${String(i).padStart(5, "0")}) Tj`).length - 1, 1);
  assert.match(pdf, /\/Count [4-9]/);
});
