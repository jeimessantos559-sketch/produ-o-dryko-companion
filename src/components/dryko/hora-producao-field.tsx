type Props = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  compact?: boolean;
};

/**
 * A data/hora do apontamento é registrada automaticamente pelo sistema.
 * O componente permanece como compatibilidade temporária com os formulários,
 * mas não exibe nenhum controle editável para o usuário.
 */
export function HoraProducaoField(_props: Props) {
  return null;
}
