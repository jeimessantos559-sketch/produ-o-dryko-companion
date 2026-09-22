import { createFileRoute, Link } from "@tanstack/react-router";

import { AppShell, nomeSetor } from "@/components/dryko/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/painel")({
  component: Painel,
});

function Painel() {
  const { profile, loading } = useAuth();

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-4">
        <div>
          <h1 className="text-2xl font-bold">Painel do turno</h1>
          <p className="text-sm text-muted-foreground">
            {loading
              ? "Carregando..."
              : profile?.setor_atual && profile.turno_atual
                ? `${nomeSetor(profile.setor_atual)} · Turno ${profile.turno_atual}`
                : "Escolha um setor e um turno para começar."}
          </p>
        </div>

        {!loading && (!profile?.setor_atual || !profile.turno_atual) && (
          <Card>
            <CardContent className="flex flex-col gap-3 pt-6">
              <p className="text-sm">Você ainda não escolheu setor e turno.</p>
              <Button asChild className="h-12 w-fit">
                <Link to="/selecionar">Escolher agora</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Apontamentos do turno</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>Nenhum apontamento registrado ainda.</p>
            <p>
              O registro de produção entra na próxima etapa, começando pelos setores com regras já
              confirmadas: Corte e Fitas.
            </p>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
