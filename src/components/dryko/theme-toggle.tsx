import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

const CHAVE_TEMA = "dryko-theme";

type Tema = "light" | "dark";

export function ThemeToggle() {
  const [tema, setTema] = useState<Tema>("light");

  useEffect(() => {
    const escuro = document.documentElement.classList.contains("dark");
    setTema(escuro ? "dark" : "light");
  }, []);

  function alternar() {
    const proximo: Tema = tema === "dark" ? "light" : "dark";
    document.documentElement.classList.toggle("dark", proximo === "dark");
    document.documentElement.style.colorScheme = proximo;
    window.localStorage.setItem(CHAVE_TEMA, proximo);
    setTema(proximo);
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="h-10 w-10 shrink-0 rounded-xl border-border bg-transparent shadow-none"
      onClick={alternar}
      aria-label={tema === "dark" ? "Usar tema claro" : "Usar tema escuro"}
      title={tema === "dark" ? "Tema claro" : "Tema escuro"}
    >
      {tema === "dark" ? <Sun className="size-4.5" /> : <Moon className="size-4.5" />}
    </Button>
  );
}
