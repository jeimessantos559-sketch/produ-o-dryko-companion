import type { Json } from "@/integrations/supabase/types";
import { consolidarOcorrencias, linhasOcorrenciasLivres, ocorrenciasDoResumo, textoOcorrencias, usaOcorrenciasEstruturadas } from "@/lib/ocorrencias-operacionais";

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
};

function registro(valor: Json | undefined): ResumoRegistro {
  return valor && typeof valor === "object" && !Array.isArray(valor) ? (valor as ResumoRegistro) : {};
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
  return valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7e]/g, "");
}

function escaparPdf(valor: string) {
  return semAcentos(valor).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function limitar(valor: string, maximo: number) {
  const limpo = semAcentos(valor);
  return limpo.length <= maximo ? limpo : `${limpo.slice(0, Math.max(0, maximo - 3))}...`;
}

function formatarNumero(valor: number, casas = 2) { return valor.toLocaleString("pt-BR", { maximumFractionDigits: casas }); }

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
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(data);
}

function turnoLegivel(valor: string) {
  if (valor === "T1") return "1o turno";
  if (valor === "T2") return "2o turno";
  if (valor === "T3") return "3o turno";
  return valor || "-";
}

function unidadeMetragem(setor: string) { return setor.includes("manta") ? "m" : "m2"; }

function resumirProdutos(apontamentos: Json[]) {
  const mapa = new Map<string, ProdutoResumo>();
  for (const item of apontamentos) {
    const apontamento = registro(item);
    const nome = texto(apontamento.produto_nome);
    const atual = mapa.get(nome) ?? { nome, apontamentos: 0, plts: 0, rolos: 0, metragem: 0, area: 0 };
    atual.apontamentos += 1;
    atual.plts += numero(apontamento.quantidade_plts);
    atual.rolos += numero(apontamento.total_rolos);
    atual.metragem += numero(apontamento.metragem);
    atual.area += numero(apontamento.area_m2);
    mapa.set(nome, atual);
  }
  return [...mapa.values()].sort((a, b) => b.plts - a.plts || b.area - a.area || a.nome.localeCompare(b.nome));
}

export function linhasDoRelatorio(resumo: Json) {
  const raiz = registro(resumo);
  const totais = registro(raiz.totais);
  const apontamentos = Array.isArray(raiz.apontamentos) ? raiz.apontamentos : [];
  const setor = texto(raiz.setor).toLowerCase();
  const fitas = setor.includes("fita");
  return [
    `DRYKO - Relatorio de Producao`,
    `${texto(raiz.setor)} | ${turnoLegivel(texto(raiz.turno))} | ${formatarData(texto(raiz.data))}`,
    `Responsavel: ${texto(raiz.responsavel)}`,
    `Apontamentos: ${texto(totais.apontamentos)} | Pendentes: ${texto(totais.pendentes)} | Lancados: ${texto(totais.lancados)}`,
    fitas ? `Producao: ${texto(totais.area)} m2` : `PLTs: ${texto(totais.plts)} | Rolos: ${texto(totais.rolos)} | Producao: ${texto(totais.metragem)} ${unidadeMetragem(setor)}`,
    `Registros detalhados: ${apontamentos.length}`,
    ...(() => {
      const oc = ocorrenciasDoResumo(raiz["ocorrencias"]);
      return oc ? ["", "OCORRENCIAS OPERACIONAIS", ...textoOcorrencias(oc, false, raiz.setor).split("\n")] : [];
    })(),
  ];
}

function comandoTexto(textoValor: string, x: number, y: number, tamanho = 9, negrito = false, cor = "0.12 0.12 0.14") {
  return `${cor} rg BT /${negrito ? "F2" : "F1"} ${tamanho} Tf ${x} ${y} Td (${escaparPdf(textoValor)}) Tj ET`;
}

function comandoRetangulo(x: number, y: number, largura: number, altura: number, preenchimento: string, borda?: string) {
  const partes = [`${preenchimento} rg ${x} ${y} ${largura} ${altura} re f`];
  if (borda) partes.push(`${borda} RG 0.7 w ${x} ${y} ${largura} ${altura} re S`);
  return partes.join("\n");
}

function comandoLinha(x1: number, y1: number, x2: number, y2: number, cor = "0.84 0.85 0.88") { return `${cor} RG 0.6 w ${x1} ${y1} m ${x2} ${y2} l S`; }

