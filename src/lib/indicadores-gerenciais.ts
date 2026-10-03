import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { dataSaoPaulo } from "@/lib/producao";

const entrada = z.object({ dias: z.union([z.literal(7), z.literal(30), z.literal(90)]) });

type LinhaBanco = {
  setor?: unknown;
  data_local?: unknown;
  quantidade_plts?: unknown;
  metragem?: unknown;
  area_m2?: unknown;
  status?: unknown;
  created_at?: unknown;
  lancado_em?: unknown;
  quantidade_meta?: unknown;
  horas_produtivas?: unknown;
  quantidade_prevista?: unknown;
  parada_minutos?: unknown;
  motivo_parada?: unknown;
  status_envio?: unknown;
};
type TabelaIndicadores =
  | "apontamentos"
  | "metas_turno"
  | "programacao_producao"
  | "programacao_hora"
  | "ocorrencias_turno"
  | "relatorios";

export type IndicadorSetor = {
  setor: "corte" | "fitas" | "mantas";
  unidade: "m²" | "m";
  producao: number;
  meta: number;
  aderenciaMeta: number | null;
  programado: number;
  realizadoProgramacao: number;
  unidadeProgramacao: "PLTs" | "m²" | "m";
  aderenciaProgramacao: number | null;
  mediaPorHora: number | null;
  apontamentos: number;
  pendentes: number;
  pendentesAntigos: number;
  tempoMedioProtheusHoras: number | null;
  paradaMinutos: number;
  ocorrencias: number;
};

export type IndicadoresGerenciais = {
  inicio: string;
  fim: string;
  geradoEm: string;
  setores: IndicadorSetor[];
  totais: {
    pendentes: number;
    pendentesAntigos: number;
    tempoMedioProtheusHoras: number | null;
    paradaMinutos: number;
    ocorrencias: number;
    problemasAbertos: number;
    emailsFalhos: number;
    emailsAguardando: number;
  };
  causasParada: Array<{ motivo: string; minutos: number; registros: number }>;
  dias: Array<{
    data: string;
    setores: Array<{ setor: "corte" | "fitas" | "mantas"; producao: number; meta: number }>;
  }>;
  avisoLimite: boolean;
};

function subtrairDias(data: string, dias: number) {
  const valor = new Date(`${data}T12:00:00.000Z`);
  valor.setUTCDate(valor.getUTCDate() - dias);
  return valor.toISOString().slice(0, 10);
}

async function buscarTudo(
  db: SupabaseClient<Database>,
  tabela: TabelaIndicadores,
  colunas: string,
  inicio: string,
  fim: string,
) {
  const tamanho = 1000;
  const limite = 10_000;
  const linhas: LinhaBanco[] = [];

  for (let de = 0; de < limite; de += tamanho) {
    const { data, error } = await db
      .from(tabela)
      .select(colunas)
      .gte("data_local", inicio)
      .lte("data_local", fim)
      .range(de, de + tamanho - 1);
    if (error) throw new Error(`Não foi possível consultar ${tabela}.`);
    const pagina = (data ?? []) as unknown as LinhaBanco[];
    linhas.push(...pagina);
    if (pagina.length < tamanho) return { linhas, truncado: false };
  }

  return { linhas, truncado: true };
}

function numero(valor: unknown) {
  const convertido = Number(valor ?? 0);
  return Number.isFinite(convertido) ? convertido : 0;
}

function producaoPrincipal(item: LinhaBanco, setor: string) {
  if (setor === "fitas") return numero(item.area_m2);
  return numero(item.metragem);
}

function realizadoProgramacao(item: LinhaBanco, setor: string) {
  if (setor === "fitas") return numero(item.area_m2);
  if (setor === "mantas") return numero(item.metragem);
  return numero(item.quantidade_plts);
}

function media(valores: number[]) {
  return valores.length ? valores.reduce((total, item) => total + item, 0) / valores.length : null;
}

function percentual(realizado: number, meta: number) {
  return meta > 0 ? (realizado / meta) * 100 : null;
}

