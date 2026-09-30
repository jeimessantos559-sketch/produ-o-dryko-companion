type Props = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  compact?: boolean;
};

/** Data/hora da produção é definida pelo sistema; campo não é exibido nos formulários. */
export function HoraProducaoField(_props: Props) {
  return null;
}
