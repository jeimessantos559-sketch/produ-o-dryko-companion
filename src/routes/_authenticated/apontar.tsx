import { createFileRoute, redirect } from "@tanstack/react-router";

// Rota mantida apenas para compatibilidade com links antigos.
// O apontamento é feito pelo formulário rápido do cabeçalho (botão "Apontar"),
// que cobre Corte, Fitas, Mantas, Líquidos e Asfox.
export const Route = createFileRoute("/_authenticated/apontar")({
  beforeLoad: () => {
    throw redirect({ to: "/painel", replace: true });
  },
});
