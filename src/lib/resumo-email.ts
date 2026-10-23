// Linhas de produção do corpo do e-mail do relatório, conforme a unidade de cada setor.
import { setorComConsumoSemi } from "./liquidos.ts";
import { formatarKg, setorEmKg } from "./misturadores.ts";

function campo(obj: unknown, chave: string): unknown {
  return obj && typeof obj === "object" && !Array.isArray(obj)
    ? (obj as Record<string, unknown>)[chave]
    : undefined;
}

function numero(valor: unknown) {
  const n = Number(valor ?? 0);
  return Number.isFinite(n) ? n : 0;
}

const inteiro = (valor: unknown) => numero(valor).toLocaleString("pt-BR", { maximumFractionDigits: 2 });

export function linhasDeProducaoEmail(setor: string, totais: unknown): string[] {
  if (setorEmKg(setor)) return [`Peso produzido: ${formatarKg(numero(campo(totais, "pesoKg")))}`];
  if (setorComConsumoSemi(setor))
    return [
      `PLTs: ${inteiro(campo(totais, "plts"))}`,
      `Unidades: ${inteiro(campo(totais, "unidades"))}`,
      `Semi consumido: ${formatarKg(numero(campo(totais, "semiKg")))}`,
    ];
  if (setor === "fitas") return ["PLTs: —", `Área: ${inteiro(campo(totais, "area"))} m²`];
  return [
    `PLTs: ${inteiro(campo(totais, "plts"))}`,
    `Metragem: ${inteiro(campo(totais, "metragem"))} ${setor === "mantas" ? "m" : "m²"}`,
  ];
}
