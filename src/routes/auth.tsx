import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { DrykoLogo } from "@/components/dryko/logo";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { entrarComLogin } from "@/lib/autenticacao-login";
import { solicitarRecuperacaoSenha } from "@/lib/recuperacao-senha";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Entrar | Aponta Produção DRYKO" },
      { name: "description", content: "Acesso individual ao aplicativo de apontamento de produção DRYKO." },
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
  const [recuperacaoAberta, setRecuperacaoAberta] = useState(false);
  const [emailRecuperacao, setEmailRecuperacao] = useState("");
  const [enviandoRecuperacao, setEnviandoRecuperacao] = useState(false);

  useEffect(() => {
    void supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) return;
      const { data: perfil } = await supabase
        .from("profiles")
        .select("deve_alterar_senha, onboarding_concluido")
        .eq("id", data.session.user.id)
        .maybeSingle();
      const estado = perfil as { deve_alterar_senha?: boolean; onboarding_concluido?: boolean } | null;
      const destino = estado?.deve_alterar_senha ? "/alterar-senha" : estado?.onboarding_concluido ? "/painel" : "/selecionar";
      void navigate({ to: destino, replace: true });
    });
  }, [navigate]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!login.trim() || senha.length < 6 || enviando) return;
    setEnviando(true);
    try {
      const resultado = await entrarComLogin({ data: { login: login.trim(), senha } });
      const { error } = await supabase.auth.setSession({ access_token: resultado.accessToken, refresh_token: resultado.refreshToken });
      if (error) throw error;
      setSenha("");
      void navigate({
        to: resultado.deveAlterarSenha ? "/alterar-senha" : resultado.onboardingConcluido ? "/painel" : "/selecionar",
        replace: true,
      });
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Usuário ou senha inválidos.");
    } finally {
      setEnviando(false);
    }
  }

  async function recuperar(e: React.FormEvent) {
    e.preventDefault();
    if (!emailRecuperacao.trim() || enviandoRecuperacao) return;
    setEnviandoRecuperacao(true);
    try {
      const resultado = await solicitarRecuperacaoSenha({ data: { email: emailRecuperacao.trim() } });
      toast.success(resultado.mensagem);
      setEmailRecuperacao("");
      setRecuperacaoAberta(false);
    } catch {
      toast.success("Se este e-mail estiver cadastrado, você receberá as instruções para redefinir a senha.");
      setRecuperacaoAberta(false);
    } finally {
      setEnviandoRecuperacao(false);
    }
  }

  return (
    <main className="floot-login-shell text-foreground">
      <section className="floot-brand-panel">
        <div className="floot-grid-texture" />
        <div className="relative flex items-center gap-4">
          <DrykoLogo size="lg" />
          <div className="grid gap-1 border-l border-white/15 pl-4">
            <strong className="font-heading text-xl leading-none">Aponta Produção</strong>
            <small className="text-slate-400">Sistema interno</small>
          </div>
        </div>
        <div className="relative max-w-[610px] pb-8">
          <span className="grid size-14 place-items-center rounded-xl border border-white/10 bg-white/5 text-red-500"><ClipboardCheck className="size-7" /></span>
          <p className="mb-3 mt-6 text-[.82rem] font-bold uppercase tracking-[.18em] text-red-500">Controle de produção</p>
          <h1 className="max-w-[590px] text-[clamp(2.5rem,4vw,4.2rem)] font-bold leading-[1.06] tracking-[-.04em] text-white">Apontamentos organizados em um só lugar.</h1>
          <p className="mt-5 max-w-[560px] text-[1.08rem] leading-[1.65] text-slate-300">Registre os PLTs fechados e acompanhe o que ainda precisa ser lançado no Protheus.</p>
          <div className="mt-8 flex flex-wrap gap-x-8 gap-y-4 border-t border-white/10 pt-6 text-sm text-slate-300">
            <span className="flex items-center gap-2"><CheckCircle2 className="size-4 text-red-500" /> Registro por apontamento</span>
            <span className="flex items-center gap-2"><CheckCircle2 className="size-4 text-red-500" /> Controle do Protheus</span>
          </div>
        </div>
        <small className="relative text-xs text-slate-500">DRYKO Impermeabilizantes · Uso interno</small>
      </section>

      <section className="grid min-h-svh place-items-center bg-background p-4 sm:p-8">
        <div className="w-full max-w-[460px]">
          <article className="floot-login-card border-border bg-card text-card-foreground">
            <div className="mb-7 flex items-center justify-between min-[901px]:hidden">
              <DrykoLogo size="lg" />
              <span className="grid size-12 place-items-center rounded-xl bg-primary/10 text-primary"><LockKeyhole className="size-6" /></span>
            </div>
            <div className="absolute right-10 top-9 hidden size-12 place-items-center rounded-xl bg-primary/10 text-primary min-[901px]:grid"><LockKeyhole className="size-6" /></div>

            <p className="text-[.8rem] font-bold uppercase tracking-[.14em] text-primary">Aponta Produção</p>
            <h2 className="mt-2 text-[2rem] font-bold leading-[1.15] tracking-[-.03em]">Acessar o sistema</h2>
            <p className="mt-3 max-w-sm leading-relaxed text-muted-foreground">Informe seu usuário e sua senha para acessar o sistema.</p>

            <form className="mt-7 grid gap-[1.15rem]" onSubmit={enviar}>
              <label className="grid gap-2 text-sm font-semibold text-foreground" htmlFor="login">
                <span>Usuário ou matrícula</span>
                <Input id="login" type="text" autoCapitalize="none" autoCorrect="off" autoComplete="username" className="h-12 rounded-xl border-border bg-background text-base" placeholder="Digite seu usuário" value={login} onChange={(e) => setLogin(e.target.value)} required />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-foreground" htmlFor="senha">
                <span>Senha</span>
                <div className="relative">
                  <Input id="senha" type={mostrarSenha ? "text" : "password"} autoComplete="current-password" className="h-12 rounded-xl border-border bg-background pr-12 text-base" placeholder="Digite sua senha" value={senha} onChange={(e) => setSenha(e.target.value)} minLength={6} required />
                  <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1 h-10 w-10 text-muted-foreground" onClick={() => setMostrarSenha((valor) => !valor)} aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}>{mostrarSenha ? <EyeOff className="size-5" /> : <Eye className="size-5" />}</Button>
                </div>
              </label>
              <div className="-mt-1 flex justify-end">
                <button type="button" className="text-sm font-semibold text-primary hover:underline" onClick={() => setRecuperacaoAberta(true)}>Esqueci minha senha</button>
              </div>
              <Button type="submit" size="lg" className="mt-1 h-12 w-full rounded-xl text-base shadow-[0_10px_28px_rgb(237_28_36_/_24%)]" disabled={enviando}>{enviando ? "Verificando..." : "Entrar"} <ArrowRight className="size-5" /></Button>
            </form>
            <div className="mt-6 flex items-center justify-center gap-2 border-t border-border pt-5 text-center text-xs text-muted-foreground"><ShieldCheck className="size-4 shrink-0 text-primary" />Acesso exclusivo para facilitadores autorizados</div>
          </article>
          <p className="mx-auto mt-4 max-w-[390px] text-center text-xs leading-relaxed text-muted-foreground">Use apenas as credenciais fornecidas pelo administrador. No primeiro acesso, crie sua senha pessoal e cadastre seu e-mail de recuperação.</p>
        </div>
      </section>

      <Dialog open={recuperacaoAberta} onOpenChange={setRecuperacaoAberta}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Recuperar acesso</DialogTitle>
            <DialogDescription>Informe o e-mail de recuperação cadastrado no seu primeiro acesso.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={recuperar}>
            <div className="space-y-1.5">
              <Label htmlFor="email-recuperar">E-mail</Label>
              <div className="relative"><Mail className="absolute left-3 top-3.5 size-4 text-muted-foreground" /><Input id="email-recuperar" type="email" autoComplete="email" className="h-12 pl-10" placeholder="seuemail@exemplo.com" value={emailRecuperacao} onChange={(e) => setEmailRecuperacao(e.target.value)} required /></div>
            </div>
            <Button type="submit" className="h-11 w-full" disabled={enviandoRecuperacao || !emailRecuperacao.trim()}>{enviandoRecuperacao ? "Enviando..." : "Enviar link de recuperação"}</Button>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}
