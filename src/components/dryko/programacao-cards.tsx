import { Card, CardContent } from "@/components/ui/card";
import {
  destaqueHora,
  fmt,
  intervaloHora,
  resumoProdutosHora,
  secundarioHora,
  type HoraPlanejada,
} from "@/lib/programacao-hora";

export function HoraCard({
  item,
  setor,
  unidade,
  mostrarMeta,
}: {
  item: HoraPlanejada;
  setor: string | null | undefined;
  unidade: string;
  mostrarMeta: boolean;
}) {
  return (
    <article className="overflow-hidden rounded-[1.6rem] border border-border bg-card shadow-sm">
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xl font-black text-foreground">{intervaloHora(item.hora)}</p>
            <p className="mt-2 text-sm font-semibold text-muted-foreground">
              {resumoProdutosHora(item, setor)}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-2xl font-black text-primary">{destaqueHora(item, setor)}</p>
            <p className="mt-1 text-sm font-bold text-muted-foreground">
              {secundarioHora(item, setor)}
            </p>
          </div>
        </div>

        {mostrarMeta && (
          <>
            <div className="my-4 border-t border-border" />
            <div className="grid grid-cols-3 gap-3">
              <MetricaHora label="Previsto" valor={`${fmt(item.metaHora)} ${unidade}`} />
              <MetricaHora label="Acumulado" valor={`${fmt(item.realizadoAcumulado)} ${unidade}`} />
              <MetricaHora
                label="Δ acumulado"
                valor={`${item.saldoAcumulado > 0 ? "+" : ""}${fmt(item.saldoAcumulado)} ${unidade}`}
                negativo={item.saldoAcumulado < 0}
              />
            </div>
          </>
        )}
      </div>
    </article>
  );
}

export function ResumoGrande({
  label,
  valor,
  destaque = false,
  className = "",
}: {
  label: string;
  valor: string;
  destaque?: boolean;
  className?: string;
}) {
  return (
    <Card
      className={`rounded-2xl border-border ${destaque ? "border-primary/40 bg-primary/10" : ""} ${className}`}
    >
      <CardContent className="p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={`mt-2 text-2xl font-black ${destaque ? "text-primary" : "text-foreground"}`}>
          {valor}
        </p>
      </CardContent>
    </Card>
  );
}

export function MetricaHora({
  label,
  valor,
  negativo = false,
}: {
  label: string;
  valor: string;
  negativo?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p
        className={`mt-1 break-words text-base font-black ${negativo ? "text-primary" : "text-foreground"}`}
      >
        {valor}
      </p>
    </div>
  );
}

export function Mini({
  label,
  valor,
  destaque = false,
  alerta = false,
}: {
  label: string;
  valor: string;
  destaque?: boolean;
  alerta?: boolean;
}) {
  return (
    <div
      className={`rounded-lg p-2 ${
        alerta ? "bg-amber-100/80 dark:bg-amber-950/50" : destaque ? "bg-primary/10" : "bg-muted"
      }`}
    >
      <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
      <p
        className={`font-bold ${alerta ? "text-amber-900 dark:text-amber-100" : destaque ? "text-primary" : ""}`}
      >
        {valor}
      </p>
    </div>
  );
}
