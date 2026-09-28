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
  const grupos = agruparProdutosPorMarca(produtos);

  return (
    <Select value={value} onValueChange={onValueChange} disabled={Boolean(disabled || carregando)}>
      <SelectTrigger
        id={id}
        className={cn(
          "h-12 rounded-xl border-slate-300 bg-white px-3 text-base font-semibold shadow-sm",
          className,
        )}
      >
        <SelectValue placeholder={carregando ? "Carregando..." : placeholder} />
      </SelectTrigger>
      <SelectContent className="max-h-[min(70vh,32rem)] rounded-2xl border-slate-200 bg-white p-1.5 shadow-2xl">
        {grupos.map(([marca, itens]) => (
          <SelectGroup key={marca}>
            <SelectLabel className="px-3 pb-1 pt-3 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
              {marca}
            </SelectLabel>
            {itens.map((produto) => (
              <SelectItem
                key={produto.id}
                value={produto.id}
                className="min-h-11 rounded-xl px-3 pr-9 text-base font-medium focus:bg-red-50 focus:text-slate-950"
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
