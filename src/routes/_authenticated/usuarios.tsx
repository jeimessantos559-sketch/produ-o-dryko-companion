import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AppShell, nomeSetor } from "@/components/dryko/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { NOMES_PAPEIS, useAuth, type AppRole, type Profile } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/usuarios")({
  component: Usuarios,
});

function Usuarios() {
  const { isAdmin, loading } = useAuth();
  const [perfis, setPerfis] = useState<Profile[]>([]);
  const [papeis, setPapeis] = useState<Record<string, AppRole[]>>({});
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    if (!isAdmin) {
      setCarregando(false);
      return;
    }
    void (async () => {
      const [{ data: p }, { data: r }] = await Promise.all([
        supabase.from("profiles").select("*").order("nome"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      setPerfis(p ?? []);
      const mapa: Record<string, AppRole[]> = {};
      (r ?? []).forEach((linha) => {
        mapa[linha.user_id] = [...(mapa[linha.user_id] ?? []), linha.role];
      });
      setPapeis(mapa);
      setCarregando(false);
    })();
  }, [isAdmin]);

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-4">
        <h1 className="text-2xl font-bold">Usuários</h1>

        {loading || carregando ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : !isAdmin ? (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">
              Esta tela é exclusiva do administrador.
            </CardContent>
          </Card>
        ) : (
          <>
            {perfis.map((p) => (
              <Card key={p.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{p.nome || "Sem nome"}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  <p>{(papeis[p.id] ?? []).map((r) => NOMES_PAPEIS[r]).join(", ") || "Sem perfil"}</p>
                  <p>
                    {p.setor_atual ? nomeSetor(p.setor_atual) : "Sem setor"} ·{" "}
                    {p.turno_atual ? `Turno ${p.turno_atual}` : "Sem turno"}
                  </p>
                </CardContent>
              </Card>
            ))}
            <p className="text-xs text-muted-foreground">
              Criação de usuários pelo administrador e troca de perfil entram na próxima etapa.
            </p>
          </>
        )}
      </div>
    </AppShell>
  );
}
