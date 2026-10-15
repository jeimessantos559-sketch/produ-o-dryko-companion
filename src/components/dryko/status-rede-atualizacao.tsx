import { RefreshCw, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { consultarVersaoPublicada, haNovaVersao, versaoDoAparelho } from "@/lib/versao-app";
import { obterVersaoPublicada } from "@/lib/versao-publicada";

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
  const [novaVersao, setNovaVersao] = useState(false);

  useEffect(() => {
    const conexao = (navigator as Navigator & { connection?: Conexao }).connection;
    const atualizar = () => {
      setOnline(navigator.onLine);
      setInstavel(
        Boolean(
          conexao &&
          (["slow-2g", "2g"].includes(conexao.effectiveType ?? "") || (conexao.rtt ?? 0) > 1500),
        ),
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
    let encerrado = false;
    let intervalo: ReturnType<typeof setInterval> | undefined;
    void navigator.serviceWorker
      .register("/sw.js?v=8", { updateViaCache: "none" })
      .then((reg) => {
        if (encerrado) return;
        const observar = (sw: ServiceWorker | null) => {
          if (!sw) return;
          const conferir = () => {
            if (!encerrado && sw.state === "installed" && navigator.serviceWorker.controller)
              setEspera(sw);
          };
          sw.addEventListener("statechange", conferir);
          conferir();
        };
        if (reg.waiting && navigator.serviceWorker.controller) setEspera(reg.waiting);
        observar(reg.installing);
        reg.addEventListener("updatefound", () => observar(reg.installing));
        void reg.update().catch(() => undefined);
        intervalo = setInterval(aoVoltar, 5 * 60_000);
      })
      .catch(() => undefined);
    // Ao voltar para o app, confere se o service worker mudou.
    const aoVoltar = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      void navigator.serviceWorker
        .getRegistration()
        .then((reg) => reg?.update())
        .catch(() => undefined);
    };
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("online", aoVoltar);
    window.addEventListener("focus", aoVoltar);
    return () => {
      encerrado = true;
      clearInterval(intervalo);
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("online", aoVoltar);
      window.removeEventListener("focus", aoVoltar);
    };
  }, []);

  // Cada publicação tem um commit; se o servidor estiver em outro, há versão nova.
  // Funciona mesmo quando o arquivo do service worker não muda.
  useEffect(() => {
    let encerrado = false;
    let consultando = false;
    const verificar = () => {
      if (consultando || document.visibilityState !== "visible" || !navigator.onLine) return;
      consultando = true;
      void consultarVersaoPublicada()
        .catch(() => obterVersaoPublicada().then((r) => r?.versao ?? null))
        .then((versao) => {
          if (!encerrado && haNovaVersao(versaoDoAparelho(), versao)) setNovaVersao(true);
        })
        .catch(() => undefined)
        .finally(() => {
          consultando = false;
        });
    };
    const inicial = setTimeout(verificar, 3_000);
    const intervalo = setInterval(verificar, 2 * 60_000);
    document.addEventListener("visibilitychange", verificar);
    window.addEventListener("online", verificar);
    window.addEventListener("focus", verificar);
    return () => {
      encerrado = true;
      clearTimeout(inicial);
      clearInterval(intervalo);
      document.removeEventListener("visibilitychange", verificar);
      window.removeEventListener("online", verificar);
      window.removeEventListener("focus", verificar);
    };
  }, []);

  function aplicarAtualizacao() {
    if (!espera) {
      // Sem service worker novo: recarregar já busca a versão nova (páginas vêm da rede).
      window.location.reload();
      return;
    }
    // Só recarrega após o usuário pedir, para não perder um formulário em andamento.
    navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload(), {
      once: true,
    });
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
          {online ? "Rede instável" : "Sem internet — apontamentos ficam guardados no aparelho"}
        </div>
      )}
      {(espera || novaVersao) && (
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
