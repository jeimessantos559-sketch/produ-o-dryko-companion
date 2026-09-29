import { createFileRoute } from "@tanstack/react-router";
import { Clipboard, KeyRound, Pencil, ShieldCheck, Target, Trash2, UserPlus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { AppShell, nomeSetor } from "@/components/dryko/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
  podeFinalizarMetas: boolean;
  papeis: AppRole[];
};

const PAPEIS_VISIVEIS: AppRole[] = ["facilitador", "administrador", "programador_producao"];
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
    for (const item of papeis ?? []) mapaPapeis[item.user_id] = [...(mapaPapeis[item.user_id] ?? []), item.role];
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
            podeFinalizarMetas: Boolean(perfil.pode_finalizar_metas),
            papeis: mapaPapeis[perfil.id] ?? [],
          },
        ]),
      ),
    );
    setCarregando(false);
  }, [isAdmin]);

  useEffect(() => { void carregar(); }, [carregar]);

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
      toast.success(`Usuário ${criado.login} criado.`);
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

    const papeis = config.papeis.filter((papel) => papel !== "autorizado_protheus");
    const { error } = await supabase.rpc("gerenciar_usuario", {
      p_usuario_id: perfil.id,
      p_ativo: config.ativo,
      p_pode_gerenciar_produtos: config.podeGerenciarProdutos,
      p_pode_confirmar_protheus: config.podeConfirmarProtheus,
      p_papeis: papeis,
    });

    if (!error) {
      const metaRpc = supabase.rpc as unknown as (
        nome: string,
        args: { p_usuario_id: string; p_pode_finalizar_metas: boolean },
      ) => PromiseLike<{ error: { message?: string } | null }>;
      const resultadoMeta = await metaRpc("gerenciar_permissao_meta", {
        p_usuario_id: perfil.id,
        p_pode_finalizar_metas: config.podeFinalizarMetas,
      });
      if (resultadoMeta.error) {
        setSalvandoId(null);
        toast.error(resultadoMeta.error.message || "Não foi possível atualizar a permissão de metas.");
        return;
      }
    }

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
        data: { action: "rename", userId: editando.id, nome: nomeEditado.trim(), login: loginEditado.trim() },
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
      toast.success(`Senha redefinida para ${SENHA_INICIAL}.`);
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
      <div className="mx-auto max-w-4xl space-y-3">
        <div>
          <h2 className="text-xl font-extrabold sm:text-2xl">Usuários e permissões</h2>
          <p className="text-xs text-muted-foreground sm:text-sm">O administrador define separadamente quem lança no Protheus e quem pode finalizar metas.</p>
        </div>

        {loading || carregando ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : !isAdmin ? (
          <Card><CardContent className="p-4 text-sm text-muted-foreground">Esta tela é exclusiva do administrador.</CardContent></Card>
        ) : (
          <>
            <Card className="rounded-2xl">
              <CardContent className="space-y-2.5 p-4">
                <Label htmlFor="nome-usuario" className="text-xs">Cadastrar usuário</Label>
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <Input id="nome-usuario" className="h-10" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome completo" />
                  <Button className="h-10" disabled={!nome.trim() || criando} onClick={criar}><UserPlus className="size-4" /> {criando ? "Criando..." : "Criar"}</Button>
                </div>
                <p className="text-xs text-slate-500">Senha inicial padrão: <strong>{SENHA_INICIAL}</strong>.</p>
              </CardContent>
            </Card>

            {credencialCriada && (
              <Card className="rounded-2xl border-emerald-200 bg-emerald-50/50">
                <CardContent className="flex items-center justify-between gap-3 p-3">
                  <div><p className="font-bold">Usuário criado</p><p className="font-mono text-xs">{credencialCriada.login} · {credencialCriada.senha}</p></div>
                  <Button size="sm" variant="outline" onClick={() => copiarCredencial(credencialCriada.login, credencialCriada.senha)}><Clipboard className="size-4" /> Copiar</Button>
                </CardContent>
              </Card>
            )}

            <div className="space-y-2">
              {perfis.map((perfil) => {
                const config = configuracoes[perfil.id];
                if (!config) return null;
                return (
                  <Card key={perfil.id} className="rounded-2xl">
                    <CardContent className="space-y-3 p-3.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-bold">{perfil.nome || "Sem nome"}</p>
                          <p className="truncate text-sm font-semibold text-primary">{perfil.login || "Sem login"}</p>
                          <p className="text-xs text-slate-500">{perfil.setor_atual ? nomeSetor(perfil.setor_atual) : "Primeiro acesso"} · {perfil.turno_atual ?? "Sem turno"}</p>
                        </div>
                        <label className="flex shrink-0 items-center gap-1.5 text-xs font-medium"><input type="checkbox" checked={config.ativo} onChange={(e) => alterar(perfil.id, { ativo: e.target.checked })} /> Ativo</label>
                      </div>

                      <div className="grid gap-2 sm:grid-cols-2">
                        <label className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-3 ${config.podeConfirmarProtheus ? "border-primary/30 bg-primary/5" : "border-slate-200 bg-slate-50"}`}>
                          <div className="flex items-center gap-2"><ShieldCheck className="size-5 text-primary" /><div><p className="text-sm font-bold">Lançar no Protheus</p><p className="text-[11px] text-slate-500">Confirma apontamentos.</p></div></div>
                          <input type="checkbox" className="size-5" checked={config.podeConfirmarProtheus} onChange={(e) => alterar(perfil.id, { podeConfirmarProtheus: e.target.checked })} />
                        </label>

                        <label className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-3 ${config.podeFinalizarMetas ? "border-primary/30 bg-primary/5" : "border-slate-200 bg-slate-50"}`}>
                          <div className="flex items-center gap-2"><Target className="size-5 text-primary" /><div><p className="text-sm font-bold">Finalizar metas</p><p className="text-[11px] text-slate-500">Somente quem o administrador liberar.</p></div></div>
                          <input type="checkbox" className="size-5" checked={config.podeFinalizarMetas} onChange={(e) => alterar(perfil.id, { podeFinalizarMetas: e.target.checked })} />
                        </label>
                      </div>

                      <div className="grid gap-2 text-xs sm:grid-cols-2">
                        <div><p className="mb-1 font-semibold">Perfil</p><div className="flex flex-wrap gap-3">{PAPEIS_VISIVEIS.map((papel) => <label key={papel} className="flex items-center gap-1.5"><input type="checkbox" checked={config.papeis.includes(papel)} onChange={() => alternarPapel(perfil.id, papel)} /> {NOMES_PAPEIS[papel]}</label>)}</div></div>
                        <div><p className="mb-1 font-semibold">Outras permissões</p><label className="flex items-center gap-1.5"><input type="checkbox" checked={config.podeGerenciarProdutos} onChange={(e) => alterar(perfil.id, { podeGerenciarProdutos: e.target.checked })} /> Gerenciar produtos</label></div>
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        <Button size="sm" disabled={salvandoId !== null} onClick={() => salvar(perfil)}>{salvandoId === perfil.id ? "Salvando..." : "Salvar"}</Button>
                        <Button size="sm" variant="outline" onClick={() => abrirEdicao(perfil)}><Pencil className="size-4" /> Editar</Button>
                        <Button size="sm" variant="outline" onClick={() => void redefinirSenha(perfil)}><KeyRound className="size-4" /> {SENHA_INICIAL}</Button>
                        {perfil.login && perfil.deve_alterar_senha && <Button size="sm" variant="outline" onClick={() => copiarCredencial(perfil.login!)}><Clipboard className="size-4" /> Acesso</Button>}
                        {perfil.id !== user?.id && <Button size="sm" variant="destructive" onClick={() => void excluir(perfil)}><Trash2 className="size-4" /> Excluir</Button>}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </>
        )}
      </div>

      <Dialog open={Boolean(editando)} onOpenChange={(aberto) => { if (!aberto) setEditando(null); }}>
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader><DialogTitle>Editar usuário</DialogTitle><DialogDescription>Altere o nome ou o login operacional.</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>Nome</Label><Input value={nomeEditado} onChange={(e) => setNomeEditado(e.target.value)} /></div>
            <div className="space-y-1"><Label>Login</Label><Input autoCapitalize="none" value={loginEditado} onChange={(e) => setLoginEditado(e.target.value)} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setEditando(null)}>Cancelar</Button><Button disabled={!nomeEditado.trim() || !loginEditado.trim() || salvandoId !== null} onClick={() => void salvarEdicao()}>Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}