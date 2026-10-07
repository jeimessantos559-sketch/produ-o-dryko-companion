import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { ProdutoSelect } from "@/components/dryko/produto-select";
import { CamposLiquidos } from "@/components/dryko/campos-liquidos";
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
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { gruposFechados, type ApontamentoTurno } from "@/lib/apontamentos-turno";
import { invalidarCache } from "@/lib/cache-consultas";
import { obterProdutosAtivos, type ProdutoCatalogo } from "@/lib/produtos-cache";
import { totalPlts, totalRolos, type GrupoCorte } from "@/lib/producao";
import { bloquearSeOffline } from "@/lib/rede";
import { calcularLiquidos, quantidadeLiquidoInicial } from "@/lib/liquidos";

type Props = { item: ApontamentoTurno; onClose: () => void; onSaved: () => void | Promise<void> };

export function CorrigirApontamento({ item, onClose, onSaved }: Props) {
  const [produtos, setProdutos] = useState<ProdutoCatalogo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [produtoId, setProdutoId] = useState(item.produto_id);
  const [referencia, setReferencia] = useState(
    item.setor === "mantas" ? (item.lote ?? "") : (item.op ?? ""),
  );
  const [grupos, setGrupos] = useState<GrupoCorte[]>(() => {
    const atuais = gruposFechados(item.grupos);
    return atuais.length
      ? atuais
      : [
          {
            quantidadePlts: item.quantidade_plts ?? 1,
            rolosPorPlt: item.rolos_por_plt ?? 1,
            pltPicadoRolos: null,
            picadoAdicional: true,
          },
        ];
  });
  const [quantidadePlts, setQuantidadePlts] = useState(item.quantidade_plts ?? 1);
  const [quantidadeLiquido, setQuantidadeLiquido] = useState(() => ({
    quantidadePlts: item.quantidade_plts ?? 1,
    picadoUnidades: item.picado_unidades || ("" as const),
    unidades: item.total_unidades ?? 0,
  }));
  const [metragem, setMetragem] = useState(Number(item.metragem ?? 0));
  const [tempo, setTempo] = useState(Number(item.tempo ?? 60));
  const [velocidade, setVelocidade] = useState(Number(item.velocidade ?? 25));
  const [largura, setLargura] = useState(Number(item.largura ?? 0.93));
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erroProdutos, setErroProdutos] = useState(false);

  useEffect(() => {
    let ativo = true;
    void obterProdutosAtivos(item.setor)
      .then(async (lista) => {
        if (!ativo) return;
        // Produtos inativos também precisam do peso atual para a correção de Líquidos.
        if (item.setor === "liquidos" && !lista.some((p) => p.id === item.produto_id)) {
          const { data: historico, error } = await supabase
            .from("produtos")
            .select(
              "id, nome, categoria, rolos_por_plt, largura, metragem_por_plt, metros_por_rolo, embalagem_liquido, unidades_por_plt, semi_kg_por_unidade",
            )
            .eq("id", item.produto_id)
            .maybeSingle();
          if (!ativo) return;
          if (error || !historico) {
            setErroProdutos(true);
            return;
          }
          setProdutos([...lista, historico]);
          return;
        }
        // Um produto histórico inativo continua disponível para corrigir só a quantidade.
        setProdutos(
          lista.some((p) => p.id === item.produto_id)
            ? lista
            : [
                ...lista,
                {
                  id: item.produto_id,
                  nome: item.produto_nome,
                  categoria: null,
                  rolos_por_plt: item.rolos_por_plt,
                  largura: item.largura,
                  metragem_por_plt: null,
                  metros_por_rolo: null,
                  embalagem_liquido: item.embalagem_liquido,
                  unidades_por_plt: item.unidades_por_plt,
                  semi_kg_por_unidade: item.semi_kg_por_unidade,
                },
              ],
        );
      })
      .catch(() => {
        if (ativo) setErroProdutos(true);
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });
    return () => {
      ativo = false;
    };
  }, [
    item.setor,
    item.produto_id,
    item.produto_nome,
    item.rolos_por_plt,
    item.largura,
    item.embalagem_liquido,
    item.unidades_por_plt,
    item.semi_kg_por_unidade,
  ]);

  const produto = useMemo(() => {
    const atual = produtos.find((p) => p.id === produtoId);
    // O padrão novo do cadastro não converte apontamentos históricos de pouch.
    return item.setor === "liquidos" &&
      atual?.id === item.produto_id &&
      atual.embalagem_liquido === "unidade" &&
      item.embalagem_liquido === "unidade"
      ? { ...atual, unidades_por_plt: item.unidades_por_plt }
      : atual;
  }, [
    produtoId,
    produtos,
    item.setor,
    item.produto_id,
    item.embalagem_liquido,
    item.unidades_por_plt,
  ]);
  const metrosPorRolo = Number(produto?.metros_por_rolo ?? 10);
  const totalLiquido = calcularLiquidos(produto, quantidadeLiquido);
  const gruposValidos = grupos.every(
    (g) =>
      Number.isInteger(g.quantidadePlts) &&
      g.quantidadePlts >= 0 &&
      Number.isInteger(g.rolosPorPlt) &&
      g.rolosPorPlt > 0 &&
      (g.pltPicadoRolos == null ||
        (Number.isInteger(g.pltPicadoRolos) &&
          g.pltPicadoRolos > 0 &&
          g.pltPicadoRolos < g.rolosPorPlt)) &&
      (g.quantidadePlts > 0 || g.pltPicadoRolos != null),
  );
  const valido =
    !carregando &&
    !erroProdutos &&
    produtoId &&
    referencia.trim() &&
    motivo.trim().length >= 3 &&
    (item.setor === "corte"
      ? gruposValidos && totalPlts(grupos) <= 20 && totalRolos(grupos) > 0
      : item.setor === "liquidos"
        ? totalLiquido.valido
        : item.setor === "fitas"
          ? tempo > 0 && velocidade > 0 && largura > 0
          : Number.isInteger(quantidadePlts) &&
            quantidadePlts > 0 &&
            metragem > 0 &&
            Number.isInteger(metragem / metrosPorRolo));

  function atualizarGrupo(indice: number, dados: Partial<GrupoCorte>) {
    setGrupos((atuais) => atuais.map((g, i) => (i === indice ? { ...g, ...dados } : g)));
  }

  async function salvar() {
    if (!valido || salvando || bloquearSeOffline()) return;
    setSalvando(true);
    const dados: Json = {
      produto_id: produtoId,
      updated_at_anterior: item.updated_at,
      ...(item.setor === "corte"
        ? { op: referencia.trim(), grupos: grupos as unknown as Json }
        : item.setor === "liquidos"
          ? {
              op: referencia.trim(),
              quantidade_plts: totalLiquido.plts,
              picado_unidades: totalLiquido.picado,
              total_unidades: totalLiquido.unidades,
            }
          : item.setor === "fitas"
            ? { op: referencia.trim(), tempo, velocidade, largura }
            : { lote: referencia.trim(), quantidade_plts: quantidadePlts, metragem }),
    };
    try {
      const { error } = await supabase.rpc("corrigir_apontamento", {
        p_id: item.id,
        p_justificativa: motivo.trim(),
        p_dados: dados,
      });
      if (error) throw error;
      invalidarCache("painel:");
      toast.success(
        item.status === "lancado"
          ? "Correção salva. Confira o ajuste no Protheus e confirme o lançamento novamente."
          : "Apontamento corrigido. Responsável e motivo registrados.",
      );
      onClose();
      await onSaved();
    } catch (erro) {
      toast.error(
        erro instanceof Error
          ? erro.message
          : ((erro as { message?: string })?.message ?? "Não foi possível salvar a correção."),
      );
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(aberto) => {
        if (!aberto && !salvando) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto overscroll-contain rounded-2xl p-4 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Corrigir apontamento</DialogTitle>
          <DialogDescription>
            {item.status === "lancado"
              ? "Correção administrativa: ao salvar, o apontamento voltará para pendente. Corrija e confira também o lançamento no Protheus antes de confirmar novamente. O responsável e o motivo ficarão salvos."
              : "Revise os dados e informe o motivo. O apontador original será preservado, e o responsável pela correção ficará registrado."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="correcao-referencia">
              {item.setor === "mantas" ? "Lote" : "Número da OP"} *
            </Label>
            <Input
              id="correcao-referencia"
              className="h-12 text-base"
              value={referencia}
              onChange={(e) =>
                setReferencia(
                  item.setor === "mantas" ? e.target.value : e.target.value.replace(/\D/g, ""),
                )
              }
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="correcao-produto">Produto *</Label>
            <ProdutoSelect
              id="correcao-produto"
              produtos={produtos}
              value={produtoId}
              carregando={carregando}
              onValueChange={(id) => {
                setProdutoId(id);
                const escolhido = produtos.find((p) => p.id === id);
                if (item.setor === "fitas" && escolhido?.largura)
                  setLargura(Number(escolhido.largura));
                if (item.setor === "liquidos" && id !== produtoId)
                  setQuantidadeLiquido(quantidadeLiquidoInicial());
              }}
            />
          </div>
          {erroProdutos && (
            <p role="alert" className="text-sm text-destructive">
              Não foi possível carregar os produtos. Feche e tente novamente.
            </p>
          )}
          {item.setor === "corte" && (
            <>
              {grupos.map((grupo, indice) => (
                <div key={indice} className="space-y-3 rounded-xl border p-3">
                  {grupos.length > 1 && <p className="text-sm font-semibold">Grupo {indice + 1}</p>}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor={`correcao-plts-${indice}`}>PLTs fechados *</Label>
                      <Input
                        id={`correcao-plts-${indice}`}
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={20}
                        className="h-12 text-base"
                        value={grupo.quantidadePlts}
                        onChange={(e) =>
                          atualizarGrupo(indice, { quantidadePlts: Number(e.target.value) })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`correcao-rolos-${indice}`}>Rolos por PLT *</Label>
                      <Input
                        id={`correcao-rolos-${indice}`}
                        type="number"
                        inputMode="numeric"
                        min={1}
                        className="h-12 text-base"
                        value={grupo.rolosPorPlt}
                        onChange={(e) =>
                          atualizarGrupo(indice, { rolosPorPlt: Number(e.target.value) })
                        }
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`correcao-picado-${indice}`}>
                      Rolos do PLT picado (opcional)
                    </Label>
                    <Input
                      id={`correcao-picado-${indice}`}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={grupo.rolosPorPlt - 1}
                      className="h-12 text-base"
                      value={grupo.pltPicadoRolos ?? ""}
                      onChange={(e) =>
                        atualizarGrupo(indice, {
                          pltPicadoRolos: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                    />
                  </div>
                </div>
              ))}
              <p className="rounded-xl bg-muted p-3 text-sm font-semibold">
                {totalPlts(grupos)} PLTs fechados · {totalRolos(grupos).toLocaleString("pt-BR")}{" "}
                rolos
              </p>
            </>
          )}
          {item.setor === "liquidos" && produto && (
            <CamposLiquidos
              id="correcao-liquidos"
              produto={produto}
              quantidade={quantidadeLiquido}
              onChange={setQuantidadeLiquido}
            />
          )}
          {item.setor === "fitas" && (
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="correcao-tempo">Tempo (min)</Label>
                <Input
                  id="correcao-tempo"
                  type="number"
                  min={0.01}
                  step="any"
                  value={tempo}
                  onChange={(e) => setTempo(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="correcao-velocidade">Velocidade</Label>
                <Input
                  id="correcao-velocidade"
                  type="number"
                  min={0.01}
                  step="any"
                  value={velocidade}
                  onChange={(e) => setVelocidade(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="correcao-largura">Largura (m)</Label>
                <Input
                  id="correcao-largura"
                  type="number"
                  min={0.01}
                  step="any"
                  value={largura}
                  onChange={(e) => setLargura(Number(e.target.value))}
                />
              </div>
            </div>
          )}
          {item.setor === "mantas" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="correcao-plts">PLTs *</Label>
                <Input
                  id="correcao-plts"
                  type="number"
                  min={1}
                  inputMode="numeric"
                  className="h-12 text-base"
                  value={quantidadePlts}
                  onChange={(e) => setQuantidadePlts(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="correcao-metragem">Metragem (m) *</Label>
                <Input
                  id="correcao-metragem"
                  type="number"
                  min={metrosPorRolo}
                  step={metrosPorRolo}
                  inputMode="decimal"
                  className="h-12 text-base"
                  value={metragem}
                  onChange={(e) => setMetragem(Number(e.target.value))}
                />
              </div>
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="correcao-motivo">Motivo da correção *</Label>
            <Textarea
              id="correcao-motivo"
              className="min-h-24 text-base"
              value={motivo}
              maxLength={1000}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Explique o que estava errado e o que foi corrigido."
            />
          </div>
        </div>
        <DialogFooter className="sticky bottom-0 -mx-4 -mb-4 grid grid-cols-2 gap-2 border-t bg-background p-4">
          <Button variant="outline" className="h-12" disabled={salvando} onClick={onClose}>
            Cancelar
          </Button>
          <Button className="h-12" disabled={!valido || salvando} onClick={() => void salvar()}>
            {salvando ? "Salvando..." : "Salvar correção"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
