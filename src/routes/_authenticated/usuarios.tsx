import { createFileRoute } from "@tanstack/react-router";
import { Clipboard, KeyRound, Pencil, Trash2, UserPlus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { AppShell, nomeSetor } from "@/components/dryko/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { NOMES_PAPEIS, useAuth, type AppRole, type Profile } from "@/lib/auth";
import { criarUsuario, gerenciarUsuarioAdmin } from "@/lib/usuarios-admin";

export const Route = createFileRoute("/_authenticated/usuarios")({ component: Usuarios });

type Configuracao = {
  ativo: boolean;
  podeGerenciarProdutos: boolean;
  podeConfirmarProtheus: boolean;
  papeis: AppRole[];
};

const PAPEIS: AppRole[] = ["facilitador", "autorizado_protheus", "administrador"];
const SENHA_INICIAL = "123456";

function Usuarios() {
  const { isAdmin, loading, refresh, user } = useAuth();
  const [perfis, setPerfis] = useState<Profile[]>([]);
  const [configuracoes, setConfiguracoes] = useState<Record<string, Configuracao>>({});
  const [carregando, setCarregando] = useState(true);
  const [salvandoId, setSalvandoId] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  const [nome, setNome] = useState("");
  const [credencialCriada, setCredencialCriada] = useState<{ login: string; senha: string } | null>(null);
  const [editando, setEditando] = useState<Profile | null>(null);
  const [nomeEditado, setNomeEditado] = useState("");
  const [loginEditado, setLoginEditado] = useState("");

  const carregar = useCallback(async () => {
    if (!isAdmin) {
      setCarregando(false);
      return;
    }
    setCarregando(true);
    const [{ data: listaPerfis, error }, { data: papeis }] = await Promise.all([
      supabase.from("profiles").select("*").order("nome"),
      supabase.from("user_roles").select("user_id, role"),
    ]);
    if (error) toast.error("Não foi possível carregar os usuários.");

    const mapaPapeis: Record<string, AppRole[]> = {};
    for (const item of papeis ?? []) {
      mapaPapeis[item.user_id] = [...(mapaPapeis[item.user_id] ?? []), item.role];
    }
    const lista = (listaPerfis ?? []) as Profile[];
    setPerfis(lista);
    setConfiguracoes(
      Object.fromEntries(
        lista.map((perfil) => [
          perfil.id,
          {
            ativo: perfil.ativo,
            podeGerenciarProdutos: perfil.pode_gerenciar_produtos,
            podeConfirmarProtheus: perfil.pode_confirmar_protheus,
            papeis: mapaPapeis[perfil.id] ?? [],
          },
        ]),
      ),
    );
    setCarregando(false);
  }, [isAdmin]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function alterar(id: string, mudanca: Partial<Configuracao>) {
    setConfiguracoes((atuais) => {
      const atual = atuais[id];
      if (!atual) return atuais;
      return { ...atuais, [id]: { ...atual, ...mudanca } };
    });
  }

  function alternarPapel(id: string, papel: AppRole) {
    const atual = configuracoes[id];
    if (!atual) return;
    alterar(id, {
      papeis: atual.papeis.includes(papel)
        ? atual.papeis.filter((item) => item !== papel)
        : [...atual.papeis, papel],
    });
  }

  async function criar() {
    if (!nome.trim() || criando) return;
    setCriando(true);
    try {
      const criado = await criarUsuario({ data: { nome: nome.trim() } });
      setCredencialCriada({ login: criado.login, senha: criado.senhaInicial });
      setNome("");
      toast.success(`Usuário ${criado.login} criado com a senha inicial ${criado.senhaInicial}.`);
      await carregar();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível criar o usuário.");
    } finally {
      setCriando(false);
    }
  }

  async function copiarCredencial(login: string, senha = SENHA_INICIAL) {
    try {
      await navigator.clipboard.writeText(`Login: ${login}\nSenha: ${senha}`);
      toast.success("Login e senha inicial copiados.");
    } catch {
      toast.error("Não foi possível copiar automaticamente.");
    }
  }

  async function salvar(perfil: Profile) {
    const config = configuracoes[perfil.id];
    if (!config || salvandoId) return;
    setSalvandoId(perfil.id);
    const { error } = await supabase.rpc("gerenciar_usuario", {
      p_usuario_id: perfil.id,
      p_ativo: config.ativo,
      p_pode_gerenciar_produtos: config.podeGerenciarProdutos,
      p_pode_confirmar_protheus: config.podeConfirmarProtheus,
      p_papeis: config.papeis,
    });
    setSalvandoId(null);
    if (error) {
      toast.error(error.message || "Não foi possível atualizar o usuário.");
      return;
    }
    toast.success("Permissões atualizadas.");
    await refresh();
    await carregar();
  }

  function abrirEdicao(perfil: Profile) {
    setEditando(perfil);
    setNomeEditado(perfil.nome || "");
    setLoginEditado(perfil.login || "");
  }

  async function salvarEdicao() {
    if (!editando || !nomeEditado.trim() || !loginEditado.trim() || salvandoId) return;
    setSalvandoId(editando.id);
    try {
      await gerenciarUsuarioAdmin({
        data: {
          action: "rename",
          userId: editando.id,
          nome: nomeEditado.trim(),
          login: loginEditado.trim(),
        },
      });
      toast.success("Nome e login atualizados.");
      setEditando(null);
      await carregar();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível editar o usuário.");
    } finally {
      setSalvandoId(null);
    }
  }

  async function redefinirSenha(perfil: Profile) {
    if (!window.confirm(`Redefinir o acesso de ${perfil.nome} para a senha inicial ${SENHA_INICIAL}?`)) return;
    setSalvandoId(perfil.id);
    try {
      await gerenciarUsuarioAdmin({ data: { action: "reset", userId: perfil.id } });
      toast.success(`Senha inicial redefinida para ${SENHA_INICIAL}. No próximo acesso será exigida uma nova senha pessoal.`);
      await carregar();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível redefinir a senha.");
    } finally {
      setSalvandoId(null);
    }
  }

  async function excluir(perfil: Profile) {
    if (perfil.id === user?.id) {
      toast.error("Você não pode excluir seu próprio usuário.");
      return;
    }
    if (!window.confirm(`Excluir definitivamente o usuário ${perfil.nome}?`)) return;
    setSalvandoId(perfil.id);
    try {
      await gerenciarUsuarioAdmin({ data: { action: "delete", userId: perfil.id } });
      toast.success("Usuário excluído.");
      await carregar();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível excluir o usuário.");
    } finally {
      setSalvandoId(null);
    }
  }

  return (
    <AppShell title="Usuários" eyebrow="ADMINISTRAÇÃO · ACESSOS">
      <div className="mx-auto max-w-4xl space-y-4">
        <div>
          <h2 className="text-2xl font-bold">Usuários e permissões</h2>
          <p className="text-sm text-muted-foreground">
            Informe apenas o nome. O login é criado automaticamente e a senha inicial é {SENHA_INICIAL}.
          </p>
        </div>

        {loading || carregando ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : !isAdmin ? (
          <Card><CardContent className="pt-6 text-sm text-muted-foreground">Esta tela é exclusiva do administrador.</CardContent></Card>
        ) : (
          <>
            <Card className="rounded-3xl">
              <CardHeader><CardTitle className="text-base">Cadastrar usuário</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="nome-usuario">Nome completo *</Label>
                  <Input id="nome-usuario" className="h-12 text-base" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: João Gomes" />
                </div>
                <div className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-600">
                  <strong>Senha inicial padrão:</strong> {SENHA_INICIAL}. No primeiro acesso o usuário será obrigado a criar uma senha pessoal.
                </div>
                <Button className="h-12 w-full" disabled={!nome.trim() || criando} onClick={criar}>
                  <UserPlus /> {criando ? "Criando..." : "Criar usuário"}
                </Button>
              </CardContent>
            </Card>

            {credencialCriada && (
              <Card className="rounded-3xl border-emerald-200 bg-emerald-50/50">
                <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
                  <div>
                    <p className="font-bold">Usuário criado</p>
                    <p className="font-mono text-sm">Login: {credencialCriada.login}</p>
                    <p className="font-mono text-sm">Senha inicial: {credencialCriada.senha}</p>
                  </div>
                  <Button variant="outline" onClick={() => copiarCredencial(credencialCriada.login, credencialCriada.senha)}><Clipboard /> Copiar acesso</Button>
                </CardContent>
              </Card>
            )}

            {perfis.map((perfil) => {
              const config = configuracoes[perfil.id];
              if (!config) return null;
              return (
                <Card key={perfil.id} className="rounded-3xl">
                  <CardHeader className="pb-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-base">{perfil.nome || "Sem nome"}</CardTitle>
                        <p className="text-sm font-semibold text-primary">Login: {perfil.login || "acesso antigo sem login"}</p>
                        <p className="text-xs text-muted-foreground">
                          {perfil.setor_atual ? nomeSetor(perfil.setor_atual) : "Primeiro acesso pendente"} · {perfil.turno_atual ? `Turno ${perfil.turno_atual}` : "Sem turno"}
                        </p>
                        <p className={`mt-1 flex items-center gap-1 text-xs font-medium ${perfil.deve_alterar_senha ? "text-amber-700" : "text-emerald-700"}`}>
                          <KeyRound className="size-3.5" />
                          {perfil.deve_alterar_senha ? `Senha inicial: ${SENHA_INICIAL}` : "Senha pessoal definida (não pode ser visualizada)"}
                        </p>
                      </div>
                      <label className="flex items-center gap-2 text-sm font-medium">
                        <input type="checkbox" checked={config.ativo} onChange={(e) => alterar(perfil.id, { ativo: e.target.checked })} /> Usuário ativo
                      </label>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <p className="mb-2 text-sm font-semibold">Papéis de acesso</p>
                      <div className="flex flex-wrap gap-4">
                        {PAPEIS.map((papel) => (
                          <label key={papel} className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={config.papeis.includes(papel)} onChange={() => alternarPapel(perfil.id, papel)} /> {NOMES_PAPEIS[papel]}
                          </label>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="mb-2 text-sm font-semibold">Permissões adicionais</p>
                      <div className="flex flex-col gap-2 text-sm sm:flex-row sm:gap-6">
                        <label className="flex items-center gap-2"><input type="checkbox" checked={config.podeGerenciarProdutos} onChange={(e) => alterar(perfil.id, { podeGerenciarProdutos: e.target.checked })} /> Gerenciar produtos</label>
                        <label className="flex items-center gap-2"><input type="checkbox" checked={config.podeConfirmarProtheus} onChange={(e) => alterar(perfil.id, { podeConfirmarProtheus: e.target.checked })} /> Confirmar Protheus</label>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button disabled={salvandoId !== null} onClick={() => salvar(perfil)}>{salvandoId === perfil.id ? "Salvando..." : "Salvar permissões"}</Button>
                      <Button variant="outline" onClick={() => abrirEdicao(perfil)}><Pencil /> Editar</Button>
                      <Button variant="outline" onClick={() => void redefinirSenha(perfil)}><KeyRound /> Redefinir para {SENHA_INICIAL}</Button>
                      {perfil.login && perfil.deve_alterar_senha && <Button variant="outline" onClick={() => copiarCredencial(perfil.login!)}><Clipboard /> Copiar acesso</Button>}
                      {perfil.id !== user?.id && <Button variant="destructive" onClick={() => void excluir(perfil)}><Trash2 /> Excluir</Button>}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </>
        )}
      </div>

      <Dialog open={Boolean(editando)} onOpenChange={(aberto) => { if (!aberto) setEditando(null); }}>
        <DialogContent className="rounded-3xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar usuário</DialogTitle>
            <DialogDescription>Altere o nome ou o login operacional.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>Nome</Label><Input value={nomeEditado} onChange={(e) => setNomeEditado(e.target.value)} /></div>
            <div className="space-y-1"><Label>Login</Label><Input autoCapitalize="none" value={loginEditado} onChange={(e) => setLoginEditado(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditando(null)}>Cancelar</Button>
            <Button disabled={!nomeEditado.trim() || !loginEditado.trim() || salvandoId !== null} onClick={() => void salvarEdicao()}>Salvar alterações</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
