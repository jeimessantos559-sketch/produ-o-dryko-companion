import { describe, expect, it } from "vitest";
import { linhasDeProducaoEmail } from "../resumo-email";

describe("linhas de produção do e-mail do relatório", () => {
  it("Líquidos e Asfox mostram PLTs, unidades e semi consumido", () => {
    const totais = { plts: 2, unidades: 72, semiKg: 259.2, metragem: 0 };
    expect(linhasDeProducaoEmail("liquidos", totais)).toEqual([
      "PLTs: 2",
      "Unidades: 72",
      "Semi consumido: 259,2 kg",
    ]);
    expect(linhasDeProducaoEmail("asfox", { plts: 1, unidades: 100, semiKg: 1000 })).toEqual([
      "PLTs: 1",
      "Unidades: 100",
      "Semi consumido: 1.000 kg",
    ]);
  });

  it("mantém Corte, Fitas, Mantas e Misturadores como antes", () => {
    expect(linhasDeProducaoEmail("corte", { plts: 8, metragem: 5184 })).toEqual([
      "PLTs: 8",
      "Metragem: 5.184 m²",
    ]);
    expect(linhasDeProducaoEmail("fitas", { area: 1395.5 })).toEqual(["PLTs: —", "Área: 1.395,5 m²"]);
    expect(linhasDeProducaoEmail("mantas", { plts: 1, metragem: 200 })).toEqual([
      "PLTs: 1",
      "Metragem: 200 m",
    ]);
    expect(linhasDeProducaoEmail("misturadores", { pesoKg: 2870.625 })).toEqual([
      "Peso produzido: 2.870,625 kg",
    ]);
  });
});
