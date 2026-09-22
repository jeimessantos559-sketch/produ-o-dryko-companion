import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/dryko/app-shell";
import { EmDefinicao } from "@/components/dryko/em-definicao";

export const Route = createFileRoute("/_authenticated/passagem-turno")({
  component: PassagemTurno,
});

function PassagemTurno() {
  return (
    <AppShell>
      <EmDefinicao
        titulo="Passagem de turno"
        descricao="Resumo do turno anterior: produção, metas ativas, pendências, alertas, responsável e horário do encerramento. Entra na etapa de fechamento de turno."
      />
    </AppShell>
  );
}
