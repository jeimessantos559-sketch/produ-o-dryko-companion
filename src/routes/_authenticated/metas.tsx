import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/dryko/app-shell";
import { EmDefinicao } from "@/components/dryko/em-definicao";

export const Route = createFileRoute("/_authenticated/metas")({
  component: Metas,
});

function Metas() {
  return (
    <AppShell>
      <EmDefinicao
        titulo="Metas das OPs"
        descricao="Entra na etapa de apontamento: meta opcional por OP e produto, com programado, apontado, restante, percentual e situação, visível nos três turnos até a OP ser finalizada."
      />
    </AppShell>
  );
}
