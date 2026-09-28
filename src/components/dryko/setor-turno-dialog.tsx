import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type SetorCodigo, type TurnoCodigo } from "@/lib/auth";

type Setor = {
  codigo: SetorCodigo;
  nome: string;
  ordem: number;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function SetorTurnoDialog({ open, onOpenChange }: Props) {
  const { user, profile, refresh } = useAuth();
  const [setores, setSetores] = useState<Setor[]>([]);
  const [setor, setSetor] = useState<SetorCodigo | null>(null);
  const [turno, setTurno] = useState<TurnoCodigo | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSetor(profile?.setor_atual ?? null);
    setTurno(profile?.turno_atual ?? null);
    if (setores.length > 0) return;

    setCarregando(true);
    void supabase
      .from("setores")
      .select("codigo, nome, ordem")
      .order("ordem")
      .then(({ data, error }) => {
        setCarregando(false);
        if (error) {
          toast.error("Não foi possível carregar os setores.");
          return;
        }
        setSetores((data ?? []) as Setor[]);
      });
  }, [open, profile?.setor_atual, profile?.turno_atual, setores.length]);

  async function salvar() {
    if (!user || !setor || !turno || salvando) return;
    setSalvando(true);
    const { error } = await supabase
      .from("profiles")
      .update({ setor_atual: setor, turno_atual: turno, onboarding_concluido: true })
      .eq("id", user.id);
    setSalvando(false);

    if (error) {
      toast.error("Não foi possível salvar. Tente novamente.");
      return;
    }

    await refresh();
    toast.success("Setor e turno atualizados.");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-24px)] max-w-md rounded-2xl p-4 sm:p-5">
        <DialogHeader className="pr-7 text-left">
          <DialogTitle>Setor e turno</DialogTitle>
          <DialogDescription>
            Altere somente quando precisar trocar sua área ou turno.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="setor-dialog-select"
              className="text-xs font-bold uppercase tracking-wide text-muted-foreground"
            >
              Setor
            </label>
            <select
              id="setor-dialog-select"
              className="h-12 w-full rounded-xl border border-input bg-background px-3 text-base font-semibold text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
              value={setor ?? ""}
              onChange={(event) => setSetor(event.target.value as SetorCodigo)}
              disabled={carregando}
            >
              <option value="">{carregando ? "Carregando..." : "Selecione o setor"}</option>
              {setores.map((item) => (
                <option key={item.codigo} value={item.codigo}>
                  {item.nome}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Turno</p>
            <div className="grid grid-cols-3 gap-2">
              {(["T1", "T2", "T3"] as const).map((item, indice) => {
                const ativo = turno === item;
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setTurno(item)}
                    className={`flex h-12 items-center justify-center gap-1 rounded-xl border text-sm font-bold transition ${
                      ativo
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-muted/40 text-foreground"
                    }`}
                  >
                    {ativo && <Check className="size-4" />}
                    {indice + 1}º turno
                  </button>
                );
              })}
            </div>
          </div>

          <Button
            className="h-12 w-full rounded-xl text-base font-bold"
            disabled={!setor || !turno || salvando}
            onClick={() => void salvar()}
          >
            {salvando ? "Salvando..." : "Salvar alteração"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
