import { createFileRoute, redirect } from "@tanstack/react-router";

// Compatibilidade com links antigos: a tela oficial agora é Programação.
export const Route = createFileRoute("/_authenticated/contagem")({
  beforeLoad: () => {
    throw redirect({ to: "/programacao", replace: true });
  },
});