export const carregarIndicadoresGerenciais = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(entrada)
  .handler(async ({ data, context }): Promise<IndicadoresGerenciais> => {
    const { data: admin } = await context.supabase.rpc("eh_admin_ativo", {
      _user_id: context.userId,
    });
    if (!admin) throw new Error("Apenas administradores podem consultar os indicadores.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin;
    const fim = dataSaoPaulo();
    const inicio = subtrairDias(fim, data.dias - 1);
    const limitePendencia = Date.now() - 8 * 60 * 60 * 1000;

    const [apontamentos, metas, programacao, paradas, ocorrencias, relatorios, problemas] =
      await Promise.all([
        buscarTudo(
          db,
          "apontamentos",
          "setor, data_local, quantidade_plts, metragem, area_m2, status, created_at, lancado_em",
          inicio,
          fim,
        ),
        buscarTudo(
          db,
          "metas_turno",
          "setor, data_local, quantidade_meta, horas_produtivas, unidade",
          inicio,
          fim,
        ),
        buscarTudo(
          db,
          "programacao_producao",
          "setor, data_local, quantidade_prevista, unidade",
          inicio,
          fim,
        ),
        buscarTudo(
          db,
          "programacao_hora",
          "setor, data_local, parada_minutos, motivo_parada",
          inicio,
          fim,
        ),
        buscarTudo(db, "ocorrencias_turno", "setor, data_local", inicio, fim),
        buscarTudo(db, "relatorios", "data_local, status_envio", inicio, fim),
        db.from("problemas").select("id", { count: "exact", head: true }).eq("resolvido", false),
      ]);

    if (problemas.error) throw new Error("Não foi possível consultar os problemas abertos.");

    const setores = (["corte", "fitas", "mantas"] as const).map((setor): IndicadorSetor => {
      const registros = apontamentos.linhas.filter((item) => item.setor === setor);
      const metasSetor = metas.linhas.filter((item) => item.setor === setor);
      const programacaoSetor = programacao.linhas.filter((item) => item.setor === setor);
      const paradasSetor = paradas.linhas.filter((item) => item.setor === setor);
      const ocorrenciasSetor = ocorrencias.linhas.filter((item) => item.setor === setor);
      const producao = registros.reduce((total, item) => total + producaoPrincipal(item, setor), 0);
      const totalMeta = metasSetor.reduce((total, item) => total + numero(item.quantidade_meta), 0);
      const totalProgramado = programacaoSetor.reduce(
        (total, item) => total + numero(item.quantidade_prevista),
        0,
      );
      const realizadoProg = registros.reduce(
        (total, item) => total + realizadoProgramacao(item, setor),
        0,
      );
      const horasMeta = metasSetor.reduce(
        (total, item) => total + numero(item.horas_produtivas),
        0,
      );
      const temposProtheus = registros.flatMap((item) => {
        if (!item.lancado_em || !item.created_at) return [];
        const duracao =
          (new Date(String(item.lancado_em)).getTime() -
            new Date(String(item.created_at)).getTime()) /
          3_600_000;
        return Number.isFinite(duracao) && duracao >= 0 ? [duracao] : [];
      });
      const pendentes = registros.filter((item) => item.status === "pendente");

      return {
        setor,
        unidade: setor === "mantas" ? "m" : "m²",
        producao,
        meta: totalMeta,
        aderenciaMeta: percentual(producao, totalMeta),
        programado: totalProgramado,
        realizadoProgramacao: realizadoProg,
        unidadeProgramacao: setor === "corte" ? "PLTs" : setor === "fitas" ? "m²" : "m",
        aderenciaProgramacao: percentual(realizadoProg, totalProgramado),
        mediaPorHora: horasMeta > 0 ? producao / horasMeta : null,
        apontamentos: registros.length,
        pendentes: pendentes.length,
        pendentesAntigos: pendentes.filter(
          (item) => new Date(String(item.created_at)).getTime() < limitePendencia,
        ).length,
        tempoMedioProtheusHoras: media(temposProtheus),
        paradaMinutos: paradasSetor.reduce((total, item) => total + numero(item.parada_minutos), 0),
        ocorrencias: ocorrenciasSetor.length,
      };
    });

    const causas = new Map<string, { minutos: number; registros: number }>();
    for (const item of paradas.linhas) {
      const minutos = numero(item.parada_minutos);
      if (minutos <= 0) continue;
      const motivo = String(item.motivo_parada || "Sem motivo informado").trim();
      const atual = causas.get(motivo) ?? { minutos: 0, registros: 0 };
      atual.minutos += minutos;
      atual.registros += 1;
      causas.set(motivo, atual);
    }

    const dias = Array.from({ length: data.dias }, (_, indice) =>
      subtrairDias(fim, data.dias - 1 - indice),
    );
    const serieDias = dias.map((dataLocal) => ({
      data: dataLocal,
      setores: (["corte", "fitas", "mantas"] as const).map((setor) => ({
        setor,
        producao: apontamentos.linhas
          .filter((item) => item.setor === setor && item.data_local === dataLocal)
          .reduce((total, item) => total + producaoPrincipal(item, setor), 0),
        meta: metas.linhas
          .filter((item) => item.setor === setor && item.data_local === dataLocal)
          .reduce((total, item) => total + numero(item.quantidade_meta), 0),
      })),
    }));

    const temposGerais = apontamentos.linhas.flatMap((item) => {
      if (!item.lancado_em || !item.created_at) return [];
      const duracao =
        (new Date(String(item.lancado_em)).getTime() -
          new Date(String(item.created_at)).getTime()) /
        3_600_000;
      return Number.isFinite(duracao) && duracao >= 0 ? [duracao] : [];
    });

    return {
      inicio,
      fim,
      geradoEm: new Date().toISOString(),
      setores,
      totais: {
        pendentes: setores.reduce((total, item) => total + item.pendentes, 0),
        pendentesAntigos: setores.reduce((total, item) => total + item.pendentesAntigos, 0),
        tempoMedioProtheusHoras: media(temposGerais),
        paradaMinutos: setores.reduce((total, item) => total + item.paradaMinutos, 0),
        ocorrencias: setores.reduce((total, item) => total + item.ocorrencias, 0),
        problemasAbertos: problemas.count ?? 0,
        emailsFalhos: relatorios.linhas.filter((item) => item.status_envio === "falhou").length,
        emailsAguardando: relatorios.linhas.filter(
          (item) => item.status_envio === "aguardando" || item.status_envio === "enviando",
        ).length,
      },
      causasParada: [...causas.entries()]
        .map(([motivo, valor]) => ({ motivo, ...valor }))
        .sort((a, b) => b.minutos - a.minutos)
        .slice(0, 5),
      dias: serieDias,
      avisoLimite: [apontamentos, metas, programacao, paradas, ocorrencias, relatorios].some(
        (resultado) => resultado.truncado,
      ),
    };
  });
