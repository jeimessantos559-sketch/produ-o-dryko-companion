/** Setor como aparece nas listas de seleção de contexto. */
export type SetorListavel = {
  nome: string;
  ordem: number;
  regras_definidas?: boolean | null;
};

/** Setores com regra de apontamento primeiro; dentro de cada grupo, mantém a ordem cadastrada. */
export function ordenarSetoresParaSelecao<T extends SetorListavel>(setores: T[]): T[] {
  return [...setores].sort((a, b) => {
    const definidoA = a.regras_definidas === false ? 1 : 0;
    const definidoB = b.regras_definidas === false ? 1 : 0;
    return definidoA - definidoB || a.ordem - b.ordem;
  });
}

/** Nome exibido na lista, deixando claro quando o setor ainda não tem regra de apontamento. */
export function rotuloSetorParaSelecao(setor: SetorListavel): string {
  return setor.regras_definidas === false ? `${setor.nome} (em definição)` : setor.nome;
}
