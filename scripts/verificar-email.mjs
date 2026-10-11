// Node 24. As variáveis privadas devem vir do ambiente; nenhuma mensagem é enviada.
import { verificarIntegracaoAppsScript } from "../src/lib/email.server.ts";

try {
  const resultado = await verificarIntegracaoAppsScript();
  console.log(`Integração validada: ${resultado.remetente}; ${resultado.destinatariosRestantes} destinatários restantes na cota diária.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Não foi possível verificar a integração de e-mail.");
  process.exitCode = 1;
}