function cabecalhoPagina(comandos: string[], titulo: string, subtitulo: string) {
  comandos.push(comandoRetangulo(34, 760, 527, 52, "0.78 0.04 0.06"));
  comandos.push(comandoTexto("DRYKO", 52, 785, 22, true, "1 1 1"));
  comandos.push(comandoTexto("APONTA PRODUCAO", 52, 770, 9, true, "1 0.91 0.91"));
  comandos.push(comandoTexto(titulo, 300, 787, 16, true, "1 1 1"));
  comandos.push(comandoTexto(subtitulo, 300, 771, 8.5, false, "1 0.93 0.93"));
}

function rodapePagina(comandos: string[], pagina: number, totalPaginas: number) {
  comandos.push(comandoLinha(36, 42, 559, 42));
  comandos.push(comandoTexto("DRYKO Impermeabilizantes | Aponta Producao", 36, 26, 7.5, false, "0.45 0.47 0.52"));
  comandos.push(comandoTexto(`Pagina ${pagina} de ${totalPaginas}`, 500, 26, 7.5, true, "0.45 0.47 0.52"));
}

function desenharCabecalhoDetalhamento(comandos: string[], y: number, fitas: boolean) {
  comandos.push(comandoTexto("Seq.", 38, y, 7.2, true, "0.42 0.44 0.49"));
  comandos.push(comandoTexto("OP / Lote", 78, y, 7.2, true, "0.42 0.44 0.49"));
  comandos.push(comandoTexto("Produto", 168, y, 7.2, true, "0.42 0.44 0.49"));
  comandos.push(comandoTexto("PLTs", 350, y, 7.2, true, "0.42 0.44 0.49"));
  comandos.push(comandoTexto("Rolos", 390, y, 7.2, true, "0.42 0.44 0.49"));
  comandos.push(comandoTexto(fitas ? "Area" : "Producao", 442, y, 7.2, true, "0.42 0.44 0.49"));
  comandos.push(comandoTexto("Status", 510, y, 7.2, true, "0.42 0.44 0.49"));
  comandos.push(comandoLinha(38, y - 10, 557, y - 10));
}

function desenharLinhaDetalhamento(comandos: string[], item: Json, indice: number, y: number, fitas: boolean, mantas: boolean) {
  const apontamento = registro(item);
  const fundo = indice % 2 === 0 ? "0.985 0.985 0.99" : "1 1 1";
  comandos.push(comandoRetangulo(36, y - 10, 523, 21, fundo));
  const seqIni = texto(apontamento.sequencia_inicio);
  const seqFim = texto(apontamento.sequencia_fim);
  const seq = seqIni !== "-" && seqFim !== "-" ? (seqIni === seqFim ? seqIni : `${seqIni}-${seqFim}`) : String(indice + 1);
  comandos.push(comandoTexto(limitar(seq, 7), 40, y, 7.6));
  comandos.push(comandoTexto(limitar(texto(apontamento.op ?? apontamento.lote), 14), 78, y, 7.6, true));
  comandos.push(comandoTexto(limitar(texto(apontamento.produto_nome), 27), 168, y, 7.6));
  comandos.push(comandoTexto(String(numero(apontamento.quantidade_plts) || "-"), 354, y, 7.6));
  comandos.push(comandoTexto(formatarNumero(numero(apontamento.total_rolos), 0), 393, y, 7.6));
  const producao = fitas ? `${formatarNumero(numero(apontamento.area_m2))} m2` : `${formatarNumero(numero(apontamento.metragem))} ${mantas ? "m" : "m2"}`;
  comandos.push(comandoTexto(limitar(producao, 12), 442, y, 7.6));
  const status = texto(apontamento.status).toLowerCase() === "lancado" ? "Lancado" : "Pendente";
  comandos.push(comandoTexto(status, 510, y, 7.0, true, status === "Pendente" ? "0.67 0.14 0.05" : "0.07 0.45 0.23"));
}

