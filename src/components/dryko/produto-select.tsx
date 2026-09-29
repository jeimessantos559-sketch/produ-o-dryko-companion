import { useMemo } from "react";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { agruparProdutosPorMarca, type ProdutoOrdenavel } from "@/lib/catalogo-produtos";
import { cn } from "@/lib/utils";

type ProdutoSelectProps<T extends ProdutoOrdenavel> = {
  produtos: readonly T[];
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  carregando?: boolean;
  placeholder?: string;
  id?: string;
  className?: string;
};

export function ProdutoSelect<T extends ProdutoOrdenavel>({
  produtos,
  value,
  onValueChange,
  disabled,
  carregando,
  placeholder = "Selecione",
  id,
  className,
}: ProdutoSelectProps<T>) {
  const grupos = useMemo(() => agruparProdutosPorMarca(produtos), [produtos]);

  return (
    <Select value={value} onValueChange={onValueChange} disabled={Boolean(disabled || carregando)}>
      <SelectTrigger
        id={id}
        className={cn(
          "h-11 touch-manipulation rounded-xl border-slate-300 bg-white px-3 text-base font-semibold shadow-sm",
          className,
        )}
      >
        <SelectValue placeholder={carregando ? "Carregando..." : placeholder} />
      </SelectTrigger>
      <SelectContent
        position="popper"
        sideOffset={6}
        className="max-h-[min(46dvh,20rem)] w-[var(--radix-select-trigger-width)] rounded-xl border-slate-200 bg-white p-1 shadow-2xl [&_[data-radix-select-viewport]]:max-h-[min(44dvh,19rem)]"
      >
        {grupos.map(([marca, itens]) => (
          <SelectGroup key={marca}>
            <SelectLabel className="px-2 pb-1 pt-2 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
              {marca}
            </SelectLabel>
            {itens.map((produto) => (
              <SelectItem
                key={produto.id}
                value={produto.id}
                className="min-h-10 touch-manipulation rounded-lg px-2 pr-8 text-sm font-medium focus:bg-red-50 focus:text-slate-950"
              >
                {produto.nome}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
