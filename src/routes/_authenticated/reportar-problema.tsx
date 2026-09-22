import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/dryko/app-shell";
import { EmDefinicao } from "@/components/dryko/em-definicao";

export const Route = createFileRoute("/_authenticated/reportar-problema")({
  component: ReportarProblema,
});

function ReportarProblema() {
  return (
    <AppShell>
      <EmDefinicao
        titulo="Reportar problema"
        descricao="Descrição, tela afetada e foto com prévia, registrando usuário, data e hora para o administrador."
        itens={["Quem pode excluir um problema reportado: aguardando definição."]}
      />
    </AppShell>
  );
}
