import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { gerarPdfRelatorio } from "@/lib/relatorio-pdf";
import { enviarComNovasTentativas } from "@/lib/reenvio-email";
import { formatarKg } from "@/lib/misturadores";

const entrada = z.object({
  relatorioId: z.string().uuid(),
  destinatarios: z.array(z.string().email()).min(1).max(10),
});

function normalizarDestinatarios(destinatarios: string[]) {
  return [...new Set(destinatarios.map((email) => email.trim().toLowerCase()).filter(Boolean))].slice(0, 10);
}

function dataExibicao(valor: string) {
  const [ano, mes, dia] = valor.split("-");
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : valor;
}

function turnoExibicao(valor: string) {
  if (valor === "T1") return "1º turno";
  if (valor === "T2") return "2º turno";
  if (valor === "T3") return "3º turno";
  return valor;
}

function limparErro(erro: unknown) {
  return (erro instanceof Error ? erro.message : "Falha desconhecida no envio.").replace(/[\r\n]+/g, " ").slice(0, 500);
}

const NOMES_SETOR: Record<string, string> = {
  corte: "Corte",
  fitas: "Fitas",
  mantas: "Mantas",
  asfox: "Asfox",
  misturadores: "Misturadores",
  liquidos: "Líquidos",
  pos: "Pós",
  avulsos: "Avulsos",
};

function campo(obj: unknown, chave: string): unknown {
  return obj && typeof obj === "object" && !Array.isArray(obj) ? (obj as Record<string, unknown>)[chave] : undefined;
}

function txt(valor: unknown) {
  if (valor === null || valor === undefined || valor === "") return "—";
  if (typeof valor === "number") return valor.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  if (typeof valor === "object") return String(campo(valor, "nome") ?? campo(valor, "email") ?? "—");
  return String(valor);
}

export const enviarRelatorio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(entrada)
  .handler(async ({ data, context }) => {
    const destinatarios = normalizarDestinatarios(data.destinatarios);
    if (destinatarios.length === 0) throw new Error("Informe ao menos um destinatário válido.");

    const { data: relatorio, error } = await context.supabase
      .from("relatorios")
      .select("*")
      .eq("id", data.relatorioId)
      .single();
    if (error || !relatorio) throw new Error("Relatório não encontrado ou sem permissão.");

    const { data: bloqueio, error: erroBloqueio } = await context.supabase
      .from("relatorios")
      .update({
        status_envio: "enviando",
        destinatarios,
        tentativas_envio: relatorio.tentativas_envio + 1,
        erro_envio: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", relatorio.id)
      .in("status_envio", ["aguardando", "falhou", "enviado"])
      .select("id")
      .maybeSingle();

    if (erroBloqueio || !bloqueio) {
      throw new Error("Este relatório já está sendo enviado. Aguarde alguns segundos e tente novamente.");
    }

    try {
      const dataFormatada = dataExibicao(relatorio.data_local);
      const turnoFormatado = turnoExibicao(relatorio.turno);
      const setor = NOMES_SETOR[relatorio.setor] ?? relatorio.setor;
      const fileName = `Relatorio-DRYKO-${setor.normalize("NFD").replace(/[^\w]/g, "")}-${relatorio.data_local}-Turno${relatorio.turno.replace("T", "")}.pdf`;
      const pdf = gerarPdfRelatorio(relatorio.resumo);
      if (pdf.byteLength > 20 * 1024 * 1024)
        throw new Error("O PDF ultrapassa 20 MB e não pode ser enviado por e-mail.");
      const raiz = relatorio.resumo;
      const totais = campo(raiz, "totais");
      const fitas = relatorio.setor === "fitas";
      const kg = relatorio.setor === "misturadores";
      const producao = kg
        ? formatarKg(Number(campo(totais, "pesoKg") ?? 0))
        : fitas
        ? `${txt(campo(totais, "area"))} m²`
        : `${txt(campo(totais, "metragem"))} ${relatorio.setor === "mantas" ? "m" : "m²"}`;
      const subject = `Relatório de Produção DRYKO - ${setor} - ${dataFormatada} - ${turnoFormatado}`;
      const body = [
        "Relatório de Produção DRYKO",
        "",
        `Setor: ${setor}`,
        `Turno: ${turnoFormatado}`,
        `Data: ${dataFormatada}`,
        `Responsável pelo fechamento: ${txt(campo(raiz, "responsavel"))}`,
        "",
        `Total de apontamentos: ${txt(campo(totais, "apontamentos"))}`,
        ...(kg ? [] : [`PLTs: ${fitas ? "—" : txt(campo(totais, "plts"))}`]),
        `${kg ? "Peso produzido" : fitas ? "Área" : "Metragem"}: ${producao}`,
        `Pendentes: ${txt(campo(totais, "pendentes"))}`,
        `Lançados: ${txt(campo(totais, "lancados"))}`,
        "",
        "O relatório completo está anexado em PDF.",
      ].join("\n");

      const { enviarEmail } = await import("./email.server");
      // Repete sozinho só quando o serviço garantiu que nada saiu (ocupado ou falha antes do envio).
      await enviarComNovasTentativas(() =>
        enviarEmail({ reportId: relatorio.id, to: destinatarios, subject, body, pdf, fileName }),
      );

      await context.supabase
        .from("relatorios")
        .update({
          status_envio: "enviado",
          destinatarios,
          enviado_em: new Date().toISOString(),
          erro_envio: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", relatorio.id);

      return { ok: true, destinatarios };
    } catch (erro) {
      const mensagem = limparErro(erro);
      await context.supabase
        .from("relatorios")
        .update({
          status_envio: "falhou",
          erro_envio: `${new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date())} · ${mensagem}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", relatorio.id);
      throw new Error(mensagem);
    }
  });
