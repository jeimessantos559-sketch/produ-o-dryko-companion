// Fonte oficial no GitHub. Implantar uma cópia deste arquivo na conta operacional.
// A chave deve ficar em Propriedades do script, nunca no código.
const EMAIL_CONFIG = Object.freeze({
  service: 'Aponta Produção DRYKO - E-mail',
  version: '2.0.0',
  sender: 'apontaproducao@gmail.com',
  tokenProperty: 'APPS_SCRIPT_API_TOKEN',
  maxPdfBytes: 20 * 1024 * 1024,
});

function doGet() {
  return emailJson_({ ok: true, service: EMAIL_CONFIG.service, version: EMAIL_CONFIG.version });
}

// Executar no editor para autorizar o MailApp; esta função não envia mensagens.
function autorizarEnvio() {
  emailRemetente_();
  return MailApp.getRemainingDailyQuota();
}

function doPost(e) {
  let lock;
  let locked = false;
  let sent = false;
  try {
    const texto = e && e.postData && e.postData.contents;
    if (typeof texto !== 'string' || !texto || texto.length > 29 * 1024 * 1024) throw new Error('INVALID_REQUEST');
    const payload = JSON.parse(texto);
    const secret = PropertiesService.getScriptProperties().getProperty(EMAIL_CONFIG.tokenProperty);
    if (!secret || secret.length < 32) throw new Error('NOT_CONFIGURED');
    if (!payload || typeof payload.token !== 'string' || !emailMesmoToken_(payload.token, secret)) throw new Error('UNAUTHORIZED');
    emailRemetente_();
    if (payload.action === 'verify') {
      return emailJson_({
        ok: true, dryRun: true, sender: EMAIL_CONFIG.sender,
        capabilities: ['pdf', 'password-recovery'],
        remainingDailyRecipients: MailApp.getRemainingDailyQuota(),
      });
    }
    if (payload.action && payload.action !== 'send') throw new Error('INVALID_REQUEST');

    const recipients = emailDestinatarios_(payload.to || payload.destinatarios);
    const subject = emailTexto_(payload.subject || payload.assunto, 180);
    if (/[\r\n\0]/.test(subject)) throw new Error('INVALID_REQUEST');
    const body = emailTexto_(payload.body || payload.mensagem, 5000);
    const requestId = emailTexto_(payload.requestId || payload.reportId, 150);
    const message = { to: recipients.join(','), subject, body, name: 'Aponta Produção DRYKO' };
    if (payload.pdfBase64 !== undefined) {
      if (typeof payload.pdfBase64 !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(payload.pdfBase64)) throw new Error('INVALID_REQUEST');
      const bytes = Utilities.base64Decode(payload.pdfBase64);
      if (!bytes.length || bytes.length > EMAIL_CONFIG.maxPdfBytes ||
          bytes.slice(0, 5).map(function (v) { return String.fromCharCode(v); }).join('') !== '%PDF-') throw new Error('INVALID_REQUEST');
      const fileName = emailTexto_(payload.fileName || payload.nomeArquivo, 180);
      if (!/\.pdf$/i.test(fileName) || /[\r\n\0"\\/]/.test(fileName)) throw new Error('INVALID_REQUEST');
      message.attachments = [Utilities.newBlob(bytes, 'application/pdf', fileName)];
    } else if (payload.fileName || payload.nomeArquivo) throw new Error('INVALID_REQUEST');

    lock = LockService.getScriptLock();
    locked = lock.tryLock(10000);
    if (!locked) throw new Error('BUSY');
    const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, requestId, Utilities.Charset.UTF_8);
    const key = 'email_' + digest.map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
    const cache = CacheService.getScriptCache();
    if (cache.get(key)) return emailJson_({ ok: true, duplicate: true });
    if (MailApp.getRemainingDailyQuota() < recipients.length) throw new Error('QUOTA_EXCEEDED');
    MailApp.sendEmail(message);
    sent = true;
    // O cache é uma proteção adicional; o bloqueio principal do relatório está no banco do aplicativo.
    try { cache.put(key, 'sent', 21600); } catch (_) { /* o envio já foi aceito; não repetir por falha do cache */ }
    return emailJson_({ ok: true });
  } catch (error) {
    if (sent) return emailJson_({ ok: true });
    const allowed = ['UNAUTHORIZED', 'NOT_CONFIGURED', 'WRONG_SENDER', 'INVALID_REQUEST', 'QUOTA_EXCEEDED', 'BUSY'];
    const code = error && allowed.indexOf(error.message) >= 0 ? error.message : 'SEND_FAILED';
    return emailJson_({ ok: false, error: code });
  } finally {
    if (lock && locked) { try { lock.releaseLock(); } catch (_) { /* não altera o resultado do envio */ } }
  }
}

function emailRemetente_() {
  if (Session.getEffectiveUser().getEmail().toLowerCase() !== EMAIL_CONFIG.sender) throw new Error('WRONG_SENDER');
}

function emailMesmoToken_(a, b) {
  let difference = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) difference |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return difference === 0;
}

function emailTexto_(valor, max) {
  if (typeof valor !== 'string' || !valor.trim() || valor.length > max) throw new Error('INVALID_REQUEST');
  return valor;
}

function emailDestinatarios_(valor) {
  if (!Array.isArray(valor) || valor.length < 1 || valor.length > 10) throw new Error('INVALID_REQUEST');
  const result = [];
  valor.forEach(function (email) {
    if (typeof email !== 'string' || !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email.trim())) throw new Error('INVALID_REQUEST');
    const normalized = email.trim().toLowerCase();
    if (result.indexOf(normalized) < 0) result.push(normalized);
  });
  return result;
}

function emailJson_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
