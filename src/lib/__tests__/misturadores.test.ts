import { describe, expect, it } from "vitest";
import { formatarKg, pesoDigitadoKg, pesoParaCampo, setorEmKg } from "../misturadores";
import { contagemPorProduto, type ApontamentoTurno } from "../apontamentos-turno";
import { agruparRevisaoDoTurno, quantidadeDaRevisao } from "../fechamento-turno";
import { agruparProtheus } from "../protheus";
import { chaveAgrupamentoProtheus } from "../agrupamento-protheus";

function apontamento(dados: Partial<ApontamentoTurno>): ApontamentoTurno {
  return {
    id: "a",
    setor: "misturadores",
    turno: "T1",
    data_local: "2026-10-15",
    produto_id: "p1",
    produto_nome: "Compound Adesiva",
    op: "4455",
    lote: null,
    status: "pendente",
    peso_kg: 1000,
    created_at: "2026-10-15T10:00:00Z",
    ...dados,
  } as ApontamentoTurno;
}

describe("Misturadores: peso digitado em kg", () => {
  it("identifica só o setor de Misturadores", () => {
    expect(setorEmKg("misturadores")).toBe(true);
    expect(setorEmKg("asfox")).toBe(false);
    expect(setorEmKg(null)).toBe(false);
  });

  it("aceita inteiro ou decimal com vírgula ou ponto, até 3 casas", () => {
    expect(pesoDigitadoKg("1250")).toBe(1250);
    expect(pesoDigitadoKg(" 1250,5 ")).toBe(1250.5);
    expect(pesoDigitadoKg("12.75")).toBe(12.75);
    expect(pesoDigitadoKg("0,125")).toBe(0.125);
  });

  it("recusa zero, texto, mais de 3 casas e ponto que parece milhar", () => {
    expect(pesoDigitadoKg("0")).toBeNull();
    expect(pesoDigitadoKg("")).toBeNull();
    expect(pesoDigitadoKg("abc")).toBeNull();
    expect(pesoDigitadoKg("10,1234")).toBeNull();
    expect(pesoDigitadoKg("1.250")).toBeNull();
    expect(pesoDigitadoKg("1.250,5")).toBeNull();
    expect(pesoDigitadoKg("-5")).toBeNull();
    expect(pesoDigitadoKg("1000000")).toBeNull();
  });

  it("formata e devolve o valor salvo para o campo de correção", () => {
    expect(formatarKg(1250.5)).toBe("1.250,5 kg");
    expect(pesoParaCampo(900.5)).toBe("900,5");
    expect(pesoParaCampo(null)).toBe("");
  });

  it("agrupa no Protheus por OP + produto e soma o peso", () => {
    const itens = [
      apontamento({ id: "1", peso_kg: 1000 }),
      apontamento({ id: "2", op: " 4455 ", peso_kg: 250.5 }),
      apontamento({ id: "3", op: "9999", peso_kg: 10 }),
      apontamento({ id: "4", produto_nome: "Compound W-11", peso_kg: 30 }),
    ];
    const grupos = agruparProtheus(itens, "misturadores");
    expect(grupos).toHaveLength(3);
    expect(grupos[0]!.ids).toEqual(["1", "2"]);
    expect(grupos[0]!.pesoKg).toBe(1250.5);
    expect(chaveAgrupamentoProtheus(itens[0]!, "misturadores")).toBe(
      chaveAgrupamentoProtheus(itens[1]!, "misturadores"),
    );
  });

  it("revisão do fechamento e contagem por produto mostram o peso", () => {
    const itens = [apontamento({ id: "1", peso_kg: 1000 }), apontamento({ id: "2", peso_kg: 0.5 })];
    const [grupo] = agruparRevisaoDoTurno(itens);
    expect(quantidadeDaRevisao(grupo!)).toBe("1.000,5 kg");
    expect(contagemPorProduto(itens, "misturadores", "T1", "2026-10-15")[0]!.pesoKg).toBe(1000.5);
  });
});
