import { createFileRoute } from "@tanstack/react-router";
import { Edit3, History as HistoryIcon, Plus, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { AppShell, nomeSetor } from "@/components/dryko/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import { useAuth, type SetorCodigo } from "@/lib/auth";
import { dataSaoPaulo, type GrupoCorte } from "@/lib/producao";

export const Route = createFileRoute("/_authenticated/historico")({ component: Historico });

type ApontamentoBase = Database["public"]["Tables"]["apontamentos"]["Row"];
type Apontamento = ApontamentoBase & {
  apontado_por_nome?: string | null;
  lancado_por_nome?: string | null;
};
type Auditoria = Database["public"]["Tables"]["apontamento_auditoria"]["Row"];
type Edicao = {
  op: string;
  lote: string;
  quantidadePlts: number;
  metragem: number;
  tempo: number;
  velocidade: number;
  largura: number;
  grupos: GrupoCorte[];
};
const SETORES: SetorCodigo[] = ["corte", "fitas", "mantas"];

function Historico() {
  const { profile, isAdmin } = useAuth();
  const [setor, setSetor] = useState<SetorCodigo>(profile?.setor_atual ?? "corte");
  const [dataInicio, setDataInicio] = useState(dataSaoPaulo());
  const [dataFim, setDataFim] = useState(dataSaoPaulo());
  const [turno, setTurno] = useState("");
  const [status, setStatus] = useState("");
  const [op, setOp] = useState("");
  const [produto, setProduto] = useState("");
  const [facilitador, setFacilitador] = useState("");
  const [itens, setItens] = useState<Apontamento[]>([]);
  const [auditorias, setAuditorias] = useState<Auditoria[]>([]);
  const [nomes, setNomes] = useState<Record<string, string>>({});
  const [carregando, setCarregando] = useState(true);
  const [editando, setEditando] = useState<string | null>(null);
  const [edicao, setEdicao] = useState<Edicao | null>(null);
  const [justificativa, setJustificativa] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (profile?.setor_atual && !isAdmin) setSetor(profile.setor_atual);
  }, [isAdmin, profile?.setor_atual]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const [{ data: registros, error }, { data: trilha }, { data: perfis }] = await Promise.all([
      supabase
        .from("apontamentos")
        .select("*")
        .eq("setor", setor)
        .gte("data_local", dataInicio)
        .lte("data_local", dataFim)
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("apontamento_auditoria")
        .select("*")
        .eq("setor", setor)
        .order("created_at", { ascending: false })
        .limit(1000),
      supabase.from("profiles").select("id, nome"),
    ]);
    if (error) toast.error("Não foi possível carregar o histórico.");
    setItens((registros ?? []) as Apontamento[]);
    setAuditorias(trilha ?? []);
    setNomes(Object.fromEntries((perfis ?? []).map((item) => [item.id, item.nome || "Sem nome"])));
    setCarregando(false);
  }, [dataFim, dataInicio, setor]);

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

  function abrirEdicao(item: Apontamento) {
    const grupos = Array.isArray(item.grupos)
      ? (item.grupos as unknown as GrupoCorte[])
      : [
          {
            quantidadePlts: item.quantidade_plts ?? 1,
            rolosPorPlt: item.rolos_por_plt ?? 1,
            pltPicadoRolos: null,
          },
        ];
    setEditando(item.id);
    setEdicao({
      op: item.op ?? "",
      lote: item.lote ?? "",
      quantidadePlts: item.quantidade_plts ?? 1,
      metragem: Number(item.metragem ?? 0),
      tempo: Number(item.tempo ?? 0),
      velocidade: Number(item.velocidade ?? 0),
      largura: Number(item.largura ?? 0.93),
      grupos,
    });
    setJustificativa("");
  }

  function fecharEdicao() {
    setEditando(null);
    setEdicao(null);
    setJustificativa("");
  }

  function atualizarGrupo(indice: number, alteracao: Partial<GrupoCorte>) {
    setEdicao((atual) =>
      atual
        ? {
            ...atual,
            grupos: atual.grupos.map((grupo, i) =>
              i === indice ? { ...grupo, ...alteracao } : grupo,
            ),
          }
        : atual,
    );
  }

  async function salvarCorrecao(item: Apontamento) {
    if (!edicao || justificativa.trim().length < 3 || salvando) return;
    const dados: Json =
      item.setor === "corte"
        ? { op: edicao.op, grupos: edicao.grupos as unknown as Json }
        : item.setor === "fitas"
          ? {
              op: edicao.op,
              tempo: edicao.tempo,
              velocidade: edicao.velocidade,
              largura: edicao.largura,
            }
          : {
              op: edicao.op,
              lote: edicao.lote,
              quantidade_plts: edicao.quantidadePlts,
              metragem: edicao.metragem,
            };
    setSalvando(true);
    const { error } = await supabase.rpc("corrigir_apontamento", {
      p_id: item.id,
      p_justificativa: justificativa.trim(),
      p_dados: dados,
    });
    setSalvando(false);
    if (error) {
      toast.error(error.message || "Não foi possível corrigir o apontamento.");
      return;
    }
    toast.success(
      item.status === "lancado"
        ? "Correção salva. O apontamento voltou para pendente."
        : "Correção salva com auditoria.",
    );
    fecharEdicao();
    await carregar();
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-4">
        <div>
          <h1 className="text-2xl font-bold">Histórico e correções</h1>
          <p className="text-sm text-muted-foreground">
            Toda correção exige justificativa e guarda os dados anteriores, novos, usuário e horário.
          </p>
        </div>

        <Card>
          <CardContent className="grid gap-3 pt-6 sm:grid-cols-2 lg:grid-cols-4">
            <Campo label="Setor">
              <select className="h-10 w-full rounded-md border bg-background px-3" value={setor} onChange={(e) => setSetor(e.target.value as SetorCodigo)} disabled={!isAdmin}>
                {SETORES.map((item) => <option key={item} value={item}>{nomeSetor(item)}</option>)}
              </select>
            </Campo>
            <Campo label="De"><Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} /></Campo>
            <Campo label="Até"><Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} /></Campo>
            <Campo label="Turno">
              <select className="h-10 w-full rounded-md border bg-background px-3" value={turno} onChange={(e) => setTurno(e.target.value)}>
                <option value="">Todos</option><option value="T1">T1</option><option value="T2">T2</option><option value="T3">T3</option>
              </select>
            </Campo>
            <Campo label="Situação">
              <select className="h-10 w-full rounded-md border bg-background px-3" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">Todas</option><option value="pendente">Pendente</option><option value="lancado">Lançado</option>
              </select>
            </Campo>
            <Campo label="OP"><Input value={op} onChange={(e) => setOp(e.target.value)} placeholder="Buscar OP" /></Campo>
            <Campo label="Produto">
              <select className="h-10 w-full rounded-md border bg-background px-3" value={produto} onChange={(e) => setProduto(e.target.value)}>
                <option value="">Todos</option>{produtos.map((item) => <option key={item}>{item}</option>)}
              </select>
            </Campo>
            <Campo label="Facilitador">
              <select className="h-10 w-full rounded-md border bg-background px-3" value={facilitador} onChange={(e) => setFacilitador(e.target.value)}>
                <option value="">Todos</option>{facilitadores.map((id) => <option key={id} value={id}>{nomes[id] ?? "Usuário"}</option>)}
              </select>
            </Campo>
          </CardContent>
        </Card>

        {carregando ? (
          <p className="text-sm text-muted-foreground">Carregando histórico...</p>
        ) : visiveis.length === 0 ? (
          <Card><CardContent className="pt-6 text-sm text-muted-foreground">Nenhum apontamento encontrado no período.</CardContent></Card>
        ) : (
          visiveis.map((item) => {
            const trilha = auditorias.filter((auditoria) => auditoria.apontamento_id === item.id);
            const podeCorrigir = item.status === "pendente" || isAdmin;
            const nomeApontador = item.apontado_por_nome || nomes[item.usuario_id] || "Usuário";
            const nomeLancador = item.lancado_por_nome || (item.lancado_por ? nomes[item.lancado_por] : null) || "Usuário";

            return (
              <Card key={item.id}>
                <CardHeader className="pb-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">
                        {item.op ? `OP ${item.op} · ` : ""}{item.produto_nome}
                      </CardTitle>
                      <p className="mt-1 text-xs text-muted-foreground">
                        <span className="font-semibold text-foreground">Apontado por:</span> {nomeApontador} · {item.turno} · {formatar(item.created_at)}
                      </p>
                      {item.status === "lancado" && item.lancado_por && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          <span className="font-semibold text-foreground">Lançado no Protheus por:</span> {nomeLancador}{item.lancado_em ? ` · ${formatar(item.lancado_em)}` : ""}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${item.status === "lancado" ? "bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-200" : "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200"}`}>
                        {item.status === "lancado" ? "Lançado" : "Pendente"}
                      </span>
                      {podeCorrigir && editando !== item.id && (
                        <Button size="sm" variant="outline" onClick={() => abrirEdicao(item)}><Edit3 /> Corrigir</Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm">{resumo(item)}</p>
                  {item.status === "lancado" && !isAdmin && (
                    <p className="text-xs text-muted-foreground">Somente o administrador pode corrigir um apontamento já lançado.</p>
                  )}

                  {editando === item.id && edicao && (
                    <div className="space-y-3 rounded-lg border bg-muted/40 p-4">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold">Corrigir apontamento</h3>
                        <Button size="icon" variant="ghost" onClick={fecharEdicao} aria-label="Fechar"><X /></Button>
                      </div>
                      <FormularioEdicao setor={item.setor} edicao={edicao} setEdicao={setEdicao} atualizarGrupo={atualizarGrupo} />
                      <div className="space-y-1">
                        <Label>Justificativa da correção *</Label>
                        <Textarea value={justificativa} onChange={(e) => setJustificativa(e.target.value)} placeholder="Explique o que foi corrigido e por quê" />
                      </div>
                      <Button className="w-full" disabled={justificativa.trim().length < 3 || salvando} onClick={() => salvarCorrecao(item)}>
                        {salvando ? "Salvando..." : "Salvar correção"}
                      </Button>
                    </div>
                  )}

                  {trilha.length > 0 && (
                    <details className="rounded-md border p-3">
                      <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                        <HistoryIcon className="size-4" /> Auditoria ({trilha.length})
                      </summary>
                      <div className="mt-3 space-y-3">
                        {trilha.map((auditoria) => (
                          <div key={auditoria.id} className="rounded-md bg-muted p-3 text-xs">
                            <p className="font-semibold">
                              {auditoria.acao === "correcao" ? "Correção" : "Confirmação Protheus"} · {nomes[auditoria.usuario_id] ?? "Usuário"} · {formatar(auditoria.created_at)}
                            </p>
                            {auditoria.justificativa && <p className="mt-1">{auditoria.justificativa}</p>}
                            <details className="mt-2">
                              <summary className="cursor-pointer text-muted-foreground">Ver dados antes e depois</summary>
                              <p className="mt-2 font-semibold">Antes</p>
                              <pre className="max-h-48 overflow-auto whitespace-pre-wrap">{JSON.stringify(auditoria.dados_anteriores, null, 2)}</pre>
                              <p className="mt-2 font-semibold">Depois</p>
                              <pre className="max-h-48 overflow-auto whitespace-pre-wrap">{JSON.stringify(auditoria.dados_novos, null, 2)}</pre>
                            </details>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </AppShell>
  );
}

function FormularioEdicao({
  setor,
  edicao,
  setEdicao,
  atualizarGrupo,
}: {
  setor: SetorCodigo;
  edicao: Edicao;
  setEdicao: React.Dispatch<React.SetStateAction<Edicao | null>>;
  atualizarGrupo: (indice: number, alteracao: Partial<GrupoCorte>) => void;
}) {
  const alterar = (alteracao: Partial<Edicao>) => setEdicao((atual) => (atual ? { ...atual, ...alteracao } : atual));
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Campo label="OP"><Input value={edicao.op} onChange={(e) => alterar({ op: e.target.value })} /></Campo>
      {setor === "corte" && (
        <div className="space-y-3 sm:col-span-2">
          {edicao.grupos.map((grupo, indice) => (
            <div key={indice} className="grid gap-2 rounded-md border p-3 sm:grid-cols-3">
              <Campo label="PLTs"><Input type="number" min={1} value={grupo.quantidadePlts} onChange={(e) => atualizarGrupo(indice, { quantidadePlts: Number(e.target.value) })} /></Campo>
              <Campo label="Rolos/PLT"><Input type="number" min={1} value={grupo.rolosPorPlt} onChange={(e) => atualizarGrupo(indice, { rolosPorPlt: Number(e.target.value) })} /></Campo>
              <Campo label="PLT picado"><Input type="number" min={1} value={grupo.pltPicadoRolos ?? ""} onChange={(e) => atualizarGrupo(indice, { pltPicadoRolos: e.target.value ? Number(e.target.value) : null })} /></Campo>
              {edicao.grupos.length > 1 && (
                <Button variant="ghost" className="sm:col-span-3 justify-self-start" onClick={() => alterar({ grupos: edicao.grupos.filter((_, i) => i !== indice) })}>
                  <Trash2 /> Remover grupo
                </Button>
              )}
            </div>
          ))}
          <Button variant="outline" onClick={() => alterar({ grupos: [...edicao.grupos, { quantidadePlts: 1, rolosPorPlt: edicao.grupos[0]?.rolosPorPlt ?? 1, pltPicadoRolos: null }] })}>
            <Plus /> Adicionar grupo
          </Button>
        </div>
      )}
      {setor === "fitas" && (
        <>
          <Campo label="Tempo"><Input type="number" min={0.01} step="0.01" value={edicao.tempo} onChange={(e) => alterar({ tempo: Number(e.target.value) })} /></Campo>
          <Campo label="Velocidade"><Input type="number" min={0.01} step="0.01" value={edicao.velocidade} onChange={(e) => alterar({ velocidade: Number(e.target.value) })} /></Campo>
          <Campo label="Largura (m)"><Input type="number" min={0.01} step="0.01" value={edicao.largura} onChange={(e) => alterar({ largura: Number(e.target.value) })} /></Campo>
        </>
      )}
      {setor === "mantas" && (
        <>
          <Campo label="Lote"><Input value={edicao.lote} onChange={(e) => alterar({ lote: e.target.value })} /></Campo>
          <Campo label="PLTs"><Input type="number" min={1} value={edicao.quantidadePlts} onChange={(e) => alterar({ quantidadePlts: Number(e.target.value) })} /></Campo>
          <Campo label="Metragem"><Input type="number" min={10} step={10} value={edicao.metragem} onChange={(e) => alterar({ metragem: Number(e.target.value) })} /></Campo>
        </>
      )}
    </div>
  );
}

function Campo({ label, children }: { label: string; children: ReactNode }) {
  return <div className="space-y-1"><Label>{label}</Label>{children}</div>;
}

function resumo(item: Apontamento) {
  if (item.setor === "fitas") {
    return `${Number(item.area_m2 ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m² · tempo ${item.tempo} · velocidade ${item.velocidade}`;
  }
  const lote = item.lote ? ` · Lote ${item.lote}` : "";
  const metragem = item.metragem ? ` · ${Number(item.metragem).toLocaleString("pt-BR")} m` : "";
  return `${item.quantidade_plts ?? 0} PLTs · ${item.total_rolos ?? 0} rolos${metragem}${lote}`;
}

function formatar(valor: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(valor));
}
