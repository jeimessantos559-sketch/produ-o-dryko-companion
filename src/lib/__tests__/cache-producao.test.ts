import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const consultarUltimo = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      const filtros: Record<string, string> = {};
      return {
        select() {
          return this;
        },
        eq(coluna: string, valor: string) {
          filtros[coluna] = valor;
          return this;
        },
        order() {
          return this;
        },
        limit() {
          return this;
        },
        maybeSingle() {
          return consultarUltimo(filtros);
        },
      };
    },
  },
}));

import type { ApontamentoTurno } from "../apontamentos-turno";
import { consultarComCache, gravarCache, invalidarCache, lerCache } from "../cache-consultas";
import {
  chavePainel,
  invalidarDadosProducao,
  memorizarUltimoApontamento,
  obterUltimoApontamento,
  painelComApontamento,
  PRAZO_DADOS_PRODUCAO,
  registrarApontamentoConfirmado,
  type PainelPayload,
} from "../cache-producao";

function registro(alteracoes: Partial<ApontamentoTurno> = {}): ApontamentoTurno {
  return {
    id: "a",
    usuario_id: "pessoa-a",
    setor: "corte",
    turno: "T2",
    data_local: "2026-10-14",
    created_at: "2026-10-15T00:30:00Z",
    data_hora_producao: "2026-10-14T21:30:00",
    produto_id: "produto-a",
    produto_nome: "FVD 20",
    op: "123",
    status: "pendente",
    quantidade_plts: 2,
    rolos_por_plt: 320,
    total_rolos: 740,
    metragem: 1480,
    grupos: [{ quantidadePlts: 2, rolosPorPlt: 320, pltPicadoRolos: 100, picadoAdicional: true }],
    total_unidades: null,
    semi_consumido_kg: null,
    peso_kg: null,
    ...alteracoes,
  } as ApontamentoTurno;
}

