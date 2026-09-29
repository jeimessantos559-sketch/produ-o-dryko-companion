import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  compact?: boolean;
};

export function HoraProducaoField({ id, value, onChange, compact = false }: Props) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className={compact ? "text-xs" : undefined}>
        Hora real da produção *
      </Label>
      <Input
        id={id}
        type="datetime-local"
        step={60}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={compact ? "h-11 text-sm" : "h-12 text-base"}
      />
      <p className="text-[11px] leading-snug text-muted-foreground">
        Preenchida automaticamente. Ajuste se estiver registrando depois da produção.
      </p>
    </div>
  );
}
