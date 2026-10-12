// Regras puras da tela de Programação: agrupamento por hora, unidades e formatação.
// Ficam fora da tela para poderem ser testadas e reutilizadas.

export type Registro = {
  id: string;
  produto_id: string;
  produto_nome: string;
  op: string | null;
  lote: string | null;
  quantidade_plts: number | null;
  total_rolos: number | null;
  metragem: number | null;
  area_m2: number | null;
  data_hora_producao: string;
};

export type Linha = {
  produto: string;
  apontamentos: number;
  plts: number;
  rolos: number;
  metragem: number;
  area: number;
};

export type Hora = {
  hora: string;
  apontamentos: number;
  plts: number;
  rolos: number;
  metragem: number;
  area: number;
  produtos: Linha[];
};

export type HoraInterna = Omit<Hora, "produtos"> & { produtos: Map<string, Linha> };

export type HoraPlanejada = Hora & {
  metaHora: number;
  realizadoAcumulado: number;
  saldoAcumulado: number;
};

export type ProgramacaoItem = {
  id: string;
  produto_id: string;
  produto_nome: string;
  op: string | null;
  lote: string | null;
  quantidade_prevista: number;
  unidade: string;
};

export function linhaVazia(produto: string): Linha {
  return { produto, apontamentos: 0, plts: 0, rolos: 0, metragem: 0, area: 0 };
}

export function horaVazia(hora: string): HoraInterna {
  return {
    hora,
    apontamentos: 0,
    plts: 0,
    rolos: 0,
    metragem: 0,
    area: 0,
    produtos: new Map(),
  };
}

export function horaVaziaFinal(hora: string): Hora {
  return { hora, apontamentos: 0, plts: 0, rolos: 0, metragem: 0, area: 0, produtos: [] };
}

export function somarRegistro(linha: Linha, item: Registro) {
  linha.apontamentos += 1;
  linha.plts += Number(item.quantidade_plts ?? 0);
  linha.rolos += Number(item.total_rolos ?? 0);
  linha.metragem += Number(item.metragem ?? 0);
  linha.area += Number(item.area_m2 ?? 0);
}

export function unidadeMetaTurno(setor: string | null | undefined) {
  if (setor === "mantas") return "m";
  return "m²";
}

export function unidadeProgramacao(setor: string | null | undefined) {
  if (setor === "fitas") return "m²";
  if (setor === "mantas") return "m";
  return "PLTs";
}

export function valorMetaHora(
  item: Pick<Hora, "plts" | "metragem" | "area">,
  setor: string | null | undefined,
) {
  if (setor === "fitas") return Number(item.area ?? 0);
  return Number(item.metragem ?? 0);
}

export function correspondeProgramacaoItem(
  registro: Registro,
  item: ProgramacaoItem,
  setor: string | null | undefined,
) {
  if (registro.produto_id !== item.produto_id) return false;
  if (setor === "mantas") return true;
  const opItem = normalizar(item.op);
  if (!opItem) return true;
  return normalizar(registro.op) === opItem;
}

export function valorRealizadoRegistro(item: Registro, setor: string | null | undefined) {
  if (setor === "fitas") return Number(item.area_m2 ?? 0);
  if (setor === "mantas") return Number(item.metragem ?? 0);
  return Number(item.quantidade_plts ?? 0);
}

export function normalizar(valor: string | null | undefined) {
  return (valor ?? "").trim().toLocaleUpperCase("pt-BR");
}

export function resumoProdutosHora(item: Hora, setor: string | null | undefined) {
  if (!item.produtos.length) return "Sem produção registrada";
  return item.produtos
    .map((produto) => {
      if (setor === "corte")
        return `${produto.produto}: ${fmt(produto.plts)} PLT${produto.plts === 1 ? "" : "s"}`;
      if (setor === "mantas") return `${produto.produto}: ${fmt(produto.metragem)} m`;
      if (setor === "fitas") return `${produto.produto}: ${fmt(produto.area)} m²`;
      return `${produto.produto}: ${fmt(produto.plts)}`;
    })
    .join(" · ");
}

export function destaqueHora(item: Hora, setor: string | null | undefined) {
  if (setor === "corte") return `${fmt(item.plts)} PLT${item.plts === 1 ? "" : "s"}`;
  if (setor === "mantas") return `${fmt(item.metragem)} m`;
  if (setor === "fitas") return `${fmt(item.area)} m²`;
  return `${fmt(item.plts)} PLTs`;
}

export function secundarioHora(item: Hora, setor: string | null | undefined) {
  if (setor === "corte") return `${fmt(item.metragem)} m²`;
  if (setor === "mantas") return `${fmt(item.plts)} PLTs · ${fmt(item.rolos)} rolos`;
  if (setor === "fitas") return `${item.produtos.length} produto(s)`;
  return `${fmt(item.rolos)} unidades`;
}

export function intervaloHora(hora: string) {
  const inicio = Number(hora.slice(0, 2));
  const fim = (inicio + 1) % 24;
  return `${String(inicio).padStart(2, "0")}:00–${String(fim).padStart(2, "0")}:00`;
}

export function duracaoDoCampo(valor: string) {
  const limpo = valor.trim().toLowerCase().replace(/\s/g, "").replace("h", ":");
  if (!limpo) return 0;
  if (limpo.includes(":")) {
    const [horasTexto, minutosTexto = "0"] = limpo.split(":", 2);
    const horas = Number(horasTexto);
    const minutos = Number(minutosTexto);
    if (
      !Number.isFinite(horas) ||
      !Number.isFinite(minutos) ||
      horas < 0 ||
      minutos < 0 ||
      minutos >= 60
    ) {
      return Number.NaN;
    }
    return horas + minutos / 60;
  }
  return numeroDoCampo(limpo);
}

export function formatarDuracaoHoras(valor: number) {
  if (!Number.isFinite(valor) || valor <= 0) return "";
  let horas = Math.floor(valor);
  let minutos = Math.round((valor - horas) * 60);
  if (minutos === 60) {
    horas += 1;
    minutos = 0;
  }
  return `${horas}:${String(minutos).padStart(2, "0")}`;
}

export function normalizarDuracaoDigitada(valor: string) {
  return valor.replace(/[^0-9:,.hH]/g, "").slice(0, 8);
}

export function numeroDoCampo(valor: string) {
  const limpo = valor.trim().replace(/\s/g, "");
  if (!limpo) return 0;
  if (limpo.includes(",")) return Number(limpo.replace(/\./g, "").replace(",", "."));
  if (/^\d{1,3}(\.\d{3})+$/.test(limpo)) return Number(limpo.replace(/\./g, ""));
  return Number(limpo);
}

export function formatarCampoNumero(valor: number) {
  return valor.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

export function formatarData(valor: string) {
  const [ano, mes, dia] = valor.split("-");
  return ano && mes && dia ? `${dia}/${mes}` : "—";
}

export function fmt(valor: number) {
  return Number(valor || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}
