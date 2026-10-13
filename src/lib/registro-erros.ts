/**
 * Registro automático de erros do aplicativo na tabela public.erros_app
 * (migração 0030). Nunca lança erro, nunca bloqueia a tela e não grava:
 * falta de internet, erros de extensões do navegador, ruído conhecido,
 * repetições do mesmo erro em 1 minuto e mais de 20 erros por sessão.
 */
import { supabase } from "@/integrations/supabase/client";
import { contarErroGravado, deveRegistrar, mensagemDoErro } from "@/lib/registro-erros-regras";

export { mensagemDoErro };

export type OrigemErro = "tela" | "codigo" | "promessa" | "apontamento";

let gravando = false;

export async function registrarErro(
  erro: unknown,
  origem: OrigemErro,
  extra: { arquivo?: string | null; setor?: string | null; turno?: string | null } = {},
) {
  try {
    if (typeof window === "undefined" || gravando) return;
    if (navigator.onLine === false) return;
    const rota = window.location.pathname.slice(0, 300);
    if (!deveRegistrar(erro, rota, Date.now(), extra.arquivo)) return;

    gravando = true;
    const { data } = await supabase.auth.getSession();
    const usuarioId = data.session?.user.id;
    if (!usuarioId) return;

    const pilha = erro instanceof Error && erro.stack ? erro.stack.slice(0, 6000) : null;
    const versao =
      typeof __APP_COMMIT__ === "string"
        ? `${__APP_COMMIT__}${typeof __APP_BUILD__ === "string" ? ` ${__APP_BUILD__}` : ""}`
        : "local";
    await supabase.from("erros_app").insert({
      usuario_id: usuarioId,
      origem,
      mensagem: mensagemDoErro(erro),
      pilha,
      rota,
      versao: versao.slice(0, 80),
      navegador: navigator.userAgent.slice(0, 300),
      setor: extra.setor ?? null,
      turno: extra.turno ?? null,
    });
    contarErroGravado();
  } catch {
    // O registro de erros nunca pode causar outro erro.
  } finally {
    gravando = false;
  }
}

/** Captura erros não tratados da página. Retorna a função para remover os ouvintes. */
export function instalarRegistroDeErros() {
  if (typeof window === "undefined") return () => undefined;
  const aoErro = (evento: ErrorEvent) => {
    void registrarErro(evento.error ?? evento.message, "codigo", { arquivo: evento.filename });
  };
  const aoRejeitar = (evento: PromiseRejectionEvent) => {
    void registrarErro(evento.reason, "promessa");
  };
  window.addEventListener("error", aoErro);
  window.addEventListener("unhandledrejection", aoRejeitar);
  return () => {
    window.removeEventListener("error", aoErro);
    window.removeEventListener("unhandledrejection", aoRejeitar);
  };
}
