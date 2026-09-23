import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  ClipboardList,
  FileText,
  Gauge,
  History,
  LogOut,
  Menu,
  PlusCircle,
  Repeat,
  TriangleAlert,
  Users,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { DrykoLogo } from "@/components/dryko/logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useAuth, NOMES_PAPEIS } from "@/lib/auth";

const ITENS = [
  { to: "/painel", label: "Painel do turno", icon: Gauge },
  { to: "/metas", label: "Metas das OPs", icon: BarChart3 },
  { to: "/contagem", label: "Contagem por produto", icon: ClipboardList },
  { to: "/historico", label: "Histórico", icon: History },
  { to: "/passagem-turno", label: "Passagem de turno", icon: Repeat },
  { to: "/relatorios", label: "Relatórios", icon: FileText },
  { to: "/reportar-problema", label: "Reportar problema", icon: TriangleAlert },
] as const;

function Navegacao({ onNavigate }: { onNavigate?: () => void }) {
  const { isAdmin, roles, profile } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const itens = isAdmin
    ? [...ITENS, { to: "/usuarios", label: "Usuários", icon: Users } as const]
    : ITENS;

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="p-4">
        <DrykoLogo />
        <p className="mt-2 text-sm text-sidebar-foreground/70">Aponta Produção</p>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-2 pb-4">
        {itens.map((item) => {
          const ativo = pathname.startsWith(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={`flex min-h-12 items-center gap-3 rounded-lg px-3 text-base font-medium transition-colors ${
                ativo
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent"
              }`}
            >
              <item.icon className="size-5 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border p-4 text-sm">
        <p className="font-semibold">{profile?.nome || "Usuário"}</p>
        <p className="text-sidebar-foreground/70">
          {roles.map((r) => NOMES_PAPEIS[r]).join(", ") || "Sem perfil definido"}
        </p>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [aberto, setAberto] = useState(false);
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

  async function sair() {
    await signOut();
    void navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-72 shrink-0 md:block">
        <div className="fixed h-screen w-72">
          <Navegacao />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-2 border-b bg-card px-3 py-2">
          <Sheet open={aberto} onOpenChange={setAberto}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Abrir menu">
                <Menu className="size-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetTitle className="sr-only">Menu</SheetTitle>
              <Navegacao onNavigate={() => setAberto(false)} />
            </SheetContent>
          </Sheet>

          <div className="min-w-0 flex-1">
            <Link to="/selecionar" className="block truncate text-sm font-semibold">
              {profile?.setor_atual ? nomeSetor(profile.setor_atual) : "Escolher setor"}
              {" · "}
              {profile?.turno_atual ?? "Escolher turno"}
            </Link>
            <p className="text-xs text-muted-foreground">Toque para trocar setor ou turno</p>
          </div>

          <Button asChild size="lg" className="h-11">
            <a href="/apontar">
              <PlusCircle className="size-5" /> Apontar
            </a>
          </Button>
          <Button variant="ghost" size="icon" aria-label="Sair" onClick={sair}>
            <LogOut className="size-5" />
          </Button>
        </header>

        <main className="flex-1 p-4 pb-16">{children}</main>
      </div>
    </div>
  );
}

export function nomeSetor(codigo: string) {
  const mapa: Record<string, string> = {
    corte: "Corte",
    fitas: "Fitas",
    mantas: "Mantas",
    asfox: "Asfox",
    misturadores: "Misturadores",
    liquidos: "Líquidos",
    pos: "Pós",
    avulsos: "Avulsos",
  };
  return mapa[codigo] ?? codigo;
}
