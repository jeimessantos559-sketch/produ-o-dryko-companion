// Limite persistente de tentativas de autenticação (por usuário e por IP).
// Chaves são gravadas com hash SHA-256: o banco nunca guarda login/e-mail/IP em texto.
/* eslint-disable @typescript-eslint/no-explicit-any */

export type TipoTentativa = "login" | "recuperacao" | "biometria";

export const JANELA_MINUTOS = 15;
export const LIMITES: Record<TipoTentativa, { porUsuario: number; porIp: number }> = {
  login: { porUsuario: 5, porIp: 20 },
  recuperacao: { porUsuario: 3, porIp: 10 },
  biometria: { porUsuario: 10, porIp: 20 },
};

export const MENSAGEM_BLOQUEIO = "Muitas tentativas. Aguarde alguns minutos e tente novamente.";

async function hash(valor: string) {
  const dados = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(valor));
  return [...new Uint8Array(dados)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function ipDaRequisicao() {
  try {
    const { getRequest } = await import("@tanstack/react-start/server");
    const h = getRequest().headers;
    return (h.get("cf-connecting-ip") || h.get("x-forwarded-for")?.split(",")[0] || h.get("x-real-ip") || "desconhecido").trim();
  } catch {
    return "desconhecido";
  }
}

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

async function chaves(tipo: TipoTentativa, identificador: string | null) {
  const ip = await hash(`ip:${await ipDaRequisicao()}`);
  const usuario = identificador ? await hash(`u:${identificador.trim().toLowerCase()}`) : null;
  return { ip, usuario, tipo };
}

/** Lança erro genérico quando usuário ou IP excederam o limite na janela. Falhas de leitura não bloqueiam o login. */
export async function verificarLimite(tipo: TipoTentativa, identificador: string | null) {
  const c = await chaves(tipo, identificador);
  const desde = new Date(Date.now() - JANELA_MINUTOS * 60_000).toISOString();
  const banco = await db();
  const contar = async (chave: string) => {
    const { count } = await banco.from("auth_tentativas").select("id", { count: "exact", head: true })
      .eq("tipo", tipo).eq("chave", chave).gte("created_at", desde);
    return count ?? 0;
  };
  const [porIp, porUsuario] = await Promise.all([contar(`ip:${c.ip}`), c.usuario ? contar(`u:${c.usuario}`) : 0]);
  if (porIp >= LIMITES[tipo].porIp || porUsuario >= LIMITES[tipo].porUsuario) throw new Error(MENSAGEM_BLOQUEIO);
  return c;
}

export async function registrarFalha(c: Awaited<ReturnType<typeof chaves>>) {
  const linhas = [{ tipo: c.tipo, chave: `ip:${c.ip}` }];
  if (c.usuario) linhas.push({ tipo: c.tipo, chave: `u:${c.usuario}` });
  try { await (await db()).from("auth_tentativas").insert(linhas); } catch { /* não interrompe o fluxo */ }
}

/** Após sucesso, zera falhas do usuário (as do IP expiram sozinhas). */
export async function limparFalhasUsuario(c: Awaited<ReturnType<typeof chaves>>) {
  if (!c.usuario) return;
  try { await (await db()).from("auth_tentativas").delete().eq("tipo", c.tipo).eq("chave", `u:${c.usuario}`); } catch { /* ignore */ }
}

/** Limpeza idempotente de desafios WebAuthn expirados e tentativas antigas. */
export async function limparSegurancaExpirada() {
  try { await (await db()).rpc("limpar_seguranca_expirada"); } catch { /* ignore */ }
}
