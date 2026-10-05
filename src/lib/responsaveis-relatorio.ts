import type { Json } from "@/integrations/supabase/types";
import { aliasDoNome } from "./login-operacional.ts";

function registro(valor: Json | undefined): Record<string, Json | undefined> {
  return valor && typeof valor === "object" && !Array.isArray(valor) ? valor : {};
}

function nome(valor: Json | undefined) {
  if (typeof valor !== "string") return null;
  const limpo = valor.trim();
  return !limpo ||
    ["usuário", "usuario", "sem nome", "não identificado"].includes(limpo.toLowerCase())
    ? null
    : limpo;
}

function dataHora(valor: Json | undefined) {
  return typeof valor === "string" && !Number.isNaN(new Date(valor).getTime()) ? valor : null;
}

// Usa o mesmo padrão de primeiro nome e último sobrenome do login operacional.
export function nomeCurtoRelatorio(valor: Json | undefined) {
  const completo = nome(valor);
  if (!completo) return "Não identificado";
  const alias = aliasDoNome(completo.replace(/[._]+/g, " "));
  return alias
    ? alias
        .split(".")
        .map((parte) => parte.charAt(0).toUpperCase() + parte.slice(1))
        .join(" ")
    : completo;
}

export function responsaveisDoApontamento(valor: Json | undefined) {
  const item = registro(valor);
  const lancado = item["status"] === "lancado";
  return {
    apontador: nomeCurtoRelatorio(item["apontado_por_nome"]),
    apontadoEm: dataHora(item["created_at"]),
    lancador: lancado ? nomeCurtoRelatorio(item["lancado_por_nome"]) : "Pendente no Protheus",
    lancadoEm: lancado ? dataHora(item["lancado_em"]) : null,
    lancado,
  };
}

// Os nomes históricos têm prioridade; os perfis completam apenas nomes ausentes.
export function completarResponsaveisRelatorio(resumo: Json, nomes: Record<string, string>): Json {
  const raiz = registro(resumo);
  if (!Array.isArray(raiz["apontamentos"])) return resumo;
  return {
    ...raiz,
    apontamentos: raiz["apontamentos"].map((valor) => {
      if (!valor || typeof valor !== "object" || Array.isArray(valor)) return valor;
      const apontadorId = typeof valor["usuario_id"] === "string" ? valor["usuario_id"] : "";
      const lancadorId = typeof valor["lancado_por"] === "string" ? valor["lancado_por"] : "";
      return {
        ...valor,
        apontado_por_nome: nome(valor["apontado_por_nome"]) ?? nome(nomes[apontadorId]) ?? null,
        lancado_por_nome:
          valor["status"] === "lancado"
            ? (nome(valor["lancado_por_nome"]) ?? nome(nomes[lancadorId]) ?? null)
            : null,
      };
    }),
  };
}

export function nomesResponsaveisRelatorio(resumo: Json) {
  const raiz = registro(resumo);
  const itens = Array.isArray(raiz["apontamentos"]) ? raiz["apontamentos"] : [];
  const responsaveis = itens.map(responsaveisDoApontamento);
  return {
    apontadores:
      [...new Set(responsaveis.map((item) => item.apontador))].join(", ") || "Não identificado",
    lancadores:
      [...new Set(responsaveis.filter((item) => item.lancado).map((item) => item.lancador))].join(
        ", ",
      ) || "Pendente no Protheus",
  };
}
