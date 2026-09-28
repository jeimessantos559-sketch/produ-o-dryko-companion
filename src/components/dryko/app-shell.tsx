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
  Settings2,
  ShieldCheck,
  TriangleAlert,
  Users,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { ApontamentoRapido } from "@/components/dryko/apontamento-rapido";
import { DrykoLogo } from "@/components/dryko/logo";
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
import { useAuth, NOMES_PAPEIS } from "@/lib/auth";
import { dataSaoPaulo } from "@/lib/producao";

const ITENS = [
  { to: "/painel", label: "Painel", icon: Gauge },
  { to: "/selecionar", label: "Setor e turno", icon: Settings2 },
  { to: "/metas", label: "Metas", icon: BarChart3 },
  { to: "/contagem", label: "Contagem", icon: ClipboardList },
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
  produto_nome: string;
  quantidade_plts: number | null;
  total_rolos: number | null;
  metragem: number | null;
  area_m2: number | null;
  data_local: string;
  turno: "T1" | "T2" | "T3";
};

function Navegacao({ onNavigate }: { onNavigate?: () => void }) {
  const { isAdmin, isAutorizado, roles, profile, signOut } = useAuth();
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
    ...(isAdmin ? [{ to: "/produtos", label: "Produtos", icon: PackagePlus } as const] : []),
    ...(isAdmin ? [{ to: "/usuarios", label: "Usuários", icon: Users } as const] : []),
  ];

  async function sair() {
    await signOut();
    onNavigate?.();
    void navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="border-b border-sidebar-border px-4 py-5">
        <DrykoLogo size="sm" />
        <div className="mt-3">
          <p data-heading className="font-bold text-white">
            Aponta Produção
          </p>
          <p className="mt-0.5 text-xs text-sidebar-foreground/55">Sistema interno</p>
        </div>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-4">
        {itens.map((item) => {
          const ativo = pathname.startsWith(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={`flex min-h-12 items-center gap-3 rounded-xl px-3 text-base font-medium transition-colors ${ativo ? "bg-sidebar-primary text-sidebar-primary-foreground" : "text-sidebar-foreground hover:bg-sidebar-accent"}`}
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
  onRepeat,
  onApontar,
}: AppShellProps) {
  const [aberto, setAberto] = useState(false);
  const [modalRapido, setModalRapido] = useState<"novo" | "repetir" | null>(null);
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
      toast.error("Não foi possível confirmar este apontamento.");
      return;
    }
    toast.success("Apontamento confirmado no Protheus.");
    await carregarNotificacoesInternas();
  }

  return (
    <>
      <div className="flex min-h-screen bg-background">
        <aside className="hidden w-[248px] shrink-0 md:block">
          <div className="fixed h-screen w-[248px]">
            <Navegacao />
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-background/95 backdrop-blur">
            <div className="mx-auto flex w-full max-w-[1480px] items-center gap-2 px-3 py-3 sm:gap-3 sm:px-6">
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
                <SheetContent side="left" className="w-[min(86vw,288px)] p-0">
                  <SheetTitle className="sr-only">Menu</SheetTitle>
                  <Navegacao onNavigate={() => setAberto(false)} />
                </SheetContent>
              </Sheet>

              <Link to="/selecionar" className="min-w-0 flex-1 py-1" title="Alterar setor e turno">
                <p className="truncate text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500 sm:text-xs">
                  {eyebrow ?? contexto}
                </p>
                <h1 className="truncate text-xl font-extrabold leading-tight tracking-tight text-slate-950 min-[390px]:text-2xl sm:text-3xl">
                  {title ?? contexto}
                </h1>
              </Link>

              <Button
                type="button"
                variant="outline"
                size="icon"
                className="relative h-12 w-12 shrink-0 rounded-2xl border-primary/70 bg-transparent text-slate-700 shadow-none"
                onClick={abrirNotificacoes}
                aria-label="Ver pendências de turnos anteriores"
              >
                <Bell className="size-6" />
                {notificationCount > 0 && (
                  <span className="absolute -right-1 -top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1 text-xs font-bold text-primary-foreground">
                    {notificationCount > 99 ? "99+" : notificationCount}
                  </span>
                )}
              </Button>

              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-12 w-12 shrink-0 rounded-2xl border-primary/35 bg-transparent text-primary shadow-none"
                onClick={abrirRepetir}
                aria-label="Repetir último apontamento"
                title="Repetir último apontamento"
              >
                <Copy className="size-5" />
              </Button>

              <Button
                type="button"
                className="h-12 shrink-0 rounded-2xl px-3 text-base font-semibold shadow-sm min-[390px]:px-4 sm:px-5"
                onClick={abrirNovo}
              >
                <Plus className="size-6" />
                <span className="hidden min-[360px]:inline">Apontar</span>
              </Button>
            </div>
          </header>
          <main className="mx-auto w-full max-w-[1480px] flex-1 px-3 pb-16 pt-4 sm:px-6 sm:pt-6">
            {children}
          </main>
        </div>
      </div>

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
          <DialogContent className="max-h-[88vh] overflow-y-auto rounded-3xl sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>Pendências de turnos anteriores</DialogTitle>
              <DialogDescription>
                Apontamentos que ainda precisam ser conferidos e lançados no Protheus.
              </DialogDescription>
            </DialogHeader>
            {carregandoNotificacoes ? (
              <div className="rounded-2xl bg-slate-50 p-5 text-center text-sm text-slate-500">
                Carregando pendências...
              </div>
            ) : pendenciasInternas.length === 0 ? (
              <div className="rounded-2xl bg-slate-50 p-5 text-center text-sm text-slate-500">
                Nenhuma pendência de turnos anteriores.
              </div>
            ) : (
              <>
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
                  <p className="text-lg font-bold text-red-800">
                    {pendenciasInternas.length} apontamento(s) pendente(s)
                  </p>
                  <p className="text-sm text-slate-500">
                    {pendenciasInternas.reduce(
                      (total, item) => total + (item.quantidade_plts ?? 0),
                      0,
                    )}{" "}
                    PLTs aguardando lançamento
                  </p>
                </div>
                <div className="space-y-3">
                  {pendenciasInternas.map((item) => (
                    <article
                      key={item.id}
                      className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-bold text-slate-950">
                            {item.op ? `OP ${item.op} · ` : ""}
                            {item.produto_nome}
                          </p>
                          <p className="mt-1 text-sm text-slate-500">
                            {formatarData(item.data_local)} · {nomeTurno(item.turno)}
                          </p>
                        </div>
                        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                          Pendente
                        </span>
                      </div>
                      <p className="mt-3 text-sm text-slate-600">{resumoPendencia(item)}</p>
                      {isAutorizado && (
                        <Button
                          type="button"
                          variant="outline"
                          className="mt-3 w-full rounded-xl border-primary text-primary"
                          disabled={confirmandoId !== null}
                          onClick={() => void confirmarPendencia(item.id)}
                        >
                          {confirmandoId === item.id ? "Confirmando..." : "Conferir e confirmar"}
                        </Button>
                      )}
                    </article>
                  ))}
                </div>
              </>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setNotificacoesInternas(false)}>
                Fechar
              </Button>
              <Button asChild>
                <Link to="/passagem-turno" onClick={() => setNotificacoesInternas(false)}>
                  Ver passagem de turno
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
  if (Number(item.metragem ?? 0) > 0 && !item.total_rolos)
    return `${Number(item.metragem).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m`;
  const metros =
    item.metragem == null
      ? ""
      : ` · ${Number(item.metragem).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m²`;
  return `${item.quantidade_plts ?? 0} PLTs · ${item.total_rolos ?? 0} rolos${metros}`;
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