function montarPrimeiraPagina(resumo: Json) {
  const raiz = registro(resumo);
  const totais = registro(raiz.totais);
  const apontamentos = Array.isArray(raiz.apontamentos) ? raiz.apontamentos : [];
  const metas = Array.isArray(raiz.metas) ? raiz.metas : [];
  const produtos = resumirProdutos(apontamentos);
  const setor = texto(raiz.setor);
  const setorChave = setor.toLowerCase();
  const fitas = setorChave.includes("fita");
  const mantas = setorChave.includes("manta");
  const comandos: string[] = [];

  cabecalhoPagina(comandos, "RELATORIO DE PRODUCAO", "Fechamento operacional de turno");
  comandos.push(comandoTexto(formatarData(texto(raiz.data)), 38, 728, 18, true));
  comandos.push(comandoTexto(`${setor} | ${turnoLegivel(texto(raiz.turno))}`, 38, 711, 10, true, "0.78 0.04 0.06"));
  comandos.push(comandoTexto(`Responsavel: ${limitar(texto(raiz.responsavel), 48)}`, 320, 728, 9.5, true));
  comandos.push(comandoTexto(`Gerado em: ${formatarDataHora(texto(raiz.geradoEm))}`, 320, 711, 8.5, false, "0.42 0.44 0.49"));
  comandos.push(comandoLinha(38, 695, 557, 695, "0.15 0.15 0.17"));

  const cards: Array<readonly [string, string]> = [["APONTAMENTOS", texto(totais.apontamentos)], ["PLTs FECHADOS", fitas ? "-" : texto(totais.plts)], ["PENDENTES", texto(totais.pendentes)], ["LANCADOS", texto(totais.lancados)]];
  const cardXs = [38, 168, 298, 428];
  cards.forEach(([rotulo, valor], i) => {
    const x = cardXs[i] ?? 38;
    comandos.push(comandoRetangulo(x, 624, 117, 55, i === 2 && numero(totais.pendentes) > 0 ? "1 0.96 0.94" : "0.97 0.98 0.99", "0.86 0.87 0.89"));
    comandos.push(comandoTexto(rotulo, x + 10, 659, 7.2, true, "0.42 0.44 0.49"));
    comandos.push(comandoTexto(valor, x + 10, 637, 18, true, i === 2 && numero(totais.pendentes) > 0 ? "0.67 0.14 0.05" : "0.12 0.12 0.14"));
  });

  comandos.push(comandoRetangulo(38, 555, 247, 53, "0.98 0.96 0.96", "0.91 0.80 0.81"));
  comandos.push(comandoTexto(fitas ? "PRODUCAO TOTAL" : mantas ? "METRAGEM PRODUZIDA" : "AREA PRODUZIDA", 50, 588, 7.5, true, "0.55 0.24 0.25"));
  const producao = fitas ? `${formatarNumero(numero(totais.area))} m2` : `${formatarNumero(numero(totais.metragem))} ${mantas ? "m" : "m2"}`;
  comandos.push(comandoTexto(producao, 50, 566, 18, true, "0.78 0.04 0.06"));
  comandos.push(comandoRetangulo(300, 555, 245, 53, "0.97 0.98 0.99", "0.86 0.87 0.89"));
  comandos.push(comandoTexto("ROLOS PRODUZIDOS", 312, 588, 7.5, true, "0.42 0.44 0.49"));
  comandos.push(comandoTexto(formatarNumero(numero(totais.rolos), 0), 312, 566, 18, true));

  let y = 520;
  comandos.push(comandoTexto("RESUMO POR PRODUTO", 38, y, 11, true));
  y -= 12;
  comandos.push(comandoLinha(38, y, 557, y));
  y -= 18;
  comandos.push(comandoTexto("Produto", 44, y, 7.5, true, "0.42 0.44 0.49"));
  comandos.push(comandoTexto("Apont.", 275, y, 7.5, true, "0.42 0.44 0.49"));
  comandos.push(comandoTexto("PLTs", 332, y, 7.5, true, "0.42 0.44 0.49"));
  comandos.push(comandoTexto("Rolos", 382, y, 7.5, true, "0.42 0.44 0.49"));
  comandos.push(comandoTexto(fitas ? "Area" : "Producao", 455, y, 7.5, true, "0.42 0.44 0.49"));
  y -= 8;

  const produtosPagina = produtos.slice(0, 8);
  produtosPagina.forEach((produto, indice) => {
    const fundo = indice % 2 === 0 ? "0.985 0.985 0.99" : "1 1 1";
    comandos.push(comandoRetangulo(38, y - 17, 519, 22, fundo));
    comandos.push(comandoTexto(limitar(produto.nome, 34), 44, y - 7, 8.5, true));
    comandos.push(comandoTexto(String(produto.apontamentos), 286, y - 7, 8.5));
    comandos.push(comandoTexto(String(produto.plts), 338, y - 7, 8.5));
    comandos.push(comandoTexto(formatarNumero(produto.rolos, 0), 389, y - 7, 8.5));
    const producaoProduto = fitas ? `${formatarNumero(produto.area)} m2` : `${formatarNumero(produto.metragem)} ${mantas ? "m" : "m2"}`;
    comandos.push(comandoTexto(limitar(producaoProduto, 16), 455, y - 7, 8.5, true));
    y -= 23;
  });
  if (produtos.length > produtosPagina.length) { comandos.push(comandoTexto(`+ ${produtos.length - produtosPagina.length} produto(s) no detalhamento`, 44, y - 3, 8, false, "0.45 0.47 0.52")); y -= 18; }

  if (metas.length > 0 && y > 150) {
    comandos.push(comandoTexto("METAS ATIVAS", 38, y, 10, true));
    y -= 12;
    comandos.push(comandoLinha(38, y, 557, y));
    y -= 17;
    metas.slice(0, 4).forEach((item) => {
      const meta = registro(item);
      comandos.push(comandoTexto(`OP ${texto(meta.op)} | ${limitar(texto(meta.produto_nome), 28)}`, 44, y, 8.3, true));
      comandos.push(comandoTexto(`Meta: ${texto(meta.quantidade_meta)} ${texto(meta.unidade)}`, 380, y, 8.3));
      y -= 18;
    });
    if (metas.length > 4) { comandos.push(comandoTexto(`+ ${metas.length - 4} meta(s) ativa(s)`, 44, y, 8, false, "0.45 0.47 0.52")); y -= 16; }
  }

  let consumidos = 0;
  const espacoUtil = y - 78;
  const capacidade = Math.max(0, Math.floor((espacoUtil - 38) / 22));
  if (apontamentos.length > 0 && capacidade > 0) {
    y -= 8;
    comandos.push(comandoTexto("DETALHAMENTO DO TURNO", 38, y, 10, true));
    y -= 20;
    desenharCabecalhoDetalhamento(comandos, y, fitas);
    y -= 28;
    consumidos = Math.min(apontamentos.length, capacidade);
    apontamentos.slice(0, consumidos).forEach((item, indice) => { desenharLinhaDetalhamento(comandos, item, indice, y, fitas, mantas); y -= 22; });
    if (consumidos < apontamentos.length && y > 55) comandos.push(comandoTexto(`Continua na pagina seguinte (+${apontamentos.length - consumidos} registro(s))`, 40, y, 7.5, false, "0.45 0.47 0.52"));
  }
  return { comandos, consumidos };
}

