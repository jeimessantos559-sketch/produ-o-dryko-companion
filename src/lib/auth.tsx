import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { invalidarCache } from "@/lib/cache-consultas";
import { obterPerfilUsuario } from "@/lib/perfil-cache";

export type AppRole = Database["public"]["Enums"]["app_role"];
export type SetorCodigo = Database["public"]["Enums"]["setor_codigo"];
export type TurnoCodigo = Database["public"]["Enums"]["turno_codigo"];
type ProfileBase = Database["public"]["Tables"]["profiles"]["Row"];
export type Profile = ProfileBase & {
  login: string | null;
  login_key: string | null;
  deve_alterar_senha: boolean;
  pode_finalizar_metas: boolean;
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
  canFinalizeGoals: boolean;
  canProgramProduction: boolean;
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
  const emAndamento = useRef<{ userId: string; tarefa: Promise<void> } | null>(null);
  const usuarioAtual = useRef<string | undefined>(undefined);
  const cargaAtual = useRef(0);

  const loadUserData = useCallback(async (userId: string | undefined, forcar = false) => {
    if (!userId) {
      cargaAtual.current += 1;
      setProfile(null);
      setRoles([]);
      ultimaCarga.current = null;
      emAndamento.current = null;
      return;
    }

    if (
      !forcar &&
      ultimaCarga.current?.userId === userId &&
      Date.now() - ultimaCarga.current.at < 12_000
    )
      return;
    if (!forcar && emAndamento.current?.userId === userId) return emAndamento.current.tarefa;

    const carga = ++cargaAtual.current;
    const tarefa = (async () => {
      try {
        const [perfil, { data: papeis, error }] = await Promise.all([
          obterPerfilUsuario(userId, forcar),
          supabase.from("user_roles").select("role").eq("user_id", userId),
        ]);
        if (carga !== cargaAtual.current || usuarioAtual.current !== userId) return;
        if (error) throw error;
        setProfile(perfil);
        setRoles((papeis ?? []).map((p) => p.role));
        ultimaCarga.current = { userId, at: Date.now() };
      } catch {
        if (carga !== cargaAtual.current || usuarioAtual.current !== userId) return;
        setProfile(null);
        setRoles([]);
        ultimaCarga.current = null;
      }
    })();

    emAndamento.current = { userId, tarefa };
    try {
      await tarefa;
    } finally {
      if (emAndamento.current?.tarefa === tarefa) emAndamento.current = null;
    }
  }, []);

  useEffect(() => {
    let ativo = true;
    let agendamento: ReturnType<typeof setTimeout> | undefined;

    function atualizarSessao(novaSessao: Session | null) {
      if (!ativo) return;
      const userId = novaSessao?.user.id;
      if (usuarioAtual.current !== userId) {
        if (usuarioAtual.current) invalidarCache();
        cargaAtual.current += 1;
        emAndamento.current = null;
        ultimaCarga.current = null;
        setProfile(null);
        setRoles([]);
      }
      usuarioAtual.current = userId;
      setSession(novaSessao);

      // Consultas dentro do callback de autenticação podem disputar o lock da sessão.
      // Agrupa eventos iniciais e busca os dados somente depois de liberar o callback.
      clearTimeout(agendamento);
      agendamento = setTimeout(() => {
        void loadUserData(userId).finally(() => {
          if (ativo && usuarioAtual.current === userId) setLoading(false);
        });
      }, 0);
    }

    const { data: sub } = supabase.auth.onAuthStateChange((_event, novaSessao) => {
      atualizarSessao(novaSessao);
    });

    void supabase.auth.getSession().then(({ data }) => {
      atualizarSessao(data.session);
    });

    return () => {
      ativo = false;
      clearTimeout(agendamento);
      cargaAtual.current += 1;
      sub.subscription.unsubscribe();
    };
  }, [loadUserData]);

  const userId = session?.user.id;
  const refresh = useCallback(() => loadUserData(userId, true), [loadUserData, userId]);
  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    usuarioAtual.current = undefined;
    invalidarCache();
    setSession(null);
    await loadUserData(undefined);
  }, [loadUserData]);

  const isAdmin = roles.includes("administrador");
  const value = useMemo<AuthValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      roles,
      loading,
      isAdmin,
      isAutorizado: isAdmin || Boolean(profile?.pode_confirmar_protheus),
      canManageProducts: isAdmin || Boolean(profile?.pode_gerenciar_produtos),
      canFinalizeGoals: isAdmin || Boolean(profile?.pode_finalizar_metas),
      canProgramProduction: isAdmin || roles.includes("programador_producao"),
      mustChangePassword: Boolean(profile?.deve_alterar_senha),
      refresh,
      signOut,
    }),
    [session, profile, roles, loading, isAdmin, refresh, signOut],
  );

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
  programador_producao: "Programador de Produção",
};
