import { supabase } from "@/integrations/supabase/client";
import type { Profile } from "@/lib/auth";
import { consultarComCache } from "@/lib/cache-consultas";

/** Compartilha a leitura entre o contexto de autenticação e a verificação de acesso. */
export function obterPerfilUsuario(userId: string, forcar = false) {
  return consultarComCache<Profile | null>(
    `perfil:usuario:${userId}`,
    12_000,
    async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();
      if (error) throw error;
      return (data as Profile | null) ?? null;
    },
    { forcar },
  );
}
