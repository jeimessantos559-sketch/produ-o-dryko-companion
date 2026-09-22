import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { DrykoLogo } from "@/components/dryko/logo";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Aponta Produção — DRYKO" },
      {
        name: "description",
        content:
          "Aplicativo de apontamento de produção da DRYKO: turnos, setores, metas de OP e relatórios.",
      },
      { property: "og:title", content: "Aponta Produção — DRYKO" },
      {
        property: "og:description",
        content:
          "Aplicativo de apontamento de produção da DRYKO: turnos, setores, metas de OP e relatórios.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  const [verificando, setVerificando] = useState(true);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        void navigate({ to: "/painel", replace: true });
      } else {
        setVerificando(false);
      }
    });
  }, [navigate]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-secondary px-6 text-center">
      <DrykoLogo size="lg" />
      <div>
        <h1 className="text-3xl font-bold">Aponta Produção</h1>
        <p className="mt-2 max-w-md text-muted-foreground">
          Registro de produção por setor e turno, com metas, pendências e relatórios.
        </p>
      </div>
      <Button
        className="h-14 px-10 text-base"
        disabled={verificando}
        onClick={() => navigate({ to: "/auth" })}
      >
        {verificando ? "Carregando..." : "Entrar"}
      </Button>
    </div>
  );
}
