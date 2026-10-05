import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Boxes, CheckCircle2, Clock3, Download, Mail, PackageCheck, Printer, Ruler, Share2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { DrykoLogo } from "@/components/dryko/logo";
import { RelatorioApontamentos } from "@/components/dryko/relatorio-apontamentos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import { enviarRelatorio } from "@/lib/enviar-relatorio";
import { baixarPdf, compartilharPdf, imprimirPdf } from "@/lib/relatorio-pdf";
import { completarResponsaveisRelatorio } from "@/lib/responsaveis-relatorio";

export const Route = createFileRoute("/_authenticated/relatorio/$relatorioId")({
  component: RelatorioDetalhado,
});

type Relatorio = Database["public"]["Tables"]["relatorios"]["Row"];
type Objeto = Record<string, Json | undefined> & {
  totais?: Json;
  apontamentos?: Json;
  metas?: Json;
  responsavel?: Json;
  geradoEm?: Json;
  produto_nome?: Json;
  quantidade_plts?: Json;
  total_rolos?: Json;
  metragem?: Json;
  area_m2?: Json;
  area?: Json;
  plts?: Json;
  pendentes?: Json;
  lancados?: Json;
  status?: Json;
  id?: Json;
  op?: Json;
  lote?: Json;
  quantidade_meta?: Json;
  unidade?: Json;
};

function objeto(valor: Json | undefined): Objeto {
  return valor && typeof valor === "object" && !Array.isArray(valor) ? (valor as Objeto) : {};
}

function texto(valor: Json | undefined) {
  if (valor === null || valor === undefined || valor === "") return "—";
  return typeof valor === "object" ? "—" : String(valor);
}

