import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Boxes,
  CheckCircle2,
  Clock3,
  Gauge,
  LockKeyhole,
  PackageCheck,
  Search,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AppShell, nomeSetor, nomeTurno } from "@/components/dryko/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { dataSaoPaulo } from "@/lib/producao";

export const Route = createFileRoute("/_authenticated/painel")({ component: Painel });

type Resumo = {
  registros: number;
  pendentes: number;
  lancados: number;
  plts: number;
  rolos: number;
  metragem: number;
  area: number;
};

type RegistroRecente = {
  id: string;
  op: string | null;
  produto_nome: string;
  quantidade_plts: number | null;
  total_rolos: number | null;
  metragem: number | null;
  area_m2: number | null;
  status: "pendente" | "lancado";
  created_at: string;
};

function Painel() {
  const { profile, loading, isAutorizado } = useAuth();
  const [resumo, setResumo] = useState<Resumo>({
    registros: 0,
    pendentes: 0,
    lancados: 0,
    plts: 0,
    rolos: 0,
    metragem: 0,
    area: 0,
  });
  const [pendenciasAnteriores, setPendenciasAnteriores] = useState(0);
  const [recentes, setRecentes] = useState<RegistroRecente[]>([]);
  const [erro, setErro] = useState(false);
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState<"todos" | "pendente" | "lancado">("todos");

  useEffect(() => {
    let ativo = true;
    setErro(false);
    if (!profile?.setor_atual || !profile.turno_atual) {
      setRecentes([]);
      setResumo({
        registros: 0,
        pendentes: 0,
        lancados: 0,
        plts: 0,
        rolos: 0,
        metragem: 0,
        area: 0,
      });
      setPendenciasAnteriores(0);
      return () => {
        ativo = false;
      };
    }
    const hoje = dataSaoPaulo();
    void Promise.all([
      supabase
        .from("apontamentos")
        .select(
          "id, op, produto_nome, quantidade_plts, total_rolos, metragem, area_m2, status, created_at",
        )
        .eq("setor", profile.setor_atual)
        .eq("turno", profile.turno_atual)
        .eq("data_local", hoje)
        .order("created_at", { ascending: false }),
      supabase
        .from("apontamentos")
        .select("turno, data_local")
        .eq("setor", profile.setor_atual)
        .eq("status", "pendente")
        .limit(500),
    ]).then(([{ data, error }, { data: pendencias }]) => {
      if (!ativo) return;
      if (error) {
        setErro(true);
        setRecentes([]);
        setResumo({
          registros: 0,
          pendentes: 0,
          lancados: 0,
          plts: 0,
          rolos: 0,
          metragem: 0,
          area: 0,
        });
        return;
      }
      setPendenciasAnteriores(
        (pendencias ?? []).filter(
          (item) => item.data_local !== hoje || item.turno !== profile.turno_atual,
        ).length,
      );
      const itens = (data ?? []) as RegistroRecente[];
      setRecentes(itens.slice(0, 40));
      setResumo(
        itens.reduce(
          (acc, item) => ({
            registros: acc.registros + 1,
            pendentes: acc.pendentes + (item.status === "pendente" ? 1 : 0),
            lancados: acc.lancados + (item.status === "lancado" ? 1 : 0),
            plts: acc.plts + (item.quantidade_plts ?? 0),
            rolos: acc.rolos + (item.total_rolos ?? 0),
            metragem: acc.metragem + Number(item.metragem ?? 0),
            area: acc.area + Number(item.area_m2 ?? 0),
          }),
          { registros: 0, pendentes: 0, lancados: 0, plts: 0, rolos: 0, metragem: 0, area: 0 },
        ),
      );
    });
    return () => {
      ativo = false;
    };
  }, [profile?.setor_atual, profile?.turno_atual]);

  const setorFitas = profile?.setor_atual === "fitas";
  const setorMantas = profile?.setor_atual === "mantas";
  const setorCorte = profile?.setor_atual === "corte";
  const setorNome = profile?.setor_atual ? nomeSetor(profile.setor_atual) : "Setor";
  const turnoNome = nomeTurno(profile?.turno_atual);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    return recentes.filter((item) => {
      const combinaStatus = statusFiltro === "todos" || item.status === statusFiltro;
      const combinaBusca =
        !termo ||
        item.produto_nome.toLocaleLowerCase("pt-BR").includes(termo) ||
        (item.op ?? "").toLocaleLowerCase("pt-BR").includes(termo);
      return combinaStatus && combinaBusca;
    });
  }, [busca, recentes, statusFiltro]);

  return (
    <AppShell
      title="Painel do turno"
      eyebrow={`HOJE · ${setorNome.toUpperCase()} · ${turnoNome.toUpperCase()}`}
      notificationCount={pendenciasAnteriores}
    >
      <div className="mx-auto max-w-5xl space-y-5">
        {erro && (
          <div
            role="alert"
            className="rounded-2xl border border-red-300 bg-red-50 p-4 text-sm font-medium text-red-800"
          >
            Não foi possível carregar os apontamentos do turno.
          </div>
        )}

        {!loading && (!profile?.setor_atual || !profile.turno_atual) && (
          <Card className="rounded-3xl border-slate-200 shadow-sm">
            <CardContent className="flex flex-col gap-3 p-5">
              <p className="text-sm">Você ainda não escolheu setor e turno.</p>
              <Button asChild className="h-12 w-fit rounded-xl">
                <Link to="/selecionar">Escolher agora</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {pendenciasAnteriores > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
            <span>
              Há <strong>{pendenciasAnteriores}</strong> apontamento(s) pendente(s) de turnos anteriores.
            </span>
            {isAutorizado && (
              <Button asChild size="sm" variant="outline" className="rounded-xl bg-white">
                <Link to="/controle-apontamentos">Revisar pendências</Link>
              </Button>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <IndicadorOperacional
            icon={Clock3}
            label="Pendentes"
            valor={resumo.pendentes}
            detalhe="para lançar"
            tone="amber"
          />
          <IndicadorOperacional
            icon={PackageCheck}
            label="Lançados"
            valor={resumo.lancados}
            detalhe="no Protheus"
            tone="green"
          />
          <IndicadorOperacional
            icon={Boxes}
            label={setorFitas ? "Apontamentos" : "PLTs fechados"}
            valor={setorFitas ? resumo.registros : resumo.plts}
            detalhe="neste turno"
            tone="slate"
          />
          <IndicadorOperacional
            icon={Gauge}
            label={setorFitas ? "Produção" : setorCorte ? "Metragem produzida" : "Metragem produzida"}
            valor={
              setorFitas
                ? formatarNumero(resumo.area)
                : setorMantas || resumo.metragem > 0
                  ? formatarNumero(resumo.metragem)
                  : "0"
            }
            detalhe={setorFitas || setorCorte ? "m² apontados" : "m apontados"}
            tone="slate"
          />
        </div>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="space-y-1 px-4 pb-4 pt-5 sm:px-6 sm:pt-6">
            <h2 className="text-2xl font-extrabold tracking-tight text-slate-950">Apontamentos do turno</h2>
            <p className="text-sm leading-relaxed text-slate-500 sm:text-base">
              Um registro por apontamento, mesmo quando houver vários PLTs.
            </p>
          </div>

          <div className="grid gap-3 border-b border-slate-200 px-4 pb-5 sm:grid-cols-[1fr_180px] sm:px-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-slate-400" />
              <Input
                value={busca}
                onChange={(event) => setBusca(event.target.value)}
                placeholder="Buscar OP ou produto"
                className="h-12 rounded-xl border-slate-200 pl-10 text-base"
                aria-label="Buscar OP ou produto"
              />
            </div>
            <select
              value={statusFiltro}
              onChange={(event) =>
                setStatusFiltro(event.target.value as "todos" | "pendente" | "lancado")
              }
              className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-base text-slate-900 outline-none focus:ring-2 focus:ring-primary/40"
              aria-label="Filtrar situação"
            >
              <option value="todos">Todos</option>
              <option value="pendente">Pendentes</option>
              <option value="lancado">Lançados</option>
            </select>
          </div>

          <div className="p-4 sm:p-6">
            {filtrados.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-9 text-center text-sm leading-relaxed text-slate-500 sm:text-base">
                {recentes.length === 0
                  ? "Nenhum apontamento neste turno. Toque em “Apontar” para começar."
                  : "Nenhum apontamento corresponde à busca ou ao filtro selecionado."}
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filtrados.map((item) => (
                  <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-950">
                        {item.op ? `OP ${item.op} · ` : ""}
                        {item.produto_nome}
                      </p>
                      <p className="text-sm text-slate-500">
                        {resumoRegistro(item, setorFitas, setorMantas)}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        item.status === "lancado"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {item.status === "lancado" ? "Lançado" : "Pendente"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-emerald-200 bg-emerald-50/60 p-4 shadow-sm sm:p-5">
          <div className="flex items-center gap-3">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
              <CheckCircle2 className="size-6" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-bold text-slate-950">Turno aberto</h2>
              <p className="text-sm text-slate-500">
                {resumo.registros} apontamento(s) · {resumo.pendentes} pendente(s)
              </p>
            </div>
          </div>
          <Button
            asChild
            variant="secondary"
            className="mt-4 h-11 w-full rounded-xl bg-slate-200/90 text-base font-medium text-slate-800 hover:bg-slate-300"
          >
            <Link to="/passagem-turno">
              <LockKeyhole className="size-5" /> Encerrar turno
            </Link>
          </Button>
        </section>
      </div>
    </AppShell>
  );
}

function IndicadorOperacional({
  icon: Icon,
  label,
  valor,
  detalhe,
  tone,
}: {
  icon: typeof Clock3;
  label: string;
  valor: string | number;
  detalhe: string;
  tone: "amber" | "green" | "slate";
}) {
  const toneClasses =
    tone === "amber"
      ? "bg-amber-50 text-amber-700"
      : tone === "green"
        ? "bg-emerald-50 text-emerald-700"
        : "bg-slate-100 text-slate-600";

  return (
    <Card className="rounded-3xl border-slate-200 shadow-sm">
      <CardContent className="flex min-h-36 items-center gap-3 p-4 sm:min-h-40 sm:p-5">
        <div className={`flex size-12 shrink-0 items-center justify-center rounded-2xl ${toneClasses}`}>
          <Icon className="size-6" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-500 sm:text-base">{label}</p>
          <p className="text-3xl font-extrabold leading-none tracking-tight text-slate-950 sm:text-4xl">
            {valor}
          </p>
          <p className="mt-1 text-sm text-slate-400 sm:text-base">{detalhe}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function resumoRegistro(item: RegistroRecente, setorFitas: boolean, setorMantas: boolean) {
  if (setorFitas) return `${formatarNumero(Number(item.area_m2 ?? 0))} m²`;
  if (setorMantas) {
    return `${item.quantidade_plts ?? 0} PLTs · ${formatarNumero(Number(item.metragem ?? 0))} m · ${item.total_rolos ?? 0} rolos`;
  }
  const metragem = item.metragem == null ? "" : ` · ${formatarNumero(Number(item.metragem))} m²`;
  return `${item.quantidade_plts ?? 0} PLTs · ${item.total_rolos ?? 0} rolos${metragem}`;
}

function formatarNumero(valor: number) {
  return valor.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}
