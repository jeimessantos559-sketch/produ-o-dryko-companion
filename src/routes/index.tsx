import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { LoaderCircle } from "lucide-react";
import { useEffect } from "react";

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

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        void navigate({ to: "/painel", replace: true });
      } else {
        void navigate({ to: "/auth", replace: true });
      }
    });
  }, [navigate]);

  return (
    <main className="grid min-h-svh place-items-center bg-[#1d1d21] text-white">
      <div className="flex items-center gap-3 text-sm text-slate-300">
        <LoaderCircle className="size-5 animate-spin text-primary" /> Carregando o sistema...
      </div>
    </main>
  );
}
