import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { KeyRound, Mail, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { DrykoLogo } from "@/components/dryko/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/alterar-senha")({ ssr: false, component: AlterarSenha });

function AlterarSenha() {
  const navigate = useNavigate();
  const { profile, refresh } = useAuth();
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [email, setEmail] = useState("");
  const [confirmarEmail, setConfirmarEmail] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data, error }) => {
      if (error || !data.user) void navigate({ to: "/auth", replace: true });
    });
  }, [navigate]);

  async function salvar(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const emailNormalizado = email.trim().toLowerCase();
    if (novaSenha.length < 8) { toast.error("A nova senha deve ter pelo menos 8 caracteres."); return; }
    if (novaSenha !== confirmacao) { toast.error("A confirmação não corresponde à nova senha."); return; }
    if (!/^\S+@\S+\.\S+$/.test(emailNormalizado)) { toast.error("Informe um e-mail válido para recuperação."); return; }
    if (emailNormalizado !== confirmarEmail.trim().toLowerCase()) { toast.error("A confirmação do e-mail não corresponde."); return; }

    setSalvando(true);
    try {
      const { error: erroSenha } = await supabase.auth.updateUser({ password: novaSenha });
      if (erroSenha) throw erroSenha;

      const { error: erroPerfil } = await (supabase as any).rpc("concluir_primeiro_acesso", {
        p_email: emailNormalizado,
      });
      if (erroPerfil) throw erroPerfil;

      await refresh();
      toast.success("Senha pessoal e e-mail de recuperação cadastrados.");
      void navigate({ to: profile?.onboarding_concluido ? "/painel" : "/selecionar", replace: true });
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível concluir o primeiro acesso.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10 text-foreground">
      <Card className="w-full max-w-md border-border bg-card shadow-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3"><DrykoLogo size="lg" /></div>
          <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary"><KeyRound className="size-6" /></div>
          <p className="text-xs font-bold uppercase tracking-widest text-primary">Primeiro acesso</p>
          <CardTitle className="text-xl">Crie sua senha pessoal</CardTitle>
          <p className="text-sm text-muted-foreground">Olá, {profile?.nome || "usuário"}. Crie sua senha e cadastre um e-mail para recuperar o acesso caso precise.</p>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={salvar}>
            <div className="space-y-1"><Label htmlFor="nova-senha">Nova senha</Label><Input id="nova-senha" type="password" autoComplete="new-password" minLength={8} className="h-12 text-base" value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} required /><p className="text-xs text-muted-foreground">Use pelo menos 8 caracteres.</p></div>
            <div className="space-y-1"><Label htmlFor="confirmar-senha">Confirmar nova senha</Label><Input id="confirmar-senha" type="password" autoComplete="new-password" minLength={8} className="h-12 text-base" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} required /></div>
            <div className="space-y-1"><Label htmlFor="email-recuperacao">E-mail de recuperação</Label><div className="relative"><Mail className="absolute left-3 top-3.5 size-4 text-muted-foreground" /><Input id="email-recuperacao" type="email" autoComplete="email" className="h-12 pl-10 text-base" placeholder="seuemail@exemplo.com" value={email} onChange={(e) => setEmail(e.target.value)} required /></div></div>
            <div className="space-y-1"><Label htmlFor="confirmar-email">Confirmar e-mail</Label><Input id="confirmar-email" type="email" autoComplete="email" className="h-12 text-base" value={confirmarEmail} onChange={(e) => setConfirmarEmail(e.target.value)} required /></div>
            <Button type="submit" className="h-12 w-full text-base" disabled={salvando || novaSenha.length < 8 || confirmacao.length < 8 || !email || !confirmarEmail}>{salvando ? "Salvando..." : "Salvar e continuar"}</Button>
          </form>
          <div className="mt-4 flex items-start gap-2 rounded-lg bg-muted p-3 text-xs text-muted-foreground"><ShieldCheck className="mt-0.5 size-4 shrink-0" />Sua senha pessoal não fica visível para o administrador. O e-mail será usado apenas para recuperação de acesso.</div>
        </CardContent>
      </Card>
    </main>
  );
}