function montarPaginasDetalhamento(resumo: Json, inicioDetalhamento = 0) {
  const raiz = registro(resumo);
  const apontamentos = Array.isArray(raiz.apontamentos) ? raiz.apontamentos : [];
  const setor = texto(raiz.setor).toLowerCase();
  const fitas = setor.includes("fita");
  const mantas = setor.includes("manta");
  const porPagina = 27;
  const paginas: string[][] = [];
  for (let inicio = inicioDetalhamento; inicio < apontamentos.length; inicio += porPagina) {
    const comandos: string[] = [];
    const lote = apontamentos.slice(inicio, inicio + porPagina);
    cabecalhoPagina(comandos, "DETALHAMENTO DO TURNO", `${texto(raiz.setor)} | ${turnoLegivel(texto(raiz.turno))} | ${formatarData(texto(raiz.data))}`);
    desenharCabecalhoDetalhamento(comandos, 730, fitas);
    let y = 699;
    lote.forEach((item, indice) => { desenharLinhaDetalhamento(comandos, item, inicio + indice, y, fitas, mantas); y -= 23; });
    paginas.push(comandos);
  }
  return paginas;
}

function montarPaginasOcorrencias(resumo: Json) {
  const raiz = registro(resumo);
  const lista = ocorrenciasDoResumo(raiz["ocorrencias"]);
  if (!lista) return [];
  const estruturado = usaOcorrenciasEstruturadas(raiz.setor);
  if (!estruturado && lista.length === 0) return [];
  const { grupos, outras } = estruturado ? consolidarOcorrencias(lista) : { grupos: [], outras: linhasOcorrenciasLivres(lista) };
  const subtitulo = `${texto(raiz.setor)} | ${turnoLegivel(texto(raiz.turno))} | ${formatarData(texto(raiz.data))}`;
  const paginas: string[][] = [];
  let comandos: string[] = [];
  let y = 0;
  const novaPagina = () => { comandos = []; paginas.push(comandos); cabecalhoPagina(comandos, "OCORRENCIAS OPERACIONAIS", subtitulo); y = 732; };
  const garantir = (altura: number) => { if (y - altura < 60) novaPagina(); };
  const quebrar = (valor: string, max: number) => {
    const palavras = semAcentos(valor).split(/\s+/);
    const linhas: string[] = [];
    let atual = "";
    for (const p of palavras) {
      if ((atual + " " + p).trim().length > max) { if (atual) linhas.push(atual); atual = p.slice(0, max); }
      else atual = (atual + " " + p).trim();
    }
    if (atual) linhas.push(atual);
    return linhas.length ? linhas : ["-"];
  };
  novaPagina();
  const secoes = [...grupos, ...(outras.length ? [{ titulo: estruturado ? "Outras ocorrencias" : "Ocorrencias registradas", itens: [{ equipamento: "Geral", linhas: outras, comProblema: true }] }] : [])];
  for (const grupo of secoes) {
    garantir(40);
    comandos.push(comandoRetangulo(36, y - 6, 523, 20, "0.96 0.93 0.93"));
    comandos.push(comandoTexto(grupo.titulo.toUpperCase(), 44, y, 9.5, true, "0.55 0.04 0.06"));
    y -= 24;
    for (const item of grupo.itens) {
      const linhas = item.linhas.flatMap((l) => quebrar(l, 70));
      garantir(14 * linhas.length + 6);
      comandos.push(comandoTexto(limitar(item.equipamento, 26), 44, y, 8.8, true));
      const cor = item.comProblema ? "0.67 0.14 0.05" : "0.07 0.45 0.23";
      linhas.forEach((l, i) => comandos.push(comandoTexto(l, 190, y - i * 13, 8.5, false, cor)));
      y -= 13 * linhas.length + 5;
      comandos.push(comandoLinha(44, y + 4, 557, y + 4, "0.92 0.92 0.94"));
      y -= 4;
    }
    y -= 8;
  }
  return paginas;
}

