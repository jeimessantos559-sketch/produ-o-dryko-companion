import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
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
  const ultimaCarga = useRef<{ userId: string; at: number } | null>(null);
  const emAndamento = useRef<Promise<void> | null>(null);

  async function loadUserData(userId: string | undefined, forcar = false) {
    if (!userId) {
      setProfile(null);
      setRoles([]);
      ultimaCarga.current = null;
      return;
    }

    if (!forcar && ultimaCarga.current?.userId === userId && Date.now() - ultimaCarga.current.at < 12_000) return;
    if (!forcar && emAndamento.current) return emAndamento.current;

    const tarefa = (async () => {
      const [{ data: perfil }, { data: papeis }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", userId),
      ]);
      setProfile((perfil as Profile | null) ?? null);
      setRoles((papeis ?? []).map((p) => p.role));
      ultimaCarga.current = { userId, at: Date.now() };
    })();

    emAndamento.current = tarefa;
    try {
      await tarefa;
    } finally {
      emAndamento.current = null;
    }
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

  const isAdmin = roles.includes("administrador");
  const value: AuthValue = {
    session,
    user: session?.user ?? null,
    profile,
    roles,
    loading,
    isAdmin,
    // A partir daqui a caixa "Pode lançar no Protheus" é a fonte de verdade.
    isAutorizado: isAdmin || Boolean(profile?.pode_confirmar_protheus),
    canManageProducts: isAdmin || Boolean(profile?.pode_gerenciar_produtos),
    mustChangePassword: Boolean(profile?.deve_alterar_senha),
    refresh: () => loadUserData(session?.user.id, true),
    signOut: async () => {
      await supabase.auth.signOut();
      setProfile(null);
      setRoles([]);
      ultimaCarga.current = null;
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
