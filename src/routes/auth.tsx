import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { DrykoLogo } from "@/components/dryko/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Entrar | Aponta Produção DRYKO" },
      { name: "description", content: "Acesso individual ao aplicativo de apontamento de produção DRYKO." },
      { property: "og:title", content: "Entrar | Aponta Produção DRYKO" },
      {
        property: "og:description",
        content: "Acesso individual ao aplicativo de apontamento de produção DRYKO.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [modo, setModo] = useState<"entrar" | "criar">("entrar");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) void navigate({ to: "/painel", replace: true });
    });
  }, [navigate]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    try {
      if (modo === "entrar") {
        const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
        if (error) {
          toast.error("Não foi possível entrar. Confira o e-mail e a senha.");
          return;
        }
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password: senha,
          options: {
            emailRedirectTo: window.location.origin,
            data: { nome },
          },
        });
        if (error) {
          toast.error(
            error.message.includes("already")
              ? "Já existe um acesso com esse e-mail."
              : "Não foi possível criar o acesso. Tente novamente.",
          );
          return;
        }
        toast.success("Acesso criado.");
      }
      void navigate({ to: "/selecionar", replace: true });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-secondary px-4 py-10">
      <DrykoLogo size="lg" />
      <h1 className="mt-3 text-center text-xl font-bold">Aponta Produção</h1>
      <p className="mt-1 text-center text-sm text-muted-foreground">Acesso individual por usuário</p>

      <Card className="mt-6 w-full max-w-sm">
        <CardHeader>
          <CardTitle>{modo === "entrar" ? "Entrar" : "Criar acesso"}</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={enviar}>
            {modo === "criar" && (
              <div className="space-y-1">
                <Label htmlFor="nome">Nome completo</Label>
                <Input
                  id="nome"
                  className="h-12 text-base"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  required
                />
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                className="h-12 text-base"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="senha">Senha</Label>
              <Input
                id="senha"
                type="password"
                autoComplete={modo === "entrar" ? "current-password" : "new-password"}
                className="h-12 text-base"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                minLength={6}
                required
              />
            </div>
            <Button type="submit" className="h-12 w-full text-base" disabled={enviando}>
              {enviando ? "Aguarde..." : modo === "entrar" ? "Entrar" : "Criar acesso"}
            </Button>
          </form>

          <button
            type="button"
            className="mt-4 w-full text-sm text-muted-foreground underline"
            onClick={() => setModo(modo === "entrar" ? "criar" : "entrar")}
          >
            {modo === "entrar" ? "Ainda não tenho acesso" : "Já tenho acesso"}
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
