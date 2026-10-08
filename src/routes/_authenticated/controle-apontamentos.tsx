import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, SlidersHorizontal } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell, nomeSetor } from "@/components/dryko/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { chaveAgrupamentoProtheus } from "@/lib/agrupamento-protheus";
import { useAuth, type SetorCodigo } from "@/lib/auth";
import { dataHoraProducaoFormatada, dataOperacional } from "@/lib/producao";
import { setorComConsumoSemi } from "@/lib/liquidos";

export const Route = createFileRoute("/_authenticated/controle-apontamentos")({
  component: ControleApontamentos,
});

type ApontamentoBase = Database["public"]["Tables"]["apontamentos"]["Row"];
type Apontamento = ApontamentoBase & {
  apontado_por_nome?: string | null;
  lancado_por_nome?: string | null;
};

type Responsavel = {
  id: string;
  nome: string | null;
  em?: string | null;
};

const SETORES: SetorCodigo[] = ["corte", "fitas", "mantas", "asfox", "liquidos"];

type GrupoLancamento = {
  chave: string;
  ids: string[];
  item: Apontamento;
  quantidadeRegistros: number;
  plts: number;
  rolos: number;
  metragem: number;
  area: number;
  unidades: number;
  semiKg: number;
  apontadores: Responsavel[];
  lancadores: Responsavel[];
};

