import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { chaveAgrupamentoProtheus } from "../src/lib/agrupamento-protheus.ts";
import {
  areaFitas,
  dataOperacional,
  horasProdutivasTurno,
  metragemCorte,
  ordemHoraTurno,
  rolosManta,
  totalPlts,
  totalRolos,
} from "../src/lib/producao.ts";

describe("data e sequência operacional", () => {
  test("T2 e T3 antes das 06:00 pertencem ao dia anterior", () => {
    const cincoECinquentaENoveEmSaoPaulo = new Date("2026-10-01T08:59:00.000Z");
    assert.equal(dataOperacional("T2", cincoECinquentaENoveEmSaoPaulo), "2026-09-30");
    assert.equal(dataOperacional("T3", cincoECinquentaENoveEmSaoPaulo), "2026-09-30");
    assert.equal(dataOperacional("T1", cincoECinquentaENoveEmSaoPaulo), "2026-10-01");
  });

  test("às 06:00 começa a data civil corrente", () => {
    assert.equal(dataOperacional("T2", new Date("2026-10-01T09:00:00.000Z")), "2026-10-01");
  });

  test("T2 mantém 00:00 e 01:00 depois de 23:00", () => {
    const horas = ["00:00", "17:00", "23:00", "01:00", "16:00"];
    assert.deepEqual(
      horas.sort((a, b) => ordemHoraTurno(a, "T2") - ordemHoraTurno(b, "T2")),
      ["16:00", "17:00", "23:00", "00:00", "01:00"],
    );
    assert.deepEqual(horasProdutivasTurno("T3"), ["01:00", "02:00", "03:00", "04:00", "05:00"]);
  });
});

describe("fórmulas industriais", () => {
  test("PLT picado soma unidades sem virar PLT fechado", () => {
    const grupos = [
      {
        quantidadePlts: 2,
        rolosPorPlt: 320,
        pltPicadoRolos: 50,
        picadoAdicional: true,
      },
    ];
    assert.equal(totalPlts(grupos), 2);
    assert.equal(totalRolos(grupos), 690);
  });

  test("Corte converte largura e rolos em metragem quadrada", () => {
    assert.equal(metragemCorte(20, 320), 640);
  });

  test("Fitas usa tempo, velocidade e largura", () => {
    assert.equal(areaFitas(10, 50, 0.93), 465);
  });

  test("Mantas converte metragem em rolos de 10 metros", () => {
    assert.equal(rolosManta(250), 25);
    assert.equal(rolosManta(200), 20);
  });
});

describe("agrupamento para o Protheus", () => {
  const item = { id: "1", produto_nome: " FVD 20 ", op: " op-100 ", lote: " l-9 " };

  test("Corte e Fitas agrupam por OP + produto", () => {
    assert.equal(chaveAgrupamentoProtheus(item, "corte"), "corte:FVD 20:OP-100");
    assert.equal(chaveAgrupamentoProtheus(item, "fitas"), "fitas:FVD 20:OP-100");
  });

  test("Mantas agrupam por lote + produto", () => {
    assert.equal(chaveAgrupamentoProtheus(item, "mantas"), "manta:FVD 20:L-9");
  });

  test("registro sem identificador obrigatório permanece isolado", () => {
    assert.equal(chaveAgrupamentoProtheus({ ...item, op: null }, "corte"), "item:1");
  });
});
