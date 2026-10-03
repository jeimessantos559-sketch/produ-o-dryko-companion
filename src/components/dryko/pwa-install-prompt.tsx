import { Download, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

type PromptInstalacao = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export function PwaInstallPrompt() {
  const [prompt, setPrompt] = useState<PromptInstalacao | null>(null);
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    const instalado = window.matchMedia("(display-mode: standalone)").matches;
    if (instalado) return;

    const existente = window.__drykoInstallPrompt as PromptInstalacao | undefined;
    if (existente) {
      setPrompt(existente);
      setVisivel(true);
    }

    function pronto() {
      const evento = window.__drykoInstallPrompt as PromptInstalacao | undefined;
      if (evento) {
        setPrompt(evento);
        setVisivel(true);
      }
    }

    function instaladoApp() {
      setVisivel(false);
      setPrompt(null);
    }

    window.addEventListener("dryko-pwa-ready", pronto);
    window.addEventListener("appinstalled", instaladoApp);
    return () => {
      window.removeEventListener("dryko-pwa-ready", pronto);
      window.removeEventListener("appinstalled", instaladoApp);
    };
  }, []);

  if (!visivel || !prompt) return null;

  async function instalar() {
    try {
      if (!prompt) return;
      await prompt.prompt();
      const escolha = await prompt.userChoice;
      if (escolha.outcome === "accepted") {
        toast.success("Aplicativo instalado no celular.");
        setVisivel(false);
        setPrompt(null);
        window.__drykoInstallPrompt = null;
      }
    } catch {
      toast.error("Não foi possível abrir a instalação. Tente pelo menu do navegador.");
    }
  }

  return (
    <div className="fixed inset-x-3 bottom-4 z-[100] mx-auto max-w-md rounded-2xl border border-border bg-card p-3 shadow-2xl sm:bottom-6">
      <div className="flex items-center gap-3">
        <img
          src="/ap-pwa-192-v5.png"
          alt="Aponta Produção DRYKO"
          width={48}
          height={48}
          className="size-12 shrink-0 rounded-xl"
          draggable={false}
        />
        <div className="min-w-0 flex-1">
          <p className="font-bold text-foreground">Instalar Aponta Produção</p>
          <p className="text-xs text-muted-foreground">
            Use como aplicativo, sem precisar abrir o navegador.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setVisivel(false)}
          className="rounded-lg p-2 text-muted-foreground hover:bg-muted"
          aria-label="Fechar aviso de instalação"
        >
          <X className="size-4" />
        </button>
      </div>
      <Button className="mt-3 h-11 w-full" onClick={() => void instalar()}>
        <Download className="size-4" /> Instalar aplicativo
      </Button>
    </div>
  );
}
