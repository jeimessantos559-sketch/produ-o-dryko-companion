export const GRUPOS_OCORRENCIAS = [
  { titulo: "Ocorrências linhas de fitas", equipamentos: ["Linha 1", "Linha 2", "Linha 3"] },
  {
    titulo: "Ocorrências máquinas de corte",
    equipamentos: [
      "Máquina de corte 1",
      "Máquina de corte 2",
      "Máquina de corte 3",
      "Máquina de corte 4",
      "Scain 01",
      "Scain 02",
    ],
  },
  { titulo: "Ocorrências máquinas de sleeve", equipamentos: ["Sleeve 1", "Sleeve 2", "Sleeve 3"] },
  {
    titulo: "Ocorrências fornos e seladoras",
    equipamentos: ["Seladora 1", "Seladora 2", "Forno 1", "Forno 2", "Forno 3"],
  },
] as const;

export type TipoStatusOcorrencia = "ocorrencia" | "sem_producao" | "em_manutencao" | "sem_ocorrencias";

export const SITUACOES_OCORRENCIA: { valor: TipoStatusOcorrencia; rotulo: string }[] = [
  { valor: "ocorrencia", rotulo: "Ocorrência" },
  { valor: "sem_producao", rotulo: "Sem produção" },
  { valor: "em_manutencao", rotulo: "Em manutenção" },
  { valor: "sem_ocorrencias", rotulo: "Sem ocorrências" },
];

export const SEM_OCORRENCIAS = "Sem ocorrências";

export function rotuloSituacao(tipo: string | null | undefined) {
  return SITUACOES_OCORRENCIA.find((s) => s.valor === tipo)?.rotulo ?? "Ocorrência";
}

export type OcorrenciaOperacional = {
  id: string;
  equipamento: string | null;
  tipo_status: string | null;
  mensagem: string;
  created_at: string;
  hora_inicio?: string | null;
  hora_fim?: string | null;
  duracao_min?: number | null;
  motivo_parada?: string | null;
  motivo_outro?: string | null;
  acao_realizada?: string | null;
  turno_origem?: string | null;
  data_origem?: string | null;
  quantidade_transferencias?: number | null;
  setor?: string;
  turno?: string;
  data_local?: string;
  criado_por?: string;
};

export const MOTIVOS_PARADA = [
  "Mecânica", "Elétrica", "Matéria-prima", "Qualidade", "Operacional",
  "Setup", "Manutenção", "Limpeza", "Falta de pessoal", "Outro",
] as const;

export function rotuloMotivo(o: Pick<OcorrenciaOperacional, "motivo_parada" | "motivo_outro">) {
  if (!o.motivo_parada) return "";
  return o.motivo_parada === "Outro" && o.motivo_outro?.trim() ? `Outro (${o.motivo_outro.trim()})` : o.motivo_parada;
}

export type TurnoCod = "T1" | "T2" | "T3";

/** Próximo turno: T1→T2 e T2→T3 no mesmo dia operacional; T3→T1 do dia seguinte (espelho de transferir_ocorrencia). */
export function proximoTurnoOperacional(turno: TurnoCod, data: string): { turno: TurnoCod; data: string } {
  if (turno === "T1") return { turno: "T2", data };
  if (turno === "T2") return { turno: "T3", data };
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return { turno: "T1", data: d.toISOString().slice(0, 10) };
}

/** Espelho puro da transferência: mesma ocorrência, hora inicial preservada, origem só na primeira vez. */
export function transferirOcorrencia<T extends OcorrenciaOperacional & { turno: string; data_local: string }>(o: T): T {
  if (!ocorrenciaEmAndamento(o)) throw new Error("Só ocorrências em andamento podem ser transferidas.");
  const destino = proximoTurnoOperacional(o.turno as TurnoCod, o.data_local);
  return {
    ...o,
    turno_origem: o.turno_origem ?? o.turno,
    data_origem: o.data_origem ?? o.data_local,
    turno: destino.turno,
    data_local: destino.data,
    quantidade_transferencias: (o.quantidade_transferencias ?? 0) + 1,
  };
}

/** Colunas de ocorrencias_turno usadas em todas as telas. */
export const CAMPOS_OCORRENCIA =
  "id, setor, turno, data_local, criado_por, equipamento, tipo_status, mensagem, created_at, hora_inicio, hora_fim, duracao_min, motivo_parada, motivo_outro, acao_realizada, turno_origem, data_origem, quantidade_transferencias";

