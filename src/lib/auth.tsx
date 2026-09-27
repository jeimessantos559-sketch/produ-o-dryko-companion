import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"];
export type SetorCodigo = Database["public"]["Enums"]["setor_codigo"];
export type TurnoCodigo = Database["public"]["Enums"]["turno_codigo"];
type ProfileBase = Database["public"]["Tables"]["profiles"]["Row"];
export type Profile = ProfileBase & {
  login: string | null;
  login_key: string | null;
  deve_alterar_senha: boolean;
};

type AuthValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  roles: AppRole[];
  loading: boolean;
  isAdmin: boolean;
  isAutorizado: boolean;
  canManageProducts: boolean;
  mustChangePassword: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadUserData(userId: string | undefined) {
    if (!userId) {
      setProfile(null);
      setRoles([]);
      return;
    }
    const [{ data: perfil }, { data: papeis }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);
    setProfile((perfil as Profile | null) ?? null);
    setRoles((papeis ?? []).map((p) => p.role));
  }

  useEffect(() => {
    let ativo = true;

    const { data: sub } = supabase.auth.onAuthStateChange((_event, novaSessao) => {
      if (!ativo) return;
      setSession(novaSessao);
      void loadUserData(novaSessao?.user.id).finally(() => setLoading(false));
    });

    void supabase.auth.getSession().then(({ data }) => {
      if (!ativo) return;
      setSession(data.session);
      void loadUserData(data.session?.user.id).finally(() => setLoading(false));
    });

    return () => {
      ativo = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value: AuthValue = {
    session,
    user: session?.user ?? null,
    profile,
    roles,
    loading,
    isAdmin: roles.includes("administrador"),
    isAutorizado:
      roles.includes("autorizado_protheus") ||
      roles.includes("administrador") ||
      Boolean(profile?.pode_confirmar_protheus),
    canManageProducts: roles.includes("administrador") || Boolean(profile?.pode_gerenciar_produtos),
    mustChangePassword: Boolean(profile?.deve_alterar_senha),
    refresh: () => loadUserData(session?.user.id),
    signOut: async () => {
      await supabase.auth.signOut();
      setProfile(null);
      setRoles([]);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth precisa estar dentro de AuthProvider");
  return ctx;
}

export const NOMES_PAPEIS: Record<AppRole, string> = {
  facilitador: "Facilitador",
  autorizado_protheus: "Autorizado Protheus",
  administrador: "Administrador",
};
