import { describe, expect, it } from "vitest";

import {
  areaFitas, dataOperacional, horarioPertenceTurno, horasProdutivasTurno, metragemCorte,
  ordemHoraTurno, rolosManta, totalPlts, totalRolos,
} from "../producao";
import { agruparProtheus } from "../protheus";
import { aderencias, pendentesAntigas, tempoMedioConfirmacaoMin } from "../indicadores";

// 03:30 UTC = 00:30 em São Paulo (UTC-3)
const MADRUGADA = new Date("2026-10-02T03:30:00Z");

describe("data operacional", () => {
  it("T2 e T3 após meia-noite pertencem ao dia anterior; T1 não", () => {
    expect(dataOperacional("T2", MADRUGADA)).toBe("2026-10-01");
    expect(dataOperacional("T3", MADRUGADA)).toBe("2026-10-01");
    expect(dataOperacional("T1", MADRUGADA)).toBe("2026-10-02");
    expect(dataOperacional("T3", new Date("2026-10-02T09:00:00Z"))).toBe("2026-10-02");
  });
});

describe("turnos", () => {
  it("respeita limites reais de cada turno", () => {
    expect(horarioPertenceTurno("T1", "06:00")).toBe(true);
    expect(horarioPertenceTurno("T1", "15:38")).toBe(false);
    expect(horarioPertenceTurno("T2", "15:38")).toBe(true);
    expect(horarioPertenceTurno("T2", "01:59")).toBe(true);
    expect(horarioPertenceTurno("T2", "02:00")).toBe(false);
    expect(horarioPertenceTurno("T3", "01:00")).toBe(true);
    expect(horarioPertenceTurno("T3", "06:00")).toBe(false);
  });

  it("ordena as horas do T2 atravessando a meia-noite", () => {
    const horas = horasProdutivasTurno("T2");
    const ordenadas = [...horas].sort((a, b) => ordemHoraTurno(a, "T2") - ordemHoraTurno(b, "T2"));
    expect(ordenadas).toEqual(horas);
    expect(ordenadas.at(-1)).toBe("01:00");
  });
});

describe("Corte", () => {
  it("PLT picado adicional não aumenta PLTs fechados", () => {
    const grupos = [{ quantidadePlts: 2, rolosPorPlt: 640, pltPicadoRolos: 100, picadoAdicional: true }];
    expect(totalPlts(grupos)).toBe(2);
    expect(totalRolos(grupos)).toBe(2 * 640 + 100);
  });

  it("registro antigo: picado fazia parte da quantidade informada", () => {
    expect(totalRolos([{ quantidadePlts: 3, rolosPorPlt: 640, pltPicadoRolos: 100 }])).toBe(2 * 640 + 100);
  });

  it("metragem = largura × rolos ÷ 10; sem largura fica indefinida", () => {
    expect(metragemCorte(0.5, 1280)).toBe(64);
    expect(metragemCorte(null, 1280)).toBeNull();
  });
});

describe("Fitas e Mantas", () => {
  it("Fitas: m² = tempo × velocidade × largura (padrão 0,93)", () => {
    expect(areaFitas(60, 10)).toBeCloseTo(558);
    expect(areaFitas(10, 5, 1)).toBe(50);
  });

  it("Mantas: rolos = metragem ÷ metros por rolo", () => {
    expect(rolosManta(120)).toBe(12);
    expect(rolosManta(120, 20)).toBe(6);
    expect(rolosManta(120, 0)).toBe(0);
  });
});

describe("agrupamento Protheus", () => {
  const base = { status: "pendente", quantidade_plts: 1, total_rolos: 10, metragem: 5, area_m2: 2 };

  it("Corte agrupa por OP + produto (sem diferenciar maiúsculas/espaços)", () => {
    const g = agruparProtheus([
      { ...base, id: "1", produto_nome: "FVD 10", op: "123" },
      { ...base, id: "2", produto_nome: "fvd 10 ", op: " 123" },
      { ...base, id: "3", produto_nome: "FVD 10", op: "999" },
      { ...base, id: "4", produto_nome: "FVD 20", op: "123" },
    ], "corte");
    expect(g.map((x) => x.ids)).toEqual([["1", "2"], ["3"], ["4"]]);
    expect(g[0]?.plts).toBe(2);
  });

  it("Fitas agrupa por OP + produto e soma m²", () => {
    const g = agruparProtheus([
      { ...base, id: "1", produto_nome: "Fita A", op: "7" },
      { ...base, id: "2", produto_nome: "Fita A", op: "7" },
      { ...base, id: "3", produto_nome: "Fita A", op: null },
    ], "fitas");
    expect(g.length).toBe(2);
    expect(g[0]?.area).toBe(4);
    expect(g[1]?.ids).toEqual(["3"]);
  });

  it("Mantas agrupa por lote + produto, ignorando OP", () => {
    const g = agruparProtheus([
      { ...base, id: "1", produto_nome: "Manta", lote: "L1", op: "X" },
      { ...base, id: "2", produto_nome: "Manta", lote: "l1", op: "Y" },
      { ...base, id: "3", produto_nome: "Manta", lote: "L2" },
    ], "mantas");
    expect(g.map((x) => x.ids)).toEqual([["1", "2"], ["3"]]);
    expect(g[0]?.metragem).toBe(10);
  });

  it("lançados permanecem unitários no controle (somente pendentes agrupam)", () => {
    const g = agruparProtheus([
      { ...base, id: "1", produto_nome: "P", op: "1", status: "lancado" },
      { ...base, id: "2", produto_nome: "P", op: "1", status: "lancado" },
    ], "corte", { somentePendentes: true });
    expect(g.length).toBe(2);
  });
});