function minutosDoDia(h: string | null | undefined) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(h ?? "").trim());
  if (!m) return null;
  const hh = Number(m[1]), mm = Number(m[2]);
  return hh > 23 || mm > 59 ? null : hh * 60 + mm;
}

/** Duração em minutos; fim menor que início = atravessou a meia-noite. Incompleto = null. */
export function calcularDuracaoOcorrencia(inicio: string | null | undefined, fim: string | null | undefined) {
  const a = minutosDoDia(inicio), b = minutosDoDia(fim);
  if (a === null || b === null) return null;
  return b >= a ? b - a : 1440 - a + b;
}

/** 120 => "2h00", 90 => "1h30", 45 => "45min", 0/null => "". */
export function formatarDuracaoOcorrencia(minutos: number | null | undefined) {
  if (!minutos || minutos <= 0) return "";
  if (minutos < 60) return `${minutos}min`;
  return `${Math.floor(minutos / 60)}h${String(minutos % 60).padStart(2, "0")}`;
}

export const hhmm = (h: string | null | undefined) => (h ? String(h).slice(0, 5) : "");

/** Prefixo "2h00 parada · 23:00 às 01:00" (vazio se sem horário). */
/** Início informado sem fim = ocorrência em andamento (não soma no total parado). */
export function ocorrenciaEmAndamento(o: Pick<OcorrenciaOperacional, "hora_inicio" | "hora_fim">) {
  return !!o.hora_inicio && !o.hora_fim;
}

/** Campos a gravar ao finalizar (só hora_fim e duracao_min); null se horário inválido. */
export function dadosFinalizacaoOcorrencia(inicio: string | null | undefined, fim: string) {
  const duracao_min = calcularDuracaoOcorrencia(inicio, fim);
  return duracao_min === null ? null : { hora_fim: fim, duracao_min };
}

/** Hora atual HH:MM em America/Sao_Paulo. */
export function horaAtualSaoPaulo(agora = new Date()) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(agora);
}

export function prefixoTempoOcorrencia(o: Pick<OcorrenciaOperacional, "hora_inicio" | "hora_fim" | "duracao_min">) {
  if (ocorrenciaEmAndamento(o)) return `Em andamento desde ${hhmm(o.hora_inicio)}`;
  const partes: string[] = [];
  const dur = formatarDuracaoOcorrencia(o.duracao_min);
  if (dur) partes.push(`${dur} parada`);
  if (o.hora_inicio && o.hora_fim) partes.push(`${hhmm(o.hora_inicio)} às ${hhmm(o.hora_fim)}`);
  return partes.join(" · ");
}

function comTempo(o: OcorrenciaOperacional, texto: string) {
  const p = prefixoTempoOcorrencia(o);
  const extras = [rotuloMotivo(o) && `Motivo: ${rotuloMotivo(o)}`, o.acao_realizada?.trim() && `Ação: ${o.acao_realizada.trim()}`].filter(Boolean);
  const base = p ? (texto ? `${p} · ${texto}` : p) : texto;
  return extras.length ? `${base} · ${extras.join(" · ")}` : base;
}

/** Soma de duracao_min por equipamento, ignorando "sem_ocorrencias". */
export function totalParadoPorEquipamento(lista: OcorrenciaOperacional[]) {
  const total = new Map<string, number>();
  for (const o of lista) {
    if (!o.equipamento || o.tipo_status === "sem_ocorrencias" || ocorrenciaEmAndamento(o) || !o.duracao_min || o.duracao_min <= 0) continue;
    total.set(o.equipamento, (total.get(o.equipamento) ?? 0) + o.duracao_min);
  }
  return total;
}

export type EquipamentoResumo = { equipamento: string; linhas: string[]; comProblema: boolean; totalMin?: number };
export type GrupoResumo = { titulo: string; itens: EquipamentoResumo[] };

