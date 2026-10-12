import { describe, expect, it } from "vitest";

import {
  correspondeProgramacaoItem,
  destaqueHora,
  duracaoDoCampo,
  formatarDuracaoHoras,
  horaVaziaFinal,
  intervaloHora,
  numeroDoCampo,
  unidadeMetaTurno,
  unidadeProgramacao,
  valorRealizadoRegistro,
  type Registro,
} from "../programacao-hora";

const registro: Registro = {
  id: "1",
  produto_id: "p1",
  produto_nome: "FVD 20",
  op: " 134433 ",
  lote: null,
  quantidade_plts: 2,
  total_rolos: 640,
  metragem: 1280,
  area_m2: 30,
  data_hora_producao: "2026-10-11T18:10:00-03:00",
};

describe("programação hora a hora", () => {
  it("aceita o tempo produtivo como 9:28, 8h45 ou 7,5 horas", () => {
    expect(duracaoDoCampo("9:28")).toBeCloseTo(9 + 28 / 60);
    expect(duracaoDoCampo("8h45")).toBeCloseTo(8.75);
    expect(duracaoDoCampo("7,5")).toBe(7.5);
    expect(duracaoDoCampo("9:75")).toBeNaN();
    expect(formatarDuracaoHoras(9)).toBe("9:00");
  });

  it("lê números no formato brasileiro", () => {
    expect(numeroDoCampo("27.391")).toBe(27391);
    expect(numeroDoCampo("3.043,44")).toBeCloseTo(3043.44);
    expect(numeroDoCampo("")).toBe(0);
  });

  it("mostra o intervalo da hora atravessando a meia-noite", () => {
    expect(intervaloHora("23:00")).toBe("23:00–00:00");
    expect(intervaloHora("00:00")).toBe("00:00–01:00");
  });

  it("usa a unidade de cada setor", () => {
    expect(unidadeMetaTurno("corte")).toBe("m²");
    expect(unidadeMetaTurno("mantas")).toBe("m");
    expect(unidadeProgramacao("corte")).toBe("PLTs");
    expect(unidadeProgramacao("fitas")).toBe("m²");
    expect(valorRealizadoRegistro(registro, "corte")).toBe(2);
    expect(valorRealizadoRegistro(registro, "fitas")).toBe(30);
    expect(valorRealizadoRegistro(registro, "mantas")).toBe(1280);
    expect(destaqueHora({ ...horaVaziaFinal("06:00"), plts: 1 }, "corte")).toBe("1 PLT");
  });

  it("liga o registro à programação pela OP, sem diferenciar espaços e maiúsculas", () => {
    const item = {
      id: "x",
      produto_id: "p1",
      produto_nome: "FVD 20",
      op: "134433",
      lote: null,
      quantidade_prevista: 5,
      unidade: "PLTs",
    };
    expect(correspondeProgramacaoItem(registro, item, "corte")).toBe(true);
    expect(correspondeProgramacaoItem({ ...registro, op: "999" }, item, "corte")).toBe(false);
    expect(correspondeProgramacaoItem({ ...registro, op: "999" }, item, "mantas")).toBe(true);
  });
});
