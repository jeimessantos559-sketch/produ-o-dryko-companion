// Verificação WebAuthn server-side usando apenas WebCrypto (sem dependências).
// Substitui @simplewebauthn/server, cujo pacote de certificados derrubava o worker
// na inicialização. Chaves públicas são guardadas em COSE (base64url), mesmo formato anterior.

const enc = new TextEncoder();

export function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64urlDecode(texto: string): Uint8Array {
  const base = texto.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(base + "=".repeat((4 - (base.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function novoDesafio(): string {
  return b64urlEncode(crypto.getRandomValues(new Uint8Array(32)));
}

async function sha256(dados: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", dados as BufferSource));
}

function iguais(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}

// ---------- CBOR mínimo ----------
function lerCbor(buf: Uint8Array, pos = 0): [unknown, number] {
  const ini = buf[pos];
  if (ini === undefined) throw new Error("CBOR inválido");
  const tipo = ini >> 5;
  const info = ini & 31;
  pos++;
  let valor: number;
  if (info < 24) valor = info;
  else if (info === 24) { valor = buf[pos]; pos += 1; }
  else if (info === 25) { valor = (buf[pos] << 8) | buf[pos + 1]; pos += 2; }
  else if (info === 26) { valor = new DataView(buf.buffer, buf.byteOffset + pos, 4).getUint32(0); pos += 4; }
  else if (info === 27) { valor = Number(new DataView(buf.buffer, buf.byteOffset + pos, 8).getBigUint64(0)); pos += 8; }
  else throw new Error("CBOR não suportado");

  switch (tipo) {
    case 0: return [valor, pos];
    case 1: return [-1 - valor, pos];
    case 2: return [buf.slice(pos, pos + valor), pos + valor];
    case 3: return [new TextDecoder().decode(buf.slice(pos, pos + valor)), pos + valor];
    case 4: {
      const arr: unknown[] = [];
      for (let i = 0; i < valor; i++) { const [v, p] = lerCbor(buf, pos); arr.push(v); pos = p; }
      return [arr, pos];
    }
    case 5: {
      const mapa = new Map<unknown, unknown>();
      for (let i = 0; i < valor; i++) {
        const [k, p1] = lerCbor(buf, pos);
        const [v, p2] = lerCbor(buf, p1);
        mapa.set(k, v); pos = p2;
      }
      return [mapa, pos];
    }
    case 7:
      if (info === 20) return [false, pos];
      if (info === 21) return [true, pos];
      return [null, pos];
    default: throw new Error("CBOR não suportado");
  }
}

// ---------- authenticatorData ----------
type DadosAutenticador = {
  rpIdHash: Uint8Array;
  up: boolean;
  uv: boolean;
  contador: number;
  credentialId?: Uint8Array;
  chaveCose?: Uint8Array;
};

function lerAuthData(ad: Uint8Array): DadosAutenticador {
  if (ad.length < 37) throw new Error("authenticatorData inválido");
  const flags = ad[32];
  const contador = new DataView(ad.buffer, ad.byteOffset + 33, 4).getUint32(0);
  const r: DadosAutenticador = { rpIdHash: ad.slice(0, 32), up: !!(flags & 0x01), uv: !!(flags & 0x04), contador };
  if (flags & 0x40) {
    let p = 37 + 16;
    const tam = (ad[p] << 8) | ad[p + 1];
    p += 2;
    r.credentialId = ad.slice(p, p + tam);
    p += tam;
    const [, fim] = lerCbor(ad, p);
    r.chaveCose = ad.slice(p, fim);
  }
  return r;
}

// ---------- chaves COSE ----------
async function importarChave(cose: Uint8Array): Promise<{ chave: CryptoKey; alg: number }> {
  const [m] = lerCbor(cose);
  const mapa = m as Map<number, unknown>;
  const kty = mapa.get(1);
  const alg = Number(mapa.get(3));
  if (kty === 2 && alg === -7) {
    const jwk = { kty: "EC", crv: "P-256", x: b64urlEncode(mapa.get(-2) as Uint8Array), y: b64urlEncode(mapa.get(-3) as Uint8Array), ext: true };
    return { chave: await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]), alg };
  }
  if (kty === 3 && alg === -257) {
    const jwk = { kty: "RSA", n: b64urlEncode(mapa.get(-1) as Uint8Array), e: b64urlEncode(mapa.get(-2) as Uint8Array), ext: true };
    return { chave: await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]), alg };
  }
  if (kty === 1 && alg === -8) {
    return { chave: await crypto.subtle.importKey("raw", mapa.get(-2) as Uint8Array as BufferSource, { name: "Ed25519" }, false, ["verify"]), alg };
  }
  throw new Error("Tipo de chave não suportado");
}

// Assinatura ECDSA vem em DER; WebCrypto espera r||s (64 bytes).
function derParaRaw(der: Uint8Array): Uint8Array {
  let p = 2;
  if (der[1] & 0x80) p = 2 + (der[1] & 0x7f);
  const ler = () => {
    if (der[p] !== 0x02) throw new Error("Assinatura inválida");
    const tam = der[p + 1];
    let v = der.slice(p + 2, p + 2 + tam);
    p += 2 + tam;
    while (v.length > 32 && v[0] === 0) v = v.slice(1);
    const out = new Uint8Array(32);
    out.set(v, 32 - v.length);
    return out;
  };
  const r = ler();
  const s = ler();
  const raw = new Uint8Array(64);
  raw.set(r, 0); raw.set(s, 32);
  return raw;
}

function conferirClientData(bytes: Uint8Array, tipo: string, desafio: string, origem: string) {
  const cd = JSON.parse(new TextDecoder().decode(bytes)) as { type?: string; challenge?: string; origin?: string };
  if (cd.type !== tipo) throw new Error("Tipo de operação inválido");
  if (cd.challenge !== desafio) throw new Error("Desafio inválido");
  if (cd.origin !== origem) throw new Error("Origem inválida");
}

async function conferirAuthData(ad: DadosAutenticador, rpID: string) {
  if (!iguais(ad.rpIdHash, await sha256(enc.encode(rpID)))) throw new Error("RP inválido");
  if (!ad.up) throw new Error("Presença do usuário não confirmada");
  if (!ad.uv) throw new Error("Biometria não confirmada");
}

// ---------- opções ----------
export function opcoesRegistro(p: {
  rpName: string; rpID: string; userId: string; userName: string; displayName: string;
  excluir: { id: string; transports?: string[] | null }[];
}) {
  return {
    challenge: novoDesafio(),
    rp: { name: p.rpName, id: p.rpID },
    user: { id: b64urlEncode(enc.encode(p.userId)), name: p.userName, displayName: p.displayName },
    pubKeyCredParams: [
      { alg: -8, type: "public-key" },
      { alg: -7, type: "public-key" },
      { alg: -257, type: "public-key" },
    ],
    timeout: 60000,
    attestation: "none",
    excludeCredentials: p.excluir.map((c) => ({ id: c.id, type: "public-key", transports: c.transports ?? undefined })),
    authenticatorSelection: { residentKey: "required", requireResidentKey: true, userVerification: "required" },
    extensions: { credProps: true },
  };
}

export function opcoesLogin(rpID: string) {
  return { challenge: novoDesafio(), rpId: rpID, timeout: 60000, userVerification: "required", allowCredentials: [] };
}

// ---------- verificação ----------
type RespostaRegistro = { id: string; response: { clientDataJSON: string; attestationObject: string; transports?: string[] } };
type RespostaLogin = { id: string; response: { clientDataJSON: string; authenticatorData: string; signature: string; userHandle?: string } };

export async function verificarRegistro(resp: RespostaRegistro, desafio: string, origem: string, rpID: string) {
  conferirClientData(b64urlDecode(resp.response.clientDataJSON), "webauthn.create", desafio, origem);
  const [obj] = lerCbor(b64urlDecode(resp.response.attestationObject));
  const authData = (obj as Map<string, unknown>).get("authData") as Uint8Array;
  const ad = lerAuthData(authData);
  await conferirAuthData(ad, rpID);
  if (!ad.credentialId || !ad.chaveCose) throw new Error("Credencial ausente");
  const id = b64urlEncode(ad.credentialId);
  if (id !== resp.id) throw new Error("Credencial inconsistente");
  await importarChave(ad.chaveCose); // garante algoritmo suportado
  return { credentialId: id, publicKey: b64urlEncode(ad.chaveCose), contador: ad.contador, transports: resp.response.transports ?? null };
}

export async function verificarLogin(
  resp: RespostaLogin, desafio: string, origem: string, rpID: string,
  cred: { publicKey: string; contador: number; userId: string },
) {
  const clientData = b64urlDecode(resp.response.clientDataJSON);
  conferirClientData(clientData, "webauthn.get", desafio, origem);
  const authData = b64urlDecode(resp.response.authenticatorData);
  const ad = lerAuthData(authData);
  await conferirAuthData(ad, rpID);
  if (resp.response.userHandle) {
    const dono = new TextDecoder().decode(b64urlDecode(resp.response.userHandle));
    if (dono !== cred.userId) throw new Error("Usuário inconsistente");
  }

  const hashCd = await sha256(clientData);
  const assinado = new Uint8Array(authData.length + hashCd.length);
  assinado.set(authData, 0); assinado.set(hashCd, authData.length);
  let assinatura = b64urlDecode(resp.response.signature);

  const { chave, alg } = await importarChave(b64urlDecode(cred.publicKey));
  let algoritmo: AlgorithmIdentifier | EcdsaParams = { name: "Ed25519" };
  if (alg === -7) { algoritmo = { name: "ECDSA", hash: "SHA-256" }; assinatura = derParaRaw(assinatura); }
  else if (alg === -257) algoritmo = { name: "RSASSA-PKCS1-v1_5" };

  const ok = await crypto.subtle.verify(algoritmo, chave, assinatura as BufferSource, assinado as BufferSource);
  if (!ok) throw new Error("Assinatura inválida");
  if ((ad.contador > 0 || cred.contador > 0) && ad.contador <= cred.contador) throw new Error("Contador inválido");
  return { novoContador: ad.contador };
}
