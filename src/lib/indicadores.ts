// Cálculos puros do painel gerencial. Cada setor usa a própria unidade;
// metas/programações só são comparadas com a produção na MESMA unidade.

export type SetorGerencial = "corte" | "fitas" | "mantas";

export const UNIDADE_PRINCIPAL: Record<SetorGerencial, string> = {
  corte: "m²",
  fitas: "m²",
  mantas: "m",
};

export type ApontamentoIndicador = {
  status: string;
  created_at: string;
  lancado_em: string | null;
  quantidade_plts: number | null;
  metragem: number | null;
  area_m2: number | null;
};

export type Quantidade = { quantidade: number; unidade: string };

export function realizadoNaUnidade(
  setor: SetorGerencial,
  unidade: string,
  aps: readonly ApontamentoIndicador[],
): number | null {
  const soma = (f: (a: ApontamentoIndicador) => number | null) =>
    aps.reduce((t, a) => t + Number(f(a) ?? 0), 0);
  if (unidade === "PLTs") return setor === "fitas" ? null : soma((a) => a.quantidade_plts);
  if (unidade === "m²")
    return setor === "fitas"
      ? soma((a) => a.area_m2)
      : setor === "corte"
        ? soma((a) => a.metragem)
        : null;
  if (unidade === "m") return setor === "mantas" ? soma((a) => a.metragem) : null;
  return null;
}

export type Aderencia = { unidade: string; alvo: number; realizado: number; percentual: number };

export function aderencias(
  setor: SetorGerencial,
  alvos: readonly Quantidade[],
  aps: readonly ApontamentoIndicador[],
): Aderencia[] {
  const porUnidade = new Map<string, number>();
  for (const a of alvos)
    porUnidade.set(a.unidade, (porUnidade.get(a.unidade) ?? 0) + Number(a.quantidade ?? 0));
  const out: Aderencia[] = [];
  for (const [unidade, alvo] of porUnidade) {
    const realizado = realizadoNaUnidade(setor, unidade, aps);
    if (realizado === null || alvo <= 0) continue;
    out.push({ unidade, alvo, realizado, percentual: (realizado / alvo) * 100 });
  }
  return out;
}

export function pendentesAntigas(aps: readonly ApontamentoIndicador[], agora: Date, horas = 24) {
  const limite = agora.getTime() - horas * 3_600_000;
  return aps.filter((a) => a.status === "pendente" && new Date(a.created_at).getTime() < limite)
    .length;
}

/** Minutos médios entre o apontamento e a confirmação manual no Protheus; null sem lançamentos. */
export function tempoMedioConfirmacaoMin(aps: readonly ApontamentoIndicador[]): number | null {
  const tempos = aps
    .filter((a) => a.status === "lancado" && a.lancado_em)
    .map(
      (a) =>
        (new Date(a.lancado_em as string).getTime() - new Date(a.created_at).getTime()) / 60_000,
    )
    .filter((m) => Number.isFinite(m) && m >= 0);
  return tempos.length ? tempos.reduce((t, m) => t + m, 0) / tempos.length : null;
}
