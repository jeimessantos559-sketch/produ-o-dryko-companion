import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  BarChart3,
  ClipboardCheck,
  PackagePlus,
  RefreshCcw,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";

import { AppShell } from "@/components/dryko/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/administracao")({ component: Administracao });

type ResumoAdmin = {
  usuarios: number;
  problemas: number;
  apontamentos24h: number;
  fechados: number;
  pendenciasCorte: number;
  pendenciasFitas: number;
  pendenciasMantas: number;
};

const VAZIO: ResumoAdmin = {
  usuarios: 0,
  problemas: 0,
  apontamentos24h: 0,
  fechados: 0,
  pendenciasCorte: 0,
  pendenciasFitas: 0,
  pendenciasMantas: 0,
};

function Administracao() {
  const { isAdmin } = useAuth();
  const [resumo, setResumo] = useState(VAZIO);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    if (!isAdmin) {
      setCarregando(false);
      return;
    }
    const desde = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    void Promise.all([
      supabase.from("profiles").select("id", { count: "exact", head: true }).eq("ativo", true),
      supabase
        .from("problemas")
        .select("id", { count: "exact", head: true })
        .eq("resolvido", false),
      supabase
        .from("apontamentos")
        .select("id", { count: "exact", head: true })
        .gte("created_at", desde),
      supabase
        .from("fechamentos_turno")
        .select("id", { count: "exact", head: true })
        .eq("status", "fechado"),
      supabase
        .from("apontamentos")
        .select("id", { count: "exact", head: true })
        .eq("setor", "corte")
        .eq("status", "pendente"),
      supabase
        .from("apontamentos")
        .select("id", { count: "exact", head: true })
        .eq("setor", "fitas")
        .eq("status", "pendente"),
      supabase
        .from("apontamentos")
        .select("id", { count: "exact", head: true })
        .eq("setor", "mantas")
        .eq("status", "pendente"),
    ]).then(([usuarios, problemas, apontamentos, fechados, corte, fitas, mantas]) => {
      setResumo({
        usuarios: usuarios.count ?? 0,
        problemas: problemas.count ?? 0,
        apontamentos24h: apontamentos.count ?? 0,
        fechados: fechados.count ?? 0,
        pendenciasCorte: corte.count ?? 0,
        pendenciasFitas: fitas.count ?? 0,
        pendenciasMantas: mantas.count ?? 0,
      });
      setCarregando(false);
    });
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <AppShell title="Administração" eyebrow="ACESSO RESTRITO">
        <Card className="mx-auto max-w-xl">
          <CardContent className="p-4 text-sm text-muted-foreground">
            Esta área é exclusiva do administrador.
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell title="Administração" eyebrow="APONTAMENTO DE PRODUÇÃO">
      <div className="mx-auto max-w-4xl space-y-3">
        <div className="grid grid-cols-2 gap-2 rounded-2xl border bg-card p-1.5 shadow-sm">
          <div className="flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-3 text-sm font-bold text-white">
            <ShieldCheck className="size-4" /> Visão geral
          </div>
          <Link
            to="/controle-apontamentos"
            className="flex h-11 items-center justify-center gap-2 rounded-xl px-3 text-center text-sm font-semibold text-foreground hover:bg-muted"
          >
            <ClipboardCheck className="size-4" /> Controle de Apontamentos
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <Indicador
            icon={Users}
            label="Usuários ativos"
            valor={carregando ? "…" : resumo.usuarios}
          />
          <Indicador
            icon={AlertTriangle}
            label="Problemas abertos"
            valor={carregando ? "…" : resumo.problemas}
          />
          <Indicador
            icon={RefreshCcw}
            label="Apontamentos 24h"
            valor={carregando ? "…" : resumo.apontamentos24h}
          />
          <Indicador
            icon={ClipboardCheck}
            label="Turnos fechados"
            valor={carregando ? "…" : resumo.fechados}
          />
        </div>

        <section className="rounded-2xl border bg-card p-4 shadow-sm">
          <h2 className="text-lg font-extrabold">Situação operacional</h2>
          <div className="mt-3 space-y-2">
            <Linha label="Pendências do Corte" valor={resumo.pendenciasCorte} />
            <Linha label="Pendências de Fitas" valor={resumo.pendenciasFitas} />
            <Linha label="Pendências de Mantas" valor={resumo.pendenciasMantas} />
          </div>
        </section>

        <div className="grid gap-2 sm:grid-cols-3">
          <Link
            to="/indicadores"
            className="rounded-2xl border bg-card p-3.5 shadow-sm hover:border-primary/40"
          >
            <div className="flex items-center gap-3">
              <BarChart3 className="size-5 text-primary" />
              <div>
                <p className="font-bold">Indicadores gerenciais</p>
                <p className="text-xs text-muted-foreground">
                  Metas, paradas e Protheus por setor.
                </p>
              </div>
            </div>
          </Link>
          <Link
            to="/usuarios"
            className="rounded-2xl border bg-card p-3.5 shadow-sm hover:border-primary/40"
          >
            <div className="flex items-center gap-3">
              <Users className="size-5 text-primary" />
              <div>
                <p className="font-bold">Usuários e permissões</p>
                <p className="text-xs text-muted-foreground">
                  Definir quem pode lançar no Protheus.
                </p>
              </div>
            </div>
          </Link>
          <Link
            to="/produtos"
            className="rounded-2xl border bg-card p-3.5 shadow-sm hover:border-primary/40"
          >
            <div className="flex items-center gap-3">
              <PackagePlus className="size-5 text-primary" />
              <div>
                <p className="font-bold">Produtos</p>
                <p className="text-xs text-muted-foreground">Editar padrões, larguras e status.</p>
              </div>
            </div>
          </Link>
        </div>
      </div>
    </AppShell>
  );
}

function Indicador({
  icon: Icon,
  label,
  valor,
}: {
  icon: typeof Users;
  label: string;
  valor: number | string;
}) {
  return (
    <Card className="rounded-2xl border-border shadow-sm">
      <CardContent className="flex min-h-28 items-center gap-3 p-3.5">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-5" />
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="text-2xl font-extrabold text-foreground">{valor}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function Linha({ label, valor }: { label: string; valor: number }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-muted px-3 py-3 text-sm">
      <span>{label}</span>
      <strong className="text-lg">{valor}</strong>
    </div>
  );
}
