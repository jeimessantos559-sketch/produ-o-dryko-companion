import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { DrykoLogo } from "@/components/dryko/logo";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type SetorCodigo, type TurnoCodigo } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/selecionar")({ component: Selecionar });

type Setor = { codigo: SetorCodigo; nome: string; ordem: number; regras_definidas: boolean };

function Selecionar() {
  const navigate = useNavigate();
  const { user, profile, refresh } = useAuth();
  const [setores, setSetores] = useState<Setor[]>([]);
  const [setor, setSetor] = useState<SetorCodigo | null>(null);
  const [turno, setTurno] = useState<TurnoCodigo | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    void supabase
      .from("setores")
      .select("codigo, nome, ordem, regras_definidas")
      .order("ordem")
      .then(({ data }) => {
        setSetores(data ?? []);
        setCarregando(false);
      });
  }, []);

  useEffect(() => {
    if (profile?.setor_atual) setSetor(profile.setor_atual);
    if (profile?.turno_atual) setTurno(profile.turno_atual);
  }, [profile]);

  async function salvar() {
    if (!user || !setor || !turno || salvando) return;
    setSalvando(true);

    const { error } = await supabase
      .from("profiles")
      .update({ setor_atual: setor, turno_atual: turno, onboarding_concluido: true })
      .eq("id", user.id);

    if (error) {
      setSalvando(false);
      toast.error("Não foi possível salvar. Tente novamente.");
      return;
    }

    try {
      await refresh();
      toast.success("Setor e turno salvos.");
      await navigate({ to: "/painel", replace: true });
    } catch {
      setSalvando(false);
      toast.error("Setor e turno foram salvos, mas não foi possível abrir o painel. Tente novamente.");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-6">
      <div className="w-full max-w-md">
        <div className="mb-4 flex flex-col items-center">
          <DrykoLogo size="sm" />
          <h1 className="mt-3 text-xl font-extrabold">Setor e turno</h1>
          <p className="mt-1 text-center text-xs text-slate-500">
            {profile?.onboarding_concluido
              ? "Altere somente quando precisar trocar sua área ou turno."
              : "Escolha uma vez. Depois o sistema entra direto no seu painel."}
          </p>
        </div>

        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="space-y-1.5">
            <label htmlFor="setor-select" className="text-xs font-bold uppercase tracking-wide text-slate-500">Setor</label>
            <select
              id="setor-select"
              className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-base font-semibold outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
              value={setor ?? ""}
              onChange={(e) => setSetor(e.target.value as SetorCodigo)}
              disabled={carregando || salvando}
            >
              <option value="">{carregando ? "Carregando..." : "Selecione o setor"}</option>
              {setores.map((item) => <option key={item.codigo} value={item.codigo}>{item.nome}</option>)}
            </select>
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Turno</p>
            <div className="grid grid-cols-3 gap-2">
              {(["T1", "T2", "T3"] as const).map((item, indice) => {
                const ativo = turno === item;
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setTurno(item)}
                    disabled={salvando}
                    className={`flex h-12 items-center justify-center gap-1 rounded-xl border text-sm font-bold transition ${ativo ? "border-primary bg-primary text-white" : "border-slate-200 bg-slate-50 text-slate-700"}`}
                  >
                    {ativo && <Check className="size-4" />}{indice + 1}º turno
                  </button>
                );
              })}
            </div>
          </div>

          <Button className="h-12 w-full rounded-xl text-base font-bold" disabled={!setor || !turno || salvando} onClick={salvar}>
            {salvando ? "Salvando e abrindo painel..." : profile?.onboarding_concluido ? "Salvar alteração" : "Continuar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