/** Consolida ocorrências na ordem fixa. Sem registro = "Sem ocorrências". */
export function consolidarOcorrencias(lista: OcorrenciaOperacional[]) {
  const ordenadas = [...lista].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const totais = totalParadoPorEquipamento(ordenadas);
  const grupos: GrupoResumo[] = GRUPOS_OCORRENCIAS.map((grupo) => ({
    titulo: grupo.titulo,
    itens: grupo.equipamentos.map((equipamento) => {
      const doEquip = ordenadas.filter((o) => o.equipamento === equipamento);
      const reais = doEquip.filter((o) => (o.tipo_status ?? "ocorrencia") === "ocorrencia");
      if (reais.length) {
        const tempos = doEquip.filter((o) => o.tipo_status !== "sem_ocorrencias" && (o.tipo_status ?? "ocorrencia") !== "ocorrencia" && prefixoTempoOcorrencia(o));
        return {
          equipamento,
          linhas: [...tempos.map((o) => comTempo(o, rotuloSituacao(o.tipo_status))), ...reais.map((o) => comTempo(o, o.mensagem))],
          comProblema: true,
          totalMin: totais.get(equipamento) ?? 0,
        };
      }
      const ultimo = doEquip[doEquip.length - 1];
      if (ultimo) {
        const txt = rotuloSituacao(ultimo.tipo_status);
        const linha = ultimo.tipo_status === "sem_ocorrencias" ? txt : comTempo(ultimo, txt);
        return { equipamento, linhas: [linha], comProblema: ultimo.tipo_status !== "sem_ocorrencias", totalMin: totais.get(equipamento) ?? 0 };
      }
      return { equipamento, linhas: [SEM_OCORRENCIAS], comProblema: false };
    }),
  }));
  const conhecidos = new Set<string>(GRUPOS_OCORRENCIAS.flatMap((g) => [...g.equipamentos]));
  const outras = ordenadas
    .filter((o) => !o.equipamento || !conhecidos.has(o.equipamento))
    .map((o) => comTempo(o, o.equipamento ? `${o.equipamento}: ${o.mensagem}` : o.mensagem));
  return { grupos, outras };
}

/** Equipamentos opcionais de Mantas (relatório livre, sem preenchimento automático). */
export const EQUIPAMENTOS_MANTAS = ["Linha 4", "Linha 5", "Rebobinadeira manual L4", "Rebobinadeira automática L5", "Forno"] as const;

