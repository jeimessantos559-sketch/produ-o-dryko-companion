import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  CalendarDays,
  Copy,
  FileText,
  Gauge,
  History,
  LogOut,
  Menu,
  Plus,
  Repeat,
  Settings2,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { ApontamentoRapido } from "@/components/dryko/apontamento-rapido";
import { DrykoLogo } from "@/components/dryko/logo";
import { SetorTurnoDialog } from "@/components/dryko/setor-turno-dialog";
import { ThemeToggle } from "@/components/dryko/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { NOMES_PAPEIS, useAuth } from "@/lib/auth";
import { dataSaoPaulo } from "@/lib/producao";

const ITENS = [
  { to: "/contagem", label: "Programação", icon: CalendarDays },
  { to: "/historico", label: "Histórico", icon: History },
  { to: "/passagem-turno", label: "Passagem", icon: Repeat },
  { to: "/relatorios", label: "Relatórios", icon: FileText },
  { to: "/reportar-problema", label: "Problema", icon: TriangleAlert },
] as const;

type AppShellProps = {
  children: ReactNode;
  title?: string | undefined;
  eyebrow?: string | undefined;
  notificationCount?: number | undefined;
  onNotifications?: (() => void) | undefined;
  onRepeat?: (() => void) | undefined;
  onApontar?: (() => void) | undefined;
};

type PendenciaRapida = {
  id: string;
  op: string | null;
  lote?: string | null;
  produto_nome: string;
  quantidade_plts: number | null;
  total_rolos: number | null;
  metragem: number | null;
  area_m2: number | null;
  data_local: string;
  turno: "T1" | "T2" | "T3";
};

