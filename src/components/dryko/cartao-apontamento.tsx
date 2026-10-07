import { Check, PackageCheck, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { gruposFechados, pltsFechados, type ApontamentoTurno } from "@/lib/apontamentos-turno";
import { horaProducao } from "@/lib/producao";
import { nomeCurtoRelatorio } from "@/lib/responsaveis-relatorio";

export type SequenciaApontamento = { registro: number; inicio: number | null; fim: number | null };
type Props = {
  item: ApontamentoTurno;
  sequencia: SequenciaApontamento | undefined;
  onCorrigir?: (() => void) | undefined;
};
const numero = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
function horario(valor: string | null) {
  if (!valor) return "";
  const data = new Date(valor);
  return Number.isNaN(data.getTime())
    ? ""
    : new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
        hour: "2-digit",
        minute: "2-digit",
      }).format(data);
}

export function CartaoApontamento({ item, sequencia, onCorrigir }: Props) {
  const grupos = gruposFechados(item.grupos);
  const picado = grupos.reduce((n, g) => n + Number(g.pltPicadoRolos ?? 0), 0);
  const padroes = [...new Set(grupos.map((g) => g.rolosPorPlt))];
  const padrao = padroes.length === 1 ? padroes[0] : item.rolos_por_plt;
  const liquidos = item.setor === "liquidos";
  const unitario =
    liquidos && item.embalagem_liquido === "unidade" && item.unidades_por_plt == null;
  const sequenciaTexto =
    sequencia?.inicio != null
      ? sequencia.inicio === sequencia.fim
        ? `PLT ${sequencia.inicio}`
        : `PLTs ${sequencia.inicio} a ${sequencia.fim}`
      : item.setor === "corte" || (liquidos && !unitario)
        ? "PLT picado · 0 PLT fechado"
        : "";
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-mono text-xs font-bold text-slate-600">
            APT-{String(sequencia?.registro ?? "").padStart(3, "0")}
          </p>
          <p className="mt-1 text-xs text-slate-500">{horaProducao(item.data_hora_producao)}</p>
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${item.status === "lancado" ? "bg-emerald-100 text-emerald-800" : "bg-amber-50 text-amber-800"}`}
        >
          {item.status === "lancado" && <Check className="size-3.5" />}
          {item.status === "lancado" ? "Lançado" : "Pendente"}
        </span>
      </div>
      <p className="mb-3 mt-4 break-words font-mono text-base font-bold text-slate-950">
        {item.setor === "mantas" ? `Lote ${item.lote ?? "—"}` : `OP ${item.op ?? "—"}`} ·{" "}
        {item.produto_nome}
      </p>
      {item.setor === "fitas" ? (
        <p className="rounded-xl bg-slate-50 p-3 text-sm font-semibold">
          {numero(Number(item.area_m2 ?? 0))} m² · {numero(Number(item.tempo ?? 0))} min
        </p>
      ) : (
        <div className={`grid ${unitario ? "grid-cols-1" : "grid-cols-2"} gap-3`}>
          {!unitario && (
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Quantidade</p>
              <p className="mt-1 font-bold text-slate-950">{numero(pltsFechados(item))} PLTs</p>
            </div>
          )}
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Total</p>
            <p className="mt-1 font-bold text-slate-950">
              {numero(Number(liquidos ? (item.total_unidades ?? 0) : (item.total_rolos ?? 0)))}{" "}
              {liquidos ? "unidades" : "rolos"}
            </p>
          </div>
        </div>
      )}
      {item.setor !== "fitas" && !unitario && (
        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          {[
            sequenciaTexto,
            liquidos && item.unidades_por_plt
              ? `${numero(item.unidades_por_plt)} unidades/PLT`
              : padrao
                ? `${numero(padrao)} rolos/PLT`
                : "",
            liquidos && item.picado_unidades
              ? `${numero(item.picado_unidades)} unidades no picado`
              : "",
            picado > 0 ? `${numero(picado)} rolos no picado` : "",
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
      <p className="mt-1 text-xs text-slate-500">
        Apontado por{" "}
        <strong className="font-semibold">{nomeCurtoRelatorio(item.apontado_por_nome)}</strong>
      </p>
      {item.status === "lancado" && (
        <p className="mt-1 flex items-start gap-1 text-xs leading-relaxed text-emerald-800">
          <PackageCheck className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Lançado no Protheus por <strong>{nomeCurtoRelatorio(item.lancado_por_nome)}</strong>
            {item.lancado_em ? ` às ${horario(item.lancado_em)}` : ""}
          </span>
        </p>
      )}
      {item.correcao && (
        <div className="mt-3 rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-950">
          <p>
            Corrigido por <strong>{nomeCurtoRelatorio(item.correcao.nome)}</strong> às{" "}
            {horario(item.correcao.created_at)}
          </p>
          <p className="mt-1 whitespace-pre-wrap break-words">
            <strong>Motivo:</strong> {item.correcao.motivo}
          </p>
        </div>
      )}
      {onCorrigir ? (
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 h-10 px-2 text-slate-800"
          onClick={onCorrigir}
        >
          <Pencil className="size-4" /> Corrigir
        </Button>
      ) : (
        item.status === "lancado" && (
          <p className="mt-3 text-[11px] text-slate-500">Correção disponível ao administrador.</p>
        )
      )}
    </article>
  );
}
