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
};

/** Colunas de ocorrencias_turno usadas em todas as telas. */
export const CAMPOS_OCORRENCIA = "id, equipamento, tipo_status, mensagem, created_at, hora_inicio, hora_fim, duracao_min";

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
export function prefixoTempoOcorrencia(o: Pick<OcorrenciaOperacional, "hora_inicio" | "hora_fim" | "duracao_min">) {
  const partes: string[] = [];
  const dur = formatarDuracaoOcorrencia(o.duracao_min);
  if (dur) partes.push(`${dur} parada`);
  if (o.hora_inicio && o.hora_fim) partes.push(`${hhmm(o.hora_inicio)} às ${hhmm(o.hora_fim)}`);
  return partes.join(" · ");
}

function comTempo(o: OcorrenciaOperacional, texto: string) {
  const p = prefixoTempoOcorrencia(o);
  return p ? (texto ? `${p} · ${texto}` : p) : texto;
}

/** Soma de duracao_min por equipamento, ignorando "sem_ocorrencias". */
export function totalParadoPorEquipamento(lista: OcorrenciaOperacional[]) {
  const total = new Map<string, number>();
  for (const o of lista) {
    if (!o.equipamento || o.tipo_status === "sem_ocorrencias" || !o.duracao_min || o.duracao_min <= 0) continue;
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
    }));
}
