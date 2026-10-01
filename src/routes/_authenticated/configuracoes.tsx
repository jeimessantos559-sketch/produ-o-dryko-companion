import { createFileRoute } from "@tanstack/react-router";
import { browserSupportsWebAuthn, platformAuthenticatorIsAvailable, startRegistration } from "@simplewebauthn/browser";
import { Camera, Fingerprint, Moon, Sun, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/dryko/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useAvatarUrl } from "@/lib/avatar";
import { confirmarRegistroBiometria, opcoesRegistroBiometria, removerBiometria, statusBiometria } from "@/lib/biometria";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações | Aponta Produção DRYKO" },
      { name: "description", content: "Aparência, perfil e login com biometria." },
    ],
  }),
  component: Configuracoes,
});

const CHAVE_TEMA = "dryko-theme";
const CHAVE_CREDENCIAL = "dryko-webauthn-credential";
const TIPOS = ["image/jpeg", "image/png", "image/webp"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function Configuracoes() {
  const { profile, user, refresh } = useAuth();
  const [tema, setTema] = useState<"light" | "dark">("light");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [previa, setPrevia] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const inputFoto = useRef<HTMLInputElement>(null);
  const avatarAtual = useAvatarUrl(profile?.avatar_url);

  const [suporte, setSuporte] = useState<boolean | null>(null);
  const [credLocal, setCredLocal] = useState<string | null>(null);
  const [ativaAqui, setAtivaAqui] = useState(false);
  const [bioOcupado, setBioOcupado] = useState(false);

  useEffect(() => { setTema(document.documentElement.classList.contains("dark") ? "dark" : "light"); }, []);
  useEffect(() => {
    setNome(profile?.nome ?? "");
    setEmail(profile?.email_recuperacao ?? "");
  }, [profile?.nome, profile?.email_recuperacao]);
  useEffect(() => () => { if (previa) URL.revokeObjectURL(previa); }, [previa]);

  useEffect(() => {
    void (async () => {
      const ok = browserSupportsWebAuthn() && (await platformAuthenticatorIsAvailable().catch(() => false));
      setSuporte(ok);
      const local = window.localStorage.getItem(CHAVE_CREDENCIAL);
      setCredLocal(local);
      if (ok && local) {
        try {
          const st = await statusBiometria();
          setAtivaAqui(st.credenciais.includes(local));
        } catch { setAtivaAqui(false); }
      }
    })();
  }, []);

  function aplicarTema(proximo: "light" | "dark") {
    document.documentElement.classList.toggle("dark", proximo === "dark");
    document.documentElement.style.colorScheme = proximo;
    window.localStorage.setItem(CHAVE_TEMA, proximo);
    setTema(proximo);
  }

  function escolherFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!TIPOS.includes(f.type)) return void toast.error("Use uma foto JPG, PNG ou WEBP.");
    if (f.size > 5 * 1024 * 1024) return void toast.error("A foto deve ter no máximo 5 MB.");
    setArquivo(f);
    setPrevia(URL.createObjectURL(f));
  }

  async function salvarPerfil() {
    if (!user || salvando) return;
    if (!nome.trim()) return void toast.error("Informe seu nome.");
    if (email.trim() && !EMAIL_RE.test(email.trim())) return void toast.error("Informe um e-mail válido.");
    setSalvando(true);
    const avatarAnterior = profile?.avatar_url ?? null;
    let avatarNovo: string | null = null;
    try {
      const emailNovo = email.trim() || null;
      if (emailNovo) {
        const padrao = emailNovo.replace(/[\\%_]/g, "\\$&");
        const { data: conflito, error: erroConflito } = await supabase.from("profiles")
          .select("id").ilike("email_recuperacao", padrao).eq("ativo", true).neq("id", user.id).maybeSingle();
        if (erroConflito) throw new Error("Não foi possível verificar o e-mail de recuperação.");
        if (conflito) throw new Error("Este e-mail já está vinculado a outro perfil.");
      }
      let avatar = avatarAnterior;
      if (arquivo) {
        const ext = arquivo.type === "image/png" ? "png" : arquivo.type === "image/webp" ? "webp" : "jpg";
        const caminho = `${user.id}/avatar-${Date.now()}.${ext}`;
        const { error } = await supabase.storage.from("avatars").upload(caminho, arquivo, { contentType: arquivo.type, upsert: true });
        if (error) throw new Error("Não foi possível enviar a foto.");
        avatarNovo = caminho;
        avatar = caminho;
      }
      const { error } = await supabase.rpc("atualizar_meu_perfil", {
        p_nome: nome.trim(),
        p_email_recuperacao: emailNovo,
        p_avatar_url: avatar,
      } as unknown as { p_nome: string; p_email_recuperacao: string; p_avatar_url: string });
      if (error) {
        if (error.code === "23505") throw new Error("Este e-mail já está vinculado a outro perfil.");
        if (error.code === "22023") throw new Error("Informe seu nome.");
        throw new Error("Não foi possível salvar o perfil.");
      }
      if (avatarNovo && avatarAnterior && !/^https?:/.test(avatarAnterior) && avatarAnterior !== avatarNovo) void supabase.storage.from("avatars").remove([avatarAnterior]);
      setArquivo(null);
      setPrevia(null);
      await refresh();
      toast.success("Perfil salvo.");
    } catch (erro) {
      if (avatarNovo) void supabase.storage.from("avatars").remove([avatarNovo]);
      toast.error(erro instanceof Error ? erro.message : "Não foi possível salvar o perfil.");
    } finally {
      setSalvando(false);
    }
  }

  async function ativarBiometria() {
    setBioOcupado(true);
    try {
      const { json } = await opcoesRegistroBiometria();
      const resposta = await startRegistration({ optionsJSON: JSON.parse(json) });
      const r = await confirmarRegistroBiometria({ data: { resposta, aparelho: navigator.userAgent.slice(0, 200) } });
      window.localStorage.setItem(CHAVE_CREDENCIAL, r.credentialId);
      setCredLocal(r.credentialId);
      setAtivaAqui(true);
      toast.success("Biometria ativada neste aparelho.");
    } catch (erro) {
      const nomeErro = (erro as { name?: string })?.name;
      toast.error(nomeErro === "NotAllowedError" ? "Ativação cancelada." : erro instanceof Error ? erro.message : "Não foi possível ativar a biometria.");
    } finally {
      setBioOcupado(false);
    }
  }

  async function desativarBiometria() {
    if (!credLocal) return;
    setBioOcupado(true);
    try {
      await removerBiometria({ data: { credentialId: credLocal } });
      window.localStorage.removeItem(CHAVE_CREDENCIAL);
      setCredLocal(null);
      setAtivaAqui(false);
      toast.success("Biometria removida deste aparelho.");
    } catch {
      toast.error("Não foi possível remover a biometria.");
    } finally {
      setBioOcupado(false);
    }
  }

  const foto = previa ?? avatarAtual;

  return (
    <AppShell title="Configurações" eyebrow="CONTA · PREFERÊNCIAS">
      <div className="mx-auto max-w-xl space-y-3">
        <Card className="rounded-2xl">
          <CardContent className="space-y-3 p-4">
            <h2 className="font-bold">Aparência</h2>
            <div className="grid grid-cols-2 gap-2">
              <Button variant={tema === "light" ? "default" : "outline"} className="h-12" onClick={() => aplicarTema("light")}><Sun className="size-4" /> Claro</Button>
              <Button variant={tema === "dark" ? "default" : "outline"} className="h-12" onClick={() => aplicarTema("dark")}><Moon className="size-4" /> Escuro</Button>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardContent className="space-y-4 p-4">
            <h2 className="font-bold">Perfil</h2>
            <div className="flex items-center gap-4">
              <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-full bg-muted text-muted-foreground">
                {foto ? <img src={foto} alt="Foto de perfil" className="size-full object-cover" /> : <UserRound className="size-9" />}
              </div>
              <div className="space-y-1">
                <Button variant="outline" onClick={() => inputFoto.current?.click()}><Camera className="size-4" /> Escolher foto</Button>
                <p className="text-xs text-muted-foreground">JPG, PNG ou WEBP · até 5 MB</p>
              </div>
              <input ref={inputFoto} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={escolherFoto} />
            </div>
            <div className="space-y-1.5"><Label htmlFor="cfg-nome">Nome</Label><Input id="cfg-nome" className="h-11" value={nome} onChange={(e) => setNome(e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label htmlFor="cfg-email">E-mail</Label>
              <Input id="cfg-email" type="email" autoComplete="email" className="h-11" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seuemail@exemplo.com" />
              <p className="text-xs text-muted-foreground">Usado para recuperar a senha. Seu login não muda.</p>
            </div>
            <Button className="h-11 w-full" disabled={salvando} onClick={() => void salvarPerfil()}>{salvando ? "Salvando..." : "Salvar perfil"}</Button>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardContent className="space-y-3 p-4">
            <h2 className="flex items-center gap-2 font-bold"><Fingerprint className="size-5 text-primary" /> Login com biometria</h2>
            {suporte === null ? (
              <p className="text-sm text-muted-foreground">Verificando o aparelho...</p>
            ) : !suporte ? (
              <p className="text-sm text-muted-foreground">Este aparelho ou navegador não oferece biometria. Continue entrando com usuário e senha.</p>
            ) : ativaAqui ? (
              <>
                <p className="rounded-xl bg-primary/10 p-3 text-sm font-semibold text-primary">Biometria ativada neste aparelho</p>
                <Button variant="outline" className="h-11 w-full" disabled={bioOcupado} onClick={() => void desativarBiometria()}>Remover biometria deste aparelho</Button>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">Entre usando a digital ou o rosto do seu celular, sem digitar senha.</p>
                <Button className="h-11 w-full" disabled={bioOcupado} onClick={() => void ativarBiometria()}>{bioOcupado ? "Aguardando..." : "Ativar biometria neste aparelho"}</Button>
              </>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Versão {typeof __APP_COMMIT__ === "string" ? __APP_COMMIT__ : "local"} · build {typeof __APP_BUILD__ === "string" ? __APP_BUILD__ : "—"} UTC
        </p>
      </div>
    </AppShell>
  );
}
