type ConfiguracaoLimite = {
  acao: string;
  identificador: string;
  maxTentativas: number;
  janelaSegundos: number;
  bloqueioSegundos: number;
};

async function chaveDaTentativa(acao: string, identificador: string) {
  const { getRequest } = await import("@tanstack/react-start/server");
  const request = getRequest();
  const ip =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "desconhecido";
  const material = `${acao}|${ip}|${identificador.trim().toLocaleLowerCase("pt-BR")}`;
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function registrarTentativaAutenticacao(config: ConfiguracaoLimite) {
  const chave = await chaveDaTentativa(config.acao, config.identificador);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("registrar_tentativa_auth", {
    p_chave: chave,
    p_acao: config.acao,
    p_max_tentativas: config.maxTentativas,
    p_janela_segundos: config.janelaSegundos,
    p_bloqueio_segundos: config.bloqueioSegundos,
  });

  // A aplicacao continua disponivel durante a janela entre deploy e migracao.
  // O erro segue para o monitoramento do servidor, sem expor detalhes ao usuario.
  if (error) {
    console.error("[auth-rate-limit] limite indisponível", {
      action: config.acao,
      code: error.code,
    });
    return { bloqueado: false, chave };
  }
  return { bloqueado: Boolean(data), chave };
}

export async function limparTentativasAutenticacao(acao: string, chave: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.rpc("limpar_tentativas_auth", {
    p_chave: chave,
    p_acao: acao,
  });
  if (error)
    console.error("[auth-rate-limit] limpeza indisponível", { action: acao, code: error.code });
}
