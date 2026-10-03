import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { toast } from "sonner";

import { PwaInstallPrompt } from "@/components/dryko/pwa-install-prompt";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/lib/auth";
import appCss from "../styles.css?url";
import themeCss from "../theme-dark.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Página não encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">O endereço não existe ou foi alterado.</p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Voltar ao início
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Não foi possível carregar esta tela
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          O erro foi registrado. Tente novamente ou volte ao início.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Tentar novamente
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Voltar ao início
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "Aponta Produção — DRYKO" },
      {
        name: "description",
        content: "Apontamento de produção DRYKO por setor e turno.",
      },
      { name: "author", content: "DRYKO" },
      { name: "theme-color", content: "#ed1c24" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "Aponta DRYKO" },
      { property: "og:title", content: "Aponta Produção — DRYKO" },
      {
        property: "og:description",
        content: "Apontamento de produção DRYKO por setor e turno.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: "@Lovable" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      {
        rel: "stylesheet",
        href: themeCss,
      },
      { rel: "manifest", href: "/manifest.webmanifest?v=5" },
      { rel: "icon", href: "/favicon.ico?v=5", sizes: "any" },
      { rel: "icon", href: "/ap-pwa-192-v5.png", type: "image/png", sizes: "192x192" },
      { rel: "apple-touch-icon", href: "/ap-touch-180-v5.png", sizes: "180x180" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    const temaSalvo = window.localStorage.getItem("dryko-theme");
    const tema = temaSalvo === "dark" ? "dark" : "light";
    document.documentElement.classList.toggle("dark", tema === "dark");
    document.documentElement.style.colorScheme = tema;

    let recarregando = false;
    const aoTrocarControlador = () => {
      if (recarregando) return;
      recarregando = true;
      window.location.reload();
    };

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("controllerchange", aoTrocarControlador);
      void navigator.serviceWorker
        .register("/sw.js?v=7")
        .then((registro) => {
          const avisarAtualizacao = () => {
            if (!registro.waiting || !navigator.serviceWorker.controller) return;
            toast.info("Nova versão disponível", {
              id: "dryko-pwa-update",
              description: "Atualize quando terminar o apontamento em andamento.",
              duration: Infinity,
              action: {
                label: "Atualizar",
                onClick: () => registro.waiting?.postMessage({ type: "SKIP_WAITING" }),
              },
            });
          };

          avisarAtualizacao();
          registro.addEventListener("updatefound", () => {
            const instalando = registro.installing;
            instalando?.addEventListener("statechange", () => {
              if (instalando.state === "installed") avisarAtualizacao();
            });
          });
        })
        .catch(() => undefined);
    }

    const antesDeInstalar = (evento: Event) => {
      evento.preventDefault();
      window.__drykoInstallPrompt = evento;
      window.dispatchEvent(new Event("dryko-pwa-ready"));
    };

    const instalado = () => {
      window.__drykoInstallPrompt = null;
    };

    window.addEventListener("beforeinstallprompt", antesDeInstalar);
    window.addEventListener("appinstalled", instalado);
    return () => {
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener("controllerchange", aoTrocarControlador);
      }
      window.removeEventListener("beforeinstallprompt", antesDeInstalar);
      window.removeEventListener("appinstalled", instalado);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <Outlet />
        <PwaInstallPrompt />
        <Toaster position="top-center" richColors />
      </AuthProvider>
    </QueryClientProvider>
  );
}