function montarPdf(paginas: string[][]) {
  const totalPaginas = paginas.length;
  paginas.forEach((comandos, indice) => rodapePagina(comandos, indice + 1, totalPaginas));
  const objetos: string[] = [];
  const idsPaginas = paginas.map((_, indice) => 5 + indice * 2);
  objetos.push("<< /Type /Catalog /Pages 2 0 R >>");
  objetos.push(`<< /Type /Pages /Kids [${idsPaginas.map((id) => `${id} 0 R`).join(" ")}] /Count ${paginas.length} >>`);
  objetos.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  objetos.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  paginas.forEach((comandos, indice) => {
    const paginaId = 5 + indice * 2;
    const conteudoId = paginaId + 1;
    const stream = comandos.join("\n");
    objetos.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${conteudoId} 0 R >>`);
    objetos.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objetos.forEach((objeto, indice) => { offsets.push(pdf.length); pdf += `${indice + 1} 0 obj\n${objeto}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

export function gerarPdfRelatorio(resumo: Json) {
  const primeira = montarPrimeiraPagina(resumo);
  const detalhamento = montarPaginasDetalhamento(resumo, primeira.consumidos);
  return montarPdf([primeira.comandos, ...detalhamento, ...montarPaginasOcorrencias(resumo)]);
}

export function arquivoPdf(resumo: Json, nome: string) { return new File([gerarPdfRelatorio(resumo)], nome, { type: "application/pdf" }); }

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
  window.setTimeout(() => { link.remove(); URL.revokeObjectURL(url); }, 60_000);
}

export function imprimirPdf(resumo: Json, nome: string) {
  const arquivo = arquivoPdf(resumo, nome);
  const url = URL.createObjectURL(arquivo);
  const janela = window.open(url, "_blank");
  if (!janela) { URL.revokeObjectURL(url); return false; }
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
