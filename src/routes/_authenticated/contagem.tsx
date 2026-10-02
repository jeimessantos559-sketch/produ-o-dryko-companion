import { createFileRoute, redirect } from "@tanstack/react-router";

// Rota de compatibilidade: links/favoritos antigos vão direto para a Programação.
export const Route = createFileRoute("/_authenticated/contagem")({
  beforeLoad: () => {
    throw redirect({ to: "/programacao", replace: true });
  },
});
