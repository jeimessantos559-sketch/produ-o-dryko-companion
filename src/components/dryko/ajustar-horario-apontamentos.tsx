import { useState } from "react";
import { Clock } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { dataHoraProducaoFormatada } from "@/lib/producao";

type RegistroHorario = {
  id: string;
  produto_nome: string;
  op: string | null;
  lote: string | null;
  quantidade_plts: number | null;
  metragem: number | null;
  area_m2: number | null;
  data_hora_producao: string;
};

type Props = {
  registros: RegistroHorario[];
  setor: string;
  onAjustado: () => void;
};

const fmt = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

function paraInput(valor: string) {
  const m = valor.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
  return m ? `${m[1]}T${m[2]}` : "";
}

function resumo(r: RegistroHorario, setor: string) {
  if (setor === "corte") return `${fmt(r.quantidade_plts ?? 0)} PLTs`;
  if (setor === "fitas") return `${fmt(r.area_m2 ?? 0)} m²`;
  if (setor === "mantas") return `${fmt(r.metragem ?? 0)} m`;
  return "";
}

function mensagemErro(msg: string) {
  if (/permiss|ativo/i.test(msg)) return "Seu usuário não tem permissão para ajustar o horário.";
  if (/futuro/i.test(msg)) return "O horário não pode estar no futuro.";
  if (/turno/i.test(msg)) return "O horário informado não pertence ao turno do apontamento.";
  if (/data operacional/i.test(msg)) return "O ajuste deve permanecer na mesma data operacional.";
  return "Não foi possível ajustar o horário. Tente novamente.";
}

export function AjustarHorarioApontamentos({ registros, setor, onAjustado }: Props) {
  const [aberto, setAberto] = useState(false);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState<string | null>(null);

  async function salvar(r: RegistroHorario) {
    const novo = valores[r.id];
    if (!novo || novo === paraInput(r.data_hora_producao)) return;
    setSalvando(r.id);
    const { error } = await (supabase as any).rpc("ajustar_horario_apontamento", {
      p_id: r.id,
      p_data_hora: `${novo}:00`,
    });
    setSalvando(null);
    if (error) {
      toast.error(mensagemErro(error.message ?? ""));
      return;
    }
    toast.success("Horário ajustado");
    setValores((v) => {
      const { [r.id]: _, ...resto } = v;
      return resto;
    });
    onAjustado();
  }

  return (
    <>
      <div className="flex justify-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9 touch-manipulation gap-1.5 text-xs text-muted-foreground"
          onClick={() => setAberto(true)}
        >
          <Clock className="h-4 w-4" />
          Ajustar horário dos apontamentos
        </Button>
      </div>
      <Sheet open={aberto} onOpenChange={setAberto}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader className="text-left">
            <SheetTitle>Ajustar horário</SheetTitle>
            <SheetDescription>
              Altera apenas a data e hora do apontamento, dentro do mesmo turno.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-3 pb-4">
            {registros.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nenhum apontamento neste turno.
              </p>
            ) : (
              registros.map((r) => {
                const atual = paraInput(r.data_hora_producao);
                const valor = valores[r.id] ?? atual;
                const referencia = r.lote ? `Lote ${r.lote}` : r.op ? `OP ${r.op}` : null;
                return (
                  <div key={r.id} className="space-y-2 rounded-xl border border-border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold">{r.produto_nome}</p>
                        <p className="text-xs text-muted-foreground">
                          {[referencia, resumo(r, setor)].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs font-semibold tabular-nums">
                        {dataHoraProducaoFormatada(r.data_hora_producao)}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <Input
                        type="datetime-local"
                        step={60}
                        value={valor}
                        onChange={(e) => setValores((v) => ({ ...v, [r.id]: e.target.value }))}
                        className="h-12 flex-1 text-base"
                        aria-label={`Novo horário de ${r.produto_nome}`}
                      />
                      <Button
                        type="button"
                        className="h-12 touch-manipulation px-4"
                        disabled={salvando === r.id || !valor || valor === atual}
                        onClick={() => void salvar(r)}
                      >
                        {salvando === r.id ? "Salvando…" : "Salvar"}
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
