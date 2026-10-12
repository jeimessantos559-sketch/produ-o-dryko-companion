import { describe, expect, it } from "vitest";

import { ordenarSetoresParaSelecao, rotuloSetorParaSelecao } from "../setores-lista";

const setores = [
  { nome: "Corte", ordem: 1, regras_definidas: true },
  { nome: "Fitas", ordem: 2, regras_definidas: true },
  { nome: "Mantas", ordem: 3, regras_definidas: true },
  { nome: "Asfox", ordem: 4, regras_definidas: true },
  { nome: "Misturadores", ordem: 5, regras_definidas: false },
  { nome: "Líquidos", ordem: 6, regras_definidas: true },
  { nome: "Pós", ordem: 7, regras_definidas: false },
  { nome: "Avulsos", ordem: 8, regras_definidas: false },
];

describe("lista de setores para seleção", () => {
  it("mostra primeiro os setores com regra, mantendo a ordem cadastrada", () => {
    expect(ordenarSetoresParaSelecao(setores).map((s) => s.nome)).toEqual([
      "Corte", "Fitas", "Mantas", "Asfox", "Líquidos", "Misturadores", "Pós", "Avulsos",
    ]);
  });

  it("não altera a lista original", () => {
    const copia = [...setores];
    ordenarSetoresParaSelecao(setores);
    expect(setores).toEqual(copia);
  });

  it("marca como em definição apenas os setores sem regra", () => {
    expect(rotuloSetorParaSelecao(setores[0]!)).toBe("Corte");
    expect(rotuloSetorParaSelecao(setores[4]!)).toBe("Misturadores (em definição)");
  });

  it("trata setor sem a informação como definido", () => {
    expect(rotuloSetorParaSelecao({ nome: "Corte", ordem: 1 })).toBe("Corte");
  });
});
