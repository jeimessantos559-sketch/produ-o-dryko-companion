import { describe, expect, it } from "vitest";
import { calcularLiquidos } from "../liquidos";
import {
  contagemPorProduto,
  sequenciasDoTurno,
  type ApontamentoTurno,
} from "../apontamentos-turno";
import { agruparRevisaoDoTurno, quantidadeDaRevisao } from "../fechamento-turno";
import { agruparProtheus } from "../protheus";

const pouch = { embalagem_liquido: "unidade", unidades_por_plt: 500, semi_kg_por_unidade: null };
const quantidade = { quantidadePlts: 2, picadoUnidades: 25, unidades: 9999 };

describe("pouch com unidades por PLT", () => {
  it("usa o padrão do cadastro para PLTs e picados, sem consumir semi", () => {
    expect(calcularLiquidos(pouch, quantidade)).toMatchObject({
      unitario: false,
      consomeSemi: false,
      configurado: true,
      valido: true,
      plts: 2,
      picado: 25,
      unidades: 1025,
      semiKg: 0,
    });
    // Um fator remanescente de balde/galão nunca gera semi para pouch.
    expect(calcularLiquidos({ ...pouch, semi_kg_por_unidade: 18 }, quantidade).semiKg).toBe(0);
  });

  it("permite somente o picado e não o conta como PLT fechado", () => {
    expect(calcularLiquidos(pouch, { ...quantidade, quantidadePlts: 0 })).toMatchObject({
      valido: true,
      plts: 0,
      picado: 25,
      unidades: 25,
      semiKg: 0,
    });
  });

  it("mantém a entrada em unidades quando não há padrão por PLT", () => {
    expect(calcularLiquidos({ ...pouch, unidades_por_plt: null }, quantidade)).toMatchObject({
      unitario: true,
      valido: true,
      plts: 0,
      picado: 0,
      unidades: 9999,
      semiKg: 0,
    });
  });

  it("rejeita padrões inválidos, sem tratá-los como entrada direta em unidades", () => {
    for (const padrao of [0, -1, 1.5, NaN, Infinity, 2_147_483_648]) {
      expect(calcularLiquidos({ ...pouch, unidades_por_plt: padrao }, quantidade).valido).toBe(
        false,
      );
    }
  });

  it("rejeita PLTs fracionados, picado cheio e totais que excedem o banco", () => {
    for (const dados of [
      { ...quantidade, quantidadePlts: 1.5 },
      { ...quantidade, quantidadePlts: -1 },
      { ...quantidade, quantidadePlts: 21 },
      { ...quantidade, picadoUnidades: -1 },
      { ...quantidade, picadoUnidades: 0.5 },
      { ...quantidade, picadoUnidades: 500 },
      { ...quantidade, quantidadePlts: 0, picadoUnidades: 0 },
    ])
      expect(calcularLiquidos(pouch, dados).valido).toBe(false);
    expect(calcularLiquidos({ ...pouch, unidades_por_plt: 2_147_483_647 }, quantidade).valido).toBe(
      false,
    );
  });

  it("mantém baldes e galões com o consumo de semi aprovado", () => {
    for (const embalagem of ["balde", "galao"]) {
      expect(
        calcularLiquidos(
          {
            embalagem_liquido: embalagem,
            unidades_por_plt: 36,
            semi_kg_por_unidade: 18,
          },
          { quantidadePlts: 12, picadoUnidades: "", unidades: 0 },
        ),
      ).toMatchObject({
        valido: true,
        plts: 12,
        unidades: 432,
        semiKg: 7776,
        consomeSemi: true,
      });
    }
  });

  it("consolida pouch em PLTs, picados e unidades no turno e no Protheus", () => {
    const registro = {
      id: "pouch-1",
      produto_id: "prikol-pouch",
      produto_nome: "Prikol pouch",
      op: "123",
      setor: "liquidos",
      turno: "T2",
      data_local: "2026-10-06",
      created_at: "2026-10-07T01:00:00Z",
      status: "pendente",
      grupos: null,
      quantidade_plts: 2,
      total_unidades: 1025,
      picado_unidades: 25,
      semi_consumido_kg: 0,
      embalagem_liquido: "unidade",
      unidades_por_plt: 500,
    } as ApontamentoTurno;
    const isolado = {
      ...registro,
      id: "pouch-2",
      quantidade_plts: 0,
      total_unidades: 25,
      created_at: "2026-10-07T01:10:00Z",
    };
    const itens = [registro, isolado];
    expect(contagemPorProduto(itens, "liquidos", "T2", "2026-10-06")[0]).toMatchObject({
      plts: 2,
      unidades: 1050,
      semiKg: 0,
    });
    expect(sequenciasDoTurno(itens).get("pouch-1")).toMatchObject({ inicio: 1, fim: 2 });
    expect(sequenciasDoTurno(itens).get("pouch-2")?.inicio).toBeNull();
    expect(quantidadeDaRevisao(agruparRevisaoDoTurno(itens)[0]!)).toBe(
      "2 PLTs e 2 picados de 50 unidades",
    );
    expect(agruparProtheus(itens, "liquidos")[0]).toMatchObject({
      plts: 2,
      unidades: 1050,
      semiKg: 0,
    });
  });
});
