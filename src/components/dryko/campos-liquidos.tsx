import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  calcularLiquidos,
  nomeEmbalagemLiquido,
  type ParametrosLiquido,
  type QuantidadeLiquido,
} from "@/lib/liquidos";

type Props = {
  id: string;
  produto: ParametrosLiquido;
  quantidade: QuantidadeLiquido;
  onChange: (quantidade: QuantidadeLiquido) => void;
};
const numero = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });

/** O mesmo formulário é usado no registro rápido e na correção. */
export function CamposLiquidos({ id, produto, quantidade, onChange }: Props) {
  const total = calcularLiquidos(produto, quantidade);
  return (
    <>
      <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-xl bg-slate-100 px-3 py-2 text-xs text-slate-700">
        <span>
          Embalagem: <strong>{nomeEmbalagemLiquido(produto.embalagem_liquido)}</strong>
        </span>
        <span>
          Padrão:{" "}
          <strong>
            {total.unitario
              ? "Contagem em unidades"
              : produto.unidades_por_plt
                ? `${numero(produto.unidades_por_plt)} unidades/PLT`
                : "A confirmar"}
          </strong>
        </span>
        <span>
          Semi:{" "}
          <strong>
            {!total.consomeSemi
              ? "Não se aplica"
              : produto.semi_kg_por_unidade
                ? `${numero(produto.semi_kg_por_unidade)} kg/unidade`
                : "A confirmar"}
          </strong>
        </span>
      </div>
      {total.unitario ? (
        <div className="space-y-1">
          <Label htmlFor={`${id}-unidades`}>Quantidade de unidades *</Label>
          <Input
            id={`${id}-unidades`}
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            className="h-11 text-base"
            value={quantidade.unidades || ""}
            onChange={(e) => onChange({ ...quantidade, unidades: Number(e.target.value) })}
          />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor={`${id}-plts`}>Quantidade de PLTs</Label>
              <select
                id={`${id}-plts`}
                className="h-11 w-full touch-manipulation rounded-xl border border-input bg-background px-3 text-base"
                value={quantidade.quantidadePlts}
                onChange={(e) =>
                  onChange({ ...quantidade, quantidadePlts: Number(e.target.value) })
                }
              >
                <option value={0}>Somente picado</option>
                {Array.from({ length: 20 }, (_, i) => i + 1).map((qtd) => (
                  <option key={qtd} value={qtd}>
                    {qtd} {qtd === 1 ? "PLT" : "PLTs"}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${id}-padrao`}>Unidades/PLT</Label>
              <Input
                id={`${id}-padrao`}
                className="h-11 text-base"
                value={produto.unidades_por_plt ?? ""}
                placeholder="A confirmar"
                readOnly
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${id}-picado`}>
              {quantidade.quantidadePlts === 0
                ? "Unidades do PLT picado *"
                : "PLT picado adicional (opcional)"}
            </Label>
            <Input
              id={`${id}-picado`}
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              max={produto.unidades_por_plt ? produto.unidades_por_plt - 1 : undefined}
              className="h-11 text-base"
              value={quantidade.picadoUnidades}
              placeholder="Deixe vazio se não houver"
              onChange={(e) =>
                onChange({
                  ...quantidade,
                  picadoUnidades: e.target.value === "" ? "" : Number(e.target.value),
                })
              }
            />
          </div>
        </>
      )}
      {!total.configurado && (
        <p role="alert" className="text-xs text-amber-700">
          {total.consomeSemi
            ? "Defina a embalagem, as unidades por PLT e os kg de semi por unidade no cadastro do produto."
            : "Defina uma quantidade inteira positiva de unidades por PLT no cadastro do produto."}
        </p>
      )}
      <div
        aria-live="polite"
        aria-atomic="true"
        className={`grid ${total.unitario ? "grid-cols-1" : total.consomeSemi ? "grid-cols-3" : "grid-cols-2"} gap-1.5 rounded-xl bg-slate-950 p-2.5 text-center text-white`}
      >
        {!total.unitario && <Resumo label="PLTs fechados" valor={numero(total.plts)} />}
        <Resumo label="Unidades" valor={total.configurado ? numero(total.unidades) : "—"} />
        {total.consomeSemi && (
          <Resumo
            label="Semi consumido"
            valor={total.configurado ? `${numero(total.semiKg)} kg` : "—"}
          />
        )}
      </div>
    </>
  );
}

function Resumo({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="break-words text-sm font-bold">{valor}</p>
    </div>
  );
}
