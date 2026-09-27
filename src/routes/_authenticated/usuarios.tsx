import { createFileRoute } from "@tanstack/react-router";
import { KeyRound, UserPlus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { AppShell, nomeSetor } from "@/components/dryko/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { NOMES_PAPEIS, useAuth, type AppRole, type Profile } from "@/lib/auth";
import { criarUsuario } from "@/lib/usuarios-admin";

export const Route = createFileRoute("/_authenticated/usuarios")({ component: Usuarios });

type Configuracao = {
  ativo: boolean;
  podeGerenciarProdutos: boolean;
  podeConfirmarProtheus: boolean;
  papeis: AppRole[];
};
const PAPEIS: AppRole[] = ["facilitador", "autorizado_protheus", "administrador"];

function Usuarios() {
  const { isAdmin, loading, refresh } = useAuth();
  const [perfis, setPerfis] = useState<Profile[]>([]);
  const [configuracoes, setConfiguracoes] = useState<Record<string, Configuracao>>({});
  const [carregando, setCarregando] = useState(true);
  const [salvandoId, setSalvandoId] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  const [nome, setNome] = useState("");
  const [loginNovo, setLoginNovo] = useState("");
  const [senha, setSenha] = useState("");

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
    if (!nome.trim() || !loginNovo.trim() || senha.length < 6 || criando) return;
    setCriando(true);
    try {
      const criado = await criarUsuario({
        data: { nome: nome.trim(), login: loginNovo.trim(), senha },
      });
      toast.success(`Usuário ${criado.login} criado. A senha deverá ser alterada no primeiro acesso.`);
      setNome("");
      setLoginNovo("");
      setSenha("");
      await carregar();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível criar o usuário.");
    } finally {
      setCriando(false);
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

  return (
    <AppShell title="Usuários" eyebrow="Administração · Acessos">
      <div className="mx-auto max-w-4xl space-y-4">
        <div>
          <h2 className="text-2xl font-bold">Usuários e permissões</h2>
          <p className="text-sm text-muted-foreground">
            Cadastre acessos somente com login e senha temporária. Não é necessário informar e-mail.
          </p>
        </div>

        {loading || carregando ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : !isAdmin ? (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">
              Esta tela é exclusiva do administrador.
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Cadastrar usuário</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="nome-usuario">Nome completo *</Label>
                  <Input id="nome-usuario" value={nome} onChange={(e) => setNome(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="login-usuario">Login *</Label>
                  <Input
                    id="login-usuario"
                    autoCapitalize="none"
                    autoCorrect="off"
                    placeholder="Ex.: Jeimes.Santos"
                    value={loginNovo}
                    onChange={(e) => setLoginNovo(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="senha-usuario">Senha inicial *</Label>
                  <Input
                    id="senha-usuario"
                    type="password"
                    minLength={6}
                    placeholder="Ex.: 123456"
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    A senha é temporária. No primeiro acesso o usuário será obrigado a criar uma senha pessoal.
                  </p>
                </div>
                <Button
                  className="self-end"
                  disabled={!nome.trim() || !loginNovo.trim() || senha.length < 6 || criando}
                  onClick={criar}
                >
                  <UserPlus /> {criando ? "Criando..." : "Criar como Facilitador"}
                </Button>
              </CardContent>
            </Card>

            {perfis.map((perfil) => {
              const config = configuracoes[perfil.id];
              if (!config) return null;
              return (
                <Card key={perfil.id}>
                  <CardHeader className="pb-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-base">{perfil.nome || "Sem nome"}</CardTitle>
                        <p className="text-sm font-semibold text-primary">
                          Login: {perfil.login || "acesso anterior sem login definido"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {perfil.setor_atual ? nomeSetor(perfil.setor_atual) : "Sem setor"} ·{" "}
                          {perfil.turno_atual ? `Turno ${perfil.turno_atual}` : "Sem turno"}
                        </p>
                        {perfil.deve_alterar_senha && (
                          <p className="mt-1 flex items-center gap-1 text-xs font-medium text-amber-700">
                            <KeyRound className="size-3.5" /> Troca de senha pendente no primeiro acesso
                          </p>
                        )}
                      </div>
                      <label className="flex items-center gap-2 text-sm font-medium">
                        <input
                          type="checkbox"
                          checked={config.ativo}
                          onChange={(e) => alterar(perfil.id, { ativo: e.target.checked })}
                        />
                        Usuário ativo
                      </label>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <p className="mb-2 text-sm font-semibold">Papéis de acesso</p>
                      <div className="flex flex-wrap gap-4">
                        {PAPEIS.map((papel) => (
                          <label key={papel} className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={config.papeis.includes(papel)}
                              onChange={() => alternarPapel(perfil.id, papel)}
                            />
                            {NOMES_PAPEIS[papel]}
                          </label>
                        ))}
                      </div>
                      {config.papeis.length === 0 && (
                        <p className="mt-2 text-xs font-medium text-amber-700">
                          Sem papel: o usuário não terá acesso operacional.
                        </p>
                      )}
                    </div>
                    <div>
                      <p className="mb-2 text-sm font-semibold">Permissões adicionais</p>
                      <div className="flex flex-col gap-2 text-sm sm:flex-row sm:gap-6">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={config.podeGerenciarProdutos}
                            onChange={(e) =>
                              alterar(perfil.id, { podeGerenciarProdutos: e.target.checked })
                            }
                          />
                          Cadastrar produtos e ordenar marcas
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={config.podeConfirmarProtheus}
                            onChange={(e) =>
                              alterar(perfil.id, { podeConfirmarProtheus: e.target.checked })
                            }
                          />
                          Confirmar lançamentos Protheus
                        </label>
                      </div>
                    </div>
                    <Button disabled={salvandoId !== null} onClick={() => salvar(perfil)}>
                      {salvandoId === perfil.id ? "Salvando..." : "Salvar permissões"}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </>
        )}
      </div>
    </AppShell>
  );
}
