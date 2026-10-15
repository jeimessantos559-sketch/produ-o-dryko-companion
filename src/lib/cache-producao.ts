import { supabase } from "@/integrations/supabase/client";
import { pltsFechados, type ApontamentoTurno } from "@/lib/apontamentos-turno";
import { consultarComCache, gravarCache, invalidarCache, lerCache } from "@/lib/cache-consultas";

export const PRAZO_DADOS_PRODUCAO = 30_000;
export type ResumoPainel = {
  registros: number;
  pendentes: number;
  lancados: number;
  plts: number;
  rolos: number;
  metragem: number;
  area: number;
  unidades: number;
  semiKg: number;
  pesoKg: number;
};
export type PainelPayload = {
  resumo?: Partial<ResumoPainel>;
  recentes?: ApontamentoTurno[];
  pendencias?: ApontamentoTurno[];
};

export const chavePainel = (usuarioId: string, setor: string, turno: string, data: string) =>
  `painel:${usuarioId}:${setor}:${turno}:${data}`;
const chaveUltimo = (usuarioId: string, setor: string, turno: string) =>
  `ultimo-apontamento:${usuarioId}:${setor}:${turno}`;

/** Produção, correção, Protheus e sincronização precisam invalidar todas as visões dependentes. */
export function invalidarDadosProducao() {
  for (const prefixo of [
    "painel:",
    "historico:",
    "programacao-turno:",
    "programacao-dia:",
    "ultimo-apontamento:",
  ])
    invalidarCache(prefixo);
}

/** Só memoriza registros do próprio usuário, mantendo a ordem de criação usada por Repetir. */
export function memorizarUltimoApontamento(
  usuarioId: string,
  registros: readonly ApontamentoTurno[],
) {
  for (const registro of registros) {
    if (registro.usuario_id !== usuarioId) continue;
    const chave = chaveUltimo(usuarioId, registro.setor, registro.turno);
    const anterior = lerCache<ApontamentoTurno | null>(chave)?.valor;
    if (!anterior || registro.created_at > anterior.created_at || registro.id === anterior.id)
      gravarCache(chave, PRAZO_DADOS_PRODUCAO, registro);
  }
}

export function obterUltimoApontamento(usuarioId: string, setor: string, turno: string) {
  return consultarComCache<ApontamentoTurno | null>(
    chaveUltimo(usuarioId, setor, turno),
    PRAZO_DADOS_PRODUCAO,
    async () => {
      const { data, error } = await supabase
        .from("apontamentos")
        .select("*")
        .eq("usuario_id", usuarioId)
        .eq("setor", setor as never)
        .eq("turno", turno as never)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  );
}

const ordenar = (a: ApontamentoTurno, b: ApontamentoTurno) =>
  b.data_hora_producao.localeCompare(a.data_hora_producao) ||
  b.created_at.localeCompare(a.created_at) ||
  b.id.localeCompare(a.id);

/** Usa os valores devolvidos pelo banco, incluindo conversões e picados. Nunca duplica um ID. */
export function painelComApontamento(
  payload: PainelPayload,
  registro: ApontamentoTurno,
): PainelPayload {
  const recentes = [...(payload.recentes ?? []).filter((r) => r.id !== registro.id), registro].sort(
    ordenar,
  );
  const pendencias = (payload.pendencias ?? []).filter((r) => r.id !== registro.id);
  if (registro.status === "pendente") pendencias.push(registro);
  const resumo = recentes.reduce<ResumoPainel>(
    (r, item) => ({
      registros: r.registros + 1,
      pendentes: r.pendentes + Number(item.status === "pendente"),
      lancados: r.lancados + Number(item.status === "lancado"),
      plts: r.plts + pltsFechados(item),
      rolos: r.rolos + Number(item.total_rolos ?? 0),
      metragem: r.metragem + Number(item.metragem ?? 0),
      area: r.area + Number(item.area_m2 ?? 0),
      unidades: r.unidades + Number(item.total_unidades ?? 0),
      semiKg: r.semiKg + Number(item.semi_consumido_kg ?? 0),
      pesoKg: r.pesoKg + Number(item.peso_kg ?? 0),
    }),
    {
      registros: 0,
      pendentes: 0,
      lancados: 0,
      plts: 0,
      rolos: 0,
      metragem: 0,
      area: 0,
      unidades: 0,
      semiKg: 0,
      pesoKg: 0,
    },
  );
  return { ...payload, recentes, pendencias: pendencias.sort(ordenar), resumo };
}

export function registrarApontamentoConfirmado(usuarioId: string, registro: ApontamentoTurno) {
  if (registro.usuario_id !== usuarioId) return;
  const chave = chavePainel(usuarioId, registro.setor, registro.turno, registro.data_local);
  const anterior = lerCache<PainelPayload>(chave)?.valor;
  invalidarDadosProducao();
  memorizarUltimoApontamento(usuarioId, [registro]);
  // Sem um retrato completo anterior, o painel deve consultar a RPC, nunca mostrar um total parcial.
  if (anterior) gravarCache(chave, PRAZO_DADOS_PRODUCAO, painelComApontamento(anterior, registro));
}
