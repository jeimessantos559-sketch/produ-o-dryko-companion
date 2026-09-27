import { Calculator, PackageCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { areaFitas, metragemCorte } from "@/lib/producao";

type Produto = {
  id: string;
  nome: string;
  categoria: string | null;
  rolos_por_plt: number | null;
  largura: number | null;
  metragem_por_plt: number | null;
  metros_por_rolo: number | null;
};

type CacheItem = { expiresAt: number; produtos: Produto[] };
const cacheProdutos = new Map<string, CacheItem>();
const CACHE_MS = 5 * 60_000;

async function obterProdutos(setor: string) {
  const cache = cacheProdutos.get(setor);
  if (cache && cache.expiresAt > Date.now()) return cache.produtos;

  const { data, error } = await supabase
    .from("produtos")
    .select("id, nome, categoria, rolos_por_plt, largura, metragem_por_plt, metros_por_rolo")
    .eq("setor", setor as never)
    .eq("ativo", true)
    .order("categoria")
    .order("nome");

  if (error) throw error;
  const produtos = (data ?? []) as Produto[];
  cacheProdutos.set(setor, { expiresAt: Date.now() + CACHE_MS, produtos });
  return produtos;
}

export function invalidarCacheProdutos(setor?: string) {
  if (setor) cacheProdutos.delete(setor);
  else cacheProdutos.clear();
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void | Promise<void>;
  repeatLatest?: boolean;
};

export function ApontamentoRapido({
  open,
  onOpenChange,
  onSaved,
  repeatLatest = false,
}: Props) {
  const { user, profile } = useAuth();
  const setor = profile?.setor_atual;
  const turno = profile?.turno_atual;
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [op, setOp] = useState("");
  const [produtoId, setProdutoId] = useState("");
  const [quantidadePlts, setQuantidadePlts] = useState(1);
  const [rolosPorPlt, setRolosPorPlt] = useState(0);
  const [pltPicado, setPltPicado] = useState<number | "">("");
  const [lote, setLote] = useState("");
  const [metragemManta, setMetragemManta] = useState(0);
  const [tempo, setTempo] = useState(60);
  const [velocidade, setVelocidade] = useState(25);
  const [largura, setLargura] = useState(0.93);

  const produto = produtos.find((item) => item.id === produtoId) ?? null;

  function limparFormulario() {
    setOp("");
    setProdutoId("");
    setQuantidadePlts(1);
    setRolosPorPlt(0);
    setPltPicado("");
    setLote("");
    setMetragemManta(0);
    setTempo(60);
    setVelocidade(25);
    setLargura(0.93);
  }

  useEffect(() => {
    if (!open || !setor || !["corte", "fitas", "mantas"].includes(setor)) return;
    let ativo = true;
    setCarregando(true);
    limparFormulario();

    void obterProdutos(setor)
      .then(async (lista) => {
        if (!ativo) return;
        setProdutos(lista);
        if (!repeatLatest || !user || !turno) return;

        const { data, error } = await supabase
          .from("apontamentos")
          .select("op, lote, produto_id, quantidade_plts, rolos_por_plt, grupos, tempo, velocidade, largura, metragem")
          .eq("usuario_id", user.id)
          .eq("setor", setor as never)
          .eq("turno", turno)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!ativo) return;
        if (error) {
          toast.error("Não foi possível consultar o último apontamento.");
          return;
        }
        if (!data) {
          toast.info("Ainda não existe apontamento neste setor para repetir.");
          return;
        }

        setProdutoId(data.produto_id);
        setOp(data.op ?? "");
        if (setor === "corte") {
          const grupos = Array.isArray(data.grupos) ? data.grupos : [];
          const primeiro = (grupos[0] ?? {}) as {
            quantidadePlts?: number;
            rolosPorPlt?: number;
            pltPicadoRolos?: number | null;
          };
          setQuantidadePlts(Number(primeiro.quantidadePlts ?? data.quantidade_plts ?? 1));
          setRolosPorPlt(Number(primeiro.rolosPorPlt ?? data.rolos_por_plt ?? 1));
          setPltPicado(primeiro.pltPicadoRolos == null ? "" : Number(primeiro.pltPicadoRolos));
        } else if (setor === "fitas") {
          setTempo(Number(data.tempo ?? 60));
          setVelocidade(Number(data.velocidade ?? 25));
          setLargura(Number(data.largura ?? 0.93));
        } else if (setor === "mantas") {
          setLote(data.lote ?? "");
          setQuantidadePlts(Number(data.quantidade_plts ?? 1));
          setMetragemManta(Number(data.metragem ?? 0));
        }
        toast.info("Último apontamento carregado. Revise os dados antes de salvar.");
      })
      .catch(() => {
        if (ativo) toast.error("Não foi possível carregar os produtos.");
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });

    return () => {
      ativo = false;
    };
  }, [open, repeatLatest, setor, turno, user]);

  function selecionarProduto(id: string) {
    setProdutoId(id);
    const escolhido = produtos.find((item) => item.id === id);
    if (!escolhido) return;
    if (setor === "corte") {
      setRolosPorPlt(escolhido.rolos_por_plt ?? 1);
      setPltPicado("");
    }
    if (setor === "fitas") {
      setTempo(60);
      setVelocidade(25);
      setLargura(Number(escolhido.largura ?? 0.93));
    }
    if (setor === "mantas") {
      setMetragemManta(Number(escolhido.metragem_por_plt ?? 0));
      setQuantidadePlts(1);
    }
  }

  function alterarPltsManta(valor: number) {
    setQuantidadePlts(valor);
    if (produto?.metragem_por_plt && valor > 0) {
      setMetragemManta(Number(produto.metragem_por_plt) * valor);
    }
  }

  const totalRolosCorte = useMemo(() => {
    if (setor !== "corte" || !produto || rolosPorPlt <= 0 || quantidadePlts <= 0) return 0;
    const picado = typeof pltPicado === "number" ? pltPicado : null;
    if (picado == null) return quantidadePlts * rolosPorPlt;
    return Math.max(0, quantidadePlts - 1) * rolosPorPlt + picado;
  }, [setor, produto, rolosPorPlt, quantidadePlts, pltPicado]);

  const metragemCorteCalculada =
    setor === "corte" && produto?.largura
      ? metragemCorte(Number(produto.largura), totalRolosCorte)
      : null;
  const areaFitasCalculada = setor === "fitas" ? areaFitas(tempo, velocidade, largura) : 0;

  const valido = Boolean(
    user &&
      turno &&
      produto &&
      ((setor === "corte" &&
        op.trim() &&
        Number.isInteger(quantidadePlts) &&
        quantidadePlts >= 1 &&
        quantidadePlts <= 20 &&
        rolosPorPlt > 0 &&
        (pltPicado === "" || (pltPicado > 0 && pltPicado < rolosPorPlt))) ||
        (setor === "fitas" && op.trim() && tempo > 0 && velocidade > 0 && largura > 0) ||
        (setor === "mantas" && lote.trim() && quantidadePlts > 0 && metragemManta > 0)),
  );

  async function salvar() {
    if (!valido || !user || !turno || !produto || salvando) return;
    setSalvando(true);
    try {
      if (setor === "corte") {
        const { error } = await supabase.from("apontamentos").insert({
          usuario_id: user.id,
          setor: "corte",
          turno,
          op: op.trim(),
          produto_id: produto.id,
          produto_nome: produto.nome,
          quantidade_plts: quantidadePlts,
          rolos_por_plt: rolosPorPlt,
          total_rolos: totalRolosCorte,
          largura: produto.largura,
          grupos: [
            {
              quantidadePlts,
              rolosPorPlt,
              pltPicadoRolos: pltPicado === "" ? null : pltPicado,
            },
          ],
        });
        if (error) throw error;
        toast.success("Apontamento de Corte salvo.");
      } else if (setor === "fitas") {
        const { error } = await supabase.from("apontamentos").insert({
          usuario_id: user.id,
          setor: "fitas",
          turno,
          op: op.trim(),
          produto_id: produto.id,
          produto_nome: produto.nome,
          tempo,
          velocidade,
          largura,
          area_m2: areaFitasCalculada,
        });
        if (error) throw error;
        toast.success("Apontamento de Fitas salvo.");
      } else if (setor === "mantas") {
        const { error } = await supabase.from("apontamentos").insert({
          usuario_id: user.id,
          setor: "mantas",
          turno,
          op: null,
          lote: lote.trim(),
          produto_id: produto.id,
          produto_nome: produto.nome,
          quantidade_plts: quantidadePlts,
          metragem: metragemManta,
        });
        if (error) throw error;
        toast.success("Apontamento de Mantas salvo.");
      }

      onOpenChange(false);
      await onSaved?.();
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : "";
      toast.error(
        mensagem.toLowerCase().includes("turno") && mensagem.toLowerCase().includes("fechado")
          ? "Este turno está fechado. Peça a reabertura ao administrador."
          : "Não foi possível salvar o apontamento. Revise os dados e tente novamente.",
      );
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-3xl sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {repeatLatest ? "Repetir último apontamento" : "Novo apontamento"}
            {setor ? ` · ${nomeSetorRapido(setor)}` : ""}
          </DialogTitle>
          <DialogDescription>
            {repeatLatest
              ? "Os dados do último registro foram copiados. Revise antes de confirmar."
              : "Registre sem sair do painel. Os valores padrão podem ser alterados antes de salvar."}
          </DialogDescription>
        </DialogHeader>

        {!setor || !["corte", "fitas", "mantas"].includes(setor) ? (
          <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">
            Este setor ainda não possui formulário rápido configurado.
          </div>
        ) : (
          <div className="space-y-4">
            {setor !== "mantas" && (
              <div className="space-y-1">
                <Label htmlFor="rapido-op">OP *</Label>
                <Input
                  id="rapido-op"
                  inputMode="numeric"
                  className="h-12 text-base"
                  value={op}
                  onChange={(event) => setOp(event.target.value.replace(/\D/g, ""))}
                />
              </div>
            )}

            <div className="space-y-1">
              <Label htmlFor="rapido-produto">Produto *</Label>
              <select
                id="rapido-produto"
                className="h-12 w-full rounded-xl border border-input bg-background px-3 text-base"
                value={produtoId}
                onChange={(event) => selecionarProduto(event.target.value)}
                disabled={carregando}
              >
                <option value="">{carregando ? "Carregando..." : "Selecione"}</option>
                {agrupar(produtos).map(([categoria, itens]) => (
                  <optgroup key={categoria} label={categoria}>
                    {itens.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.nome}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            {setor === "corte" && produto && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="rapido-plts">Quantidade de PLTs</Label>
                    <Input
                      id="rapido-plts"
                      type="number"
                      min={1}
                      max={20}
                      className="h-12 text-base"
                      value={quantidadePlts}
                      onChange={(event) => setQuantidadePlts(Number(event.target.value))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="rapido-rolos">Rolos/PLT</Label>
                    <Input
                      id="rapido-rolos"
                      type="number"
                      min={1}
                      className="h-12 text-base"
                      value={rolosPorPlt}
                      onChange={(event) => setRolosPorPlt(Number(event.target.value))}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="rapido-picado">Último PLT picado — rolos (opcional)</Label>
                  <Input
                    id="rapido-picado"
                    type="number"
                    min={1}
                    max={Math.max(1, rolosPorPlt - 1)}
                    className="h-12 text-base"
                    placeholder="Deixe vazio para todos fechados"
                    value={pltPicado}
                    onChange={(event) => setPltPicado(event.target.value ? Number(event.target.value) : "")}
                  />
                </div>
                <div className="grid grid-cols-3 gap-2 rounded-2xl bg-slate-950 p-3 text-center text-white">
                  <Resumo label="PLTs" valor={quantidadePlts} />
                  <Resumo label="Rolos" valor={totalRolosCorte.toLocaleString("pt-BR")} />
                  <Resumo
                    label="Metragem"
                    valor={`${Number(metragemCorteCalculada ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m²`}
                  />
                </div>
              </>
            )}

            {setor === "fitas" && produto && (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="rapido-tempo">Tempo (min)</Label>
                    <Input id="rapido-tempo" type="number" min={1} className="h-12 text-base" value={tempo} onChange={(event) => setTempo(Number(event.target.value))} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="rapido-velocidade">Velocidade</Label>
                    <Input id="rapido-velocidade" type="number" min={0.01} step="0.01" className="h-12 text-base" value={velocidade} onChange={(event) => setVelocidade(Number(event.target.value))} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="rapido-largura">Largura (m)</Label>
                    <Input id="rapido-largura" type="number" min={0.01} step="0.01" className="h-12 text-base" value={largura} onChange={(event) => setLargura(Number(event.target.value))} />
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-2xl bg-slate-950 p-4 text-white">
                  <Calculator className="size-6 text-primary" />
                  <div>
                    <p className="text-xs text-slate-300">{tempo} min × {velocidade} m/min × {largura} m</p>
                    <p className="text-2xl font-extrabold">{areaFitasCalculada.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m²</p>
                  </div>
                </div>
              </>
            )}

            {setor === "mantas" && produto && (
              <>
                <div className="space-y-1">
                  <Label htmlFor="rapido-lote">Lote *</Label>
                  <Input id="rapido-lote" className="h-12 text-base" value={lote} onChange={(event) => setLote(event.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="rapido-plts-manta">PLTs</Label>
                    <Input id="rapido-plts-manta" type="number" min={1} className="h-12 text-base" value={quantidadePlts} onChange={(event) => alterarPltsManta(Number(event.target.value))} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="rapido-metragem-manta">Metragem</Label>
                    <Input id="rapido-metragem-manta" type="number" min={1} step={produto.metros_por_rolo ?? 10} className="h-12 text-base" value={metragemManta} onChange={(event) => setMetragemManta(Number(event.target.value))} />
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-2xl bg-slate-100 p-4 text-slate-900">
                  <PackageCheck className="size-6 text-primary" />
                  <div>
                    <p className="text-xs text-slate-500">Produção calculada</p>
                    <p className="font-bold">{quantidadePlts} PLT(s) · {metragemManta.toLocaleString("pt-BR")} m · {produto.metros_por_rolo ? metragemManta / produto.metros_por_rolo : 0} rolos</p>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="button" disabled={!valido || salvando} onClick={salvar}>
            {salvando ? "Salvando..." : "Registrar apontamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function agrupar(produtos: Produto[]) {
  const mapa = new Map<string, Produto[]>();
  for (const produto of produtos) {
    const grupo = produto.categoria?.trim() || "Produtos";
    mapa.set(grupo, [...(mapa.get(grupo) ?? []), produto]);
  }
  return [...mapa.entries()];
}

function Resumo({ label, valor }: { label: string; valor: string | number }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="truncate text-sm font-bold">{valor}</p>
    </div>
  );
}

function nomeSetorRapido(setor: string) {
  if (setor === "corte") return "Corte";
  if (setor === "fitas") return "Fitas";
  if (setor === "mantas") return "Mantas";
  return setor;
}
