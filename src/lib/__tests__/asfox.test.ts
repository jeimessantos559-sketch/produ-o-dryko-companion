import { describe, expect, it } from "vitest";
import { calcularLiquidos, nomeEmbalagemLiquido, setorComConsumoSemi } from "../liquidos";
import {
  contagemPorProduto,
  sequenciasDoTurno,
  type ApontamentoTurno,
} from "../apontamentos-turno";
import { agruparRevisaoDoTurno, quantidadeDaRevisao } from "../fechamento-turno";
import { agruparProtheus } from "../protheus";
import { chaveAgrupamentoProtheus } from "../agrupamento-protheus";

const asfox = { embalagem_liquido: "saco", unidades_por_plt: 100, semi_kg_por_unidade: 10 };
const quantidade = { quantidadePlts: 1, picadoUnidades: "" as const, unidades: 9999 };

describe("Asfox SC", () => {
  it("converte cada PLT em 100 unidades e 1.000 kg de semi", () => {
    expect(calcularLiquidos(asfox, quantidade)).toMatchObject({
      configurado: true,
      valido: true,
      unitario: false,
      consomeSemi: true,
      plts: 1,
      picado: 0,
      unidades: 100,
      semiKg: 1000,
    });
    expect(calcularLiquidos(asfox, { ...quantidade, quantidadePlts: 20 })).toMatchObject({
      valido: true,
      plts: 20,
      unidades: 2000,
      semiKg: 20000,
    });
  });

  it("soma o picado sem contá-lo como PLT fechado", () => {
    expect(
      calcularLiquidos(asfox, { ...quantidade, quantidadePlts: 2, picadoUnidades: 25 }),
    ).toMatchObject({ valido: true, plts: 2, picado: 25, unidades: 225, semiKg: 2250 });
    expect(
      calcularLiquidos(asfox, { ...quantidade, quantidadePlts: 0, picadoUnidades: 25 }),
    ).toMatchObject({ valido: true, plts: 0, unidades: 25, semiKg: 250 });
  });

  it("rejeita peso ausente, sacos sem padrão, picado cheio e PLT fracionado", () => {
    expect(calcularLiquidos({ ...asfox, semi_kg_por_unidade: null }, quantidade).valido).toBe(
      false,
    );
    expect(calcularLiquidos({ ...asfox, unidades_por_plt: null }, quantidade).valido).toBe(false);
    for (const qtd of [
      { ...quantidade, picadoUnidades: 100 },
      { ...quantidade, picadoUnidades: -1 },
      { ...quantidade, quantidadePlts: 1.5 },
      { ...quantidade, quantidadePlts: 21 },
      { ...quantidade, quantidadePlts: 0 },
    ])
      expect(calcularLiquidos(asfox, qtd).valido).toBe(false);
  });

  it("usa o padrão e o peso cadastrados, incluindo valores decimais", () => {
    expect(
      calcularLiquidos({ ...asfox, unidades_por_plt: 80, semi_kg_por_unidade: 7.5 }, quantidade),
    ).toMatchObject({ valido: true, unidades: 80, semiKg: 600 });
    expect(nomeEmbalagemLiquido("saco")).toBe("Saco");
    expect(setorComConsumoSemi("asfox")).toBe(true);
    expect(setorComConsumoSemi("liquidos")).toBe(true);
    for (const setor of ["corte", "fitas", "mantas", "pos", undefined])
      expect(setorComConsumoSemi(setor)).toBe(false);
  });

  it("mantém os mesmos totais na sequência, contagem, revisão e Protheus", () => {
    const primeiro = {
      id: "asfox-1",
      produto_id: "asfox-sc",
      produto_nome: "Asfox SC",
      setor: "asfox",
      turno: "T2",
      data_local: "2026-10-08",
      op: "123",
      created_at: "2026-10-08T20:00:00Z",
      status: "pendente",
      grupos: null,
      quantidade_plts: 2,
      picado_unidades: 25,
      total_unidades: 225,
      semi_consumido_kg: 2250,
    } as ApontamentoTurno;
    const picado = {
      ...primeiro,
      id: "asfox-2",
      created_at: "2026-10-08T21:00:00Z",
      quantidade_plts: 0,
      total_unidades: 25,
      semi_consumido_kg: 250,
    };
    const itens = [primeiro, picado];
    expect(contagemPorProduto(itens, "asfox", "T2", "2026-10-08")[0]).toMatchObject({
      plts: 2,
      unidades: 250,
      semiKg: 2500,
      rolos: 0,
      metragem: 0,
    });
    expect(sequenciasDoTurno(itens).get("asfox-1")).toMatchObject({ inicio: 1, fim: 2 });
    expect(sequenciasDoTurno(itens).get("asfox-2")?.inicio).toBeNull();
    expect(quantidadeDaRevisao(agruparRevisaoDoTurno(itens)[0]!)).toBe(
      "2 PLTs e 2 picados de 50 unidades",
    );
    expect(agruparProtheus(itens, "asfox")).toHaveLength(1);
    expect(agruparProtheus(itens, "asfox")[0]).toMatchObject({
      plts: 2,
      unidades: 250,
      semiKg: 2500,
      registros: 2,
    });
    expect(chaveAgrupamentoProtheus(primeiro, "asfox")).toBe(
      chaveAgrupamentoProtheus(picado, "asfox"),
    );
    expect(
      agruparProtheus([...itens, { ...picado, id: "asfox-3", op: "456" }], "asfox"),
    ).toHaveLength(2);
  });
});
