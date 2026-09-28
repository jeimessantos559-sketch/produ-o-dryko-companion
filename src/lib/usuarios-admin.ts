import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { aliasDoNome, emailInternoDoLogin, normalizarLogin } from "@/lib/login-operacional";

const criarEntrada = z.object({
  nome: z.string().trim().min(2).max(120),
});

const criarLoteEntrada = z.object({
  nomes: z.array(z.string().trim().min(2).max(120)).min(1).max(30),
});

const editarEntrada = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("rename"),
    userId: z.string().uuid(),
    nome: z.string().trim().min(2).max(120),
    login: z.string().trim().min(2).max(80),
  }),
  z.object({ action: z.literal("reset"), userId: z.string().uuid() }),
  z.object({ action: z.literal("delete"), userId: z.string().uuid() }),
]);

type ContextoAutenticado = {
  supabase: SupabaseClient<Database>;
  userId: string;
};

async function exigirAdmin(context: ContextoAutenticado) {
  const { data: admin } = await context.supabase.rpc("eh_admin_ativo", {
    _user_id: context.userId,
  });
  if (!admin) throw new Error("Apenas administradores podem gerenciar usuários.");
}

function gerarSenhaTecnica() {
  return `Tmp-${crypto.randomUUID()}-Aa9!`;
}

async function gerarLoginUnico(supabaseAdmin: SupabaseClient<Database>, nome: string) {
  const base = normalizarLogin(aliasDoNome(nome) ?? "") || `usuario.${crypto.randomUUID().slice(0, 6)}`;
  let tentativa = base;
  let sufixo = 2;
  while (true) {
    const { data } = await supabaseAdmin.from("profiles").select("id").eq("login_key", tentativa).maybeSingle();
    if (!data) return tentativa;
    tentativa = `${base}${sufixo}`;
    sufixo += 1;
  }
}

async function criarUsuarioInterno(supabaseAdmin: SupabaseClient<Database>, nome: string) {
  const loginKey = await gerarLoginUnico(supabaseAdmin, nome);
  const login = loginKey
    .split(".")
    .map((parte) => parte ? parte[0]?.toUpperCase() + parte.slice(1) : parte)
    .join(".");

  const { data: criado, error } = await supabaseAdmin.auth.admin.createUser({
    email: emailInternoDoLogin(loginKey),
    password: gerarSenhaTecnica(),
    email_confirm: true,
    user_metadata: {
      nome,
      login,
      login_key: loginKey,
      deve_alterar_senha: true,
    },
  });

  if (error || !criado.user) throw new Error(error?.message || "Não foi possível criar o usuário.");

  const { error: erroPerfil } = await supabaseAdmin.from("profiles")
    .update({ nome, login, login_key: loginKey, deve_alterar_senha: true, ativo: true })
    .eq("id", criado.user.id);

  if (erroPerfil) {
    await supabaseAdmin.auth.admin.deleteUser(criado.user.id);
    throw new Error("Não foi possível concluir o cadastro do usuário.");
  }

  return { id: criado.user.id, login, senhaInicial: "123456" };
}

export const criarUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(criarEntrada)
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return criarUsuarioInterno(supabaseAdmin, data.nome);
  });

export const criarUsuariosEmLote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(criarLoteEntrada)
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const nomes = [...new Set(data.nomes.map((nome) => nome.trim()).filter(Boolean))];
    const criados: Array<{ nome: string; login: string; senhaInicial: string }> = [];
    const existentes: string[] = [];
    const falhas: Array<{ nome: string; erro: string }> = [];

    for (const nome of nomes) {
      const loginBase = normalizarLogin(aliasDoNome(nome) ?? "");
      if (loginBase) {
        const { data: existente } = await supabaseAdmin.from("profiles")
          .select("id")
          .eq("login_key", loginBase)
          .maybeSingle();
        if (existente) {
          existentes.push(nome);
          continue;
        }
      }

      try {
        const criado = await criarUsuarioInterno(supabaseAdmin, nome);
        criados.push({ nome, login: criado.login, senhaInicial: criado.senhaInicial });
      } catch (erro) {
        falhas.push({ nome, erro: erro instanceof Error ? erro.message : "Falha ao criar usuário." });
      }
    }

    return { criados, existentes, falhas };
  });

export const gerenciarUsuarioAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(editarEntrada)
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    if (data.userId === context.userId && data.action === "delete") {
      throw new Error("Você não pode excluir seu próprio usuário.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.action === "reset") {
      const { error: erroSenha } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
        password: gerarSenhaTecnica(),
      });
      if (erroSenha) throw new Error("Não foi possível redefinir a senha do usuário.");

      const { error } = await supabaseAdmin.from("profiles")
        .update({ deve_alterar_senha: true })
        .eq("id", data.userId);
      if (error) throw new Error("Não foi possível redefinir o primeiro acesso.");
      return { ok: true, senhaInicial: "123456" };
    }

    if (data.action === "delete") {
      const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
      if (error) {
        throw new Error("Este usuário possui vínculos no histórico ou não pôde ser excluído. Desative-o para preservar os registros.");
      }
      return { ok: true };
    }

    const loginKey = normalizarLogin(data.login);
    if (!loginKey) throw new Error("Informe um login válido.");
    const { data: duplicado } = await supabaseAdmin.from("profiles")
      .select("id")
      .eq("login_key", loginKey)
      .neq("id", data.userId)
      .maybeSingle();
    if (duplicado) throw new Error("Este login já está sendo usado.");

    const { error: erroAuth } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      email: emailInternoDoLogin(loginKey),
      user_metadata: { nome: data.nome, login: data.login.trim(), login_key: loginKey },
    });
    if (erroAuth) throw new Error("Não foi possível atualizar o acesso do usuário.");

    const { error } = await supabaseAdmin.from("profiles")
      .update({ nome: data.nome.trim(), login: data.login.trim(), login_key: loginKey })
      .eq("id", data.userId);
    if (error) throw new Error("Não foi possível atualizar o usuário.");
    return { ok: true };
  });
