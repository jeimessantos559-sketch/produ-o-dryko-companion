/**
 * Reenvio automático do e-mail do relatório, sem risco de duplicar.
 *
 * Só repete quando o serviço CONFIRMOU que o e-mail não saiu e o motivo é
 * passageiro (serviço ocupado ou falha antes do envio). Resposta incerta
 * (sem retorno, tempo esgotado, página de login) nunca é repetida
 * automaticamente: o e-mail pode ter saído. Cota e configuração também não,
 * porque repetir não resolve.
 */

export class ErroEnvioEmail extends Error {
  /** Código do serviço (BUSY, SEND_FAILED, QUOTA_EXCEEDED...) ou SEM_CONFIRMACAO. */
  readonly codigo: string;
  /** true somente quando o serviço garantiu que nada foi enviado. */
  readonly naoEnviado: boolean;

  constructor(mensagem: string, codigo: string, naoEnviado: boolean) {
    super(mensagem);
    this.name = "ErroEnvioEmail";
    this.codigo = codigo;
    this.naoEnviado = naoEnviado;
  }
}

const CODIGOS_PASSAGEIROS = new Set(["BUSY", "SEND_FAILED"]);
export const PAUSAS_REENVIO_MS = [2_000, 5_000] as const;

export function podeRepetirAutomaticamente(erro: unknown): boolean {
  return (
    erro instanceof ErroEnvioEmail && erro.naoEnviado && CODIGOS_PASSAGEIROS.has(erro.codigo)
  );
}

const esperarPadrao = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Executa o envio e repete só nos casos seguros. Retorna quantas tentativas foram feitas. */
export async function enviarComNovasTentativas(
  enviar: () => Promise<void>,
  esperar: (ms: number) => Promise<void> = esperarPadrao,
  pausas: readonly number[] = PAUSAS_REENVIO_MS,
): Promise<number> {
  for (let tentativa = 0; ; tentativa += 1) {
    try {
      await enviar();
      return tentativa + 1;
    } catch (erro) {
      if (tentativa >= pausas.length || !podeRepetirAutomaticamente(erro)) throw erro;
      await esperar(pausas[tentativa]!);
    }
  }
}
