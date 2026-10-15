/**
 * Fila de apontamentos feitos sem internet.
 *
 * Regras (ver drizzle/migrations/0029_apontamento_sem_internet.sql):
 * - O apontamento rápido, sem conexão, fica guardado no aparelho com um id gerado no
 *   próprio aparelho e a hora em que foi salvo (registradoEm).
 * - O envio é automático quando a conexão volta. Reenviar o mesmo id não duplica:
 *   o banco recusa o id repetido (23505) e o item é tratado como já salvo.
 * - O banco usa registradoEm como horário da produção, desde que seja do mesmo turno,
 *   o turno não esteja fechado e o envio aconteça em até 12 horas.
 * - Qualquer recusa do banco vira "conflito": o item fica no aparelho, com a
 *   explicação, até o facilitador tentar de novo ou descartar. Nada é apagado
 *   sem confirmação.
 * - A fila é separada por usuário: um aparelho compartilhado nunca envia o
 *   apontamento de uma pessoa com a conta de outra.
 */

export const PRAZO_SEM_INTERNET_MS = 12 * 60 * 60_000;
export const EVENTO_FILA = "dryko:fila-apontamentos";
/** Disparado quando apontamentos guardados no aparelho chegam ao banco. */
export const EVENTO_ENVIADOS = "dryko:apontamentos-enviados";
const PREFIXO = "dryko:apontamentos-sem-internet:v1:";

export type SetorFila = "corte" | "fitas" | "mantas" | "liquidos" | "asfox" | "misturadores";

export type ApontamentoNaFila = {
  id: string;
  usuarioId: string;
  setor: SetorFila;
  turno: string;
  /** Momento (ISO) em que o facilitador salvou no aparelho. */
  registradoEm: string;
  /** Campos do insert em public.apontamentos, sem id e sem registrado_offline_em. */
  insercao: Record<string, unknown>;
  /** Preenchimento opcional da referência na programação do dia, feito após o envio. */
  programacao: { setor: "corte" | "fitas" | "mantas"; produtoId: string; referencia: string } | null;
  /** Texto curto para a lista: "OP 134433 · FVD 45 · 3 PLTs". */
  descricao: string;
  situacao: "aguardando" | "conflito";
  erro: string | null;
  tentativas: number;
};

export type Armazenamento = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** localStorage, quando disponível e gravável (modo privado ou cota cheia podem recusar). */
export function armazenamentoPadrao(): Armazenamento | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    const teste = "__dryko_teste_fila__";
    window.localStorage.setItem(teste, "1");
    window.localStorage.removeItem(teste);
    return window.localStorage;
  } catch {
    return null;
  }
}

function chave(usuarioId: string) {
  return `${PREFIXO}${usuarioId}`;
}

function avisarMudanca() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENTO_FILA));
}

export function lerFila(
  usuarioId: string | null | undefined,
  armazenamento: Armazenamento | null = armazenamentoPadrao(),
): ApontamentoNaFila[] {
  if (!usuarioId || !armazenamento) return [];
  try {
    const bruto = armazenamento.getItem(chave(usuarioId));
    const lista: unknown = bruto ? JSON.parse(bruto) : [];
    return Array.isArray(lista)
      ? (lista as ApontamentoNaFila[]).filter((item) => item && item.usuarioId === usuarioId)
      : [];
  } catch {
    return [];
  }
}

function gravarFila(
  usuarioId: string,
  itens: ApontamentoNaFila[],
  armazenamento: Armazenamento | null,
): boolean {
  if (!armazenamento) return false;
  try {
    if (itens.length) armazenamento.setItem(chave(usuarioId), JSON.stringify(itens));
    else armazenamento.removeItem(chave(usuarioId));
    avisarMudanca();
    return true;
  } catch {
    return false;
  }
}

/** Retorna false quando o aparelho não conseguiu guardar (sem armazenamento ou cota cheia). */
export function adicionarNaFila(
  item: ApontamentoNaFila,
  armazenamento: Armazenamento | null = armazenamentoPadrao(),
): boolean {
  const atual = lerFila(item.usuarioId, armazenamento);
  if (atual.some((existente) => existente.id === item.id)) return true;
  return gravarFila(item.usuarioId, [...atual, item], armazenamento);
}

