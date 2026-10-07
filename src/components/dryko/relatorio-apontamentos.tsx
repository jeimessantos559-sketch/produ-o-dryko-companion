import type { Json } from "@/integrations/supabase/types";
import { responsaveisDoApontamento } from "@/lib/responsaveis-relatorio";

function objeto(valor: Json): Record<string, Json | undefined> {
  return valor && typeof valor === "object" && !Array.isArray(valor) ? valor : {};
}

function texto(valor: Json | undefined) {
  return valor === null || valor === undefined || typeof valor === "object" || valor === ""
    ? "—"
    : String(valor);
}

function numero(valor: Json | undefined) {
  const convertido = Number(valor ?? 0);
  return Number.isFinite(convertido) ? convertido : 0;
}

function formatarNumero(valor: number, casas = 2) {
  return valor.toLocaleString("pt-BR", { maximumFractionDigits: casas });
}

function formatarDataHora(valor: string | null) {
  if (!valor) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(valor));
}

export function RelatorioApontamentos({
  apontamentos,
  fitas,
  unidade,
  liquidos = false,
}: {
  apontamentos: Json[];
  fitas: boolean;
  unidade: string;
  liquidos?: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200">
      <table className="w-full min-w-[880px] table-fixed border-collapse text-sm sm:min-w-[940px]">
        <colgroup>
          <col className="w-[44px]" />
          <col className="w-[100px]" />
          <col className="w-[180px]" />
          <col className="w-[52px]" />
          <col className="w-[64px]" />
          <col className="w-[100px]" />
          <col className="w-[140px] sm:w-[160px]" />
          <col className="w-[200px] sm:w-[240px]" />
        </colgroup>
        <thead className="bg-slate-100 text-left text-xs font-extrabold uppercase tracking-wide text-slate-600">
          <tr className="divide-x divide-slate-200 border-b border-slate-200">
            {[
              "Seq.",
              "OP / Lote",
              "Produto",
              "PLTs",
              liquidos ? "Unidades" : "Rolos",
              liquidos ? "Semi (kg)" : "Produção",
              "Apontado por",
              "Protheus / Lançado por",
            ].map((titulo) => (
              <th key={titulo} scope="col" className="px-3 py-3">
                {titulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {apontamentos.map((valor, indice) => {
            const item = objeto(valor);
            const responsaveis = responsaveisDoApontamento(item);
            const inicio = texto(item["sequencia_inicio"]);
            const fim = texto(item["sequencia_fim"]);
            const sequencia =
              inicio !== "—" && fim !== "—"
                ? inicio === fim
                  ? inicio
                  : `${inicio}–${fim}`
                : String(indice + 1);
            const producao = liquidos
              ? item["embalagem_liquido"] === "unidade" &&
                item["semi_kg_por_unidade"] == null &&
                numero(item["semi_consumido_kg"]) === 0
                ? "—"
                : `${formatarNumero(numero(item["semi_consumido_kg"]), 3)} kg`
              : fitas
                ? `${formatarNumero(numero(item["area_m2"]))} m²`
                : `${formatarNumero(numero(item["metragem"]))} ${unidade}`;
            return (
              <tr
                key={texto(item["id"]) === "—" ? indice : texto(item["id"])}
                className="divide-x divide-slate-200 bg-white align-top"
              >
                <td className="px-3 py-3 text-slate-600">{sequencia}</td>
                <td className="break-words px-3 py-3 font-semibold text-slate-900">
                  {texto(item["op"] ?? item["lote"])}
                </td>
                <td className="break-words px-3 py-3 font-semibold text-slate-900">
                  {texto(item["produto_nome"])}
                </td>
                <td className="px-3 py-3 text-slate-600">
                  {formatarNumero(numero(item["quantidade_plts"]), 0)}
                </td>
                <td className="px-3 py-3 text-slate-600">
                  {formatarNumero(numero(item[liquidos ? "total_unidades" : "total_rolos"]), 0)}
                </td>
                <td className="break-words px-3 py-3 text-slate-600">{producao}</td>
                <td className="px-3 py-3">
                  <p className="break-words font-bold text-slate-900">{responsaveis.apontador}</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    {formatarDataHora(responsaveis.apontadoEm)}
                  </p>
                </td>
                <td className="px-3 py-3">
                  <p
                    className={`font-bold ${responsaveis.lancado ? "text-emerald-800" : "text-amber-800"}`}
                  >
                    {responsaveis.lancado ? "Lançado" : "Pendente"}
                  </p>
                  <p className="mt-1 break-words text-xs leading-relaxed text-slate-500">
                    {responsaveis.lancado
                      ? `${responsaveis.lancador} · ${formatarDataHora(responsaveis.lancadoEm)}`
                      : "Aguardando lançamento"}
                  </p>
                </td>
              </tr>
            );
          })}
          {apontamentos.length === 0 && (
            <tr>
              <td colSpan={8} className="p-4 text-slate-500">
                Nenhum apontamento registrado.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