describe("indicadores gerenciais", () => {
  const ap = (o: Partial<Parameters<typeof pendentesAntigas>[0][number]>) => ({
    status: "pendente", created_at: "2026-10-01T10:00:00Z", lancado_em: null,
    quantidade_plts: 2, metragem: 50, area_m2: 30, ...o,
  });

  it("compara meta só na mesma unidade do setor", () => {
    const r = aderencias("corte", [{ quantidade: 100, unidade: "m²" }, { quantidade: 4, unidade: "PLTs" }], [ap({}), ap({})]);
    expect(r).toEqual([
      { unidade: "m²", alvo: 100, realizado: 100, percentual: 100 },
      { unidade: "PLTs", alvo: 4, realizado: 4, percentual: 100 },
    ]);
    expect(aderencias("fitas", [{ quantidade: 10, unidade: "PLTs" }], [ap({})])).toEqual([]);
  });

  it("pendências antigas e tempo médio até o Protheus", () => {
    const agora = new Date("2026-10-03T10:00:00Z");
    expect(pendentesAntigas([ap({}), ap({ created_at: "2026-10-03T09:00:00Z" })], agora)).toBe(1);
    expect(tempoMedioConfirmacaoMin([ap({ status: "lancado", lancado_em: "2026-10-01T10:30:00Z" })])).toBe(30);
    expect(tempoMedioConfirmacaoMin([ap({})])).toBeNull();
  });
});

import { calcularDuracaoOcorrencia, formatarDuracaoOcorrencia, totalParadoPorEquipamento, textoOcorrencias } from "@/lib/ocorrencias-operacionais";

describe("horários das ocorrências", () => {
  it("calcula duração, inclusive após meia-noite", () => {
    expect(calcularDuracaoOcorrencia("23:00", "01:00")).toBe(120);
    expect(calcularDuracaoOcorrencia("15:00", "17:00")).toBe(120);
    expect(calcularDuracaoOcorrencia("08:15:00", "09:00:00")).toBe(45);
    expect(calcularDuracaoOcorrencia("10:00", "10:00")).toBe(0);
    expect(calcularDuracaoOcorrencia(null, "10:00")).toBeNull();
    expect(calcularDuracaoOcorrencia("10:00", "")).toBeNull();
  });
  it("formata duração", () => {
    expect([120, 90, 45, 0, null].map(formatarDuracaoOcorrencia)).toEqual(["2h00", "1h30", "45min", "", ""]);
  });
  it("soma por equipamento sem contar sem_ocorrencias", () => {
    const o = (tipo: string, dur: number | null, eq = "Máquina de corte 3") =>
      ({ id: tipo + dur, equipamento: eq, tipo_status: tipo, mensagem: "x", created_at: "2026-10-01T10:00:00Z", duracao_min: dur });
    const t = totalParadoPorEquipamento([o("ocorrencia", 120), o("em_manutencao", 80), o("sem_ocorrencias", 60), o("sem_producao", 0)]);
    expect(t.get("Máquina de corte 3")).toBe(200);
    const txt = textoOcorrencias([{ ...o("ocorrencia", 120), mensagem: "Quebrou o disco", hora_inicio: "23:00:00", hora_fim: "01:00:00" }], false, "corte");
    expect(txt).toContain("Máquina de corte 3 — Total parado: 2h00");
    expect(txt).toContain("2h00 parada · 23:00 às 01:00 · Quebrou o disco");
  });
});

describe("ocorrências de Mantas", () => {
  it("livre, com equipamento opcional e total parado", () => {
    const base = { tipo_status: "ocorrencia", created_at: "2026-10-01T10:00:00Z" };
    const txt = textoOcorrencias([
      { ...base, id: "1", equipamento: "Linha 4", mensagem: "Correia", duracao_min: 90, hora_inicio: "15:00", hora_fim: "16:30" },
      { ...base, id: "2", equipamento: null, mensagem: "Geral" },
    ], false, "mantas");
    expect(txt).toContain("Linha 4: Correia");
    expect(txt).toContain("Linha 4 — Total parado: 1h30");
    expect(txt).not.toContain("Linha 5");
  });
});

import { dadosFinalizacaoOcorrencia, ocorrenciaEmAndamento } from "@/lib/ocorrencias-operacionais";

describe("ocorrência em andamento", () => {
  const base = { id: "a", equipamento: "Linha 4", tipo_status: "ocorrencia", mensagem: "Correia", created_at: "2026-10-01T10:00:00Z" };
  it("registra só com início e mostra Em andamento sem somar", () => {
    const o = { ...base, hora_inicio: "15:20:00", hora_fim: null, duracao_min: null };
    expect(ocorrenciaEmAndamento(o)).toBe(true);
    const txt = textoOcorrencias([o], false, "mantas");
    expect(txt).toContain("Em andamento desde 15:20 · Linha 4: Correia");
    expect(txt).not.toContain("Total parado");
    expect(totalParadoPorEquipamento([{ ...o, duracao_min: 50 }]).size).toBe(0);
  });
  it("finaliza calculando a duração", () => {
    expect(dadosFinalizacaoOcorrencia("15:20:00", "17:00")).toEqual({ hora_fim: "17:00", duracao_min: 100 });
    expect(dadosFinalizacaoOcorrencia("23:00:00", "01:00")).toEqual({ hora_fim: "01:00", duracao_min: 120 });
    expect(dadosFinalizacaoOcorrencia(null, "01:00")).toBeNull();
    const fim = { ...base, hora_inicio: "23:00:00", ...dadosFinalizacaoOcorrencia("23:00:00", "01:00")! };
    expect(textoOcorrencias([fim], false, "mantas")).toContain("Linha 4 — Total parado: 2h00");
  });
});
