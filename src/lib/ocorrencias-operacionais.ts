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
};

export type EquipamentoResumo = { equipamento: string; linhas: string[]; comProblema: boolean };
export type GrupoResumo = { titulo: string; itens: EquipamentoResumo[] };

/** Consolida ocorrências na ordem fixa. Sem registro = "Sem ocorrências". */
export function consolidarOcorrencias(lista: OcorrenciaOperacional[]) {
  const ordenadas = [...lista].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const grupos: GrupoResumo[] = GRUPOS_OCORRENCIAS.map((grupo) => ({
    titulo: grupo.titulo,
    itens: grupo.equipamentos.map((equipamento) => {
      const doEquip = ordenadas.filter((o) => o.equipamento === equipamento);
      const reais = doEquip.filter((o) => (o.tipo_status ?? "ocorrencia") === "ocorrencia");
      if (reais.length) {
        return { equipamento, linhas: reais.map((o) => o.mensagem), comProblema: true };
      }
      const ultimo = doEquip[doEquip.length - 1];
      if (ultimo) {
        const txt = rotuloSituacao(ultimo.tipo_status);
        return { equipamento, linhas: [txt], comProblema: ultimo.tipo_status !== "sem_ocorrencias" };
      }
      return { equipamento, linhas: [SEM_OCORRENCIAS], comProblema: false };
    }),
  }));
  const conhecidos = new Set<string>(GRUPOS_OCORRENCIAS.flatMap((g) => [...g.equipamentos]));
  const outras = ordenadas
    .filter((o) => !o.equipamento || !conhecidos.has(o.equipamento))
    .map((o) => (o.equipamento ? `${o.equipamento}: ${o.mensagem}` : o.mensagem));
  return { grupos, outras };
}

/** Texto no padrão WhatsApp (asteriscos) ou simples. */
export function textoOcorrencias(lista: OcorrenciaOperacional[], negrito = true) {
  const b = (t: string) => (negrito ? `*${t}*` : t);
  const { grupos, outras } = consolidarOcorrencias(lista);
  const linhas: string[] = [];
  grupos.forEach((grupo, i) => {
    if (i > 0) linhas.push("");
    linhas.push(b(grupo.titulo));
    for (const item of grupo.itens) {
      linhas.push(b(item.equipamento));
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
      id: String(v.id ?? ""),
      equipamento: typeof v.equipamento === "string" ? v.equipamento : null,
      tipo_status: typeof v.tipo_status === "string" ? v.tipo_status : null,
      mensagem: String(v.mensagem ?? ""),
      created_at: String(v.created_at ?? ""),
    }));
}
