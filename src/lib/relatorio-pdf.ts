import type { Json } from "@/integrations/supabase/types";

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
  [key: string]: Json | undefined;
};

function registro(valor: Json | undefined): ResumoRegistro {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as ResumoRegistro)
    : {};
}

function texto(valor: Json | undefined) {
  if (valor === null || valor === undefined) return "-";
  if (typeof valor === "object") return JSON.stringify(valor);
  return String(valor);
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

export function linhasDoRelatorio(resumo: Json) {
  const raiz = registro(resumo);
  const totais = registro(raiz.totais);
  const apontamentos = Array.isArray(raiz.apontamentos) ? raiz.apontamentos : [];
  const metas = Array.isArray(raiz.metas) ? raiz.metas : [];
  const linhas = [
    `Setor: ${texto(raiz.setor)} | Turno: ${texto(raiz.turno)} | Data: ${texto(raiz.data)}`,
    `Responsavel: ${texto(raiz.responsavel)} | Gerado em: ${texto(raiz.geradoEm)}`,
    "",
    "RESUMO",
    `Apontamentos: ${texto(totais.apontamentos)} | Pendentes: ${texto(totais.pendentes)} | Lancados: ${texto(totais.lancados)}`,
    `PLTs: ${texto(totais.plts)} | Rolos: ${texto(totais.rolos)} | Metragem: ${texto(totais.metragem)} m | Area: ${texto(totais.area)} m2`,
    "",
  ];

  if (metas.length > 0) {
    linhas.push("METAS ATIVAS");
    for (const item of metas.slice(0, 8)) {
      const meta = registro(item);
      linhas.push(
        `${texto(meta.op)} | ${texto(meta.produto_nome)} | Meta: ${texto(meta.quantidade_meta)} ${texto(meta.unidade)}`,
      );
    }
    linhas.push("");
  }

  linhas.push("APONTAMENTOS");
  for (const item of apontamentos.slice(0, 30)) {
    const apontamento = registro(item);
    const identificador = apontamento.op ?? apontamento.lote ?? "-";
    const quantidade =
      apontamento.area_m2 !== null && apontamento.area_m2 !== undefined
        ? `${texto(apontamento.area_m2)} m2`
        : `${texto(apontamento.quantidade_plts)} PLTs | ${texto(apontamento.total_rolos)} rolos | ${texto(apontamento.metragem)} m`;
    linhas.push(
      `${texto(identificador)} | ${texto(apontamento.produto_nome)} | ${quantidade} | ${texto(apontamento.status)}`,
    );
  }
  if (apontamentos.length > 30) linhas.push(`... e mais ${apontamentos.length - 30} registro(s).`);
  return linhas;
}

export function gerarPdfRelatorio(resumo: Json) {
  const linhas = linhasDoRelatorio(resumo).slice(0, 48);
  const comandos = [
    "BT /F2 17 Tf 40 805 Td (DRYKO - RELATORIO DE PRODUCAO) Tj ET",
    "BT /F1 9 Tf 40 786 Td (Aponta Producao) Tj ET",
  ];
  let y = 760;
  for (const linha of linhas) {
    const fonte =
      linha === "RESUMO" || linha === "METAS ATIVAS" || linha === "APONTAMENTOS" ? "F2" : "F1";
    comandos.push(`BT /${fonte} 8.5 Tf 40 ${y} Td (${escaparPdf(linha).slice(0, 115)}) Tj ET`);
    y -= 14;
  }
  comandos.push("0.75 0 0 rg 40 822 515 3 re f");
  const stream = comandos.join("\n");
  const objetos = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];

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

export function arquivoPdf(resumo: Json, nome: string) {
  return new File([gerarPdfRelatorio(resumo)], nome, { type: "application/pdf" });
}

export function baixarPdf(resumo: Json, nome: string) {
  const arquivo = arquivoPdf(resumo, nome);
  const url = URL.createObjectURL(arquivo);
  const link = document.createElement("a");
  link.href = url;
  link.download = nome;
  link.click();
  URL.revokeObjectURL(url);
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
