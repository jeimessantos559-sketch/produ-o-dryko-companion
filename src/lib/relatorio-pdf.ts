import type { Json } from "@/integrations/supabase/types";
import {
  opsFinalizadasNoRelatorio,
  referenciaFinalizada,
  type OpFinalizada,
} from "./fechamento-turno.ts";
import {
  nomeCurtoRelatorio,
  nomesResponsaveisRelatorio,
  responsaveisDoApontamento,
} from "./responsaveis-relatorio.ts";

type ResumoRegistro = {
  totais?: Json;
  apontamentos?: Json;
  metas?: Json;
  setor?: Json;
  turno?: Json;
  data?: Json;
  responsavel?: Json;
  geradoEm?: Json;
  pendentes?: Json;
  lancados?: Json;
  plts?: Json;
  rolos?: Json;
  metragem?: Json;
  area?: Json;
  op?: Json;
  lote?: Json;
  produto_nome?: Json;
  quantidade_meta?: Json;
  unidade?: Json;
  area_m2?: Json;
  quantidade_plts?: Json;
  total_rolos?: Json;
  status?: Json;
  sequencia_inicio?: Json;
  sequencia_fim?: Json;
  [key: string]: Json | undefined;
};

type ProdutoResumo = {
  nome: string;
  apontamentos: number;
  plts: number;
  rolos: number;
  metragem: number;
  area: number;
  unidades: number;
  semiKg: number;
};

function registro(valor: Json | undefined): ResumoRegistro {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as ResumoRegistro)
    : {};
}

function texto(valor: Json | undefined) {
  if (valor === null || valor === undefined || valor === "") return "-";
  if (typeof valor === "object") return JSON.stringify(valor);
  return String(valor);
}

