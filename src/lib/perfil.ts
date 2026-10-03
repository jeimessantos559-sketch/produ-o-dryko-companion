import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const entradaPerfil = z.object({
  nome: z.string().trim().min(2, "Informe um nome válido.").max(120),
  emailRecuperacao: z.string().trim().email("Informe um e-mail válido.").max(254).nullable(),
  avatarUrl: z.string().trim().max(500).nullable().optional(),
});

function avatarPertenceAoUsuario(caminho: string, userId: string) {
  return caminho.startsWith(`${userId}/`) && !caminho.includes("..") && !/^https?:/i.test(caminho);
}

/**
 * Atualiza apenas os campos de perfil que o próprio usuário pode editar.
 * A operação roda no servidor para não depender de permissões de coluna antigas
 * e nunca aceita um id de usuário vindo do navegador.
 */
export const atualizarMeuPerfil = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(entradaPerfil)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const emailRecuperacao = data.emailRecuperacao?.toLowerCase() ?? null;

    if (
      data.avatarUrl !== undefined &&
      data.avatarUrl !== null &&
      !avatarPertenceAoUsuario(data.avatarUrl, context.userId)
    ) {
      throw new Error("A foto selecionada não pertence a este usuário.");
    }

    if (emailRecuperacao) {
      const { data: existente, error: erroConsulta } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("ativo", true)
        .ilike("email_recuperacao", emailRecuperacao)
        .neq("id", context.userId)
        .maybeSingle();

      if (erroConsulta) throw new Error("Não foi possível validar o e-mail informado.");
      if (existente) throw new Error("Este e-mail já está associado a outro usuário ativo.");
    }

    const atualizacao: {
      nome: string;
      email_recuperacao: string | null;
      updated_at: string;
      avatar_url?: string | null;
    } = {
      nome: data.nome,
      email_recuperacao: emailRecuperacao,
      updated_at: new Date().toISOString(),
    };

    // Ausente significa "preserve o avatar atual". Isso também mantém a
    // atualização compatível com instalações que ainda aplicarão a migração.
    if (data.avatarUrl !== undefined) atualizacao.avatar_url = data.avatarUrl;

    const { data: perfil, error } = await supabaseAdmin
      .from("profiles")
      .update(atualizacao)
      .eq("id", context.userId)
      .select("id, nome, email_recuperacao, avatar_url")
      .single();

    if (error?.code === "23505") {
      throw new Error("Este e-mail já está associado a outro usuário ativo.");
    }
    if (error || !perfil) throw new Error("Não foi possível salvar o perfil. Tente novamente.");

    return perfil;
  });
