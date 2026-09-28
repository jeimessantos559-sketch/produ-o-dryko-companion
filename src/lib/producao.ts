export const CORTE_CATALOGO = [
  { nome: "FVD 5", rolosPorPlt: 1280 },
  { nome: "FVD 10", rolosPorPlt: 640 },
  { nome: "FVD 15", rolosPorPlt: 432 },
  { nome: "FVD 20", rolosPorPlt: 320 },
  { nome: "FVD 30", rolosPorPlt: 216 },
  { nome: "FVD 45", rolosPorPlt: 144 },
  { nome: "FVD 60", rolosPorPlt: 72 },
  { nome: "FVD 90", rolosPorPlt: 72 },
  { nome: "DRYKO 5", rolosPorPlt: 960 },
  { nome: "DRYKO 10", rolosPorPlt: 480 },
  { nome: "DRYKO 15", rolosPorPlt: 288 },
  { nome: "DRYKO 20", rolosPorPlt: 240 },
  { nome: "DRYKO 30", rolosPorPlt: 168 },
  { nome: "DRYKO 45", rolosPorPlt: 112 },
  { nome: "DRYKO 60", rolosPorPlt: 56 },
  { nome: "DRYKO 90", rolosPorPlt: 56 },
] as const;

export type GrupoCorte = {
  /** Quantidade de pallets FECHADOS. Zero representa apenas um PLT picado. */
  quantidadePlts: number;
  rolosPorPlt: number;
  pltPicadoRolos: number | null;
  /** Novos apontamentos contam o picado como adicional, sem somar um pallet fechado. */
  picadoAdicional?: boolean;
};

export function totalPlts(grupos: GrupoCorte[]) {
  return grupos.reduce((total, grupo) => total + Math.max(0, grupo.quantidadePlts), 0);
}

export function totalRolos(grupos: GrupoCorte[]) {
  return grupos.reduce((total, grupo) => {
    const picado = grupo.pltPicadoRolos ?? 0;
    if (grupo.picadoAdicional) {
      return total + Math.max(0, grupo.quantidadePlts) * grupo.rolosPorPlt + picado;
    }

    // Compatibilidade com registros antigos, em que o PLT picado fazia parte da quantidade informada.
    const pltsFechados = Math.max(
      0,
      grupo.quantidadePlts - (grupo.pltPicadoRolos === null ? 0 : 1),
    );
    return total + pltsFechados * grupo.rolosPorPlt + picado;
  }, 0);
}

export function metragemCorte(largura: number | null, rolos: number) {
  return largura === null ? null : (largura * rolos) / 10;
}

export function areaFitas(tempo: number, velocidade: number, largura = 0.93) {
  return tempo * velocidade * largura;
}

export function rolosManta(metragem: number, metrosPorRolo = 10) {
  return metrosPorRolo > 0 ? metragem / metrosPorRolo : 0;
}

export function dataSaoPaulo(date = new Date()) {
  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const valor = (tipo: Intl.DateTimeFormatPartTypes) =>
    partes.find((parte) => parte.type === tipo)?.value ?? "";
  return `${valor("year")}-${valor("month")}-${valor("day")}`;
}
