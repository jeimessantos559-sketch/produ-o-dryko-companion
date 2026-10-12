import { AlertTriangle, CloudUpload, RotateCcw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import { EVENTO_FILA, lerFila, type ApontamentoNaFila } from "@/lib/fila-offline";
import {
  descartarDaFila,
  sincronizarFila,
  tentarNovamente,
  type ResumoEnvio,
} from "@/lib/sincronizar-apontamentos";

const NOME_TURNO: Record<string, string> = { T1: "1º turno", T2: "2º turno", T3: "3º turno" };

function horaSalva(valor: string) {
  const data = new Date(valor);
  return Number.isNaN(data.getTime())
    ? ""
    : new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(data);
}

/** Lê e acompanha a fila do usuário logado neste aparelho. */
export function useFilaSemInternet() {
  const { user } = useAuth();
  const usuarioId = user?.id ?? null;
  const [itens, setItens] = useState<ApontamentoNaFila[]>([]);

  useEffect(() => {
    const atualizar = () => setItens(lerFila(usuarioId));
    atualizar();
    window.addEventListener(EVENTO_FILA, atualizar);
    window.addEventListener("storage", atualizar);
    return () => {
      window.removeEventListener(EVENTO_FILA, atualizar);
      window.removeEventListener("storage", atualizar);
    };
  }, [usuarioId]);

  return { usuarioId, itens };
}

function avisarResultado(resumo: ResumoEnvio, manual: boolean) {
  if (resumo.enviados > 0) {
    toast.success(
      resumo.enviados === 1
        ? "1 apontamento feito sem internet foi enviado."
        : `${resumo.enviados} apontamentos feitos sem internet foram enviados.`,
    );
  }
  if (resumo.conflitos > 0 && (manual || resumo.enviados > 0)) {
    toast.warning("Há apontamento sem internet que precisa de revisão.");
  } else if (manual && resumo.enviados === 0 && resumo.aguardando > 0) {
    toast.info("Ainda sem conexão com o servidor. O envio será tentado de novo.");
  }
}

/** Envio automático da fila e acesso à lista de apontamentos guardados no aparelho. */
export function FilaSemInternet() {
  const { usuarioId, itens } = useFilaSemInternet();
  const [aberta, setAberta] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const aguardando = itens.filter((item) => item.situacao === "aguardando").length;
  const conflitos = itens.filter((item) => item.situacao === "conflito").length;

  const enviar = useCallback(
    async (manual = false) => {
      if (!usuarioId) return;
      setEnviando(true);
      try {
        avisarResultado(await sincronizarFila(usuarioId), manual);
      } finally {
        setEnviando(false);
      }
    },
    [usuarioId],
  );

  // Tenta ao abrir o app, quando a conexão volta, ao voltar para a tela e a cada minuto.
  useEffect(() => {
    if (!usuarioId || aguardando === 0) return;
    const tentar = () => {
      if (navigator.onLine) void enviar();
    };
    tentar();
    const visivel = () => {
      if (document.visibilityState === "visible") tentar();
    };
    window.addEventListener("online", tentar);
    document.addEventListener("visibilitychange", visivel);
    const intervalo = window.setInterval(tentar, 60_000);
    return () => {
      window.removeEventListener("online", tentar);
      document.removeEventListener("visibilitychange", visivel);
      window.clearInterval(intervalo);
    };
  }, [usuarioId, aguardando, enviar]);

  if (!usuarioId || itens.length === 0) return null;

  async function reenviar(item: ApontamentoNaFila) {
    if (!usuarioId) return;
    setEnviando(true);
    try {
      avisarResultado(await tentarNovamente(usuarioId, item.id), true);
    } finally {
      setEnviando(false);
    }
  }

  function descartar(item: ApontamentoNaFila) {
    if (!usuarioId) return;
    if (
      !window.confirm(
        `Descartar o apontamento "${item.descricao}"? Ele foi salvo só neste aparelho e não poderá ser recuperado.`,
      )
    )
      return;
    descartarDaFila(usuarioId, item.id);
    toast.info("Apontamento descartado.");
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAberta(true)}
        className={`fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-3 z-[104] flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-semibold shadow-lg ${
          conflitos > 0
            ? "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100"
            : "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
        }`}
        aria-label="Ver apontamentos feitos sem internet"
      >
        {conflitos > 0 ? (
          <AlertTriangle className="size-4 shrink-0" />
        ) : (
          <CloudUpload className={`size-4 shrink-0 ${enviando ? "animate-pulse" : ""}`} />
        )}
        {conflitos > 0
          ? `${conflitos} para revisar`
          : `${aguardando} aguardando envio`}
      </button>

      <Dialog open={aberta} onOpenChange={setAberta}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-2xl p-4 sm:max-w-lg sm:p-5">
          <DialogHeader className="space-y-1 pr-7">
            <DialogTitle>Apontamentos feitos sem internet</DialogTitle>
            <DialogDescription>
              Guardados só neste aparelho. São enviados automaticamente quando a conexão volta,
              com a hora em que foram salvos (prazo de 12 horas).
            </DialogDescription>
          </DialogHeader>

          <ul className="space-y-2">
            {itens.map((item) => (
              <li
                key={item.id}
                className={`rounded-xl border p-3 text-sm ${
                  item.situacao === "conflito"
                    ? "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40"
                    : "border-border bg-muted/40"
                }`}
              >
                <p className="break-words font-semibold text-foreground">{item.descricao}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {NOME_TURNO[item.turno] ?? item.turno} · salvo em {horaSalva(item.registradoEm)}
                </p>
                {item.situacao === "conflito" ? (
                  <>
                    <p className="mt-2 text-xs leading-relaxed text-red-900 dark:text-red-100">
                      {item.erro}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={enviando}
                        onClick={() => void reenviar(item)}
                      >
                        <RotateCcw className="size-4" /> Tentar de novo
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => descartar(item)}>
                        <Trash2 className="size-4" /> Descartar
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="mt-2 text-xs font-semibold text-amber-800 dark:text-amber-200">
                    Aguardando envio
                  </p>
                )}
              </li>
            ))}
          </ul>

          {aguardando > 0 && (
            <Button className="w-full" disabled={enviando} onClick={() => void enviar(true)}>
              <CloudUpload className="size-4" />
              {enviando ? "Enviando..." : "Enviar agora"}
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
