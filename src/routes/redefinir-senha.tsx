import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { KeyRound, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { DrykoLogo } from "@/components/dryko/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/redefinir-senha")({
  ssr: false,
  component: RedefinirSenha,
});

function RedefinirSenha() {
  const navigate = useNavigate();
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [pronto, setPronto] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let ativo = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!ativo) return;
      setPronto(Boolean(data.session));
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_evento, sessao) => {
      if (ativo && sessao) setPronto(true);
    });
    return () => {
      ativo = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (senha.length < 8) return toast.error("A senha deve ter pelo menos 8 caracteres.");
    if (senha !== confirmacao) return toast.error("A confirmação não corresponde à nova senha.");

    setSalvando(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    setSalvando(false);
    if (error) return toast.error(error.message || "Não foi possível redefinir a senha.");

    toast.success("Senha redefinida com sucesso.");
    await supabase.auth.signOut();
    void navigate({ to: "/auth", replace: true });
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10 text-foreground">
      <Card className="w-full max-w-sm border-border bg-card shadow-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3"><DrykoLogo size="lg" /></div>
          <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary"><KeyRound className="size-6" /></div>
          <CardTitle className="text-xl">Redefinir senha</CardTitle>
          <p className="text-sm text-muted-foreground">Crie uma nova senha pessoal para voltar a acessar o Aponta Produção.</p>
        </CardHeader>
        <CardContent>
          {!pronto ? (
            <div className="rounded-xl bg-muted p-4 text-center text-sm text-muted-foreground">Validando seu link de recuperação...</div>
          ) : (
            <form className="space-y-4" onSubmit={salvar}>
              <div className="space-y-1"><Label htmlFor="nova-senha">Nova senha</Label><Input id="nova-senha" type="password" autoComplete="new-password" minLength={8} className="h-12 text-base" value={senha} onChange={(e) => setSenha(e.target.value)} required /></div>
              <div className="space-y-1"><Label htmlFor="confirmar-senha">Confirmar nova senha</Label><Input id="confirmar-senha" type="password" autoComplete="new-password" minLength={8} className="h-12 text-base" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} required /></div>
              <Button type="submit" className="h-12 w-full text-base" disabled={salvando || senha.length < 8 || confirmacao.length < 8}>{salvando ? "Salvando..." : "Salvar nova senha"}</Button>
            </form>
          )}
          <div className="mt-4 flex items-start gap-2 rounded-lg bg-muted p-3 text-xs text-muted-foreground"><ShieldCheck className="mt-0.5 size-4 shrink-0" />Por segurança, o link de recuperação é de uso único.</div>
        </CardContent>
      </Card>
    </main>
  );
}
