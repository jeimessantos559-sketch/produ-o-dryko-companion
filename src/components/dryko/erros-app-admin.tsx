import { Bug, ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type ErroApp = Database["public"]["Tables"]["erros_app"]["Row"];

const ORIGEM: Record<string, string> = {
  tela: "Tela",
  codigo: "Código",
  promessa: "Código",
  apontamento: "Apontamento",
};

function quando(valor: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(valor));
}

/** Erros gravados automaticamente pelos aparelhos nos últimos 7 dias (só administrador). */
export function ErrosAppAdmin() {
  const [erros, setErros] = useState<ErroApp[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [nomes, setNomes] = useState<Record<string, string>>({});
  const [aberto, setAberto] = useState<string | null>(null);
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    let ativo = true;
    const desde = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString();
    void supabase
      .from("erros_app")
      .select("*", { count: "exact" })
      .gte("created_at", desde)
      .order("created_at", { ascending: false })
      .limit(15)
      .then(async ({ data, count, error }) => {
        if (!ativo) return;
        if (error) {
          setFalhou(true);
          return;
        }
        const lista = (data ?? []) as ErroApp[];
        setErros(lista);
        setTotal(count ?? lista.length);
        const ids = [...new Set(lista.map((item) => item.usuario_id))];
        if (!ids.length) return;
        const { data: perfis } = await supabase.from("profiles").select("id, nome").in("id", ids);
        if (!ativo) return;
        setNomes(
          Object.fromEntries(
            ((perfis ?? []) as { id: string; nome: string | null }[]).map((p) => [
              p.id,
              p.nome || "Usuário",
            ]),
          ),
        );
      });
    return () => {
      ativo = false;
    };
  }, []);

  return (
    <section className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-extrabold">
          <Bug className="size-5 text-primary" /> Erros do aplicativo
        </h2>
        <span className="text-sm font-semibold text-muted-foreground">
          {falhou ? "—" : total === null ? "…" : `${total} em 7 dias`}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Registrados automaticamente pelos aparelhos. Falta de internet não conta como erro.
      </p>

      {falhou ? (
        <p className="mt-3 rounded-xl bg-muted px-3 py-3 text-sm">
          Não foi possível carregar os erros.
        </p>
      ) : total === 0 ? (
        <p className="mt-3 rounded-xl bg-muted px-3 py-3 text-sm">Nenhum erro nos últimos 7 dias.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {erros.map((item) => (
            <li key={item.id} className="rounded-xl bg-muted px-3 py-2.5 text-sm">
              <button
                type="button"
                className="flex w-full items-start justify-between gap-2 text-left"
                onClick={() => setAberto(aberto === item.id ? null : item.id)}
                aria-expanded={aberto === item.id}
              >
                <span className="min-w-0">
                  <span className="line-clamp-2 break-words font-semibold">{item.mensagem}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {quando(item.created_at)} · {ORIGEM[item.origem] ?? item.origem} ·{" "}
                    {item.rota ?? "—"} · {nomes[item.usuario_id] ?? "…"}
                  </span>
                </span>
                <ChevronDown
                  className={`mt-0.5 size-4 shrink-0 transition-transform ${aberto === item.id ? "rotate-180" : ""}`}
                />
              </button>
              {aberto === item.id && (
                <div className="mt-2 space-y-1 border-t border-border pt-2 text-xs text-muted-foreground">
                  <p>
                    Versão {item.versao ?? "—"}
                    {item.setor ? ` · ${item.setor}` : ""}
                    {item.turno ? ` · ${item.turno}` : ""}
                  </p>
                  <p className="break-words">{item.navegador ?? "—"}</p>
                  {item.pilha && (
                    <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-background p-2 font-mono text-[11px]">
                      {item.pilha}
                    </pre>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
