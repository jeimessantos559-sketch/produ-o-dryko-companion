import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/dryko/app-shell";
import { EmDefinicao } from "@/components/dryko/em-definicao";

export const Route = createFileRoute("/_authenticated/contagem")({
  component: Contagem,
});

function Contagem() {
  return (
    <AppShell>
      <EmDefinicao
        titulo="Contagem por produto"
        descricao="Totais por produto do setor e turno escolhidos. Depende dos apontamentos, que entram na próxima etapa."
      />
    </AppShell>
  );
}
