import { RefreshCw, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

type Conexao = {
  effectiveType?: string;
  rtt?: number;
  addEventListener?: (t: string, f: () => void) => void;
  removeEventListener?: (t: string, f: () => void) => void;
};

/** Indicador discreto de offline/rede instável + aviso seguro de nova versão do app. */
export function StatusRedeAtualizacao() {
  const [online, setOnline] = useState(true);
  const [instavel, setInstavel] = useState(false);
  const [espera, setEspera] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    const conexao = (navigator as Navigator & { connection?: Conexao }).connection;
    const atualizar = () => {
      setOnline(navigator.onLine);
      setInstavel(
        Boolean(conexao && (["slow-2g", "2g"].includes(conexao.effectiveType ?? "") || (conexao.rtt ?? 0) > 1500)),
      );
    };
    atualizar();
    window.addEventListener("online", atualizar);
    window.addEventListener("offline", atualizar);
    conexao?.addEventListener?.("change", atualizar);
    return () => {
      window.removeEventListener("online", atualizar);
      window.removeEventListener("offline", atualizar);
      conexao?.removeEventListener?.("change", atualizar);
    };
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let intervalo: ReturnType<typeof setInterval> | undefined;
    void navigator.serviceWorker
      .register("/sw.js?v=7")
      .then((reg) => {
        const observar = (sw: ServiceWorker | null) => {
          if (!sw) return;
          sw.addEventListener("statechange", () => {
            if (sw.state === "installed" && navigator.serviceWorker.controller) setEspera(sw);
          });
        };
        if (reg.waiting && navigator.serviceWorker.controller) setEspera(reg.waiting);
        reg.addEventListener("updatefound", () => observar(reg.installing));
        intervalo = setInterval(() => void reg.update().catch(() => undefined), 30 * 60_000);
      })
      .catch(() => undefined);
    return () => clearInterval(intervalo);
  }, []);

  function aplicarAtualizacao() {
    if (!espera) return;
    // Só recarrega após o usuário pedir, para não perder um formulário em andamento.
    navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload(), { once: true });
    espera.postMessage({ tipo: "SKIP_WAITING" });
  }

  return (
    <>
      {(!online || instavel) && (
        <div
          role="status"
          className="fixed left-1/2 top-2 z-[110] flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-foreground shadow-md"
        >
          <WifiOff className={`size-3.5 ${online ? "text-amber-500" : "text-destructive"}`} />
          {online ? "Rede instável" : "Sem internet — nada será salvo"}
        </div>
      )}
      {espera && (
        <div className="fixed inset-x-3 bottom-4 z-[105] mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-2xl">
          <RefreshCw className="size-5 shrink-0 text-primary" />
          <p className="flex-1 text-sm text-foreground">
            Nova versão disponível. Salve o que estiver fazendo e atualize.
          </p>
          <Button size="sm" onClick={aplicarAtualizacao}>
            Atualizar
          </Button>
        </div>
      )}
    </>
  );
}
