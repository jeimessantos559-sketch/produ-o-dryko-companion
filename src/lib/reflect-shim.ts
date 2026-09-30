// Needed by @simplewebauthn/server -> @peculiar/x509 -> tsyringe, which throws at
// module load on the Worker unless Reflect.getMetadata exists. Minimal metadata store.
export function instalarReflectShim() {
  const R = Reflect as any;
  if (typeof R.getMetadata === "function") return;
  const store = new WeakMap<object, Map<unknown, Map<unknown, unknown>>>();
  const mapa = (alvo: object, prop: unknown, criar: boolean) => {
    let porAlvo = store.get(alvo);
    if (!porAlvo) { if (!criar) return undefined; porAlvo = new Map(); store.set(alvo, porAlvo); }
    let porProp = porAlvo.get(prop);
    if (!porProp) { if (!criar) return undefined; porProp = new Map(); porAlvo.set(prop, porProp); }
    return porProp;
  };
  R.defineMetadata = (k: unknown, v: unknown, alvo: object, prop?: unknown) => { mapa(alvo, prop, true)!.set(k, v); };
  R.getOwnMetadata = (k: unknown, alvo: object, prop?: unknown) => mapa(alvo, prop, false)?.get(k);
  R.hasOwnMetadata = (k: unknown, alvo: object, prop?: unknown) => !!mapa(alvo, prop, false)?.has(k);
  R.getMetadata = (k: unknown, alvo: object, prop?: unknown) => {
    for (let o: any = alvo; o; o = Object.getPrototypeOf(o)) { const m = mapa(o, prop, false); if (m?.has(k)) return m.get(k); }
    return undefined;
  };
  R.hasMetadata = (k: unknown, alvo: object, prop?: unknown) => R.getMetadata(k, alvo, prop) !== undefined;
  R.metadata = (k: unknown, v: unknown) => (alvo: object, prop?: unknown) => R.defineMetadata(k, v, alvo, prop);
}
