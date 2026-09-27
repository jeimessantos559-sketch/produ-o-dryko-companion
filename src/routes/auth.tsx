import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, LockKeyhole } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { DrykoLogo } from "@/components/dryko/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { entrarComLogin } from "@/lib/autenticacao-login";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Entrar | Aponta Produção DRYKO" },
      {
        name: "description",
        content: "Acesso individual ao aplicativo de apontamento de produção DRYKO.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [login, setLogin] = useState("");
  const [senha, setSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    void supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) return;
      const { data: perfil } = await supabase.from("profiles").select("*").eq("id", data.session.user.id).maybeSingle();
      const precisaTrocar = Boolean((perfil as { deve_alterar_senha?: boolean } | null)?.deve_alterar_senha);
      void navigate({ to: precisaTrocar ? "/alterar-senha" : "/painel", replace: true });
    });
  }, [navigate]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!login.trim() || senha.length < 6 || enviando) return;
    setEnviando(true);
    try {
      const resultado = await entrarComLogin({ data: { login: login.trim(), senha } });
      const { error } = await supabase.auth.setSession({
        access_token: resultado.accessToken,
        refresh_token: resultado.refreshToken,
      });
      if (error) throw error;
      setSenha("");
      void navigate({
        to: resultado.deveAlterarSenha ? "/alterar-senha" : "/selecionar",
        replace: true,
      });
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Usuário ou senha inválidos.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-secondary px-4 py-10">
      <DrykoLogo size="lg" />
      <h1 className="mt-3 text-center text-2xl font-extrabold">Aponta Produção</h1>
      <p className="mt-1 text-center text-sm text-muted-foreground">
        Sistema interno de apontamento
      </p>

      <Card className="mt-6 w-full max-w-sm shadow-sm">
        <CardHeader className="pb-3">
          <div className="mb-2 flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <LockKeyhole className="size-5" />
          </div>
          <CardTitle>Acessar o sistema</CardTitle>
          <p className="text-sm text-muted-foreground">Informe seu login e sua senha.</p>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={enviar}>
            <div className="space-y-1">
              <Label htmlFor="login">Login</Label>
              <Input
                id="login"
                type="text"
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="username"
                className="h-12 text-base"
                placeholder="Ex.: Jeimes.Santos"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="senha">Senha</Label>
              <div className="relative">
                <Input
                  id="senha"
                  type={mostrarSenha ? "text" : "password"}
                  autoComplete="current-password"
                  className="h-12 pr-12 text-base"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  minLength={6}
                  required
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1 h-10 w-10"
                  onClick={() => setMostrarSenha((valor) => !valor)}
                  aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
                >
                  {mostrarSenha ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                </Button>
              </div>
            </div>
            <Button type="submit" className="h-12 w-full text-base" disabled={enviando}>
              {enviando ? "Verificando..." : "Entrar"}
            </Button>
          </form>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Use as credenciais fornecidas pelo administrador. No primeiro acesso a senha deverá ser alterada.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