function ControleApontamentos() {
  const { profile, isAutorizado, isAdmin } = useAuth();
  const [setor, setSetor] = useState<SetorCodigo>(profile?.setor_atual ?? "corte");
  const [data, setData] = useState(() => dataOperacional(profile?.turno_atual));
  const [turno, setTurno] = useState("");
  const [status, setStatus] = useState("pendente");
  const [op, setOp] = useState("");
  const [produto, setProduto] = useState("");
  const [facilitador, setFacilitador] = useState("");
  const [itens, setItens] = useState<Apontamento[]>([]);
  const [nomes, setNomes] = useState<Record<string, string>>({});
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [confirmando, setConfirmando] = useState(false);

  useEffect(() => {
    if (profile?.setor_atual && !isAdmin) setSetor(profile.setor_atual);
  }, [isAdmin, profile?.setor_atual]);

  useEffect(() => {
    if (profile?.turno_atual) setData(dataOperacional(profile.turno_atual));
  }, [profile?.turno_atual]);

  const carregar = useCallback(async () => {
    if (!isAutorizado) {
      setCarregando(false);
      return;
    }
    setCarregando(true);
    const [{ data: registros, error }, { data: perfis }] = await Promise.all([
      supabase
        .from("apontamentos")
        .select("*")
        .eq("setor", setor)
        .eq("data_local", data)
        .order("data_hora_producao", { ascending: false })
        .limit(250),
      supabase.from("profiles").select("id, nome").eq("ativo", true),
    ]);
    if (error) {
      toast.error("Não foi possível carregar os apontamentos.");
      setItens([]);
    } else {
      setItens((registros ?? []) as Apontamento[]);
    }
    setNomes(Object.fromEntries((perfis ?? []).map((item) => [item.id, item.nome || "Sem nome"])));
    setSelecionados([]);
    setCarregando(false);
  }, [data, isAutorizado, setor]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const produtos = useMemo(
    () => [...new Set(itens.map((item) => item.produto_nome))].sort(),
    [itens],
  );
  const facilitadores = useMemo(() => [...new Set(itens.map((item) => item.usuario_id))], [itens]);

  const visiveis = useMemo(
    () =>
      itens.filter(
        (item) =>
          (!turno || item.turno === turno) &&
          (!status || item.status === status) &&
          (!op.trim() ||
            item.op?.toLowerCase().includes(op.trim().toLowerCase()) ||
            item.lote?.toLowerCase().includes(op.trim().toLowerCase())) &&
          (!produto || item.produto_nome === produto) &&
          (!facilitador || item.usuario_id === facilitador),
      ),
    [facilitador, itens, op, produto, status, turno],
  );

  const grupos = useMemo(() => agruparParaLancamento(visiveis, setor), [visiveis, setor]);
  const pendentesVisiveis = useMemo(
    () => grupos.flatMap((grupo) => (grupo.item.status === "pendente" ? grupo.ids : [])),
    [grupos],
  );

  async function confirmar(idsForcados?: string[]) {
    const ids = [...new Set(idsForcados ?? selecionados)];
    if (ids.length === 0 || confirmando) return;
    setConfirmando(true);
    const { data: total, error } = await supabase.rpc("confirmar_apontamentos_protheus", {
      p_ids: ids,
    });
    setConfirmando(false);
    if (error) {
      toast.error(error.message || "Não foi possível confirmar os apontamentos no Protheus.");
      return;
    }
    toast.success(`${total ?? ids.length} apontamento(s) marcado(s) como lançado(s).`);
    await carregar();
  }

  function alternarGrupo(grupo: GrupoLancamento) {
    if (grupo.item.status === "lancado") return;
    setSelecionados((atuais) => {
      const todos = grupo.ids.every((id) => atuais.includes(id));
      if (todos) return atuais.filter((id) => !grupo.ids.includes(id));
      return [...new Set([...atuais, ...grupo.ids])];
    });
  }

  return (
    <AppShell
      title="Controle Protheus"
      eyebrow={isAdmin ? "ADMINISTRAÇÃO · APONTAMENTOS" : "LANÇAMENTOS"}
    >
      <div className="mx-auto max-w-5xl space-y-3">
        <div>
          <h2 className="text-xl font-extrabold sm:text-2xl">Lançamentos no Protheus</h2>
          <p className="text-xs text-muted-foreground sm:text-sm">
            Mantas agrupadas por lote; Corte e Fitas agrupados por OP e produto.
          </p>
        </div>

        {!isAutorizado ? (
          <Card>
            <CardContent className="p-4 text-sm text-muted-foreground">
              Você não tem permissão para lançar apontamentos no Protheus.
            </CardContent>
          </Card>
        ) : (
          <>
            <details className="rounded-2xl border border-border bg-card shadow-sm" open={isAdmin}>
              <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-semibold">
                <SlidersHorizontal className="size-4 text-primary" /> Filtros
              </summary>
              <div className="grid grid-cols-2 gap-2 border-t border-border px-3 py-3 sm:grid-cols-4">
                <Campo label="Setor">
                  <select
                    className="h-10 w-full rounded-xl border bg-background px-2 text-sm"
                    value={setor}
                    onChange={(e) => setSetor(e.target.value as SetorCodigo)}
                    disabled={!isAdmin}
                  >
                    {SETORES.map((item) => (
                      <option key={item} value={item}>
                        {nomeSetor(item)}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo label="Data">
                  <Input
                    className="h-10"
                    type="date"
                    value={data}
                    onChange={(e) => setData(e.target.value)}
                  />
                </Campo>
                <Campo label="Turno">
                  <select
                    className="h-10 w-full rounded-xl border bg-background px-2 text-sm"
                    value={turno}
                    onChange={(e) => setTurno(e.target.value)}
                  >
                    <option value="">Todos</option>
                    <option value="T1">T1</option>
                    <option value="T2">T2</option>
                    <option value="T3">T3</option>
                  </select>
                </Campo>
                <Campo label="Situação">
                  <select
                    className="h-10 w-full rounded-xl border bg-background px-2 text-sm"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    <option value="">Todos</option>
                    <option value="pendente">Pendente</option>
                    <option value="lancado">Lançado</option>
                  </select>
                </Campo>
                <Campo label={setor === "mantas" ? "Lote" : "OP"}>
                  <Input
                    className="h-10"
                    value={op}
                    onChange={(e) => setOp(e.target.value)}
                    placeholder={setor === "mantas" ? "Buscar lote" : "Buscar OP"}
                  />
                </Campo>
                <Campo label="Produto">
                  <select
                    className="h-10 w-full rounded-xl border bg-background px-2 text-sm"
                    value={produto}
                    onChange={(e) => setProduto(e.target.value)}
                  >
                    <option value="">Todos</option>
                    {produtos.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </Campo>
                <Campo label="Facilitador">
                  <select
                    className="h-10 w-full rounded-xl border bg-background px-2 text-sm"
                    value={facilitador}
                    onChange={(e) => setFacilitador(e.target.value)}
                  >
                    <option value="">Todos</option>
                    {facilitadores.map((id) => (
                      <option key={id} value={id}>
                        {nomes[id] ?? "Usuário"}
                      </option>
                    ))}
                  </select>
                </Campo>
              </div>
            </details>

            <div className="sticky top-[58px] z-20 flex items-center justify-between gap-2 rounded-2xl border bg-background/95 p-2.5 shadow-sm backdrop-blur">
              <label className="flex items-center gap-2 text-xs font-medium sm:text-sm">
                <input
                  type="checkbox"
                  checked={
                    pendentesVisiveis.length > 0 &&
                    pendentesVisiveis.every((id) => selecionados.includes(id))
                  }
                  onChange={(e) => setSelecionados(e.target.checked ? pendentesVisiveis : [])}
                />{" "}
                Selecionar pendentes
              </label>
              <Button
                size="sm"
                disabled={selecionados.length === 0 || confirmando}
                onClick={() => void confirmar()}
              >
                <CheckCircle2 className="size-4" />{" "}
                {confirmando ? "Lançando..." : `Lançar (${selecionados.length})`}
              </Button>
            </div>

            {carregando ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Carregando...</p>
            ) : grupos.length === 0 ? (
              <Card>
                <CardContent className="p-5 text-center text-sm text-muted-foreground">
                  Nenhum apontamento encontrado.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {grupos.map((grupo) => {
                  const selecionado = grupo.ids.every((id) => selecionados.includes(id));
                  const agrupado = grupo.quantidadeRegistros > 1;
                  const apontadores = grupo.apontadores
                    .map((responsavel) => responsavel.nome || nomes[responsavel.id] || "Usuário")
                    .join(", ");
                  const lancadores = grupo.lancadores
                    .map((responsavel) => responsavel.nome || nomes[responsavel.id] || "Usuário")
                    .join(", ");
                  const lancadoEm =
                    grupo.lancadores.find((responsavel) => responsavel.em)?.em ??
                    grupo.item.lancado_em;

                  return (
                    <article
                      key={grupo.chave}
                      className={`rounded-2xl border bg-card p-3 shadow-sm ${selecionado ? "border-primary ring-1 ring-primary/20" : "border-border"}`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          className="mt-1 size-5 shrink-0"
                          type="checkbox"
                          disabled={grupo.item.status === "lancado"}
                          checked={selecionado}
                          onChange={() => alternarGrupo(grupo)}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-bold text-foreground">{tituloGrupo(grupo, setor)}</p>
                            {agrupado && (
                              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
                                {grupo.quantidadeRegistros} registros agrupados
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            <span className="font-semibold text-foreground">Produção:</span>{" "}
                            {dataHoraProducaoFormatada(grupo.item.data_hora_producao)} ·{" "}
                            {grupo.item.turno} · {apontadores}
                          </p>
                          {grupo.item.status === "lancado" && grupo.item.lancado_por && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              <span className="font-semibold text-foreground">
                                Lançado no Protheus por:
                              </span>{" "}
                              {lancadores || nomes[grupo.item.lancado_por] || "Usuário"}
                              {lancadoEm ? ` · ${formatarDataHora(lancadoEm)}` : ""}
                            </p>
                          )}
                          <p
                            className={`mt-2 font-extrabold ${setor === "mantas" || setor === "fitas" ? "text-xl text-primary" : "text-base text-foreground"}`}
                          >
                            {resumoPrincipal(grupo, setor)}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {resumoApoio(grupo, setor)}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold ${grupo.item.status === "lancado" ? "bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-200" : "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200"}`}
                        >
                          {grupo.item.status === "lancado" ? "Lançado" : "Pendente"}
                        </span>
                      </div>
                      {grupo.item.status === "pendente" && (
                        <Button
                          className="mt-3 w-full"
                          size="sm"
                          disabled={confirmando}
                          onClick={() => void confirmar(grupo.ids)}
                        >
                          {confirmando
                            ? "Lançando..."
                            : setor === "mantas" && agrupado
                              ? `Confirmar lote · ${fmt(grupo.metragem)} m`
                              : agrupado
                                ? `Confirmar agrupado (${grupo.quantidadeRegistros})`
                                : "Confirmar no Protheus"}
                        </Button>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}

function agruparParaLancamento(itens: Apontamento[], setor: SetorCodigo) {
  const mapa = new Map<string, GrupoLancamento>();
  for (const item of itens) {
    const chave =
      item.status === "pendente" ? chaveAgrupamentoProtheus(item, setor) : `item:${item.id}`;

    const apontador: Responsavel = { id: item.usuario_id, nome: item.apontado_por_nome ?? null };
    const lancador: Responsavel | null = item.lancado_por
      ? { id: item.lancado_por, nome: item.lancado_por_nome ?? null, em: item.lancado_em }
      : null;

    const atual = mapa.get(chave);
    if (!atual) {
      mapa.set(chave, {
        chave,
        ids: [item.id],
        item,
        quantidadeRegistros: 1,
        plts: Number(item.quantidade_plts ?? 0),
        rolos: Number(item.total_rolos ?? 0),
        metragem: Number(item.metragem ?? 0),
        area: Number(item.area_m2 ?? 0),
        unidades: Number(item.total_unidades ?? 0),
        semiKg: Number(item.semi_consumido_kg ?? 0),
        apontadores: [apontador],
        lancadores: lancador ? [lancador] : [],
      });
      continue;
    }

    atual.ids.push(item.id);
    atual.quantidadeRegistros += 1;
    atual.plts += Number(item.quantidade_plts ?? 0);
    atual.rolos += Number(item.total_rolos ?? 0);
    atual.metragem += Number(item.metragem ?? 0);
    atual.area += Number(item.area_m2 ?? 0);
    atual.unidades += Number(item.total_unidades ?? 0);
    atual.semiKg += Number(item.semi_consumido_kg ?? 0);
    if (!atual.apontadores.some((responsavel) => responsavel.id === apontador.id))
      atual.apontadores.push(apontador);
    if (lancador && !atual.lancadores.some((responsavel) => responsavel.id === lancador.id))
      atual.lancadores.push(lancador);
  }
  return [...mapa.values()];
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function tituloGrupo(grupo: GrupoLancamento, setor: SetorCodigo) {
  if (setor === "mantas") return `Lote ${grupo.item.lote ?? "—"} · ${grupo.item.produto_nome}`;
  return `${grupo.item.op ? `OP ${grupo.item.op} · ` : ""}${grupo.item.produto_nome}`;
}

function resumoPrincipal(grupo: GrupoLancamento, setor: SetorCodigo) {
  if (setorComConsumoSemi(setor)) return `${fmt(grupo.unidades)} unidades`;
  if (setor === "fitas") return `${fmt(grupo.area)} m²`;
  if (setor === "mantas") return `${fmt(grupo.metragem)} m`;
  return `${grupo.plts} PLTs`;
}

function resumoApoio(grupo: GrupoLancamento, setor: SetorCodigo) {
  if (setorComConsumoSemi(setor))
    return `${grupo.plts > 0 ? `${grupo.plts} PLTs · ` : ""}${grupo.semiKg > 0 ? `${fmt(grupo.semiKg)} kg de semi · ` : ""}${grupo.quantidadeRegistros} apontamento(s)`;
  if (setor === "fitas") return `${grupo.quantidadeRegistros} apontamento(s) agrupado(s)`;
  if (setor === "mantas")
    return `${grupo.plts} PLTs · ${grupo.rolos} rolos · ${grupo.quantidadeRegistros} apontamento(s)`;
  return `${grupo.rolos} unidades · ${grupo.quantidadeRegistros} apontamento(s)`;
}

function fmt(valor: number) {
  return valor.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function formatarDataHora(valor: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(valor));
}
