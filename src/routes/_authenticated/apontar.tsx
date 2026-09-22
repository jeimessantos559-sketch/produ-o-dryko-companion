import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/dryko/app-shell";
import { EmDefinicao } from "@/components/dryko/em-definicao";

export const Route = createFileRoute("/_authenticated/apontar")({
  component: Apontar,
});

function Apontar() {
  return (
    <AppShell>
      <EmDefinicao
        titulo="Apontar produção"
        descricao="Esta tela entra na próxima etapa. Cada setor terá o seu próprio formulário, sem reaproveitar regras entre setores."
        itens={[
          "Corte e Fitas: regras e cálculos já confirmados por você.",
          "Mantas, Asfox, Misturadores, Líquidos, Pós e Avulsos: regras aguardando definição.",
        ]}
      />
    </AppShell>
  );
}