function numero(valor: Json | undefined) {
  const n = Number(valor ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function semAcentos(valor: string) {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, "");
}

function escaparPdf(valor: string) {
  return semAcentos(valor).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function limitar(valor: string, maximo: number) {
  const limpo = semAcentos(valor);
  return limpo.length <= maximo ? limpo : `${limpo.slice(0, Math.max(0, maximo - 3))}...`;
}

function formatarNumero(valor: number, casas = 2) {
  return valor.toLocaleString("pt-BR", { maximumFractionDigits: casas });
}

function formatarData(valor: string) {
  if (!valor) return "-";
  const somenteData = valor.slice(0, 10);
  const [ano, mes, dia] = somenteData.split("-");
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : valor;
}

function formatarDataHora(valor: string) {
  if (!valor) return "-";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return formatarData(valor);
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(data);
}

function turnoLegivel(valor: string) {
  if (valor === "T1") return "1o turno";
  if (valor === "T2") return "2o turno";
  if (valor === "T3") return "3o turno";
  return valor || "-";
}

function unidadeMetragem(setor: string) {
  return setor.includes("manta") ? "m" : "m2";
}

function resumirProdutos(apontamentos: Json[]) {
  const mapa = new Map<string, ProdutoResumo>();
  for (const item of apontamentos) {
    const apontamento = registro(item);
    const nome = texto(apontamento.produto_nome);
    const atual = mapa.get(nome) ?? {
      nome,
      apontamentos: 0,
      plts: 0,
      rolos: 0,
      metragem: 0,
      area: 0,
      unidades: 0,
      semiKg: 0,
    };
    atual.apontamentos += 1;
    atual.plts += numero(apontamento.quantidade_plts);
    atual.rolos += numero(apontamento.total_rolos);
    atual.metragem += numero(apontamento.metragem);
    atual.area += numero(apontamento.area_m2);
    atual.unidades += numero(apontamento["total_unidades"]);
    atual.semiKg += numero(apontamento["semi_consumido_kg"]);
    mapa.set(nome, atual);
  }
  return [...mapa.values()].sort(
    (a, b) => b.plts - a.plts || b.area - a.area || a.nome.localeCompare(b.nome),
  );
}

export function linhasDoRelatorio(resumo: Json) {
  const raiz = registro(resumo);
  const totais = registro(raiz.totais);
  const apontamentos = Array.isArray(raiz.apontamentos) ? raiz.apontamentos : [];
  const setor = texto(raiz.setor).toLowerCase();
  const fitas = setor.includes("fita");
  const liquidos = semAcentos(setor).includes("liquid") || setor.includes("asfox");
  const responsaveis = nomesResponsaveisRelatorio(resumo);
  return [
    `DRYKO - Relatorio de Producao`,
    `${texto(raiz.setor)} | ${turnoLegivel(texto(raiz.turno))} | ${formatarData(texto(raiz.data))}`,
    `Responsavel pelo relatorio: ${nomeCurtoRelatorio(raiz.responsavel)}`,
    `Apontado por: ${responsaveis.apontadores}`,
    `Lancado no Protheus por: ${responsaveis.lancadores}`,
    `Apontamentos: ${texto(totais.apontamentos)} | Pendentes: ${texto(totais.pendentes)} | Lancados: ${texto(totais.lancados)}`,
    liquidos
      ? `PLTs: ${texto(totais.plts)} | Unidades: ${texto(totais["unidades"])} | Semi consumido: ${texto(totais["semiKg"])} kg`
      : fitas
        ? `Producao: ${texto(totais.area)} m2`
        : `PLTs: ${texto(totais.plts)} | Rolos: ${texto(totais.rolos)} | Producao: ${texto(totais.metragem)} ${unidadeMetragem(setor)}`,
    `Registros detalhados: ${apontamentos.length}`,
    ...opsFinalizadasNoRelatorio(resumo).map(
      (op) =>
        `${referenciaFinalizada(op)} | ${op.produto_nome} | ${op.op ? "OP finalizada" : "Lote finalizado"}`,
    ),
  ];
}

function comandoTexto(
  textoValor: string,
  x: number,
  y: number,
  tamanho = 9,
  negrito = false,
  cor = "0.12 0.12 0.14",
) {
  return `${cor} rg BT /${negrito ? "F2" : "F1"} ${tamanho} Tf ${x} ${y} Td (${escaparPdf(textoValor)}) Tj ET`;
}

function comandoRetangulo(
  x: number,
  y: number,
  largura: number,
  altura: number,
  preenchimento: string,
  borda?: string,
) {
  const partes = [`${preenchimento} rg ${x} ${y} ${largura} ${altura} re f`];
  if (borda) partes.push(`${borda} RG 0.7 w ${x} ${y} ${largura} ${altura} re S`);
  return partes.join("\n");
}

function comandoLinha(x1: number, y1: number, x2: number, y2: number, cor = "0.84 0.85 0.88") {
  return `${cor} RG 0.6 w ${x1} ${y1} m ${x2} ${y2} l S`;
}

function cabecalhoPagina(comandos: string[], titulo: string, subtitulo: string) {
  comandos.push(comandoRetangulo(34, 760, 527, 52, "0.78 0.04 0.06"));
  comandos.push(comandoTexto("DRYKO", 52, 785, 22, true, "1 1 1"));
  comandos.push(comandoTexto("APONTA PRODUCAO", 52, 770, 9, true, "1 0.91 0.91"));
  comandos.push(comandoTexto(titulo, 300, 787, 16, true, "1 1 1"));
  comandos.push(comandoTexto(subtitulo, 300, 771, 8.5, false, "1 0.93 0.93"));
}

function rodapePagina(comandos: string[], pagina: number, totalPaginas: number) {
  comandos.push(comandoLinha(36, 42, 559, 42));
  comandos.push(
    comandoTexto(
      "DRYKO Impermeabilizantes | Aponta Producao",
      36,
      26,
      7.5,
      false,
      "0.45 0.47 0.52",
    ),
  );
  comandos.push(
    comandoTexto(`Pagina ${pagina} de ${totalPaginas}`, 500, 26, 7.5, true, "0.45 0.47 0.52"),
  );
}

const colunasDetalhamento = [
  { titulo: "Seq.", x: 36, largura: 24 },
  { titulo: "OP / Lote", x: 60, largura: 52 },
  { titulo: "Produto", x: 112, largura: 102 },
  { titulo: "PLTs", x: 214, largura: 28 },
  { titulo: "Rolos", x: 242, largura: 36 },
  { titulo: "Producao", x: 278, largura: 59 },
  { titulo: "APONTADO POR", x: 337, largura: 100 },
  { titulo: "PROTHEUS / LANCADO POR", x: 437, largura: 122 },
];

// Larguras das fontes Helvetica do PDF, em milésimos de um ponto por tamanho.
const largurasHelvetica = [
  [
    278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
    556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667,
    611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
    667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500,
    222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
  ],
  [
    278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
    556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667,
    611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
    667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556,
    278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
  ],
];

type TextoCelula = { texto: string; tamanho?: number; negrito?: boolean; cor?: string };

function quebrarLinhas(valor: string, largura: number, tamanho = 7.5, negrito = false) {
  const metricas = largurasHelvetica[negrito ? 1 : 0]!;
  const linhas: string[] = [];
  let restante = semAcentos(valor).trim();
  while (restante) {
    let usado = 0;
    let fim = 0;
    let espaco = -1;
    while (fim < restante.length) {
      const caractere = restante.charCodeAt(fim);
      const medida = ((metricas[caractere - 32] ?? 556) * tamanho) / 1000;
      if (usado + medida > largura) break;
      usado += medida;
      if (restante[fim] === " ") espaco = fim;
      fim += 1;
    }
    if (fim < restante.length && espaco > 0) fim = espaco;
    fim = Math.max(1, fim);
    linhas.push(restante.slice(0, fim).trim());
    restante = restante.slice(fim).trimStart();
  }
  return linhas.length ? linhas : [""];
}

function desenharCabecalhoDetalhamento(
  comandos: string[],
  y: number,
  fitas: boolean,
  liquidos = false,
) {
  comandos.push(comandoRetangulo(36, y - 10, 523, 28, "0.93 0.95 0.97", "0.84 0.85 0.88"));
  for (const coluna of colunasDetalhamento) {
    const titulo =
      liquidos && coluna.titulo === "Rolos"
        ? "Unidades"
        : liquidos && coluna.titulo === "Producao"
          ? "Semi (kg)"
          : coluna.titulo === "Producao" && fitas
            ? "Area"
            : coluna.titulo;
    comandos.push(comandoTexto(titulo, coluna.x + 5, y, 6.6, true, "0.42 0.44 0.49"));
    if (coluna.x > 36) comandos.push(comandoLinha(coluna.x, y - 10, coluna.x, y + 18));
  }
}

function celulasDetalhamento(
  item: Json,
  indice: number,
  fitas: boolean,
  mantas: boolean,
  liquidos = false,
) {
  const apontamento = registro(item);
  const responsaveis = responsaveisDoApontamento(item);
  const seqIni = texto(apontamento.sequencia_inicio);
  const seqFim = texto(apontamento.sequencia_fim);
  const seq =
    seqIni !== "-" && seqFim !== "-"
      ? seqIni === seqFim
        ? seqIni
        : `${seqIni}-${seqFim}`
      : String(indice + 1);
  const producao = liquidos
    ? apontamento["embalagem_liquido"] === "unidade" &&
      apontamento["semi_kg_por_unidade"] == null &&
      numero(apontamento["semi_consumido_kg"]) === 0
      ? "-"
      : `${formatarNumero(numero(apontamento["semi_consumido_kg"]), 3)} kg`
    : fitas
      ? `${formatarNumero(numero(apontamento.area_m2))} m2`
      : `${formatarNumero(numero(apontamento.metragem))} ${mantas ? "m" : "m2"}`;
  const celulas: TextoCelula[][] = [
    [{ texto: seq }],
    [{ texto: texto(apontamento.op ?? apontamento.lote), negrito: true }],
    [{ texto: texto(apontamento.produto_nome) }],
    [{ texto: String(numero(apontamento.quantidade_plts) || "-") }],
    [
      {
        texto: formatarNumero(numero(apontamento[liquidos ? "total_unidades" : "total_rolos"]), 0),
      },
    ],
    [{ texto: producao }],
    [
      { texto: responsaveis.apontador, negrito: true },
      { texto: formatarDataHora(responsaveis.apontadoEm ?? ""), tamanho: 7, cor: "0.45 0.47 0.52" },
    ],
    [
      {
        texto: responsaveis.lancado ? "Lancado" : "Pendente",
        negrito: true,
        cor: responsaveis.lancado ? "0.07 0.45 0.23" : "0.55 0.31 0.07",
      },
      {
        texto: responsaveis.lancado
          ? `${responsaveis.lancador} | ${formatarDataHora(responsaveis.lancadoEm ?? "")}`
          : "Aguardando lancamento",
        tamanho: 7,
        cor: "0.45 0.47 0.52",
      },
    ],
  ];
  return celulas.map((partes, coluna) =>
    partes.flatMap((parte) =>
      quebrarLinhas(
        parte.texto,
        colunasDetalhamento[coluna]!.largura - 10,
        parte.tamanho ?? 7.5,
        parte.negrito,
      ).map((linha) => ({ ...parte, texto: linha })),
    ),
  );
}

function alturaDetalhamento(
  item: Json,
  indice: number,
  fitas: boolean,
  mantas: boolean,
  liquidos = false,
) {
  return (
    16 +
    Math.max(
      ...celulasDetalhamento(item, indice, fitas, mantas, liquidos).map((linhas) => linhas.length),
    ) *
      11
  );
}

function desenharLinhaDetalhamento(
  comandos: string[],
  item: Json,
  indice: number,
  y: number,
  fitas: boolean,
  mantas: boolean,
  liquidos = false,
) {
  const celulas = celulasDetalhamento(item, indice, fitas, mantas, liquidos);
  const altura = alturaDetalhamento(item, indice, fitas, mantas, liquidos);
  const base = y - altura + 12;
  comandos.push(comandoRetangulo(36, base, 523, altura, "1 1 1", "0.84 0.85 0.88"));
  celulas.forEach((linhas, indiceColuna) => {
    const coluna = colunasDetalhamento[indiceColuna]!;
    if (coluna.x > 36) comandos.push(comandoLinha(coluna.x, base, coluna.x, y + 12));
    linhas.forEach((linha, indiceLinha) =>
      comandos.push(
        comandoTexto(
          linha.texto,
          coluna.x + 5,
          y - indiceLinha * 11,
          linha.tamanho ?? 7.5,
          linha.negrito,
          linha.cor,
        ),
      ),
    );
  });
  return altura;
}

function montarPrimeiraPagina(resumo: Json) {
  const raiz = registro(resumo);
  const totais = registro(raiz.totais);
  const apontamentos = Array.isArray(raiz.apontamentos) ? raiz.apontamentos : [];
  const opsFinalizadas = opsFinalizadasNoRelatorio(resumo);
  const produtos = resumirProdutos(apontamentos);
  const setor = texto(raiz.setor);
  const setorChave = setor.toLowerCase();
  const fitas = setorChave.includes("fita");
  const mantas = setorChave.includes("manta");
  const liquidos = semAcentos(setorChave).includes("liquid") || setorChave.includes("asfox");
  const comandos: string[] = [];

  cabecalhoPagina(comandos, "RELATORIO DE PRODUCAO", "Fechamento operacional de turno");

  comandos.push(comandoTexto(formatarData(texto(raiz.data)), 38, 728, 18, true));
  comandos.push(
    comandoTexto(
      `${setor} | ${turnoLegivel(texto(raiz.turno))}`,
      38,
      711,
      10,
      true,
      "0.78 0.04 0.06",
    ),
  );
  comandos.push(comandoTexto("RESPONSAVEL PELO RELATORIO", 320, 742, 7, true, "0.42 0.44 0.49"));
  comandos.push(
    comandoTexto(limitar(nomeCurtoRelatorio(raiz.responsavel), 30), 320, 728, 8.2, true),
  );
  comandos.push(
    comandoTexto(
      `Gerado em: ${formatarDataHora(texto(raiz.geradoEm))}`,
      320,
      711,
      8.5,
      false,
      "0.42 0.44 0.49",
    ),
  );
  comandos.push(comandoLinha(38, 695, 557, 695, "0.15 0.15 0.17"));

  const cards: Array<readonly [string, string]> = [
    ["APONTAMENTOS", texto(totais.apontamentos)],
    ["PLTs FECHADOS", fitas ? "-" : texto(totais.plts)],
    ["PENDENTES", texto(totais.pendentes)],
    ["LANCADOS", texto(totais.lancados)],
  ];
  const cardXs = [38, 168, 298, 428];
  cards.forEach(([rotulo, valor], i) => {
    const x = cardXs[i] ?? 38;
    comandos.push(
      comandoRetangulo(
        x,
        612,
        117,
        55,
        i === 2 && numero(totais.pendentes) > 0 ? "1 0.96 0.94" : "0.97 0.98 0.99",
        "0.86 0.87 0.89",
      ),
    );
    comandos.push(comandoTexto(rotulo, x + 10, 647, 7.2, true, "0.42 0.44 0.49"));
    comandos.push(
      comandoTexto(
        valor,
        x + 10,
        625,
        18,
        true,
        i === 2 && numero(totais.pendentes) > 0 ? "0.67 0.14 0.05" : "0.12 0.12 0.14",
      ),
    );
  });

  comandos.push(comandoRetangulo(38, 543, 247, 53, "0.98 0.96 0.96", "0.91 0.80 0.81"));
  comandos.push(
    comandoTexto(
      liquidos
        ? "SEMI CONSUMIDO"
        : fitas
          ? "PRODUCAO TOTAL"
          : mantas
            ? "METRAGEM PRODUZIDA"
            : "AREA PRODUZIDA",
      50,
      576,
      7.5,
      true,
      "0.55 0.24 0.25",
    ),
  );
  const producao = liquidos
    ? `${formatarNumero(numero(totais["semiKg"]), 3)} kg`
    : fitas
      ? `${formatarNumero(numero(totais.area))} m2`
      : `${formatarNumero(numero(totais.metragem))} ${mantas ? "m" : "m2"}`;
  comandos.push(comandoTexto(producao, 50, 554, 18, true, "0.78 0.04 0.06"));

  comandos.push(comandoRetangulo(300, 543, 245, 53, "0.97 0.98 0.99", "0.86 0.87 0.89"));
  comandos.push(
    comandoTexto(
      liquidos ? "UNIDADES PRODUZIDAS" : "ROLOS PRODUZIDOS",
      312,
      576,
      7.5,
      true,
      "0.42 0.44 0.49",
    ),
  );
  comandos.push(
    comandoTexto(
      formatarNumero(numero(totais[liquidos ? "unidades" : "rolos"]), 0),
      312,
      554,
      18,
      true,
    ),
  );

  let y = 508;
  comandos.push(comandoTexto("RESUMO POR PRODUTO", 38, y, 11, true));
  y -= 12;
  comandos.push(comandoLinha(38, y, 557, y));
  y -= 18;
  comandos.push(comandoTexto("Produto", 44, y, 7.5, true, "0.42 0.44 0.49"));
  comandos.push(comandoTexto("Apont.", 275, y, 7.5, true, "0.42 0.44 0.49"));
  comandos.push(comandoTexto("PLTs", 332, y, 7.5, true, "0.42 0.44 0.49"));
  comandos.push(comandoTexto(liquidos ? "Unidades" : "Rolos", 382, y, 7.5, true, "0.42 0.44 0.49"));
  comandos.push(
    comandoTexto(
      liquidos ? "Semi (kg)" : fitas ? "Area" : "Producao",
      455,
      y,
      7.5,
      true,
      "0.42 0.44 0.49",
    ),
  );
  y -= 8;

  const produtosPagina = produtos.slice(0, 8);
  produtosPagina.forEach((produto, indice) => {
    const fundo = indice % 2 === 0 ? "0.985 0.985 0.99" : "1 1 1";
    comandos.push(comandoRetangulo(38, y - 17, 519, 22, fundo));
    comandos.push(comandoTexto(limitar(produto.nome, 34), 44, y - 7, 8.5, true));
    comandos.push(comandoTexto(String(produto.apontamentos), 286, y - 7, 8.5));
    comandos.push(comandoTexto(String(produto.plts), 338, y - 7, 8.5));
    comandos.push(
      comandoTexto(formatarNumero(liquidos ? produto.unidades : produto.rolos, 0), 389, y - 7, 8.5),
    );
    const producaoProduto = liquidos
      ? produto.semiKg > 0
        ? `${formatarNumero(produto.semiKg, 3)} kg`
        : "-"
      : fitas
        ? `${formatarNumero(produto.area)} m2`
        : `${formatarNumero(produto.metragem)} ${mantas ? "m" : "m2"}`;
    comandos.push(comandoTexto(limitar(producaoProduto, 16), 455, y - 7, 8.5, true));
    y -= 23;
  });
  if (produtos.length > produtosPagina.length) {
    comandos.push(
      comandoTexto(
        `+ ${produtos.length - produtosPagina.length} produto(s) no detalhamento`,
        44,
        y - 3,
        8,
        false,
        "0.45 0.47 0.52",
      ),
    );
    y -= 18;
  }

  let opsConsumidas = 0;
  if (opsFinalizadas.length > 0 && y > 150) {
    y -= 8;
    comandos.push(comandoTexto(mantas ? "LOTES FINALIZADOS" : "OPS FINALIZADAS", 38, y, 10, true));
    y -= 12;
    comandos.push(comandoLinha(38, y, 557, y));
    y -= 17;
    for (const op of opsFinalizadas) {
      if (y - 20 < 90) break;
      desenharOpFinalizada(comandos, op, y);
      y -= 20;
      opsConsumidas += 1;
    }
    if (opsConsumidas < opsFinalizadas.length) {
      comandos.push(
        comandoTexto(
          "Finalizacoes continuam na pagina seguinte",
          44,
          y,
          8,
          false,
          "0.45 0.47 0.52",
        ),
      );
      y -= 16;
    }
  }

  let consumidos = 0;
  const primeiroApontamento = apontamentos[0];
  if (
    opsConsumidas === opsFinalizadas.length &&
    primeiroApontamento &&
    y - 56 - alturaDetalhamento(primeiroApontamento, 0, fitas, mantas, liquidos) >= 66
  ) {
    y -= 8;
    comandos.push(comandoTexto("DETALHAMENTO DO TURNO", 38, y, 10, true));
    y -= 20;
    desenharCabecalhoDetalhamento(comandos, y, fitas, liquidos);
    y -= 22;
    for (const item of apontamentos) {
      if (y - alturaDetalhamento(item, consumidos, fitas, mantas, liquidos) < 66) break;
      y -= desenharLinhaDetalhamento(comandos, item, consumidos, y, fitas, mantas, liquidos);
      consumidos += 1;
    }
    if (consumidos < apontamentos.length && y > 55) {
      comandos.push(
        comandoTexto(
          `Continua na pagina seguinte (+${apontamentos.length - consumidos} registro(s))`,
          40,
          y,
          7.5,
          false,
          "0.45 0.47 0.52",
        ),
      );
    }
  }

  return { comandos, consumidos, opsConsumidas };
}

function desenharOpFinalizada(comandos: string[], op: OpFinalizada, y: number) {
  comandos.push(
    comandoTexto(limitar(`${referenciaFinalizada(op)} | ${op.produto_nome}`, 74), 44, y, 8.3, true),
  );
  comandos.push(
    comandoTexto(op.op ? "Finalizada" : "Finalizado", 495, y, 8.3, true, "0.12 0.42 0.28"),
  );
}

function montarPaginasFinalizacoes(resumo: Json, inicio = 0) {
  const raiz = registro(resumo);
  const ops = opsFinalizadasNoRelatorio(resumo);
  const paginas: string[][] = [];
  while (inicio < ops.length) {
    const comandos: string[] = [];
    const titulo = texto(raiz.setor).toLowerCase().includes("manta")
      ? "LOTES FINALIZADOS"
      : "OPS FINALIZADAS";
    cabecalhoPagina(
      comandos,
      titulo,
      `${texto(raiz.setor)} | ${turnoLegivel(texto(raiz.turno))} | ${formatarData(texto(raiz.data))}`,
    );
    let y = 730;
    while (inicio < ops.length && y - 20 >= 66) {
      desenharOpFinalizada(comandos, ops[inicio]!, y);
      y -= 20;
      inicio += 1;
    }
    paginas.push(comandos);
  }
  return paginas;
}

function montarPaginasDetalhamento(resumo: Json, inicioDetalhamento = 0) {
  const raiz = registro(resumo);
  const apontamentos = Array.isArray(raiz.apontamentos) ? raiz.apontamentos : [];
  const setor = texto(raiz.setor).toLowerCase();
  const fitas = setor.includes("fita");
  const mantas = setor.includes("manta");
  const liquidos = semAcentos(setor).includes("liquid") || setor.includes("asfox");
  const paginas: string[][] = [];

  let inicio = inicioDetalhamento;
  while (inicio < apontamentos.length) {
    const comandos: string[] = [];
    cabecalhoPagina(
      comandos,
      "DETALHAMENTO DO TURNO",
      `${texto(raiz.setor)} | ${turnoLegivel(texto(raiz.turno))} | ${formatarData(texto(raiz.data))}`,
    );
    desenharCabecalhoDetalhamento(comandos, 730, fitas, liquidos);

    let y = 708;
    const inicioPagina = inicio;
    while (inicio < apontamentos.length) {
      const item = apontamentos[inicio];
      if (item === undefined || y - alturaDetalhamento(item, inicio, fitas, mantas, liquidos) < 66)
        break;
      y -= desenharLinhaDetalhamento(comandos, item, inicio, y, fitas, mantas, liquidos);
      inicio += 1;
    }
    if (inicio === inicioPagina)
      throw new Error("Os dados do responsável excedem o espaço de uma página do relatório.");
    paginas.push(comandos);
  }

  return paginas;
}

function montarPdf(paginas: string[][]) {
  const totalPaginas = paginas.length;
  paginas.forEach((comandos, indice) => rodapePagina(comandos, indice + 1, totalPaginas));

  const objetos: string[] = [];
  const idsPaginas = paginas.map((_, indice) => 5 + indice * 2);
  objetos.push("<< /Type /Catalog /Pages 2 0 R >>");
  objetos.push(
    `<< /Type /Pages /Kids [${idsPaginas.map((id) => `${id} 0 R`).join(" ")}] /Count ${paginas.length} >>`,
  );
  objetos.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  objetos.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");

  paginas.forEach((comandos, indice) => {
    const paginaId = 5 + indice * 2;
    const conteudoId = paginaId + 1;
    const stream = comandos.join("\n");
    objetos.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${conteudoId} 0 R >>`,
    );
    objetos.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objetos.forEach((objeto, indice) => {
    offsets.push(pdf.length);
    pdf += `${indice + 1} 0 obj\n${objeto}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

export function gerarPdfRelatorio(resumo: Json) {
  const primeira = montarPrimeiraPagina(resumo);
  const finalizacoes = montarPaginasFinalizacoes(resumo, primeira.opsConsumidas);
  const detalhamento = montarPaginasDetalhamento(resumo, primeira.consumidos);
  return montarPdf([primeira.comandos, ...finalizacoes, ...detalhamento]);
}

export function arquivoPdf(resumo: Json, nome: string) {
  return new File([gerarPdfRelatorio(resumo)], nome, { type: "application/pdf" });
}

export function baixarPdf(resumo: Json, nome: string) {
  const arquivo = arquivoPdf(resumo, nome);
  const url = URL.createObjectURL(arquivo);
  const link = document.createElement("a");
  link.href = url;
  link.download = nome;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 60_000);
}

export function imprimirPdf(resumo: Json, nome: string) {
  const arquivo = arquivoPdf(resumo, nome);
  const url = URL.createObjectURL(arquivo);
  const janela = window.open(url, "_blank");
  if (!janela) {
    URL.revokeObjectURL(url);
    return false;
  }
  janela.opener = null;
  janela.addEventListener("load", () => janela.print(), { once: true });
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}

export async function compartilharPdf(resumo: Json, nome: string) {
  const arquivo = arquivoPdf(resumo, nome);
  if (navigator.share && navigator.canShare?.({ files: [arquivo] })) {
    await navigator.share({ title: "Relatório de Produção DRYKO", files: [arquivo] });
    return true;
  }
  baixarPdf(resumo, nome);
  return false;
}