export function equipamentosOpcionaisSetor(setor: unknown): readonly string[] {
  const s = String(setor ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  return s === "mantas" ? EQUIPAMENTOS_MANTAS : [];
}

/** Linhas "Equipamento — Total parado: 3h20" para ocorrências livres com equipamento. */
export function linhasTotalParado(lista: OcorrenciaOperacional[]) {
  return [...totalParadoPorEquipamento(lista)].map(([eq, min]) => `${eq} — Total parado: ${formatarDuracaoOcorrencia(min)}`);
}

/** Somente Corte e Fitas usam o padrão estruturado por equipamento. */
export function usaOcorrenciasEstruturadas(setor: unknown) {
  const s = String(setor ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  return s === "corte" || s === "fitas";
}

/** Lista simples: somente ocorrências realmente registradas. */
export function linhasOcorrenciasLivres(lista: OcorrenciaOperacional[]) {
  return [...lista]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((o) => {
      const tipo = o.tipo_status ?? "ocorrencia";
      const msg = tipo === "ocorrencia" ? o.mensagem : o.mensagem || rotuloSituacao(tipo);
      const d = new Date(o.created_at);
      const h = Number.isNaN(d.getTime())
        ? ""
        : new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(d) + " - ";
      return h + comTempo(o, o.equipamento ? `${o.equipamento}: ${msg}` : msg);
    })
    .filter((l) => l.trim().length > 0);
}

/** Texto no padrão WhatsApp (asteriscos) ou simples. Setores fora de Corte/Fitas geram lista livre. */
export function textoOcorrencias(lista: OcorrenciaOperacional[], negrito = true, setor?: unknown) {
  const b = (t: string) => (negrito ? `*${t}*` : t);
  if (setor !== undefined && !usaOcorrenciasEstruturadas(setor)) {
    const livres = linhasOcorrenciasLivres(lista);
    if (!livres.length) return "Sem ocorrências registradas no turno.";
    const totais = linhasTotalParado(lista);
    return totais.length ? [...livres, "", b("Total parado por equipamento"), ...totais].join("\n") : livres.join("\n");
  }
  const { grupos, outras } = consolidarOcorrencias(lista);
  const linhas: string[] = [];
  grupos.forEach((grupo, i) => {
    if (i > 0) linhas.push("");
    linhas.push(b(grupo.titulo));
    for (const item of grupo.itens) {
      const total = formatarDuracaoOcorrencia(item.totalMin);
      linhas.push(b(total ? `${item.equipamento} — Total parado: ${total}` : item.equipamento));
      linhas.push(...item.linhas);
    }
  });
  if (outras.length) {
    linhas.push("", b("Outras ocorrências"), ...outras);
  }
  return linhas.join("\n");
}

/** Normaliza ocorrências vindas do resumo salvo (Json). */
export function ocorrenciasDoResumo(valor: unknown): OcorrenciaOperacional[] | null {
  if (!Array.isArray(valor)) return null;
  return valor
    .filter((v): v is Record<string, unknown> => !!v && typeof v === "object")
    .map((v) => ({
      id: String(v["id"] ?? ""),
      equipamento: typeof v["equipamento"] === "string" ? v["equipamento"] : null,
      tipo_status: typeof v["tipo_status"] === "string" ? v["tipo_status"] : null,
      mensagem: String(v["mensagem"] ?? ""),
      created_at: String(v["created_at"] ?? ""),
      hora_inicio: typeof v["hora_inicio"] === "string" ? v["hora_inicio"] : null,
      hora_fim: typeof v["hora_fim"] === "string" ? v["hora_fim"] : null,
      duracao_min: typeof v["duracao_min"] === "number" ? v["duracao_min"] : null,
      motivo_parada: typeof v["motivo_parada"] === "string" ? v["motivo_parada"] : null,
      motivo_outro: typeof v["motivo_outro"] === "string" ? v["motivo_outro"] : null,
      acao_realizada: typeof v["acao_realizada"] === "string" ? v["acao_realizada"] : null,
    }));
}

/* ---------- Gerencial: paradas ---------- */

export type LinhaRanking = { chave: string; minutos: number; quantidade: number };

/** Ranking de paradas finalizadas (duracao_min válida). Ignora "Sem ocorrências" e abertas. */
export function rankingParadas(lista: readonly OcorrenciaOperacional[], por: "equipamento" | "motivo" | "turno"): LinhaRanking[] {
  const mapa = new Map<string, LinhaRanking>();
  for (const o of lista) {
    if (o.tipo_status === "sem_ocorrencias" || ocorrenciaEmAndamento(o)) continue;
    if (typeof o.duracao_min !== "number" || o.duracao_min <= 0) continue;
    const chave = por === "equipamento" ? o.equipamento || "Ocorrência geral" : por === "motivo" ? o.motivo_parada || "Sem motivo" : o.turno || "—";
    const atual = mapa.get(chave) ?? { chave, minutos: 0, quantidade: 0 };
    atual.minutos += o.duracao_min;
    atual.quantidade += 1;
    mapa.set(chave, atual);
  }
  return [...mapa.values()].sort((a, b) => b.minutos - a.minutos || a.chave.localeCompare(b.chave));
}

export function resumoParadas(lista: readonly OcorrenciaOperacional[]) {
  const ranking = rankingParadas(lista, "equipamento");
  return {
    totalMin: ranking.reduce((t, r) => t + r.minutos, 0),
    finalizadas: ranking.reduce((t, r) => t + r.quantidade, 0),
    emAndamento: lista.filter((o) => ocorrenciaEmAndamento(o)).length,
    maiorEquipamento: ranking[0] ?? null,
  };
}

const csvCampo = (v: unknown) => {
  const t = v === null || v === undefined ? "" : String(v);
  return /[";\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

/** CSV (separador ;, compatível com Excel pt-BR). */
export function csvOcorrencias(lista: readonly OcorrenciaOperacional[], nomes: Record<string, string> = {}) {
  const cab = ["Data operacional", "Setor", "Turno atual", "Turno origem", "Equipamento", "Situação", "Motivo", "Descrição",
    "Hora início", "Hora fim", "Duração (min)", "Duração", "Ação realizada", "Registrado por", "Transferências"];
  const linhas = lista.map((o) => [
    o.data_local ?? "", o.setor ?? "", o.turno ?? "", o.turno_origem ?? "", o.equipamento ?? "Ocorrência geral",
    ocorrenciaEmAndamento(o) ? "Em andamento" : rotuloSituacao(o.tipo_status), rotuloMotivo(o), o.mensagem,
    hhmm(o.hora_inicio), hhmm(o.hora_fim), o.duracao_min ?? "", formatarDuracaoOcorrencia(o.duracao_min),
    o.acao_realizada ?? "", (o.criado_por && nomes[o.criado_por]) || "", o.quantidade_transferencias ?? 0,
  ]);
  return [cab, ...linhas].map((l) => l.map(csvCampo).join(";")).join("\r\n");
}
