import { useState } from "react";
import { Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import {
  GRUPOS_OCORRENCIAS,
  SITUACOES_OCORRENCIA,
  rotuloSituacao,
  usaOcorrenciasEstruturadas,
  type OcorrenciaOperacional,
  type TipoStatusOcorrencia,
} from "@/lib/ocorrencias-operacionais";

type Props = {
  setor: string;
  turno: string;
  dataLocal: string;
  userId: string | undefined;
  ocorrencias: OcorrenciaOperacional[];
  onChange: (lista: OcorrenciaOperacional[]) => void;
  permitirExcluir?: boolean;
};

const CAMPOS = "id, equipamento, tipo_status, mensagem, created_at";
const classeCampo =
  "h-12 w-full rounded-xl border border-input bg-background px-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

function hora(valor: string) {
  const d = new Date(valor);
  return Number.isNaN(d.getTime())
    ? "—"
    : new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(d);
}

export function OcorrenciasOperacionaisForm({
  setor,
  turno,
  dataLocal,
  userId,
  ocorrencias,
  onChange,
  permitirExcluir = false,
}: Props) {
  const [equipamento, setEquipamento] = useState("");
  const [situacao, setSituacao] = useState<TipoStatusOcorrencia | "">("");
  const [descricao, setDescricao] = useState("");
  const [salvando, setSalvando] = useState(false);

  const estruturado = usaOcorrenciasEstruturadas(setor);
  const precisaDescricao = !estruturado || situacao === "ocorrencia";
  const valido = estruturado
    ? !!equipamento && !!situacao && (!precisaDescricao || descricao.trim().length > 0)
    : descricao.trim().length > 0;

  async function salvarLivre() {
    if (!userId || !valido || salvando) return;
    setSalvando(true);
    const { data, error } = await (supabase as any)
      .from("ocorrencias_turno")
      .insert({ setor, turno, data_local: dataLocal, equipamento: null, tipo_status: "ocorrencia", mensagem: descricao.trim(), criado_por: userId })
      .select(CAMPOS)
      .single();
    setSalvando(false);
    if (error || !data) {
      toast.error("Não foi possível salvar a ocorrência. Tente novamente.");
      return;
    }
    onChange([...ocorrencias, data as OcorrenciaOperacional]);
    setDescricao("");
    toast.success("Ocorrência registrada.");
  }

  async function salvar() {
    if (!estruturado) return salvarLivre();
    if (!userId || !valido || salvando || !situacao) return;
    const mensagem = precisaDescricao ? descricao.trim() : rotuloSituacao(situacao);
    setSalvando(true);
    let base = ocorrencias;
    if (!precisaDescricao) {
      // Status simples substitui o status simples anterior do mesmo equipamento.
      const anteriores = ocorrencias.filter(
        (o) => o.equipamento === equipamento && o.tipo_status && o.tipo_status !== "ocorrencia",
      );
      if (anteriores.length) {
        const { error } = await (supabase as any)
          .from("ocorrencias_turno")
          .delete()
          .in("id", anteriores.map((o) => o.id));
        if (!error) base = ocorrencias.filter((o) => !anteriores.includes(o));
      }
    }
    const { data, error } = await (supabase as any)
      .from("ocorrencias_turno")
      .insert({
        setor,
        turno,
        data_local: dataLocal,
        equipamento,
        tipo_status: situacao,
        mensagem,
        criado_por: userId,
      })
      .select(CAMPOS)
      .single();
    setSalvando(false);
    if (error || !data) {
      toast.error("Não foi possível salvar a ocorrência. Tente novamente.");
      return;
    }
    onChange([...base, data as OcorrenciaOperacional]);
    setDescricao("");
    setSituacao("");
    toast.success("Ocorrência registrada.");
  }

  async function excluir(id: string) {
    const { error } = await (supabase as any).from("ocorrencias_turno").delete().eq("id", id);
    if (error) {
      toast.error("Não foi possível excluir a ocorrência.");
      return;
    }
    onChange(ocorrencias.filter((o) => o.id !== id));
  }

  return (
    <div className="space-y-3">
      {estruturado && (
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="oc-equip">Equipamento</Label>
          <select id="oc-equip" className={classeCampo} value={equipamento} onChange={(e) => setEquipamento(e.target.value)}>
            <option value="">Selecione…</option>
            {GRUPOS_OCORRENCIAS.map((g) => (
              <optgroup key={g.titulo} label={g.titulo}>
                {g.equipamentos.map((eq) => (
                  <option key={eq} value={eq}>
                    {eq}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="oc-sit">Situação</Label>
          <select
            id="oc-sit"
            className={classeCampo}
            value={situacao}
            onChange={(e) => setSituacao(e.target.value as TipoStatusOcorrencia | "")}
          >
            <option value="">Selecione…</option>
            {SITUACOES_OCORRENCIA.map((s) => (
              <option key={s.valor} value={s.valor}>
                {s.rotulo}
              </option>
            ))}
          </select>
        </div>
      </div>
      )}
      {precisaDescricao && (
        <div className="space-y-1">
          <Label htmlFor="oc-desc">{estruturado ? "Descrição do problema" : "Ocorrência"}</Label>
          <textarea
            id="oc-desc"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            maxLength={1500}
            rows={3}
            placeholder="Descreva o problema…"
            className="w-full resize-y rounded-xl border border-input bg-background px-3 py-2 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
      )}
      <Button className="h-12 w-full touch-manipulation" disabled={!valido || salvando} onClick={() => void salvar()}>
        <Save className="size-4" />
        {salvando ? "Salvando..." : "Registrar"}
      </Button>

      {ocorrencias.length > 0 && (
        <div className="space-y-2">
          {ocorrencias.map((item) => {
            const tipo = item.tipo_status ?? "ocorrencia";
            return (
              <div key={item.id} className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-primary">
                    {hora(item.created_at)} · {item.equipamento ?? "Ocorrência geral"}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">
                    {tipo === "ocorrencia" ? item.mensagem : rotuloSituacao(tipo)}
                  </p>
                </div>
                {permitirExcluir && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-9 shrink-0 text-destructive"
                    onClick={() => void excluir(item.id)}
                    aria-label="Excluir ocorrência"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
