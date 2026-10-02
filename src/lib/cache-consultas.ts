/** Cache curto em memória com deduplicação de consultas idênticas em andamento. */
type Item = { valor: unknown; expiraEm: number };

const valores = new Map<string, Item>();
const emAndamento = new Map<string, Promise<unknown>>();

/** Valor salvo (mesmo vencido) para exibir imediatamente enquanto revalida. */
export function lerCache<T>(chave: string): { valor: T; fresco: boolean } | null {
  const item = valores.get(chave);
  if (!item) return null;
  return { valor: item.valor as T, fresco: item.expiraEm > Date.now() };
}

export async function consultarComCache<T>(
  chave: string,
  ttlMs: number,
  buscar: () => Promise<T>,
  opcoes: { forcar?: boolean } = {},
): Promise<T> {
  const salvo = lerCache<T>(chave);
  if (!opcoes.forcar && salvo?.fresco) return salvo.valor;
  const atual = emAndamento.get(chave);
  if (atual) return atual as Promise<T>;
  const req = buscar()
    .then((valor) => {
      valores.set(chave, { valor, expiraEm: Date.now() + ttlMs });
      return valor;
    })
    .finally(() => emAndamento.delete(chave));
  emAndamento.set(chave, req);
  return req;
}

/** Invalida chaves que começam com o prefixo (ou tudo). */
export function invalidarCache(prefixo?: string) {
  for (const chave of [...valores.keys()]) {
    if (!prefixo || chave.startsWith(prefixo)) valores.delete(chave);
  }
}
