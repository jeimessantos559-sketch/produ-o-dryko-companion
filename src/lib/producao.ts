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

export type TurnoOperacional = "T1" | "T2" | "T3";

export const HORARIOS_TURNO: Record<TurnoOperacional, string> = {
  T1: "06:00–15:38",
  T2: "15:38–02:00",
  T3: "01:00–06:00",
};

const HORAS_PRODUTIVAS_PADRAO: Record<TurnoOperacional, number[]> = {
  T1: [6, 7, 8, 9, 10, 11, 12, 13, 14],
  T2: [16, 17, 18, 19, 20, 21, 22, 23, 0],
  T3: [1, 2, 3, 4, 5],
};

export const HORA_INICIO_DATA_OPERACIONAL = 6;

/** Horas cheias usadas na distribuicao automatica da meta do turno. */
export function horasProdutivasTurno(turno: TurnoOperacional | null | undefined) {
  if (!turno) return [];
  return HORAS_PRODUTIVAS_PADRAO[turno].map((hora) => `${String(hora).padStart(2, "0")}:00`);
}

/** Mantem a ordem operacional quando o turno atravessa a meia-noite. */
export function ordemHoraTurno(hora: string, turno: TurnoOperacional | null | undefined) {
  const inicio = turno === "T2" ? 15 : turno === "T3" ? 1 : 6;
  const valor = Number(hora.slice(0, 2));
  return Number.isFinite(valor) ? (valor - inicio + 24) % 24 : 99;
}

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

function partesSaoPaulo(date = new Date()) {
  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const valor = (tipo: Intl.DateTimeFormatPartTypes) =>
    partes.find((parte) => parte.type === tipo)?.value ?? "";
  return {
    ano: valor("year"),
    mes: valor("month"),
    dia: valor("day"),
    hora: Number(valor("hour") || 0),
    minuto: valor("minute"),
  };
}

export function dataSaoPaulo(date = new Date()) {
  const { ano, mes, dia } = partesSaoPaulo(date);
  return `${ano}-${mes}-${dia}`;
}

/** Valor local de Sao Paulo para campos datetime-local, sem conversao de fuso pelo navegador. */
export function dataHoraProducaoPadrao(date = new Date()) {
  const { ano, mes, dia, hora, minuto } = partesSaoPaulo(date);
  return `${ano}-${mes}-${dia}T${String(hora).padStart(2, "0")}:${minuto}`;
}

/** Hora de um TIMESTAMP local salvo pelo banco (YYYY-MM-DD HH:mm:ss). */
export function horaProducao(valor: string | null | undefined) {
  const correspondencia = valor?.match(/[T ](\d{2}):(\d{2})/);
  return correspondencia ? `${correspondencia[1]}:${correspondencia[2]}` : "—";
}

export function horaCheiaProducao(valor: string | null | undefined) {
  const hora = horaProducao(valor);
  return hora === "—" ? hora : `${hora.slice(0, 2)}:00`;
}

export function dataHoraProducaoFormatada(valor: string | null | undefined) {
  const correspondencia = valor?.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  return correspondencia
    ? `${correspondencia[3]}/${correspondencia[2]}/${correspondencia[1]} ${correspondencia[4]}:${correspondencia[5]}`
    : "—";
}

export function dataOperacional(turno: TurnoOperacional | null | undefined, date = new Date()) {
  const { ano, mes, dia, hora } = partesSaoPaulo(date);
  const hoje = `${ano}-${mes}-${dia}`;
  if ((turno === "T2" || turno === "T3") && hora < HORA_INICIO_DATA_OPERACIONAL) {
    const meioDiaUtc = new Date(`${hoje}T12:00:00Z`);
    meioDiaUtc.setUTCDate(meioDiaUtc.getUTCDate() - 1);
    return meioDiaUtc.toISOString().slice(0, 10);
  }
  return hoje;
}

/** Espelho da função do banco horario_pertence_turno (T2 e T3 se sobrepõem entre 01:00 e 02:00). */
export function horarioPertenceTurno(turno: TurnoOperacional, horario: string) {
  const [h = 0, m = 0] = horario.split(":").map(Number);
  const min = h * 60 + m;
  const t = (hh: number, mm = 0) => hh * 60 + mm;
  if (turno === "T1") return min >= t(6) && min < t(15, 38);
  if (turno === "T2") return min >= t(15, 38) || min < t(2);
  return min >= t(1) && min < t(6);
}
