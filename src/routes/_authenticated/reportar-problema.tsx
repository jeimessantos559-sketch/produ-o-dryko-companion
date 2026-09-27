import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, ImagePlus, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { AppShell, nomeSetor } from "@/components/dryko/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/reportar-problema")({
  component: ReportarProblema,
});

type Problema = Database["public"]["Tables"]["problemas"]["Row"];

function ReportarProblema() {
  const { user, profile, isAdmin } = useAuth();
  const [tela, setTela] = useState("Apontamento");
  const [descricao, setDescricao] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [problemas, setProblemas] = useState<Problema[]>([]);
  const [nomes, setNomes] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    if (!user) return;
    setCarregando(true);
    const [{ data, error }, { data: perfis }] = await Promise.all([
      supabase.from("problemas").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.from("profiles").select("id, nome"),
    ]);
    if (error) toast.error("Não foi possível carregar os problemas registrados.");
    setProblemas(data ?? []);
    setNomes(Object.fromEntries((perfis ?? []).map((item) => [item.id, item.nome || "Sem nome"])));
    setCarregando(false);
  }, [user]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  function escolherFoto(arquivo: File | undefined) {
    if (!arquivo) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(arquivo.type)) {
      toast.error("Use uma imagem JPG, PNG ou WebP.");
      return;
    }
    if (arquivo.size > 5 * 1024 * 1024) {
      toast.error("A foto deve ter no máximo 5 MB.");
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setFoto(arquivo);
    setPreview(URL.createObjectURL(arquivo));
  }

  function limparFoto() {
    if (preview) URL.revokeObjectURL(preview);
    setFoto(null);
    setPreview(null);
  }

  async function salvar() {
    if (!user || !tela.trim() || descricao.trim().length < 5 || salvando) return;
    setSalvando(true);
    let fotoUrl: string | null = null;
    let caminho: string | null = null;
    if (foto) {
      const extensao = foto.name.split(".").pop()?.toLowerCase() || "jpg";
      caminho = `${user.id}/${crypto.randomUUID()}.${extensao}`;
      const { error } = await supabase.storage.from("problemas").upload(caminho, foto, {
        contentType: foto.type,
        upsert: false,
      });
      if (error) {
        setSalvando(false);
        toast.error("Não foi possível enviar a foto.");
        return;
      }
      fotoUrl = supabase.storage.from("problemas").getPublicUrl(caminho).data.publicUrl;
    }
    const { error } = await supabase.from("problemas").insert({
      usuario_id: user.id,
      setor: profile?.setor_atual ?? null,
      tela: tela.trim(),
      descricao: descricao.trim(),
      foto_url: fotoUrl,
    });
    setSalvando(false);
    if (error) {
      if (caminho) await supabase.storage.from("problemas").remove([caminho]);
      toast.error("Não foi possível registrar o problema.");
      return;
    }
    setDescricao("");
    limparFoto();
    toast.success("Problema registrado para acompanhamento.");
    await carregar();
  }

  async function resolver(item: Problema) {
    if (!user || !isAdmin) return;
    const resolvido = !item.resolvido;
    const { error } = await supabase
      .from("problemas")
      .update({
        resolvido,
        resolvido_por: resolvido ? user.id : null,
        resolvido_em: resolvido ? new Date().toISOString() : null,
      })
      .eq("id", item.id);
    if (error) {
      toast.error("Não foi possível atualizar o problema.");
      return;
    }
    toast.success(resolvido ? "Problema marcado como resolvido." : "Problema reaberto.");
    await carregar();
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-4">
        <div>
          <h1 className="text-2xl font-bold">Reportar problema</h1>
          <p className="text-sm text-muted-foreground">
            Registre a tela afetada, explique o ocorrido e, se ajudar, anexe uma foto.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Novo registro</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="tela-problema">Tela afetada *</Label>
              <Input id="tela-problema" value={tela} onChange={(e) => setTela(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="descricao-problema">Descrição *</Label>
              <Textarea
                id="descricao-problema"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="O que você tentou fazer e o que aconteceu?"
                className="min-h-28"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="foto-problema">Foto (opcional, até 5 MB)</Label>
              <Input
                id="foto-problema"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => escolherFoto(e.target.files?.[0])}
              />
              {preview && (
                <div className="relative w-fit overflow-hidden rounded-lg border">
                  <img
                    src={preview}
                    alt="Prévia da foto"
                    className="max-h-64 max-w-full object-contain"
                  />
                  <Button
                    size="icon"
                    variant="destructive"
                    className="absolute right-2 top-2"
                    onClick={limparFoto}
                    aria-label="Remover foto"
                  >
                    <X />
                  </Button>
                </div>
              )}
            </div>
            <Button
              className="h-12 w-full"
              disabled={!tela.trim() || descricao.trim().length < 5 || salvando}
              onClick={salvar}
            >
              <ImagePlus /> {salvando ? "Registrando..." : "Registrar problema"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {isAdmin ? "Registros de todos os usuários" : "Meus registros"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {carregando ? (
              <p className="text-sm text-muted-foreground">Carregando...</p>
            ) : problemas.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum problema registrado.</p>
            ) : (
              problemas.map((item) => (
                <div key={item.id} className="space-y-2 rounded-lg border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{item.tela}</p>
                      <p className="text-xs text-muted-foreground">
                        {nomes[item.usuario_id] ?? "Usuário"} · {formatar(item.created_at)} ·{" "}
                        {item.setor ? nomeSetor(item.setor) : "Sem setor"}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-semibold ${
                        item.resolvido
                          ? "bg-green-100 text-green-800"
                          : "bg-amber-100 text-amber-900"
                      }`}
                    >
                      {item.resolvido ? "Resolvido" : "Em aberto"}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm">{item.descricao}</p>
                  {item.foto_url && (
                    <a href={item.foto_url} target="_blank" rel="noreferrer">
                      <img
                        src={item.foto_url}
                        alt="Foto anexada ao problema"
                        className="max-h-64 rounded-md border object-contain"
                      />
                    </a>
                  )}
                  {isAdmin && (
                    <Button size="sm" variant="outline" onClick={() => resolver(item)}>
                      <CheckCircle2 /> {item.resolvido ? "Reabrir" : "Marcar como resolvido"}
                    </Button>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function formatar(valor: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(valor));
}
