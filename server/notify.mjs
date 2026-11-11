import { readFileSync } from 'node:fs';
import { writeFile, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import tls from 'node:tls';
import { randomBytes } from 'node:crypto';

// Avisos: o resultado de uma rotina chega no SEU Telegram (bot próprio, conversa privada) ou no SEU e-mail (Gmail com senha de app).
// Regras: o token do bot e a senha de app ficam só em .data/notify-secrets.json (fora do Git) e nunca saem pela API;
// projetos da área Financeiro não enviam nada para fora; o Code Room só manda para os destinos que você cadastrou aqui.
const FILE = 'notify-secrets.json';
const TG_TOKEN = /^\d{5,12}:[\w-]{30,}$/, TG_CHAT = /^-?\d{3,20}$/, EMAIL = /^[^\s@<>"',;]{1,64}@[^\s@<>"',;]{1,190}\.[a-z]{2,}$/i;
export const CHANNELS = ['telegram', 'email'];

const crlf = s => String(s).replace(/\r?\n/g, '\r\n');
const b64 = s => Buffer.from(String(s), 'utf8').toString('base64');
const wrap76 = s => s.replace(/.{1,76}/g, '$&\r\n');
const encHeader = s => /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`;

// Mensagem de e-mail em texto simples, UTF-8, corpo em base64 (sem risco de linha começando com ponto).
export function buildMessage({ from, to, subject, text, date = new Date() }) {
  const id = `<${randomBytes(12).toString('hex')}@code-room.local>`;
  return crlf([`From: Code Room <${from}>`, `To: ${to.join(', ')}`, `Subject: ${encHeader(String(subject).replace(/[\r\n]+/g, ' ').slice(0, 180))}`, `Date: ${date.toUTCString()}`, `Message-ID: ${id}`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', wrap76(b64(text)).trimEnd()].join('\n'));
}

// Cliente SMTP mínimo (TLS direto na porta 465, AUTH PLAIN). `connect` é trocável para teste.
export function sendMail({ host = 'smtp.gmail.com', port = 465, user, pass, to, subject, text, connect = o => tls.connect(o), timeoutMs = 25000 }) {
  return new Promise((resolve, reject) => {
    let buf = '', waiter = null, done = false;
    const sock = connect({ host, port, servername: host });
    const fail = e => { if (done) return; done = true; clearTimeout(timer); try { sock.destroy(); } catch {} reject(e instanceof Error ? e : new Error(String(e))); };
    const timer = setTimeout(() => fail(new Error('O servidor de e-mail não respondeu a tempo.')), timeoutMs); timer.unref?.();
    const pump = () => {
      const lines = buf.split('\r\n'); const end = lines.findIndex(l => /^\d{3}( |$)/.test(l));
      if (end < 0 || !waiter) return;
      const reply = lines.slice(0, end + 1); buf = lines.slice(end + 1).join('\r\n');
      const w = waiter; waiter = null; w({ code: Number(reply[end].slice(0, 3)), text: reply.join(' ') });
    };
    const read = () => new Promise(r => { waiter = r; pump(); });
    const step = async (cmd, ok) => { if (cmd != null) sock.write(cmd + '\r\n'); const r = await read(); if (!ok.includes(r.code)) throw Object.assign(new Error(r.text.slice(0, 200)), { code: r.code }); return r; };
    sock.setEncoding?.('utf8');
    sock.on('data', d => { buf += d; pump(); });
    sock.on('error', e => fail(new Error(`Não consegui falar com ${host}: ${e.message}`)));
    (async () => {
      await step(null, [220]);
      await step('EHLO code-room.local', [250]);
      try { await step(`AUTH PLAIN ${b64(`\0${user}\0${pass}`)}`, [235]); }
      catch (e) { throw new Error(e.code === 535 || e.code === 534 ? 'O Gmail recusou o login. Use uma senha de app (myaccount.google.com/apppasswords), não a senha da conta.' : e.message); }
      await step(`MAIL FROM:<${user}>`, [250]);
      for (const r of to) await step(`RCPT TO:<${r}>`, [250, 251]);
      await step('DATA', [354]);
      await step(buildMessage({ from: user, to, subject, text }) + '\r\n.', [250]);
      try { sock.write('QUIT\r\n'); } catch {}
      done = true; clearTimeout(timer); try { sock.end(); } catch {} resolve({ ok: true });
    })().catch(fail);
  });
}

// Telegram aceita até 4096 caracteres por mensagem: divide em partes, quebrando em linha quando dá.
export function chunks(text, max = 3900) {
  const out = []; let s = String(text || '').trim();
  while (s.length > max) { let cut = s.lastIndexOf('\n', max); if (cut < max * 0.5) cut = max; out.push(s.slice(0, cut).trim()); s = s.slice(cut).trim(); }
  if (s) out.push(s); return out.slice(0, 6);
}

export class Notifier {
  constructor({ dataDir, fetchFn = (...a) => fetch(...a), mailer = sendMail } = {}) { Object.assign(this, { dir: dataDir, fetch: fetchFn, mailer }); }
  #read() { try { return JSON.parse(readFileSync(join(this.dir, FILE), 'utf8')); } catch { return {}; } }
  async #write(o) { const f = join(this.dir, FILE); await writeFile(f, JSON.stringify(o, null, 2)); try { await chmod(f, 0o600); } catch {} }

  status() {
    const s = this.#read(), mask = e => e ? e.replace(/^(.{2}).*(@.*)$/, '$1•••$2') : '';
    return { telegram: { configured: !!(s.telegram?.botToken && s.telegram?.chatId), bot: s.telegram?.bot || null, chatName: s.telegram?.chatName || null },
      email: { configured: !!(s.email?.user && s.email?.pass), user: mask(s.email?.user), to: (s.email?.to || []).map(mask) } };
  }
  async #tg(token, method, body) {
    const r = await this.fetch(`https://api.telegram.org/bot${token}/${method}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
    const j = await r.json().catch(() => ({})); if (!j.ok) throw new Error(j.error_code === 401 ? 'Token do bot inválido. Confira com o @BotFather.' : j.error_code === 403 ? 'O bot ainda não pode falar com você: abra a conversa com ele no Telegram e envie /start.' : `Telegram recusou (${j.description || r.status}).`); return j.result;
  }
  // Passo 1: a pessoa cola o token e manda /start para o bot. Passo 2: o Code Room lê a conversa e descobre o número do chat sozinho.
  async saveTelegram({ botToken, chatId } = {}) {
    const s = this.#read(), token = String(botToken || '').trim() || s.telegram?.botToken || '';
    if (!TG_TOKEN.test(token)) throw new Error('Token de bot inválido (formato 123456:ABC…). Crie o bot com o @BotFather no Telegram.');
    const me = await this.#tg(token, 'getMe');
    let chat = String(chatId || '').trim(), chatName = null;
    if (!chat) {
      const ups = await this.#tg(token, 'getUpdates?limit=50&allowed_updates=%5B%22message%22%5D');
      const m = [...(ups || [])].reverse().find(u => u.message?.chat?.type === 'private');
      if (!m) throw new Error(`Abra o Telegram, procure @${me.username}, envie /start e clique em Conectar de novo.`);
      chat = String(m.message.chat.id); chatName = [m.message.chat.first_name, m.message.chat.last_name].filter(Boolean).join(' ') || m.message.chat.username || null;
    }
    if (!TG_CHAT.test(chat)) throw new Error('Número da conversa inválido.');
    s.telegram = { botToken: token, chatId: chat, bot: me.username || null, chatName }; await this.#write(s);
    return this.status();
  }
  async saveEmail({ user, pass, to } = {}) {
    const s = this.#read(), u = String(user || '').trim().toLowerCase(), p = String(pass || '').replace(/\s+/g, '') || s.email?.pass || '';
    if (!EMAIL.test(u) || !/@(gmail|googlemail)\.com$/.test(u)) throw new Error('Informe o seu endereço do Gmail (…@gmail.com).');
    if (!/^[a-z]{16}$/i.test(p)) throw new Error('A senha de app do Google tem 16 letras. Gere em myaccount.google.com/apppasswords (precisa da verificação em duas etapas ligada).');
    const list = String(to || u).split(/[,;\s]+/).map(x => x.trim().toLowerCase()).filter(Boolean).slice(0, 3);
    if (!list.every(x => EMAIL.test(x))) throw new Error('Algum destinatário está com o endereço inválido.');
    s.email = { user: u, pass: p, to: list }; await this.#write(s); return this.status();
  }
  async remove(channel) { const s = this.#read(); if (!CHANNELS.includes(channel)) throw new Error('Canal de aviso desconhecido.'); delete s[channel]; await this.#write(s); return this.status(); }

  async send(channel, { subject, text }) {
    const s = this.#read();
    if (channel === 'telegram') {
      const t = s.telegram; if (!t?.botToken || !t?.chatId) throw new Error('O Telegram ainda não está conectado (Conexões › Avisos).');
      for (const part of chunks(`${subject}\n\n${text}`)) await this.#tg(t.botToken, 'sendMessage', { chat_id: t.chatId, text: part, disable_web_page_preview: true });
      return { ok: true };
    }
    if (channel === 'email') {
      const e = s.email; if (!e?.user || !e?.pass) throw new Error('O Gmail ainda não está conectado (Conexões › Avisos).');
      await this.mailer({ user: e.user, pass: e.pass, to: e.to?.length ? e.to : [e.user], subject, text: String(text).slice(0, 60000) }); return { ok: true };
    }
    throw new Error('Canal de aviso desconhecido.');
  }
  test(channel) { return this.send(channel, { subject: 'Code Room: teste de aviso', text: 'Se você recebeu esta mensagem, os resultados das suas rotinas vão chegar aqui. Pode ignorar.' }); }

  // Entrega o resultado de uma rotina nos canais marcados. Nunca lança: devolve o que deu certo e o que falhou, para o histórico da rotina.
  async deliver(routine, { status, text, projectName, area }) {
    const want = CHANNELS.filter(c => routine?.deliver?.[c]); if (!want.length) return [];
    if (area === 'Financeiro') return want.map(c => ({ channel: c, ok: false, error: 'Projetos financeiros não enviam resultados para fora do computador.' }));
    const ok = status === 'completed', subject = `${ok ? '✅' : '⚠️'} Rotina “${routine.name}”${ok ? ' concluída' : ' não terminou'}${projectName ? ` · ${projectName}` : ''}`;
    const body = `${String(text || (ok ? 'A rotina terminou sem texto de resposta.' : 'A execução falhou. Abra o Code Room para ver o motivo.')).trim()}\n\n— Enviado pelo Code Room em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}.`;
    const out = [];
    for (const c of want) { try { await this.send(c, { subject, text: body }); out.push({ channel: c, ok: true }); } catch (e) { out.push({ channel: c, ok: false, error: String(e.message || e).slice(0, 200) }); } }
    return out;
  }
}