describe("fluidez com dados confirmados da produção", () => {
  beforeEach(() => {
    invalidarCache();
    consultarUltimo.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });
  afterEach(() => {
    invalidarCache();
    vi.useRealTimers();
  });

  it("Repetir usa os dados já carregados do próprio usuário sem consultar o banco", async () => {
    const meu = registro();
    memorizarUltimoApontamento("pessoa-a", [
      registro({ id: "outro", usuario_id: "pessoa-b" }),
      meu,
    ]);
    expect(await obterUltimoApontamento("pessoa-a", "corte", "T2")).toEqual(meu);
    expect(consultarUltimo).not.toHaveBeenCalled();
  });

  it("repete por ordem de criação, mesmo quando a produção foi informada para uma hora anterior", async () => {
    const novo = registro({
      id: "novo",
      created_at: "2026-10-15T01:00:00Z",
      data_hora_producao: "2026-10-14T16:00:00",
    });
    memorizarUltimoApontamento("pessoa-a", [novo, registro()]);
    expect((await obterUltimoApontamento("pessoa-a", "corte", "T2"))?.id).toBe("novo");
  });

  it("revalida o último após o prazo curto e separa usuário, setor e turno", async () => {
    memorizarUltimoApontamento("pessoa-a", [registro()]);
    consultarUltimo.mockResolvedValue({ data: null, error: null });
    await obterUltimoApontamento("pessoa-b", "corte", "T2");
    await obterUltimoApontamento("pessoa-a", "mantas", "T2");
    await obterUltimoApontamento("pessoa-a", "corte", "T1");
    expect(consultarUltimo.mock.calls.map(([f]) => f)).toEqual([
      { usuario_id: "pessoa-b", setor: "corte", turno: "T2" },
      { usuario_id: "pessoa-a", setor: "mantas", turno: "T2" },
      { usuario_id: "pessoa-a", setor: "corte", turno: "T1" },
    ]);
    vi.setSystemTime(PRAZO_DADOS_PRODUCAO);
    await obterUltimoApontamento("pessoa-a", "corte", "T2");
    expect(consultarUltimo).toHaveBeenCalledTimes(4);
  });

  it("deduplica consultas simultâneas e não guarda falhas", async () => {
    consultarUltimo.mockResolvedValueOnce({ data: null, error: new Error("Sem rede") });
    await expect(obterUltimoApontamento("pessoa-a", "corte", "T2")).rejects.toThrow("Sem rede");
    consultarUltimo.mockResolvedValue({ data: registro(), error: null });
    const [a, b] = await Promise.all([
      obterUltimoApontamento("pessoa-a", "corte", "T2"),
      obterUltimoApontamento("pessoa-a", "corte", "T2"),
    ]);
    expect(a).toEqual(b);
    expect(consultarUltimo).toHaveBeenCalledTimes(2);
  });

  it("atualiza os totais com o registro confirmado, sem duplicar IDs nem contar picado como PLT", () => {
    const antigo = registro({
      id: "antigo",
      quantidade_plts: 0,
      total_rolos: 50,
      metragem: 100,
      grupos: [{ quantidadePlts: 0, rolosPorPlt: 320, pltPicadoRolos: 50, picadoAdicional: true }],
    });
    const pendenciaAntiga = registro({ id: "pendencia-antiga", data_local: "2026-10-13" });
    const base: PainelPayload = { recentes: [antigo], pendencias: [pendenciaAntiga, antigo] };
    const resultado = painelComApontamento(painelComApontamento(base, registro()), registro());
    expect(resultado.resumo).toMatchObject({
      registros: 2,
      pendentes: 2,
      plts: 2,
      rolos: 790,
      metragem: 1580,
    });
    expect(resultado.pendencias).toHaveLength(3);
    expect(base.recentes).toEqual([antigo]);
    expect(base.pendencias).toHaveLength(2);
  });

  it("preserva semi em kg, peso de Misturadores e área de Fitas como medidas distintas", () => {
    const asfox = registro({
      setor: "asfox",
      grupos: null,
      total_rolos: null,
      metragem: null,
      quantidade_plts: 1,
      total_unidades: 100,
      semi_consumido_kg: 1000,
    });
    const misturador = registro({
      id: "mist",
      setor: "misturadores",
      grupos: null,
      quantidade_plts: 0,
      total_rolos: null,
      metragem: null,
      peso_kg: 250,
    });
    const fita = registro({
      id: "fita",
      setor: "fitas",
      grupos: null,
      quantidade_plts: null,
      total_rolos: null,
      metragem: null,
      area_m2: 1395,
    });
    const a = painelComApontamento({}, asfox);
    expect(a.resumo).toMatchObject({ unidades: 100, semiKg: 1000, pesoKg: 0 });
    expect(painelComApontamento({}, misturador).resumo).toMatchObject({ pesoKg: 250, semiKg: 0 });
    expect(painelComApontamento({}, fita).resumo).toMatchObject({ area: 1395, rolos: 0 });
  });

  it("mantém o painel completo, invalida as outras telas e disponibiliza o novo registro para Repetir", async () => {
    const r = registro();
    const chave = chavePainel("pessoa-a", r.setor, r.turno, r.data_local);
    gravarCache(chave, PRAZO_DADOS_PRODUCAO, { recentes: [], pendencias: [] });
    for (const prefixo of ["historico:", "programacao-turno:", "programacao-dia:"])
      gravarCache(prefixo + "pessoa-a", PRAZO_DADOS_PRODUCAO, "antigo");
    registrarApontamentoConfirmado("pessoa-a", r);
    expect(lerCache<PainelPayload>(chave)?.valor.recentes).toEqual([r]);
    expect(lerCache("historico:pessoa-a")).toBeNull();
    expect(lerCache("programacao-turno:pessoa-a")).toBeNull();
    expect(lerCache("programacao-dia:pessoa-a")).toBeNull();
    expect(await obterUltimoApontamento("pessoa-a", "corte", "T2")).toEqual(r);
    expect(consultarUltimo).not.toHaveBeenCalled();
  });

  it("não cria um painel parcial nem modifica o cache para a conta errada", () => {
    const r = registro();
    registrarApontamentoConfirmado("pessoa-a", r);
    expect(lerCache(chavePainel("pessoa-a", r.setor, r.turno, r.data_local))).toBeNull();
    gravarCache("historico:pessoa-b", PRAZO_DADOS_PRODUCAO, "preservado");
    registrarApontamentoConfirmado("pessoa-b", r);
    expect(lerCache("historico:pessoa-b")?.valor).toBe("preservado");
  });

  it("uma leitura antiga não pode substituir o painel depois da confirmação", async () => {
    let resolver!: (valor: PainelPayload) => void;
    const r = registro();
    const chave = chavePainel("pessoa-a", r.setor, r.turno, r.data_local);
    gravarCache(chave, 0, { recentes: [], pendencias: [] });
    const antiga = consultarComCache(
      chave,
      PRAZO_DADOS_PRODUCAO,
      () =>
        new Promise<PainelPayload>((resolve) => {
          resolver = resolve;
        }),
    );
    registrarApontamentoConfirmado("pessoa-a", r);
    resolver({ recentes: [], pendencias: [] });
    await antiga;
    expect(lerCache<PainelPayload>(chave)?.valor.resumo?.registros).toBe(1);
  });

  it("invalida todas as visões ao corrigir, confirmar Protheus ou sincronizar", async () => {
    memorizarUltimoApontamento("pessoa-a", [registro()]);
    for (const prefixo of ["painel:", "historico:", "programacao-turno:", "programacao-dia:"])
      gravarCache(prefixo + "teste", PRAZO_DADOS_PRODUCAO, 1);
    invalidarDadosProducao();
    for (const prefixo of ["painel:", "historico:", "programacao-turno:", "programacao-dia:"])
      expect(lerCache(prefixo + "teste")).toBeNull();
    consultarUltimo.mockResolvedValue({ data: null, error: null });
    await obterUltimoApontamento("pessoa-a", "corte", "T2");
    expect(consultarUltimo).toHaveBeenCalledOnce();
  });
});
