import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  Bell,
  ClipboardList,
  Copy,
  FileText,
  Gauge,
  History,
  LogOut,
  Menu,
  PackagePlus,
  Plus,
  Repeat,
  ShieldCheck,
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

type AppShellProps = {
  children: ReactNode;
  title?: string;
  eyebrow?: string;
  notificationCount?: number;
  onNotifications?: () => void;
  onApontar?: () => void;
};

function Navegacao({ onNavigate }: { onNavigate?: () => void }) {
  const { isAdmin, isAutorizado, canManageProducts, roles, profile, signOut } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();

  const itens = [
    ...ITENS,
    ...(isAutorizado
      ? [
          {
            to: "/controle-apontamentos",
            label: "Controle de apontamentos",
            icon: ShieldCheck,
          } as const,
        ]
      : []),
    ...(canManageProducts
      ? [{ to: "/produtos", label: "Produtos", icon: PackagePlus } as const]
      : []),
    ...(isAdmin ? [{ to: "/usuarios", label: "Usuários", icon: Users } as const] : []),
  ];

  async function sair() {
    await signOut();
    onNavigate?.();
    void navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="border-b border-sidebar-border p-4">
        <DrykoLogo />
        <p className="mt-2 text-sm text-sidebar-foreground/70">Aponta Produção</p>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-4">
        {itens.map((item) => {
          const ativo = pathname.startsWith(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={`flex min-h-12 items-center gap-3 rounded-xl px-3 text-base font-medium transition-colors ${
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

      <div className="space-y-3 border-t border-sidebar-border p-4 text-sm">
        <div>
          <p className="font-semibold">{profile?.nome || "Usuário"}</p>
          <p className="text-sidebar-foreground/70">
            {roles.map((r) => NOMES_PAPEIS[r]).join(", ") || "Sem perfil definido"}
          </p>
        </div>
        <Button
          variant="ghost"
          className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          onClick={sair}
        >
          <LogOut className="size-4" /> Sair
        </Button>
      </div>
    </div>
  );
}

export function AppShell({
  children,
  title,
  eyebrow,
  notificationCount = 0,
  onNotifications,
  onApontar,
}: AppShellProps) {
  const [aberto, setAberto] = useState(false);
  const { profile, isAutorizado } = useAuth();
  const contexto = profile?.setor_atual
    ? `${nomeSetor(profile.setor_atual)} · ${nomeTurno(profile.turno_atual)}`
    : "Escolher setor e turno";
  const destinoNotificacoes = isAutorizado ? "/controle-apontamentos" : "/passagem-turno";

  return (
    <div className="flex min-h-screen bg-[#eef3f7]">
      <aside className="hidden w-72 shrink-0 md:block">
        <div className="fixed h-screen w-72">
          <Navegacao />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-[#eef3f7]/95 backdrop-blur">
          <div className="mx-auto flex w-full max-w-7xl items-center gap-2 px-3 py-3 sm:gap-3 sm:px-5">
            <Sheet open={aberto} onOpenChange={setAberto}>
              <SheetTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-12 w-12 shrink-0 rounded-2xl border-primary/70 bg-transparent text-primary shadow-none md:hidden"
                  aria-label="Abrir menu"
                >
                  <Menu className="size-6" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0">
                <SheetTitle className="sr-only">Menu</SheetTitle>
                <Navegacao onNavigate={() => setAberto(false)} />
              </SheetContent>
            </Sheet>

            <Link to="/selecionar" className="min-w-0 flex-1 py-1">
              <p className="truncate text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500 sm:text-xs">
                {eyebrow ?? contexto}
              </p>
              <h1 className="truncate text-2xl font-extrabold leading-tight tracking-tight text-slate-950 sm:text-3xl">
                {title ?? contexto}
              </h1>
            </Link>

            {onNotifications ? (
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="relative h-12 w-12 shrink-0 rounded-2xl border-primary/70 bg-transparent text-slate-700 shadow-none"
                onClick={onNotifications}
                aria-label="Ver pendências"
              >
                <Bell className="size-6" />
                {notificationCount > 0 && (
                  <span className="absolute -right-1 -top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1 text-xs font-bold text-primary-foreground">
                    {notificationCount > 99 ? "99+" : notificationCount}
                  </span>
                )}
              </Button>
            ) : (
              <Button
                asChild
                variant="outline"
                size="icon"
                className="relative h-12 w-12 shrink-0 rounded-2xl border-primary/70 bg-transparent text-slate-700 shadow-none"
              >
                <Link to={destinoNotificacoes} aria-label="Ver pendências">
                  <Bell className="size-6" />
                  {notificationCount > 0 && (
                    <span className="absolute -right-1 -top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1 text-xs font-bold text-primary-foreground">
                      {notificationCount > 99 ? "99+" : notificationCount}
                    </span>
                  )}
                </Link>
              </Button>
            )}

            <Button
              asChild
              variant="outline"
              size="icon"
              className="h-12 w-12 shrink-0 rounded-2xl border-primary/35 bg-transparent text-primary shadow-none"
            >
              <Link to="/historico" aria-label="Abrir histórico">
                <Copy className="size-5" />
              </Link>
            </Button>

            {onApontar ? (
              <Button
                type="button"
                className="h-12 shrink-0 rounded-2xl px-4 text-base font-semibold shadow-sm sm:px-5"
                onClick={onApontar}
              >
                <Plus className="size-6" />
                <span className="hidden min-[360px]:inline">Apontar</span>
              </Button>
            ) : (
              <Button asChild className="h-12 shrink-0 rounded-2xl px-4 text-base font-semibold shadow-sm sm:px-5">
                <Link to="/apontar">
                  <Plus className="size-6" />
                  <span className="hidden min-[360px]:inline">Apontar</span>
                </Link>
              </Button>
            )}
          </div>
        </header>

        <main className="flex-1 px-3 pb-16 pt-4 sm:px-5 sm:pt-5">{children}</main>
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

export function nomeTurno(codigo?: string | null) {
  if (codigo === "T1") return "1º turno";
  if (codigo === "T2") return "2º turno";
  if (codigo === "T3") return "3º turno";
  return codigo ?? "Escolher turno";
}