export function removerDaFila(
  usuarioId: string,
  id: string,
  armazenamento: Armazenamento | null = armazenamentoPadrao(),
) {
  return gravarFila(
    usuarioId,
    lerFila(usuarioId, armazenamento).filter((item) => item.id !== id),
    armazenamento,
  );
}

export function atualizarNaFila(
  usuarioId: string,
  id: string,
  alteracao: Partial<Pick<ApontamentoNaFila, "situacao" | "erro" | "tentativas">>,
  armazenamento: Armazenamento | null = armazenamentoPadrao(),
) {
  return gravarFila(
    usuarioId,
    lerFila(usuarioId, armazenamento).map((item) =>
      item.id === id ? { ...item, ...alteracao } : item,
    ),
    armazenamento,
  );
}

export function prazoVencido(item: Pick<ApontamentoNaFila, "registradoEm">, agora = Date.now()) {
  const salvo = Date.parse(item.registradoEm);
  return Number.isFinite(salvo) && agora - salvo > PRAZO_SEM_INTERNET_MS;
}

type ErroBanco = { code?: string | null; message?: string | null; status?: number | null };

/** Falha de transporte: o pedido pode nem ter chegado ao servidor. */
export function ehErroDeRede(erro: unknown): boolean {
  const texto =
    erro instanceof Error
      ? `${erro.name} ${erro.message}`
      : typeof erro === "object" && erro
        ? `${(erro as ErroBanco).message ?? ""}`
        : String(erro ?? "");
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed|err_internet_disconnected|err_network/i.test(
    texto,
  );
}

export type ResultadoEnvio = "salvo" | "ja-salvo" | "sem-rede" | "sessao" | "conflito";

export function classificarErroEnvio(erro: unknown, online = true): ResultadoEnvio {
  if (!erro) return "salvo";
  const { code, message, status } = (typeof erro === "object" ? erro : {}) as ErroBanco;
  if (code === "23505") return "ja-salvo";
  if (!online || ehErroDeRede(erro)) return "sem-rede";
  if (
    status === 401 ||
    code === "PGRST301" ||
    /jwt|auth session missing|not authenticated|invalid refresh token/i.test(message ?? "")
  )
    return "sessao";
  return "conflito";
}

const NOME_SETOR: Record<SetorFila, string> = {
  corte: "Corte",
  fitas: "Fitas",
  mantas: "Mantas",
  liquidos: "Líquidos",
  asfox: "Asfox",
  misturadores: "Misturadores",
};
const NOME_TURNO: Record<string, string> = { T1: "1º turno", T2: "2º turno", T3: "3º turno" };

/** Explicação para o facilitador, a partir da recusa do banco. */
export function mensagemConflito(
  erro: unknown,
  item: Pick<ApontamentoNaFila, "setor" | "turno">,
): string {
  const { code, message } = (typeof erro === "object" && erro ? erro : {}) as ErroBanco;
  const texto = (message ?? String(erro ?? "")).toLocaleLowerCase("pt-BR");
  if (texto.includes("prazo de 12 horas"))
    return "Passou do prazo de 12 horas para envio. Descarte e, se precisar, registre de novo.";
  if (texto.includes("fechado"))
    return "O turno já foi fechado. Peça ao administrador para reabrir o turno ou descarte este apontamento.";
  if (texto.includes("horario") && texto.includes("turno"))
    return "A hora em que foi salvo não pertence ao turno escolhido. Descarte e registre no turno certo.";
  if (texto.includes("futuro"))
    return "O relógio do aparelho estava adiantado. Acerte a hora do celular e tente de novo.";
  if (texto.includes("produto invalido"))
    return "O produto foi desativado ou não pertence a este setor.";
  if (code === "42501" || texto.includes("row-level security") || texto.includes("permission"))
    return `Seu setor ou turno mudou. Volte para ${NOME_SETOR[item.setor] ?? item.setor} · ${NOME_TURNO[item.turno] ?? item.turno} em "Setor e turno" para enviar, ou descarte.`;
  return message || "O servidor recusou este apontamento. Revise e tente de novo ou descarte.";
}

/** Identificador do apontamento gerado no aparelho (o mesmo em todas as tentativas). */
export function novoIdApontamento(): string {
  const c = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
