import assert from "node:assert/strict";
import { test } from "node:test";
import {
  contagemPorProduto,
  gruposFechados,
  pltsFechados,
  produtoUnicoDaReferencia,
  sequenciasDoTurno,
  type ApontamentoTurno,
} from "../src/lib/apontamentos-turno.ts";
import { totalRolos } from "../src/lib/producao.ts";

function registro(dados: Partial<ApontamentoTurno> = {}): ApontamentoTurno {
  return {
    id: "1",
    produto_id: "fvd20",
    produto_nome: "FVD 20",
    setor: "corte",
    turno: "T2",
    data_local: "2026-10-05",
    created_at: "2026-10-06T04:48:00Z",
    quantidade_plts: 4,
    total_rolos: 1280,
    metragem: 2560,
    status: "pendente",
    grupos: [{ quantidadePlts: 4, rolosPorPlt: 320, pltPicadoRolos: null, picadoAdicional: true }],
    ...dados,
  } as ApontamentoTurno;
}

test("sequência do print considera registros pendentes e lançados antes de filtrar", () => {
  const antes = registro();
  const depois = registro({
    id: "2",
    created_at: "2026-10-06T04:48:01Z",
    quantidade_plts: 3,
    status: "lancado",
    grupos: [{ quantidadePlts: 3, rolosPorPlt: 320, pltPicadoRolos: null, picadoAdicional: true }],
  });
  const mapa = sequenciasDoTurno([depois, antes]);
  assert.deepEqual(mapa.get("1"), { registro: 1, inicio: 1, fim: 4 });
  assert.deepEqual(mapa.get("2"), { registro: 2, inicio: 5, fim: 7 });
  // A correção de 4 para 2 não deixa sobreposição ou buraco na próxima faixa.
  antes.grupos = [
    { quantidadePlts: 2, rolosPorPlt: 320, pltPicadoRolos: null, picadoAdicional: true },
  ];
  assert.deepEqual(sequenciasDoTurno([depois, antes]).get("2"), { registro: 2, inicio: 3, fim: 5 });
});

test("picado isolado e formato legado preservam rolos e contam somente fechados", () => {
  const legado = [{ quantidadePlts: 3, rolosPorPlt: 320, pltPicadoRolos: 50 }];
  const normalizado = gruposFechados(legado);
  assert.equal(normalizado[0]?.quantidadePlts, 2);
  assert.equal(totalRolos(normalizado), 690);
  assert.equal(totalRolos(legado), 690);
  const picado = registro({
    grupos: [{ quantidadePlts: 0, rolosPorPlt: 320, pltPicadoRolos: 50, picadoAdicional: true }],
    total_rolos: 50,
  });
  assert.equal(pltsFechados(picado), 0);
  assert.equal(sequenciasDoTurno([picado]).get("1")?.inicio, null);
});

test("contagem exclui outro dia, setor e turno, inclui todo o turno e separa produtos com mesmo nome", () => {
  const lista = Array.from({ length: 55 }, (_, i) => registro({ id: String(i) }));
  lista.push(
    registro({ turno: "T1" }),
    registro({ data_local: "2026-10-04" }),
    registro({ setor: "mantas" }),
  );
  lista.push(registro({ id: "outro", produto_id: "fvd-outro" }));
  const totais = contagemPorProduto(lista, "corte", "T2", "2026-10-05");
  assert.equal(totais.length, 2);
  assert.equal(totais.find((i) => i.produtoId === "fvd20")?.plts, 220);
  assert.equal(totais.find((i) => i.produtoId === "fvd20")?.rolos, 70400);
});

test("sequência reinicia por produto e turno e picado não avança a faixa", () => {
  const lista = [
    registro(),
    registro({ id: "2", produto_id: "outro" }),
    registro({ id: "3", turno: "T1" }),
    registro({
      id: "4",
      grupos: [{ quantidadePlts: 0, rolosPorPlt: 320, pltPicadoRolos: 20, picadoAdicional: true }],
      created_at: "2026-10-06T04:48:01Z",
    }),
    registro({ id: "5", created_at: "2026-10-06T04:48:02Z" }),
  ];
  const mapa = sequenciasDoTurno(lista);
  assert.equal(mapa.get("2")?.inicio, 1);
  assert.equal(mapa.get("3")?.inicio, 1);
  assert.equal(mapa.get("4")?.inicio, null);
  assert.equal(mapa.get("5")?.inicio, 5);
});

test("lote/OP repetido só preenche um produto único e ativo", () => {
  const ativos = [{ id: "a" }, { id: "b" }];
  assert.deepEqual(produtoUnicoDaReferencia([{ produto_id: "a" }, { produto_id: "a" }], ativos), {
    id: "a",
    ambiguo: false,
  });
  assert.deepEqual(produtoUnicoDaReferencia([{ produto_id: "a" }, { produto_id: "b" }], ativos), {
    id: null,
    ambiguo: true,
  });
  assert.deepEqual(produtoUnicoDaReferencia([{ produto_id: "inativo" }], ativos), {
    id: null,
    ambiguo: false,
  });
  assert.deepEqual(produtoUnicoDaReferencia([], ativos), { id: null, ambiguo: false });
});
