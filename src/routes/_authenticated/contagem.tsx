import { createFileRoute, redirect } from "@tanstack/react-router";

// Rota mantida apenas para compatibilidade com links antigos.
export const Route = createFileRoute("/_authenticated/contagem")({
  beforeLoad: () => {
    throw redirect({ to: "/programacao", replace: true });
  },
});
