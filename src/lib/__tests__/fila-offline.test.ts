import { describe, expect, it } from "vitest";

import {
  PRAZO_SEM_INTERNET_MS,
  adicionarNaFila,
  atualizarNaFila,
  classificarErroEnvio,
  ehErroDeRede,
  lerFila,
  mensagemConflito,
  novoIdApontamento,
  prazoVencido,
  removerDaFila,
  type ApontamentoNaFila,
  type Armazenamento,
} from "../fila-offline";

function memoria(): Armazenamento & { dados: Map<string, string> } {
  const dados = new Map<string, string>();
  return {
    dados,
    getItem: (k) => dados.get(k) ?? null,
    setItem: (k, v) => void dados.set(k, v),
    removeItem: (k) => void dados.delete(k),
  };
}

function item(parcial: Partial<ApontamentoNaFila> = {}): ApontamentoNaFila {
  return {
    id: "a1",
    usuarioId: "u1",
    setor: "corte",
    turno: "T2",
    registradoEm: "2026-10-12T17:30:00.000Z",
    insercao: { setor: "corte", op: "134433" },
    programacao: null,
    descricao: "OP 134433 · FVD 45 · 3 PLTs",
    situacao: "aguardando",
    erro: null,
    tentativas: 0,
    ...parcial,
  };
}

describe("fila de apontamentos sem internet", () => {
  it("guarda, lê e remove por usuário, sem duplicar o mesmo id", () => {
    const arm = memoria();
    expect(adicionarNaFila(item(), arm)).toBe(true);
    expect(adicionarNaFila(item(), arm)).toBe(true);
    expect(adicionarNaFila(item({ id: "a2" }), arm)).toBe(true);
    expect(lerFila("u1", arm).map((i) => i.id)).toEqual(["a1", "a2"]);
    expect(removerDaFila("u1", "a1", arm)).toBe(true);
    expect(lerFila("u1", arm).map((i) => i.id)).toEqual(["a2"]);
  });

  it("nunca mistura a fila de outra pessoa no mesmo aparelho", () => {
    const arm = memoria();
    adicionarNaFila(item({ usuarioId: "u1" }), arm);
    adicionarNaFila(item({ id: "b1", usuarioId: "u2" }), arm);
    expect(lerFila("u1", arm).map((i) => i.id)).toEqual(["a1"]);
    expect(lerFila("u2", arm).map((i) => i.id)).toEqual(["b1"]);
    expect(lerFila(null, arm)).toEqual([]);
  });

  it("marca conflito com a explicação e permite voltar para aguardando", () => {
    const arm = memoria();
    adicionarNaFila(item(), arm);
    atualizarNaFila("u1", "a1", { situacao: "conflito", erro: "Turno fechado" }, arm);
    expect(lerFila("u1", arm)[0]).toMatchObject({ situacao: "conflito", erro: "Turno fechado" });
    atualizarNaFila("u1", "a1", { situacao: "aguardando", erro: null }, arm);
    expect(lerFila("u1", arm)[0]?.situacao).toBe("aguardando");
  });

  it("sem armazenamento disponível avisa que não guardou", () => {
    expect(adicionarNaFila(item(), null)).toBe(false);
    const cheio: Armazenamento = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => undefined,
    };
    expect(adicionarNaFila(item(), cheio)).toBe(false);
  });

  it("ignora conteúdo corrompido no armazenamento", () => {
    const arm = memoria();
    arm.setItem("dryko:apontamentos-sem-internet:v1:u1", "{quebrado");
    expect(lerFila("u1", arm)).toEqual([]);
  });

  it("vence o prazo depois de 12 horas", () => {
    const salvo = Date.parse("2026-10-12T17:30:00.000Z");
    expect(prazoVencido(item(), salvo + PRAZO_SEM_INTERNET_MS)).toBe(false);
    expect(prazoVencido(item(), salvo + PRAZO_SEM_INTERNET_MS + 1)).toBe(true);
  });
});

describe("classificação da resposta do servidor", () => {
  it("separa salvo, já salvo, sem rede, sessão e conflito", () => {
    expect(classificarErroEnvio(null)).toBe("salvo");
    expect(classificarErroEnvio({ code: "23505", message: "duplicate key" })).toBe("ja-salvo");
    expect(classificarErroEnvio({ code: "", message: "TypeError: Failed to fetch" })).toBe(
      "sem-rede",
    );
    expect(classificarErroEnvio(new TypeError("Load failed"))).toBe("sem-rede");
    expect(classificarErroEnvio({ code: "P0001", message: "qualquer" }, false)).toBe("sem-rede");
    expect(classificarErroEnvio({ code: "PGRST301", message: "JWT expired" })).toBe("sessao");
    expect(
      classificarErroEnvio({ code: "P0001", message: "O turno esta fechado. Solicite a reabertura" }),
    ).toBe("conflito");
  });

  it("reconhece falha de transporte em vários navegadores", () => {
    expect(ehErroDeRede(new TypeError("Failed to fetch"))).toBe(true);
    expect(ehErroDeRede({ message: "NetworkError when attempting to fetch resource." })).toBe(true);
    expect(ehErroDeRede({ message: "O turno esta fechado" })).toBe(false);
  });

  it("explica cada recusa do banco para o facilitador", () => {
    const alvo = { setor: "corte" as const, turno: "T1" };
    expect(mensagemConflito({ message: "O turno esta fechado. Solicite a reabertura" }, alvo)).toMatch(
      /reabrir o turno/,
    );
    expect(
      mensagemConflito({ message: "Apontamento sem internet enviado depois do prazo de 12 horas" }, alvo),
    ).toMatch(/prazo de 12 horas/);
    expect(
      mensagemConflito({ message: "O horario informado nao pertence ao turno selecionado" }, alvo),
    ).toMatch(/não pertence ao turno/);
    expect(
      mensagemConflito({ code: "42501", message: "new row violates row-level security policy" }, alvo),
    ).toMatch(/Corte · 1º turno/);
    expect(mensagemConflito({ message: "Produto invalido para o setor" }, alvo)).toMatch(/desativado/);
  });

  it("gera ids no formato UUID v4", () => {
    const id = novoIdApontamento();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(novoIdApontamento()).not.toBe(id);
  });
});
