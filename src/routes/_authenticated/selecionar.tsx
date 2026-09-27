import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { DrykoLogo } from "@/components/dryko/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type SetorCodigo, type TurnoCodigo } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/selecionar")({
  component: Selecionar,
});

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
    if (!user || !setor || !turno) return;
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
    toast.success("Setor e turno salvos.");
    void navigate({ to: "/painel", replace: true });
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-4 py-8">
      <div className="mb-6 flex flex-col items-center">
        <DrykoLogo />
        <h1 className="mt-3 text-center text-xl font-bold">Escolha o setor e o turno</h1>
        <p className="mt-1 text-center text-sm text-muted-foreground">
          Fica salvo no seu perfil e pode ser trocado quando precisar.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Setor</CardTitle>
        </CardHeader>
        <CardContent>
          {carregando ? (
            <p className="text-sm text-muted-foreground">Carregando setores...</p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {setores.map((s) => (
                <button
                  key={s.codigo}
                  type="button"
                  onClick={() => setSetor(s.codigo)}
                  className={`min-h-16 rounded-xl border-2 p-3 text-left text-base font-semibold transition-colors ${
                    setor === s.codigo
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card hover:bg-accent"
                  }`}
                >
                  {s.nome}
                  {!s.regras_definidas && (
                    <span className="block text-xs font-normal text-muted-foreground">
                      regras aguardando definição
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">Turno</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            {(["T1", "T2", "T3"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTurno(t)}
                className={`min-h-16 rounded-xl border-2 text-lg font-bold transition-colors ${
                  turno === t
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card hover:bg-accent"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Horários dos turnos: aguardando definição.
          </p>
        </CardContent>
      </Card>

      <Button
        className="mt-6 h-14 w-full text-base"
        disabled={!setor || !turno || salvando}
        onClick={salvar}
      >
        {salvando ? "Salvando..." : "Confirmar e continuar"}
      </Button>
    </div>
  );
}
