# Integração de e-mail

O backend usa `src/lib/email.server.ts` para enviar relatórios com PDF e links de recuperação. A geração dos relatórios, os destinatários cadastrados, as permissões, o bloqueio de envio simultâneo e os limites de recuperação permanecem no aplicativo. A recuperação mantém a resposta genérica para não revelar contas cadastradas.

## Conta e código do serviço

O remetente operacional é `apontaproducao@gmail.com`. A fonte do Web App está em `integrations/apps-script/email.gs`, com o manifesto `integrations/apps-script/appsscript.json`. Criar uma implantação dedicada na conta operacional, preservando o Apps Script anterior utilizado pelo Floot.

O Web App usa MailApp para enviar mensagens; os únicos escopos são envio de e-mail e identificação do e-mail da conta executora. A identificação confirma que o remetente é a conta operacional. Não usa leitura da caixa de entrada. Relatórios aceitam PDF de até 20 MB e até 10 destinatários; recuperação funciona sem PDF.

## Ativação no Google

1. Acessar Apps Script com `apontaproducao@gmail.com` e criar o projeto dedicado **Aponta Produção DRYKO - E-mail Vercel**.
2. Inserir `email.gs` e `appsscript.json` exatamente como estão no repositório. O código real da chave não entra nesses arquivos.
3. Em **Configurações do projeto → Propriedades do script**, configurar `APPS_SCRIPT_API_TOKEN` com uma chave aleatória de pelo menos 32 caracteres, gerada por ferramenta segura. Guardar a mesma chave exclusivamente nas variáveis privadas da Vercel.
4. Executar `autorizarEnvio` e autorizar os dois escopos do manifesto. Essa função apenas consulta a cota e confirma a conta, sem enviar e-mail.
5. Em **Implantar → Nova implantação → App da Web**, executar como a conta operacional e permitir acesso **Qualquer pessoa**. Esse acesso permite que o servidor da Vercel faça a chamada; toda requisição de envio exige a chave privada. O GET público mostra somente nome e versão do serviço.
6. Copiar a URL da implantação terminada em `/exec`. Não usar a URL `/dev` do editor. Não trocar a propriedade/token da implantação antiga.

## Vercel

Configurar somente no ambiente Production do projeto `aponta_producao_dryko`:

| Variável | Valor | Proteção |
| --- | --- | --- |
| `APPS_SCRIPT_WEB_APP_URL` | URL `/exec` da nova implantação | Configuração do servidor |
| `APPS_SCRIPT_API_TOKEN` | Mesma chave das Propriedades do script | Secret |
| `APP_URL` | `https://apontaproducaodryko.vercel.app` | Configuração do servidor |

As chaves não podem ter prefixo `VITE_` nem entrar no Git. Fazer nova implantação após salvar as variáveis. A lista de redirecionamentos do Supabase já deve incluir `https://apontaproducaodryko.vercel.app/redefinir-senha`.

Quando `LOVABLE_API_KEY` e `GOOGLE_MAIL_API_KEY` (ou `_1`) estão presentes, o backend preserva o conector Gmail existente. Na Vercel, usar somente as duas variáveis do Apps Script para e-mail. Falha após iniciar o envio não troca automaticamente de provedor nem repete a mensagem. A única repetição automática (até 2 vezes, após 2 s e 5 s) acontece quando o Apps Script responde `BUSY` ou `SEND_FAILED`, códigos que ele só devolve quando garantiu que nada foi enviado (src/lib/reenvio-email.ts). Resposta incerta, cota esgotada e erro de configuração não são repetidos.

## Verificação

`npm run verify:email` consulta o Web App com `{ action: "verify" }`. As duas variáveis privadas precisam existir no ambiente do comando (Node 22.6+; produção usa Node 24). A verificação autentica a chave, confirma a conta operacional, os recursos PDF/recuperação e a cota restante, sem destinatários, envio real ou criação de link de recuperação. Nunca imprimir os valores das variáveis.

Os testes locais simulam ambos os provedores e o Web App. Para confirmar entrega real, pedir ao usuário um destinatário de teste e enviar um único teste autorizado. Não reenviar relatórios de produção nem acionar recuperação de contas para testar sem autorização.

O Google aplica cotas por conta; consultar a cota retornada pelo serviço e as [cotas oficiais](https://developers.google.com/apps-script/guides/services/quotas). Configuração válida com cota zero exige aguardar sua renovação.

Referências: [MailApp](https://developers.google.com/apps-script/reference/mail/mail-app), [Web Apps](https://developers.google.com/apps-script/guides/web) e [Propriedades do script](https://developers.google.com/apps-script/guides/properties).
