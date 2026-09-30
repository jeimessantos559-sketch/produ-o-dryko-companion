import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  compact?: boolean;
};

export function HoraProducaoField({ id, value, compact = false }: Props) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className={compact ? "text-xs" : undefined}>
        Data e hora automáticas
      </Label>
      <Input
        id={id}
        type="datetime-local"
        step={60}
        value={value}
        disabled
        readOnly
        aria-readonly="true"
        className={`${compact ? "h-11 text-sm" : "h-12 text-base"} cursor-not-allowed opacity-80`}
      />
      <p className="text-[11px] leading-snug text-muted-foreground">
        Definidas automaticamente pelo sistema e não podem ser alteradas manualmente.
      </p>
    </div>
  );
}
