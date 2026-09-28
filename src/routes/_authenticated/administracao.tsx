import { createFileRoute, Link } from "@tanstack/react-router";
import { FileText, PackagePlus, ShieldCheck, Users } from "lucide-react";

import { AppShell } from "@/components/dryko/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/administracao")({ component: Administracao });

const ITENS = [
  {
    to: "/controle-apontamentos",
    titulo: "Controle de apontamentos",
    descricao: "Conferir pendências, agrupar lotes e lançar no Protheus.",
    icon: ShieldCheck,
  },
  {
    to: "/produtos",
    titulo: "Produtos",
    descricao: "Cadastrar, editar, desativar e ajustar padrões de produção.",
    icon: PackagePlus,
  },
  {
    to: "/usuarios",
    titulo: "Usuários e permissões",
    descricao: "Criar acessos e definir quem pode lançar no Protheus.",
    icon: Users,
  },
  {
    to: "/relatorios",
    titulo: "Relatórios",
    descricao: "Consultar relatórios, PDFs e histórico de envios.",
    icon: FileText,
  },
] as const;

function Administracao() {
  const { isAdmin } = useAuth();

  return (
    <AppShell title="Administração" eyebrow="CONFIGURAÇÕES E CONTROLES">
      <div className="mx-auto max-w-4xl space-y-3">
        <div>
          <h2 className="text-xl font-extrabold sm:text-2xl">Central de administração</h2>
          <p className="text-xs text-muted-foreground sm:text-sm">Controles do sistema em um único lugar.</p>
        </div>

        {!isAdmin ? (
          <Card><CardContent className="p-4 text-sm text-muted-foreground">Esta área é exclusiva do administrador.</CardContent></Card>
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2">
            {ITENS.map((item) => (
              <Link key={item.to} to={item.to} className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-primary/40 hover:shadow-md">
                <div className="flex items-start gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><item.icon className="size-5" /></div>
                  <div><h3 className="font-bold text-slate-950 group-hover:text-primary">{item.titulo}</h3><p className="mt-1 text-xs leading-relaxed text-slate-500">{item.descricao}</p></div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