function numero(valor: Json | undefined) {
  const n = Number(valor ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function formatarNumero(valor: number, casas = 2) {
  return valor.toLocaleString("pt-BR", { maximumFractionDigits: casas });
}

function formatarData(valor: string) {
  const [ano, mes, dia] = valor.slice(0, 10).split("-");
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : valor;
}

function formatarDataHora(valor?: string | null) {
  if (!valor) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(valor));
}

function turnoNome(turno: string) {
  if (turno === "T1") return "1º turno";
  if (turno === "T2") return "2º turno";
  if (turno === "T3") return "3º turno";
  return turno;
}

function setorNome(setor: string) {
  const mapa: Record<string, string> = { corte: "Corte", fitas: "Fitas", mantas: "Mantas" };
  return mapa[setor] ?? setor;
}

function RelatorioDetalhado() {
  const { relatorioId } = Route.useParams();
  const [relatorio, setRelatorio] = useState<Relatorio | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [destinatarios, setDestinatarios] = useState("");
  const [enviando, setEnviando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const [{ data, error }, { data: perfis }] = await Promise.all([
      supabase.from("relatorios").select("*").eq("id", relatorioId).single(),
      supabase.from("profiles").select("id, nome"),
    ]);
    if (error || !data) {
      toast.error("Não foi possível abrir o relatório.");
      setRelatorio(null);
    } else {
      const nomes = Object.fromEntries((perfis ?? []).map((item) => [item.id, item.nome || ""]));
      setRelatorio({ ...data, resumo: completarResponsaveisRelatorio(data.resumo, nomes) });
      if (data.destinatarios?.length) setDestinatarios(data.destinatarios.join("; "));
    }
    setCarregando(false);
  }, [relatorioId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const dados = useMemo(() => {
    const raiz = objeto(relatorio?.resumo);
    const totais = objeto(raiz.totais);
    const apontamentos = Array.isArray(raiz.apontamentos) ? raiz.apontamentos.map(objeto) : [];
    const metas = Array.isArray(raiz.metas) ? raiz.metas.map(objeto) : [];
    const produtos = new Map<string, { apontamentos: number; plts: number; rolos: number; metragem: number; area: number }>();
    for (const item of apontamentos) {
      const nome = texto(item.produto_nome);
      const atual = produtos.get(nome) ?? { apontamentos: 0, plts: 0, rolos: 0, metragem: 0, area: 0 };
      atual.apontamentos += 1;
      atual.plts += numero(item.quantidade_plts);
      atual.rolos += numero(item.total_rolos);
      atual.metragem += numero(item.metragem);
      atual.area += numero(item.area_m2);
      produtos.set(nome, atual);
    }
    return {
      raiz,
      totais,
      apontamentos,
      metas,
      produtos: [...produtos.entries()].sort((a, b) => b[1].plts - a[1].plts || b[1].area - a[1].area),
    };
  }, [relatorio]);

  if (carregando) {
    return <main className="min-h-screen bg-[#e9eef3] p-6 text-center text-sm text-slate-500">Montando relatório...</main>;
  }
  if (!relatorio) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#e9eef3] p-6">
        <div className="rounded-3xl bg-white p-8 text-center shadow-sm">
          <p className="font-semibold">Relatório não encontrado.</p>
          <Button asChild className="mt-4"><Link to="/relatorios">Voltar aos relatórios</Link></Button>
        </div>
      </main>
    );
  }

  const relatorioAtual = relatorio;
  const nomeArquivo = `relatorio-${relatorio.setor}-${relatorio.data_local}-${relatorio.turno}.pdf`;
  const fitas = relatorio.setor === "fitas";
  const mantas = relatorio.setor === "mantas";
  const metragem = fitas ? numero(dados.totais.area) : numero(dados.totais.metragem);
  const unidade = mantas ? "m" : "m²";

  async function compartilhar() {
    try {
      const usouCompartilhamento = await compartilharPdf(relatorioAtual.resumo, nomeArquivo);
      if (!usouCompartilhamento) toast.info("O PDF foi baixado porque o compartilhamento de arquivos não está disponível neste aparelho.");
    } catch {
      toast.error("Não foi possível compartilhar o relatório.");
    }
  }

  async function enviarEmail() {
    const lista = destinatarios.split(/[;,\s]+/).map((email) => email.trim().toLowerCase()).filter(Boolean);
    if (!lista.length) {
      toast.error("Informe ao menos um e-mail destinatário.");
      return;
    }
    setEnviando(true);
    try {
      await enviarRelatorio({ data: { relatorioId: relatorioAtual.id, destinatarios: lista } });
      toast.success("Relatório enviado por e-mail.");
      await carregar();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível enviar o relatório.");
      await carregar();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#e9eef3] px-3 py-4 sm:px-6 sm:py-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="h-11 rounded-xl bg-white"><Link to="/relatorios"><ArrowLeft /> Voltar</Link></Button>
          <Button variant="outline" className="h-11 rounded-xl bg-white" onClick={() => { if (!imprimirPdf(relatorio.resumo, nomeArquivo)) toast.error("O navegador bloqueou a janela de impressão."); }}><Printer /> Imprimir</Button>
          <Button variant="outline" className="h-11 rounded-xl bg-white" onClick={() => baixarPdf(relatorio.resumo, nomeArquivo)}><Download /> Baixar PDF</Button>
          <Button variant="outline" className="h-11 rounded-xl bg-white" onClick={compartilhar}><Share2 /> WhatsApp / compartilhar</Button>
        </div>

        <section className={`rounded-2xl border p-4 ${relatorio.status_envio === "enviado" ? "border-emerald-200 bg-emerald-50" : relatorio.status_envio === "falhou" ? "border-red-200 bg-red-50" : "border-slate-200 bg-white"}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-bold text-slate-900">{relatorio.status_envio === "enviado" ? "Relatório enviado por e-mail" : relatorio.status_envio === "falhou" ? "Falha no último envio" : "Envio por e-mail"}</p>
              <p className="text-sm text-slate-600">
                {relatorio.status_envio === "enviado"
                  ? `${relatorio.destinatarios.length} destinatário(s) · ${formatarDataHora(relatorio.enviado_em)}`
                  : "Informe os destinatários para enviar o PDF profissional em anexo."}
              </p>
              {relatorio.erro_envio && <p className="mt-1 text-sm font-medium text-red-700">{relatorio.erro_envio}</p>}
            </div>
            <div className="flex min-w-[280px] flex-1 gap-2 sm:max-w-xl">
              <Input value={destinatarios} onChange={(event) => setDestinatarios(event.target.value)} placeholder="producao@empresa.com; qualidade@empresa.com" className="h-11 bg-white" />
              <Button className="h-11 shrink-0" disabled={enviando || relatorio.status_envio === "enviando"} onClick={enviarEmail}><Mail /> {enviando ? "Enviando..." : relatorio.status_envio === "enviado" ? "Enviado" : "Enviar"}</Button>
            </div>
          </div>
        </section>

        <article className="overflow-hidden rounded-3xl bg-white shadow-xl shadow-slate-300/40">
          <header className="bg-gradient-to-r from-[#c70812] to-[#e61b26] px-6 py-6 text-white sm:px-8">
            <div className="flex flex-wrap items-center justify-between gap-5">
              <div className="rounded-xl bg-white p-2"><DrykoLogo /></div>
              <div className="text-left sm:text-right">
                <p className="text-xs font-extrabold uppercase tracking-[0.22em] text-red-100">Aponta Produção · {setorNome(relatorio.setor)}</p>
                <h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">Relatório do turno</h1>
                <p className="mt-2 text-sm text-red-100">Documento operacional de produção e passagem de turno</p>
              </div>
            </div>
          </header>

          <div className="space-y-7 p-5 sm:p-8">
            <section className="flex flex-wrap items-start justify-between gap-5 border-b border-slate-200 pb-6">
              <div>
                <p className="text-3xl font-black text-slate-950">{formatarData(relatorio.data_local)}</p>
                <p className="mt-1 text-lg font-bold text-[#c70812]">{setorNome(relatorio.setor)} · {turnoNome(relatorio.turno)}</p>
              </div>
              <div className="text-sm text-slate-500 sm:text-right">
                <p><strong className="text-slate-700">Responsável pelo relatório:</strong> {texto(dados.raiz.responsavel)}</p>
                <p><strong className="text-slate-700">Gerado em:</strong> {formatarDataHora(texto(dados.raiz.geradoEm))}</p>
                <p><strong className="text-slate-700">ID:</strong> {relatorio.id.slice(0, 8).toUpperCase()}</p>
              </div>
            </section>

            <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Indicador icon={PackageCheck} titulo="Apontamentos" valor={formatarNumero(numero(dados.totais.apontamentos), 0)} />
              <Indicador icon={Boxes} titulo={fitas ? "Registros" : "PLTs fechados"} valor={fitas ? formatarNumero(numero(dados.totais.apontamentos), 0) : formatarNumero(numero(dados.totais.plts), 0)} />
              <Indicador icon={Ruler} titulo={fitas ? "Produção" : "Metragem produzida"} valor={`${formatarNumero(metragem)} ${unidade}`} destaque />
              <Indicador icon={Clock3} titulo="Pendentes / lançados" valor={`${formatarNumero(numero(dados.totais.pendentes), 0)} / ${formatarNumero(numero(dados.totais.lancados), 0)}`} alerta={numero(dados.totais.pendentes) > 0} />
            </section>

            <Secao titulo="Resumo por produto">
              <div className="overflow-hidden rounded-2xl border border-slate-200">
                {dados.produtos.map(([nome, total], indice) => (
                  <div key={nome} className={`grid grid-cols-[1fr_auto] gap-3 px-4 py-3 text-sm sm:grid-cols-[1fr_90px_90px_130px] ${indice % 2 === 0 ? "bg-slate-50" : "bg-white"}`}>
                    <div><p className="font-bold text-slate-900">{nome}</p><p className="text-xs text-slate-500">{total.apontamentos} apontamento(s)</p></div>
                    <span className="hidden self-center text-slate-600 sm:block">{total.plts} PLTs</span>
                    <span className="hidden self-center text-slate-600 sm:block">{formatarNumero(total.rolos, 0)} rolos</span>
                    <strong className="self-center text-right text-slate-900">{fitas ? `${formatarNumero(total.area)} m²` : `${formatarNumero(total.metragem)} ${unidade}`}</strong>
                  </div>
                ))}
                {dados.produtos.length === 0 && <p className="p-4 text-sm text-slate-500">Nenhum produto registrado.</p>}
              </div>
            </Secao>

            <Secao titulo="Controle das OPs e apontamentos">
              <RelatorioApontamentos apontamentos={dados.apontamentos} fitas={fitas} unidade={unidade} />
            </Secao>

            {dados.metas.length > 0 && (
              <Secao titulo="Metas ativas da OP">
                <div className="grid gap-2 sm:grid-cols-2">
                  {dados.metas.map((meta, indice) => <div key={String(meta.id ?? indice)} className="rounded-2xl bg-slate-50 p-4 text-sm"><p className="font-bold">OP {texto(meta.op)} · {texto(meta.produto_nome)}</p><p className="mt-1 text-slate-600">Meta: {texto(meta.quantidade_meta)} {texto(meta.unidade)}</p></div>)}
                </div>
              </Secao>
            )}

            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5 text-xs text-slate-400">
              <span>DRYKO Impermeabilizantes · Aponta Produção</span>
              <span>Relatório gerado eletronicamente pelo sistema</span>
            </footer>
          </div>
        </article>
      </div>
    </main>
  );
}

function Indicador({ icon: Icon, titulo, valor, destaque, alerta }: { icon: typeof Boxes; titulo: string; valor: string; destaque?: boolean; alerta?: boolean }) {
  return <div className={`rounded-2xl border p-4 ${alerta ? "border-amber-200 bg-amber-50" : destaque ? "border-red-100 bg-red-50" : "border-slate-200 bg-slate-50"}`}><div className={`mb-3 flex size-9 items-center justify-center rounded-xl ${alerta ? "bg-amber-100 text-amber-700" : destaque ? "bg-red-100 text-[#c70812]" : "bg-white text-slate-600"}`}><Icon className="size-5" /></div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{titulo}</p><p className="mt-1 text-2xl font-black text-slate-950">{valor}</p></div>;
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return <section><div className="mb-3 flex items-center gap-3"><h2 className="text-xl font-black text-slate-950">{titulo}</h2><div className="h-px flex-1 bg-slate-200" /></div>{children}</section>;
}
