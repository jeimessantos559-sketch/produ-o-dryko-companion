import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell, nomeSetor } from "@/components/dryko/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth, type SetorCodigo } from "@/lib/auth";
import { dataSaoPaulo } from "@/lib/producao";

export const Route = createFileRoute("/_authenticated/controle-apontamentos")({
  component: ControleApontamentos,
});

type Apontamento = Database["public"]["Tables"]["apontamentos"]["Row"];
const SETORES: SetorCodigo[] = ["corte", "fitas", "mantas"];

function ControleApontamentos() {
  const { profile, isAutorizado, isAdmin } = useAuth();
  const [setor, setSetor] = useState<SetorCodigo>(profile?.setor_atual ?? "corte");
  const [data, setData] = useState(dataSaoPaulo());
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
        .order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, nome"),
    ]);
    if (error) {
      toast.error("Não foi possível carregar os apontamentos.");
      setItens([]);
    } else {
      setItens(registros ?? []);
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
          (!op.trim() || item.op?.toLowerCase().includes(op.trim().toLowerCase())) &&
          (!produto || item.produto_nome === produto) &&
          (!facilitador || item.usuario_id === facilitador),
      ),
    [facilitador, itens, op, produto, status, turno],
  );
  const pendentesVisiveis = visiveis.filter((item) => item.status === "pendente");

  async function confirmar() {
    if (selecionados.length === 0 || confirmando) return;
    setConfirmando(true);
    const { data: total, error } = await supabase.rpc("confirmar_apontamentos_protheus", {
      p_ids: selecionados,
    });
    setConfirmando(false);
    if (error) {
      toast.error("Não foi possível confirmar os apontamentos no controle Protheus.");
      return;
    }
    toast.success(`${total ?? selecionados.length} apontamento(s) marcado(s) como lançado(s).`);
    await carregar();
  }

  function alternar(id: string) {
    setSelecionados((atuais) =>
      atuais.includes(id) ? atuais.filter((item) => item !== id) : [...atuais, id],
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-4">
        <div>
          <h1 className="text-2xl font-bold">Controle de apontamentos</h1>
          <p className="text-sm text-muted-foreground">
            Confirmação manual de lançamento no Protheus, com responsável e horário auditados.
          </p>
        </div>

        {!isAutorizado ? (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">
              Você não tem permissão para confirmar lançamentos no Protheus.
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardContent className="grid gap-3 pt-6 sm:grid-cols-2 lg:grid-cols-4">
                <Campo label="Setor">
                  <select
                    className="h-10 w-full rounded-md border bg-background px-3"
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
                  <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
                </Campo>
                <Campo label="Turno">
                  <select
                    className="h-10 w-full rounded-md border bg-background px-3"
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
                    className="h-10 w-full rounded-md border bg-background px-3"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    <option value="">Todos</option>
                    <option value="pendente">Pendente</option>
                    <option value="lancado">Lançado</option>
                  </select>
                </Campo>
                <Campo label="OP">
                  <Input
                    value={op}
                    onChange={(e) => setOp(e.target.value)}
                    placeholder="Buscar OP"
                  />
                </Campo>
                <Campo label="Produto">
                  <select
                    className="h-10 w-full rounded-md border bg-background px-3"
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
                    className="h-10 w-full rounded-md border bg-background px-3"
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
              </CardContent>
            </Card>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={
                    pendentesVisiveis.length > 0 &&
                    pendentesVisiveis.every((item) => selecionados.includes(item.id))
                  }
                  onChange={(e) =>
                    setSelecionados(
                      e.target.checked ? pendentesVisiveis.map((item) => item.id) : [],
                    )
                  }
                />
                Selecionar pendentes visíveis
              </label>
              <Button disabled={selecionados.length === 0 || confirmando} onClick={confirmar}>
                <CheckCircle2 />
                {confirmando ? "Confirmando..." : `Confirmar no Protheus (${selecionados.length})`}
              </Button>
            </div>

            {carregando ? (
              <p className="text-sm text-muted-foreground">Carregando...</p>
            ) : visiveis.length === 0 ? (
              <Card>
                <CardContent className="pt-6 text-sm text-muted-foreground">
                  Nenhum apontamento encontrado com estes filtros.
                </CardContent>
              </Card>
            ) : (
              visiveis.map((item) => (
                <Card key={item.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start gap-3">
                      <input
                        className="mt-1 size-5"
                        type="checkbox"
                        disabled={item.status === "lancado"}
                        checked={selecionados.includes(item.id)}
                        onChange={() => alternar(item.id)}
                        aria-label={`Selecionar ${item.produto_nome}`}
                      />
                      <div className="min-w-0 flex-1">
                        <CardTitle className="text-base">
                          {item.op ? `OP ${item.op} · ` : ""}
                          {item.produto_nome}
                        </CardTitle>
                        <p className="text-xs text-muted-foreground">
                          {nomes[item.usuario_id] ?? "Usuário"} · {item.turno} ·{" "}
                          {formatarDataHora(item.created_at)}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold ${
                          item.status === "lancado"
                            ? "bg-green-100 text-green-800"
                            : "bg-amber-100 text-amber-900"
                        }`}
                      >
                        {item.status === "lancado" ? "Lançado" : "Pendente"}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="text-sm">
                    <p>{resumo(item)}</p>
                    {item.lancado_em && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Confirmado por {nomes[item.lancado_por ?? ""] ?? "usuário autorizado"} em{" "}
                        {formatarDataHora(item.lancado_em)}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function resumo(item: Apontamento) {
  if (item.setor === "fitas") return `${Number(item.area_m2 ?? 0).toLocaleString("pt-BR")} m²`;
  const lote = item.lote ? ` · Lote ${item.lote}` : "";
  const metragem = item.metragem ? ` · ${Number(item.metragem).toLocaleString("pt-BR")} m` : "";
  return `${item.quantidade_plts ?? 0} PLTs · ${item.total_rolos ?? 0} rolos${metragem}${lote}`;
}

function formatarDataHora(valor: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(valor));
}