function Navegacao({
  onNavigate,
  onSetorTurno,
}: {
  onNavigate?: () => void;
  onSetorTurno: () => void;
}) {
  const { isAdmin, isAutorizado, roles, profile, signOut } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();

  const itens = [
    ...ITENS,
    ...(!isAdmin && isAutorizado
      ? [{ to: "/controle-apontamentos", label: "Controle Protheus", icon: ShieldCheck } as const]
      : []),
    ...(isAdmin ? [{ to: "/administracao", label: "Administração", icon: ShieldCheck } as const] : []),
  ];

  async function sair() {
    await signOut();
    onNavigate?.();
    void navigate({ to: "/auth", replace: true });
  }

  function abrirSetorTurno() {
    onNavigate?.();
    onSetorTurno();
  }

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="border-b border-sidebar-border px-4 py-4">
        <DrykoLogo size="sm" />
        <div className="mt-2">
          <p data-heading className="font-bold text-white">Aponta Produção</p>
          <p className="text-xs text-sidebar-foreground/55">Sistema interno</p>
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
        <Link
          to="/painel"
          onClick={onNavigate}
          className={`flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors ${
            pathname.startsWith("/painel")
              ? "bg-sidebar-primary text-sidebar-primary-foreground"
              : "text-sidebar-foreground hover:bg-sidebar-accent"
          }`}
        >
          <Gauge className="size-4.5 shrink-0" />
          Painel
        </Link>

        <button
          type="button"
          onClick={abrirSetorTurno}
          className="flex min-h-10 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
        >
          <Settings2 className="size-4.5 shrink-0" />
          Setor e turno
        </button>

        {itens.map((item) => {
          const ativo = pathname.startsWith(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={`flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors ${
                ativo
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent"
              }`}
            >
              <item.icon className="size-4.5 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="space-y-2 border-t border-sidebar-border p-3 text-sm">
        <div>
          <p className="truncate font-semibold">{profile?.nome || "Usuário"}</p>
          <p className="truncate text-xs text-sidebar-foreground/65">
            {roles.map((r) => NOMES_PAPEIS[r]).join(", ") || "Sem perfil definido"}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
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
  onRepeat,
  onApontar,
}: AppShellProps) {
  const [aberto, setAberto] = useState(false);
  const [modalRapido, setModalRapido] = useState<"novo" | "repetir" | null>(null);
  const [setorTurnoAberto, setSetorTurnoAberto] = useState(false);
  const [notificacoesInternas, setNotificacoesInternas] = useState(false);
  const [carregandoNotificacoes, setCarregandoNotificacoes] = useState(false);
  const [pendenciasInternas, setPendenciasInternas] = useState<PendenciaRapida[]>([]);
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);
  const { profile, isAutorizado } = useAuth();
  const contexto = profile?.setor_atual
    ? `${nomeSetor(profile.setor_atual)} · ${nomeTurno(profile.turno_atual)}`
    : "Escolher setor e turno";
  const abrirNovo = onApontar ?? (() => setModalRapido("novo"));
  const abrirRepetir = onRepeat ?? (() => setModalRapido("repetir"));

  async function carregarNotificacoesInternas() {
    if (!profile?.setor_atual || !profile.turno_atual) {
      setPendenciasInternas([]);
      return;
    }
    setCarregandoNotificacoes(true);
    const hoje = dataSaoPaulo();
    const painelTurno = supabase.rpc as unknown as (
      nome: string,
      parametros: { p_setor: string; p_turno: string; p_data: string },
    ) => PromiseLike<{
      data: { pendencias?: PendenciaRapida[] } | null;
      error: { message: string } | null;
    }>;
    const { data, error } = await painelTurno("painel_turno", {
      p_setor: profile.setor_atual,
      p_turno: profile.turno_atual,
      p_data: hoje,
    });
    setCarregandoNotificacoes(false);
    if (error) {
      toast.error("Não foi possível carregar as pendências.");
      setPendenciasInternas([]);
      return;
    }
    const todas = (data?.pendencias ?? []) as PendenciaRapida[];
    setPendenciasInternas(
      todas.filter((item) => item.data_local !== hoje || item.turno !== profile.turno_atual),
    );
  }

  function abrirNotificacoes() {
    if (onNotifications) {
      onNotifications();
      return;
    }
    setNotificacoesInternas(true);
    void carregarNotificacoesInternas();
  }

  async function confirmarPendencia(id: string) {
    if (!isAutorizado || confirmandoId) return;
    setConfirmandoId(id);
    const { error } = await supabase.rpc("confirmar_apontamentos_protheus", { p_ids: [id] });
    setConfirmandoId(null);
    if (error) {
      toast.error(error.message || "Não foi possível confirmar este apontamento.");
      return;
    }
    toast.success("Apontamento lançado no Protheus.");
    await carregarNotificacoesInternas();
  }

  return (
    <>
      <div className="flex min-h-screen bg-background">
        <aside className="hidden w-[232px] shrink-0 md:block">
          <div className="fixed h-screen w-[232px]">
            <Navegacao onSetorTurno={() => setSetorTurnoAberto(true)} />
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
            <div className="mx-auto flex w-full max-w-[1480px] items-center gap-1.5 px-2.5 py-2 sm:gap-2 sm:px-5">
              <Sheet open={aberto} onOpenChange={setAberto}>
                <SheetTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-10 w-10 shrink-0 rounded-xl border-primary/70 bg-transparent text-primary shadow-none md:hidden"
                    aria-label="Abrir menu"
                  >
                    <Menu className="size-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-[min(84vw,276px)] p-0">
                  <SheetTitle className="sr-only">Menu</SheetTitle>
                  <Navegacao
                    onNavigate={() => setAberto(false)}
                    onSetorTurno={() => setSetorTurnoAberto(true)}
                  />
                </SheetContent>
              </Sheet>

              <button
                type="button"
                onClick={() => setSetorTurnoAberto(true)}
                className="min-w-0 flex-1 text-left"
                title="Alterar setor e turno"
              >
                <p className="truncate text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground sm:text-[11px]">
                  {eyebrow ?? contexto}
                </p>
                <h1 className="truncate text-lg font-extrabold leading-tight tracking-tight text-foreground sm:text-2xl">
                  {title ?? contexto}
                </h1>
              </button>

              <Button
                type="button"
                variant="outline"
                size="icon"
                className="relative h-10 w-10 shrink-0 rounded-xl border-primary/60 bg-transparent text-foreground shadow-none"
                onClick={abrirNotificacoes}
                aria-label="Ver pendências"
              >
                <Bell className="size-5" />
                {notificationCount > 0 && (
                  <span className="absolute -right-1 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                    {notificationCount > 99 ? "99+" : notificationCount}
                  </span>
                )}
              </Button>

              <ThemeToggle />

              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-10 w-10 shrink-0 rounded-xl border-primary/30 bg-transparent text-primary shadow-none"
                onClick={abrirRepetir}
                aria-label="Repetir último apontamento"
              >
                <Copy className="size-4.5" />
              </Button>

              <Button
                type="button"
                className="h-10 shrink-0 rounded-xl px-2.5 text-sm font-semibold shadow-sm min-[390px]:px-3.5"
                onClick={abrirNovo}
              >
                <Plus className="size-5" />
                <span className="hidden min-[390px]:inline">Apontar</span>
              </Button>
            </div>
          </header>
          <main className="mx-auto w-full max-w-[1480px] flex-1 px-2.5 pb-12 pt-3 sm:px-5 sm:pt-4">
            {children}
          </main>
        </div>
      </div>

      <SetorTurnoDialog open={setorTurnoAberto} onOpenChange={setSetorTurnoAberto} />

      {!onApontar && !onRepeat && (
        <ApontamentoRapido
          open={modalRapido !== null}
          onOpenChange={(open) => {
            if (!open) setModalRapido(null);
          }}
          repeatLatest={modalRapido === "repetir"}
        />
      )}

      {!onNotifications && (
        <Dialog open={notificacoesInternas} onOpenChange={setNotificacoesInternas}>
          <DialogContent className="max-h-[92dvh] overflow-y-auto rounded-2xl p-4 sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>Pendências de turnos anteriores</DialogTitle>
              <DialogDescription>Apontamentos ainda não lançados no Protheus.</DialogDescription>
            </DialogHeader>
            {carregandoNotificacoes ? (
              <div className="rounded-xl bg-muted p-4 text-center text-sm text-muted-foreground">
                Carregando pendências...
              </div>
            ) : pendenciasInternas.length === 0 ? (
              <div className="rounded-xl bg-muted p-4 text-center text-sm text-muted-foreground">
                Nenhuma pendência de turnos anteriores.
              </div>
            ) : (
              <>
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/40">
                  <p className="font-bold text-red-800 dark:text-red-200">
                    {pendenciasInternas.length} apontamento(s) pendente(s)
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {pendenciasInternas.reduce(
                      (total, item) => total + Number(item.quantidade_plts ?? 0),
                      0,
                    )}{" "}
                    PLTs fechados aguardando lançamento
                  </p>
                </div>
                <div className="space-y-2">
                  {pendenciasInternas.map((item) => (
                    <article key={item.id} className="rounded-xl border border-border bg-muted/40 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-bold text-foreground">
                            {item.op ? `OP ${item.op} · ` : ""}
                            {item.produto_nome}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatarData(item.data_local)} · {nomeTurno(item.turno)}
                          </p>
                        </div>
                        <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-700 dark:bg-amber-950 dark:text-amber-200">
                          Pendente
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">{resumoPendencia(item)}</p>
                      {isAutorizado && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="mt-2 w-full border-primary text-primary"
                          disabled={confirmandoId !== null}
                          onClick={() => void confirmarPendencia(item.id)}
                        >
                          {confirmandoId === item.id ? "Lançando..." : "Conferir e lançar"}
                        </Button>
                      )}
                    </article>
                  ))}
                </div>
              </>
            )}
            <DialogFooter className="grid grid-cols-2 gap-2 sm:flex">
              <Button variant="outline" onClick={() => setNotificacoesInternas(false)}>
                Fechar
              </Button>
              <Button asChild>
                <Link
                  to="/controle-apontamentos"
                  onClick={() => setNotificacoesInternas(false)}
                >
                  Controle Protheus
                </Link>
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

function resumoPendencia(item: PendenciaRapida) {
  if (Number(item.area_m2 ?? 0) > 0)
    return `${Number(item.area_m2).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m²`;
  if (Number(item.metragem ?? 0) > 0)
    return `${Number(item.metragem).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m · ${item.quantidade_plts ?? 0} PLTs · ${item.total_rolos ?? 0} rolos${item.lote ? ` · Lote ${item.lote}` : ""}`;
  return `${item.quantidade_plts ?? 0} PLTs fechados · ${item.total_rolos ?? 0} rolos`;
}

function formatarData(valor: string) {
  const [ano, mes, dia] = valor.split("-");
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : valor;
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
