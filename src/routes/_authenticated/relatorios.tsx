import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/dryko/app-shell";
import { EmDefinicao } from "@/components/dryko/em-definicao";

export const Route = createFileRoute("/_authenticated/relatorios")({
  component: Relatorios,
});

function Relatorios() {
  return (
    <AppShell>
      <EmDefinicao
        titulo="Relatórios"
        descricao="Geração do relatório em PDF do turno e envio por e-mail, com status de sucesso ou erro e proteção contra envio repetido."
        itens={["Destinatários de teste: aguardando definição.", "Nenhum e-mail real será enviado antes disso."]}
      />
    </AppShell>
  );
}
