import { Calculator, PackageCheck, Target } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { HoraProducaoField } from "@/components/dryko/hora-producao-field";
import { ProdutoSelect } from "@/components/dryko/produto-select";
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
import { preencherLoteProgramacaoMantas, preencherReferenciaProgramacao } from "@/lib/programacao-lote";
import { areaFitas, dataHoraProducaoPadrao, dataOperacional, metragemCorte, rolosManta } from "@/lib/producao";
import {
  invalidarCacheProdutos,
  obterProdutosAtivos,
  type ProdutoCatalogo,
} from "@/lib/produtos-cache";

export { invalidarCacheProdutos };

type Produto = ProdutoCatalogo;

type MetaAtiva = {
  id: string;
  quantidade_meta: number;
  unidade: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void | Promise<void>;
  repeatLatest?: boolean;
};

export function ApontamentoRapido({ open, onOpenChange, onSaved, repeatLatest = false }: Props) {
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
  const [dataHoraProducao, setDataHoraProducao] = useState(dataHoraProducaoPadrao);
  const [meta, setMeta] = useState<MetaAtiva | null>(null);
  const [apontadoMeta, setApontadoMeta] = useState(0);
  const [metaNova, setMetaNova] = useState(0);
  const [carregandoMeta, setCarregandoMeta] = useState(false);
  const [programadoDia, setProgramadoDia] = useState<number | null>(null);

  const produto = useMemo(
    () => produtos.find((item) => item.id === produtoId) ?? null,
    [produtoId, produtos],
  );

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
    setDataHoraProducao(dataHoraProducaoPadrao());
    setMeta(null);
    setApontadoMeta(0);
    setMetaNova(0);
  }

  useEffect(() => {
    if (!open || !setor || !["corte", "fitas", "mantas"].includes(setor)) return;
    let ativo = true;
    setCarregando(true);
    limparFormulario();

    void obterProdutosAtivos(setor)
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
        if (setor === "corte") {
          setOp(data.op ?? "");
          const grupos = Array.isArray(data.grupos) ? data.grupos : [];
          const primeiro = (grupos[0] ?? {}) as {
            quantidadePlts?: number;
            rolosPorPlt?: number;
            pltPicadoRolos?: number | null;
            picadoAdicional?: boolean;
          };
          const qtdOriginal = Number(primeiro.quantidadePlts ?? data.quantidade_plts ?? 1);
          const picadoOriginal =
            primeiro.pltPicadoRolos == null ? null : Number(primeiro.pltPicadoRolos);
          const qtdFechados =
            picadoOriginal != null && primeiro.picadoAdicional !== true
              ? Math.max(0, qtdOriginal - 1)
              : Math.max(0, qtdOriginal);
          setQuantidadePlts(qtdFechados);
          setRolosPorPlt(Number(primeiro.rolosPorPlt ?? data.rolos_por_plt ?? 1));
          setPltPicado(picadoOriginal ?? "");
        } else if (setor === "fitas") {
          setOp(data.op ?? "");
          setTempo(Number(data.tempo ?? 60));
          setVelocidade(Number(data.velocidade ?? 25));
          setLargura(Number(data.largura ?? 0.93));
        } else {
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

  useEffect(() => {
    let ativo = true;
    let timer: number | undefined;

    if (!open || setor !== "corte" || !op.trim() || !produtoId) {
      setMeta(null);
      setApontadoMeta(0);
      setProgramadoDia(null);
      setCarregandoMeta(false);
      return () => {
        ativo = false;
      };
    }

    timer = window.setTimeout(() => {
      setCarregandoMeta(true);
      void (async () => {
        const dataDia = dataOperacional(turno);
        const opDigitada = op.trim();
        const { data: progs } = await supabase
          .from("programacao_producao")
          .select("quantidade_prevista, op")
          .eq("setor", "corte")
          .eq("data_local", dataDia)
          .eq("global_dia", true)
          .eq("produto_id", produtoId)
          .limit(5);
        if (!ativo) return;
        const listaProg = (progs ?? []) as { quantidade_prevista: number; op: string | null }[];
        const prog =
          listaProg.find((p) => (p.op ?? "").trim().toUpperCase() === opDigitada.toUpperCase()) ??
          listaProg.find((p) => !(p.op ?? "").trim()) ??
          null;
        if (prog) {
          const opProg = (prog.op ?? "").trim();
          let consultaDia = supabase
            .from("apontamentos")
            .select("quantidade_plts")
            .eq("setor", "corte")
            .eq("data_local", dataDia)
            .eq("produto_id", produtoId);
          if (opProg) consultaDia = consultaDia.eq("op", opProg);
          const { data: doDia } = await consultaDia;
          if (!ativo) return;
          setMeta(null);
          setProgramadoDia(Number(prog.quantidade_prevista));
          setApontadoMeta(
            (doDia ?? []).reduce((total, item) => total + Number(item.quantidade_plts ?? 0), 0),
          );
          return;
        }
        setProgramadoDia(null);
        const { data, error } = await supabase
          .from("metas_op")
          .select("id, quantidade_meta, unidade")
          .eq("setor", "corte")
          .eq("op", op.trim())
          .eq("produto_id", produtoId)
          .eq("status", "ativa")
          .maybeSingle();

        if (!ativo) return;
        if (error) {
          setMeta(null);
          setApontadoMeta(0);
          return;
        }

        const metaEncontrada = (data as MetaAtiva | null) ?? null;
        setMeta(metaEncontrada);
        if (!metaEncontrada) {
          setApontadoMeta(0);
          return;
        }

        const { data: registros } = await supabase
          .from("apontamentos")
          .select("quantidade_plts")
          .eq("setor", "corte")
          .eq("op", op.trim())
          .eq("produto_id", produtoId);
        if (!ativo) return;
        setApontadoMeta(
          (registros ?? []).reduce((total, item) => total + Number(item.quantidade_plts ?? 0), 0),
        );
      })().finally(() => {
        if (ativo) setCarregandoMeta(false);
      });
    }, 300);

    return () => {
      ativo = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [open, op, produtoId, setor, turno]);

  function selecionarProduto(id: string) {
    setProdutoId(id);
    setMetaNova(0);
    const escolhido = produtos.find((item) => item.id === id);
    if (!escolhido) return;

    if (setor === "corte") {
      setRolosPorPlt(escolhido.rolos_por_plt ?? 1);
      setPltPicado("");
      setQuantidadePlts(1);
    } else if (setor === "fitas") {
      setTempo(60);
      setVelocidade(25);
      setLargura(Number(escolhido.largura ?? 0.93));
    } else if (setor === "mantas") {
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
    if (setor !== "corte" || !produto || rolosPorPlt <= 0 || quantidadePlts < 0) return 0;
    const picado = typeof pltPicado === "number" ? pltPicado : 0;
    return quantidadePlts * rolosPorPlt + picado;
  }, [setor, produto, rolosPorPlt, quantidadePlts, pltPicado]);

  const metragemCorteCalculada =
    setor === "corte" && produto?.largura
      ? metragemCorte(Number(produto.largura), totalRolosCorte)
      : null;
  const areaFitasCalculada = setor === "fitas" ? areaFitas(tempo, velocidade, largura) : 0;
  const totalRolosManta =
    setor === "mantas" && produto
      ? rolosManta(metragemManta, Number(produto.metros_por_rolo ?? 10))
      : 0;
  const mantaRolosValidos = totalRolosManta > 0 && Number.isInteger(totalRolosManta);

  const valido = Boolean(
    user &&
      turno &&
      produto &&
      dataHoraProducao &&
      ((setor === "corte" &&
        op.trim() &&
        Number.isInteger(quantidadePlts) &&
        quantidadePlts >= 0 &&
        quantidadePlts <= 20 &&
        rolosPorPlt > 0 &&
        totalRolosCorte > 0 &&
        (pltPicado === "" || (pltPicado > 0 && pltPicado < rolosPorPlt)) &&
        (quantidadePlts > 0 || pltPicado !== "")) ||
        (setor === "fitas" && op.trim() && tempo > 0 && velocidade > 0 && largura > 0) ||
        (setor === "mantas" &&
          lote.trim() &&
          Number.isInteger(quantidadePlts) &&
          quantidadePlts > 0 &&
          metragemManta > 0 &&
          mantaRolosValidos)),
  );

  function confirmarMetaCorte() {
    if (setor !== "corte") return true;
    const limite =
      programadoDia != null ? programadoDia : meta ? Number(meta.quantidade_meta) : Number(metaNova || 0);
    if (limite <= 0 || apontadoMeta + quantidadePlts <= limite) return true;
    const excesso = apontadoMeta + quantidadePlts - limite;
    if (programadoDia != null) {
      return window.confirm(
        `Programado no dia: ${limite.toLocaleString("pt-BR")} PLTs. Este apontamento deixará o dia com ${(apontadoMeta + quantidadePlts).toLocaleString("pt-BR")} PLTs, ultrapassando o saldo em ${excesso.toLocaleString("pt-BR")} PLT(s). Deseja continuar?`,
      );
    }
    return window.confirm(
      `A meta é ${limite.toLocaleString("pt-BR")} PLTs. Este apontamento deixará a OP com ${(apontadoMeta + quantidadePlts).toLocaleString("pt-BR")} PLTs, ultrapassando a meta em ${excesso.toLocaleString("pt-BR")} PLT(s). Deseja continuar?`,
    );
  }

  async function salvarMetaCorte() {
    if (setor !== "corte" || !user || !produto || meta || programadoDia != null || metaNova <= 0) return;
    const { error } = await supabase.from("metas_op").insert({
      setor: "corte",
      op: op.trim(),
      produto_id: produto.id,
      produto_nome: produto.nome,
      unidade: "PLTs",
      quantidade_meta: metaNova,
      criado_por: user.id,
    });
    if (error && error.code !== "23505") {
      toast.warning("O apontamento foi salvo, mas a meta da OP não pôde ser cadastrada.");
    }
  }

  async function salvar() {
    if (!valido || !user || !turno || !produto || salvando) return;
    if (!confirmarMetaCorte()) return;
    setSalvando(true);

    try {
      if (setor === "corte") {
        const { data: salvoCorte, error } = await supabase.from("apontamentos").insert({
          usuario_id: user.id,
          setor: "corte",
          turno,
          data_hora_producao: dataHoraProducao,
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
              picadoAdicional: true,
            },
          ],
        }).select("data_local").single();
        if (error) throw error;
        void preencherReferenciaProgramacao({
          setor: "corte",
          dataLocal: (salvoCorte as { data_local?: string } | null)?.data_local ?? dataOperacional(turno),
          produtoId: produto.id,
          referencia: op,
        });
        await salvarMetaCorte();
        toast.success(
          quantidadePlts === 0
            ? "PLT picado registrado sem contabilizar pallet fechado."
            : "Apontamento de Corte salvo.",
        );
      } else if (setor === "fitas") {
        const { data: salvoFitas, error } = await supabase.from("apontamentos").insert({
          usuario_id: user.id,
          setor: "fitas",
          turno,
          data_hora_producao: dataHoraProducao,
          op: op.trim(),
          produto_id: produto.id,
          produto_nome: produto.nome,
          tempo,
          velocidade,
          largura,
          area_m2: areaFitasCalculada,
        }).select("data_local").single();
        if (error) throw error;
        void preencherReferenciaProgramacao({
          setor: "fitas",
          dataLocal: (salvoFitas as { data_local?: string } | null)?.data_local ?? dataOperacional(turno),
          produtoId: produto.id,
          referencia: op,
        });
        toast.success("Apontamento de Fitas salvo.");
      } else if (setor === "mantas") {
        const { data: salvoManta, error } = await supabase.from("apontamentos").insert({
          usuario_id: user.id,
          setor: "mantas",
          turno,
          data_hora_producao: dataHoraProducao,
          op: null,
          lote: lote.trim(),
          produto_id: produto.id,
          produto_nome: produto.nome,
          quantidade_plts: quantidadePlts,
          rolos_por_plt: produto.rolos_por_plt,
          total_rolos: totalRolosManta,
          metragem: metragemManta,
        }).select("data_local").single();
        if (error) throw error;
        toast.success("Apontamento de Mantas salvo.");
        void preencherLoteProgramacaoMantas({
          dataLocal: (salvoManta as { data_local?: string } | null)?.data_local ?? dataOperacional(turno),
          produtoId: produto.id,
          lote,
        });
      }

      onOpenChange(false);
      await onSaved?.();
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : "";
      toast.error(mensagemErroApontamento(mensagem));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94dvh] overscroll-contain overflow-y-auto rounded-2xl p-4 sm:max-w-xl sm:p-5">
        <DialogHeader className="space-y-1 pr-7">
          <DialogTitle className="text-xl">
            {repeatLatest ? "Repetir último apontamento" : "Novo apontamento"}
            {setor ? ` · ${nomeSetorRapido(setor)}` : ""}
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            {repeatLatest
              ? "Revise os dados copiados antes de confirmar."
              : "Registro rápido sem sair do painel."}
          </DialogDescription>
        </DialogHeader>

        {!setor || !["corte", "fitas", "mantas"].includes(setor) ? (
          <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
            Este setor ainda não possui formulário rápido configurado.
          </div>
        ) : (
          <div className="space-y-3">
            <HoraProducaoField
              id="rapido-hora-producao"
              value={dataHoraProducao}
              onChange={setDataHoraProducao}
              compact
            />

            {setor !== "mantas" && (
              <div className="space-y-1">
                <Label htmlFor="rapido-op">OP *</Label>
                <Input
                  id="rapido-op"
                  inputMode="numeric"
                  className="h-11 text-base"
                  value={op}
                  onChange={(event) => setOp(event.target.value.replace(/\D/g, ""))}
                  placeholder="Ex.: 169813"
                />
              </div>
            )}

            <div className="space-y-1">
              <Label htmlFor="rapido-produto">Produto *</Label>
              <ProdutoSelect
                id="rapido-produto"
                produtos={produtos}
                value={produtoId}
                onValueChange={selecionarProduto}
                carregando={carregando}
              />
            </div>

            {setor === "corte" && produto && (
              <>
                <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-xl bg-slate-100 px-3 py-2 text-xs text-slate-700">
                  <span>
                    Padrão: <strong>{produto.rolos_por_plt} rolos/PLT</strong>
                  </span>
                  <span>
                    Largura:{" "}
                    <strong>
                      {produto.largura == null
                        ? "não informada"
                        : `${Number(produto.largura).toLocaleString("pt-BR")} cm`}
                    </strong>
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="rapido-plts">Quantidade de PLTs</Label>
                    <select
                      id="rapido-plts"
                      className="h-11 w-full touch-manipulation rounded-xl border border-input bg-background px-3 text-base"
                      value={quantidadePlts}
                      onChange={(event) => {
                        const valor = Number(event.target.value);
                        setQuantidadePlts(valor);
                        if (valor === 0 && pltPicado === "") setPltPicado(1);
                      }}
                    >
                      <option value={0}>− PLT picado</option>
                      {Array.from({ length: 20 }, (_, indice) => indice + 1).map((quantidade) => (
                        <option key={quantidade} value={quantidade}>
                          {quantidade} {quantidade === 1 ? "PLT" : "PLTs"}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="rapido-rolos">Rolos/PLT</Label>
                    <Input
                      id="rapido-rolos"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      className="h-11 text-base"
                      value={rolosPorPlt}
                      onChange={(event) => setRolosPorPlt(Number(event.target.value))}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="rapido-picado">
                    {quantidadePlts === 0
                      ? "Rolos do PLT picado *"
                      : "PLT picado adicional (opcional)"}
                  </Label>
                  <Input
                    id="rapido-picado"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={Math.max(1, rolosPorPlt - 1)}
                    className="h-11 text-base"
                    placeholder={
                      quantidadePlts === 0 ? "Informe os rolos" : "Deixe vazio se não houver"
                    }
                    value={pltPicado}
                    onChange={(event) =>
                      setPltPicado(event.target.value ? Number(event.target.value) : "")
                    }
                  />
                  {quantidadePlts === 0 && (
                    <p className="text-xs text-amber-700">
                      O picado entra em rolos e metragem, mas contabiliza <strong>0 PLT fechado</strong>.
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-slate-950 p-2.5 text-center text-white">
                  <Resumo label="PLTs fechados" valor={quantidadePlts} />
                  <Resumo label="Rolos" valor={totalRolosCorte.toLocaleString("pt-BR")} />
                  <Resumo
                    label="Metragem"
                    valor={`${Number(metragemCorteCalculada ?? 0).toLocaleString("pt-BR", {
                      maximumFractionDigits: 2,
                    })} m²`}
                  />
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="flex items-center gap-2">
                    <Target className="size-4 text-primary" />
                    <p className="text-sm font-semibold">{programadoDia != null ? "Programação do dia" : "Meta da OP"}</p>
                  </div>
                  {carregandoMeta ? (
                    <p className="mt-1 text-xs text-slate-500">Consultando programação...</p>
                  ) : programadoDia != null ? (
                    <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="rounded-lg bg-muted p-2"><p className="text-muted-foreground">Programado no dia</p><p className="text-base font-bold">{programadoDia} PLTs</p></div>
                      <div className="rounded-lg bg-muted p-2"><p className="text-muted-foreground">Produzido no dia</p><p className="text-base font-bold">{apontadoMeta} PLTs</p></div>
                      <div className="rounded-lg bg-primary/10 p-2"><p className="text-muted-foreground">Saldo para finalizar</p><p className="text-base font-bold text-primary">{Math.max(0, programadoDia - apontadoMeta)} PLTs</p></div>
                    </div>
                  ) : meta ? (
                    <div className="mt-1 flex items-center justify-between gap-3 text-sm">
                      <span>
                        <strong>{apontadoMeta}</strong> / {Number(meta.quantidade_meta)} PLTs
                      </span>
                      <span className="text-xs text-slate-500">
                        restam {Math.max(0, Number(meta.quantidade_meta) - apontadoMeta)}
                      </span>
                    </div>
                  ) : (
                    <div className="mt-2">
                      <Label htmlFor="rapido-meta" className="text-xs">
                        Definir meta nesta primeira produção (opcional)
                      </Label>
                      <Input
                        id="rapido-meta"
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={9999}
                        className="mt-1 h-10"
                        value={metaNova || ""}
                        onChange={(event) => setMetaNova(Number(event.target.value))}
                        placeholder="Ex.: 5 PLTs"
                      />
                    </div>
                  )}
                </div>
              </>
            )}

            {setor === "fitas" && produto && (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="rapido-tempo" className="text-xs">Tempo (min)</Label>
                    <Input id="rapido-tempo" type="number" inputMode="numeric" min={1} className="h-11 text-base" value={tempo} onChange={(event) => setTempo(Number(event.target.value))} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="rapido-velocidade" className="text-xs">Velocidade</Label>
                    <Input id="rapido-velocidade" type="number" inputMode="decimal" min={0.01} step="0.01" className="h-11 text-base" value={velocidade} onChange={(event) => setVelocidade(Number(event.target.value))} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="rapido-largura" className="text-xs">Largura (m)</Label>
                    <Input id="rapido-largura" type="number" inputMode="decimal" min={0.01} step="0.01" className="h-11 text-base" value={largura} onChange={(event) => setLargura(Number(event.target.value))} />
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-xl border-2 border-primary/25 bg-primary/5 p-3">
                  <Calculator className="size-6 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Metragem para lançar no Protheus</p>
                    <p className="text-3xl font-extrabold leading-none text-slate-950">{areaFitasCalculada.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m²</p>
                    <p className="mt-1 text-xs text-slate-500">{tempo} min × {velocidade} m/min × {largura} m</p>
                  </div>
                </div>
              </>
            )}

            {setor === "mantas" && produto && (
              <>
                <div className="space-y-1">
                  <Label htmlFor="rapido-lote">Lote *</Label>
                  <Input id="rapido-lote" className="h-11 text-base" value={lote} onChange={(event) => setLote(event.target.value)} placeholder="Informe o lote" />
                  <p className="text-[11px] text-slate-500">Em Mantas o lote é o identificador do lançamento; não é necessário informar OP.</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="rapido-plts-manta">PLTs</Label>
                    <select id="rapido-plts-manta" className="h-11 w-full touch-manipulation rounded-xl border border-input bg-background px-3 text-base" value={quantidadePlts} onChange={(event) => alterarPltsManta(Number(event.target.value))}>
                      {Array.from({ length: 20 }, (_, indice) => indice + 1).map((quantidade) => (
                        <option key={quantidade} value={quantidade}>{quantidade} {quantidade === 1 ? "PLT" : "PLTs"}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="rapido-metragem-manta">Metragem (m)</Label>
                    <Input id="rapido-metragem-manta" type="number" inputMode="decimal" min={1} step={produto.metros_por_rolo ?? 10} className="h-11 text-base" value={metragemManta || ""} onChange={(event) => setMetragemManta(Number(event.target.value))} />
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-xl border-2 border-primary/25 bg-primary/5 p-3">
                  <PackageCheck className="size-6 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Metragem para lançar no Protheus</p>
                    <p className="text-3xl font-extrabold leading-none text-slate-950">{metragemManta.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m</p>
                    <p className="mt-1 text-xs text-slate-500">Lote {lote || "—"} · {quantidadePlts} PLT(s) · {totalRolosManta.toLocaleString("pt-BR")} rolos</p>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        <DialogFooter className="sticky bottom-0 z-10 -mx-4 -mb-4 mt-1 grid grid-cols-[auto_1fr] gap-2 border-t border-border bg-background/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur sm:static sm:m-0 sm:flex sm:border-0 sm:bg-transparent sm:p-0">
          <Button type="button" variant="outline" className="h-11 touch-manipulation" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" className="h-11 touch-manipulation" disabled={!valido || salvando} onClick={salvar}>
            {salvando ? "Salvando..." : "Registrar apontamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Resumo({ label, valor }: { label: string; valor: string | number }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[9px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
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

function mensagemErroApontamento(mensagem: string) {
  const normalizada = mensagem.toLocaleLowerCase("pt-BR");
  if (normalizada.includes("turno") && normalizada.includes("fechado"))
    return "Este turno está fechado. Peça a reabertura ao administrador.";
  if (normalizada.includes("horario") && normalizada.includes("turno"))
    return "A hora real informada não pertence ao turno selecionado.";
  if (normalizada.includes("futuro"))
    return "A hora real da produção não pode estar no futuro.";
  return mensagem || "Não foi possível salvar o apontamento. Revise os dados e tente novamente.";
}
