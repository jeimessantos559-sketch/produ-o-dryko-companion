import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/dryko/app-shell";
import { EmDefinicao } from "@/components/dryko/em-definicao";

export const Route = createFileRoute("/_authenticated/historico")({
  component: Historico,
});

function Historico() {
  return (
    <AppShell>
      <EmDefinicao
        titulo="Histórico"
        descricao="Consulta de apontamentos anteriores, com registro completo de correções (antes, depois, usuário e data/hora). Entra junto com o apontamento."
      />
    </AppShell>
  );
}
