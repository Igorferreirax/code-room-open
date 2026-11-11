import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Duplex } from 'node:stream';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Notifier, sendMail, buildMessage, chunks } from '../server/notify.mjs';
import { Metrics } from '../server/metrics.mjs';
import { validateRoutine, Routines } from '../server/routines.mjs';
import { newLookCard, NEW_LOOK } from '../public/views.js';
import { aiLogo } from '../public/brand-icons.js';
import { matchModel } from '../server/effort.mjs';
import { classifyFailure } from '../server/connectors.mjs';
import { zoomAt, fitCam, ZMIN, ZMAX } from '../public/canvas.js';

const AGY = [['gemini-3.8-flash-high', 'Gemini 3.8 Flash (High)'], ['gemini-3.8-flash-medium', 'Gemini 3.8 Flash (Medium)'], ['gemini-3.8-flash-low', 'Gemini 3.8 Flash (Low)'], ['claude-sonnet-4-6', 'Claude Sonnet 4.6 (Thinking)'], ['claude-opus-4-6-thinking', 'Claude Opus 4.6 (Thinking)'], ['gpt-oss-120b-medium', 'GPT-OSS 120B (Medium)']].map(([id, label]) => ({ id, label }));
test('modelo: nome aproximado vira o identificador aceito pela IA; a falha vira o tipo "model"', () => {
  assert.equal(matchModel('Gemini Flash 3.8', AGY), 'gemini-3.8-flash-medium', 'ordem trocada e sem nível: escolhe o médio');
  assert.equal(matchModel('Gemini 3.8 Flash (High)', AGY), 'gemini-3.8-flash-high', 'o rótulo exato vale');
  assert.equal(matchModel('claude opus', AGY), 'claude-opus-4-6-thinking'); assert.equal(matchModel('gpt-oss-120b-medium', AGY), 'gpt-oss-120b-medium');
  assert.equal(matchModel('modelo inexistente qualquer', AGY), null); assert.equal(matchModel('Gemini Flash 3.8', []), null);
  assert.equal(classifyFailure('invalid model selection (--model "Gemini Flash 3.8" --effort ""): model Gemini Flash 3.8 is not recognized as a known model or custom model in settings'), 'model');
  assert.equal(classifyFailure('not logged in'), 'auth');
});
test('Canvas: zoom mantém parado o ponto do cursor, respeita os limites e "Ver tudo" enquadra', () => {
  const c = zoomAt({ z: 1, x: 0, y: 0 }, 2, 100, 50); assert.deepEqual(c, { z: 2, x: -100, y: -50 }, 'o ponto (100,50) continua sob o cursor');
  assert.equal(zoomAt({ z: 1, x: 0, y: 0 }, 100, 0, 0).z, ZMAX); assert.equal(zoomAt({ z: 1, x: 0, y: 0 }, 0.001, 0, 0).z, ZMIN);
  const f = fitCam(2000, 1000, 1000, 600); assert.ok(f.z < 1 && 2000 * f.z <= 1000 && 1000 * f.z <= 600); assert.equal(fitCam(300, 200, 1000, 600).z, 1, 'mundo pequeno não passa de 100%');
});

test('cara nova: aparece só para quem já usava, abre a lista e some depois de dispensada', () => {
  const ctx = (prefs = {}, ui = {}, projects = [{ id: 'p' }]) => ({ prefs, ui, state: { projects, runs: [] } });
  assert.equal(newLookCard(ctx({}, {}, [])), '', 'instalação nova não vê');
  assert.match(newLookCard(ctx()), /O Code Room está de cara nova/); assert.match(newLookCard(ctx()), /data-act="newlook-open"/);
  assert.match(newLookCard(ctx({}, { newLookOpen: true })), /Avisos no Telegram e no Gmail/);
  assert.equal(newLookCard(ctx({ newLookSeen: NEW_LOOK })), '');
  assert.equal(newLookCard({ prefs: {}, state: { projects: [{ id: 'p' }], runs: [] } }).includes('cara nova'), true, 'sem ctx.ui não quebra');
});
test('logos das IAs: oficiais para Codex, Claude, Gemini e Antigravity; vazio para as outras', () => {
  assert.match(aiLogo('codex'), /<svg class="ai-logo ai-codex"/); assert.match(aiLogo('claude'), /fill="#d97757"/); assert.match(aiLogo('gemini'), /linearGradient/);
  assert.match(aiLogo('agy'), /ai-antigravity\.png/); assert.equal(aiLogo('kiro'), '');
});

const TOKEN = '123456789:' + 'A'.repeat(35);
const memStore = () => { const d = {}; return { get: (c, id) => d[c]?.[id] ?? null, put: (c, v) => ((d[c] ||= {})[v.id] = v, v), list: c => Object.values(d[c] || {}), remove: (c, id) => { delete d[c]?.[id]; } }; };

// Servidor SMTP de mentira: responde cada comando como o Gmail.
function fakeSmtp({ authOk = true } = {}) {
  const seen = []; let inData = false, data = '';
  const sock = new Duplex({ read() {}, write(chunk, _e, cb) {
    const s = chunk.toString();
    if (inData) { data += s; if (data.endsWith('\r\n.\r\n')) { inData = false; this.push('250 2.0.0 OK\r\n'); } return cb(); }
    seen.push(s.trim());
    if (s.startsWith('EHLO')) this.push('250-smtp.gmail.com\r\n250-AUTH PLAIN LOGIN\r\n250 SMTPUTF8\r\n');
    else if (s.startsWith('AUTH')) this.push(authOk ? '235 2.7.0 Accepted\r\n' : '535 5.7.8 Username and Password not accepted\r\n');
    else if (s.startsWith('MAIL') || s.startsWith('RCPT')) this.push('250 OK\r\n');
    else if (s.startsWith('DATA')) { inData = true; this.push('354 Go ahead\r\n'); }
    else if (s.startsWith('QUIT')) this.push('221 bye\r\n');
    cb();
  } });
  setImmediate(() => sock.push('220 smtp.gmail.com ESMTP\r\n'));
  return { sock, seen, data: () => data };
}

test('e-mail: mensagem UTF-8 com assunto codificado e corpo em base64', () => {
  const m = buildMessage({ from: 'a@gmail.com', to: ['b@gmail.com'], subject: 'Rotina “Cursos” concluída', text: 'Olá, ação!\n.\nfim' });
  assert.match(m, /Subject: =\?UTF-8\?B\?/); assert.match(m, /Content-Transfer-Encoding: base64/);
  const body = m.split('\r\n\r\n')[1].replace(/\r\n/g, ''); assert.equal(Buffer.from(body, 'base64').toString('utf8'), 'Olá, ação!\n.\nfim');
});

test('e-mail: conversa SMTP completa e erro claro de senha', async () => {
  const f = fakeSmtp();
  await sendMail({ user: 'eu@gmail.com', pass: 'abcdabcdabcdabcd', to: ['eu@gmail.com'], subject: 'Oi', text: 'corpo', connect: () => f.sock });
  assert.ok(f.seen.some(s => s.startsWith('AUTH PLAIN'))); assert.ok(f.seen.includes('RCPT TO:<eu@gmail.com>')); assert.match(f.data(), /Subject: Oi/);
  const bad = fakeSmtp({ authOk: false });
  await assert.rejects(sendMail({ user: 'eu@gmail.com', pass: 'x', to: ['eu@gmail.com'], subject: 'Oi', text: 'c', connect: () => bad.sock }), /senha de app/);
});

test('Telegram: descobre a conversa sozinho, divide mensagens longas e guarda o token só no arquivo local', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cr-notify-')), calls = [];
  const fetchFn = async (url, opts = {}) => { calls.push({ url, body: opts.body }); const m = url.split('/').pop();
    const result = m === 'getMe' ? { username: 'meu_bot' } : m.startsWith('getUpdates') ? [{ message: { chat: { id: 987654, type: 'private', first_name: 'Igor' } } }] : {};
    return { status: 200, json: async () => ({ ok: true, result }) }; };
  const n = new Notifier({ dataDir: dir, fetchFn });
  const st = await n.saveTelegram({ botToken: TOKEN });
  assert.equal(st.telegram.configured, true); assert.equal(st.telegram.bot, 'meu_bot'); assert.equal(JSON.stringify(st).includes(TOKEN), false, 'o token não sai pela API');
  assert.equal(JSON.parse(readFileSync(join(dir, 'notify-secrets.json'), 'utf8')).telegram.chatId, '987654');
  await n.send('telegram', { subject: 'Rotina', text: 'x'.repeat(9000) });
  const sends = calls.filter(c => c.url.endsWith('/sendMessage')); assert.equal(sends.length, 3); assert.ok(sends.every(c => JSON.parse(c.body).text.length <= 3900));
  assert.deepEqual(chunks(''), []);
  await assert.rejects(n.saveTelegram({ botToken: 'errado' }), /Token de bot inválido/);
});

test('Telegram: sem /start enviado, explica o que fazer', async () => {
  const fetchFn = async url => ({ status: 200, json: async () => ({ ok: true, result: url.endsWith('getMe') ? { username: 'meu_bot' } : [] }) });
  await assert.rejects(new Notifier({ dataDir: mkdtempSync(join(tmpdir(), 'cr-notify-')), fetchFn }).saveTelegram({ botToken: TOKEN }), /envie \/start/);
});

test('Gmail: valida endereço e senha de app; entrega respeita Financeiro e registra falha sem lançar', async () => {
  const sent = [], n = new Notifier({ dataDir: mkdtempSync(join(tmpdir(), 'cr-notify-')), mailer: async m => { sent.push(m); } });
  await assert.rejects(n.saveEmail({ user: 'eu@outlook.com', pass: 'abcdabcdabcdabcd' }), /Gmail/);
  await assert.rejects(n.saveEmail({ user: 'eu@gmail.com', pass: 'minhasenha' }), /16 letras/);
  const st = await n.saveEmail({ user: 'Eu@Gmail.com', pass: 'abcd efgh ijkl mnop' });
  assert.equal(st.email.configured, true); assert.equal(st.email.user.includes('eu@'), false, 'o endereço aparece mascarado');
  const r = { name: 'Cursos', deliver: { email: true, telegram: true } };
  const out = await n.deliver(r, { status: 'completed', text: 'Lista de cursos', projectName: 'Estudos', area: 'Geral' });
  assert.deepEqual(out.map(o => [o.channel, o.ok]), [['telegram', false], ['email', true]]);
  assert.match(sent[0].subject, /Cursos.*concluída/); assert.match(sent[0].text, /Lista de cursos/); assert.deepEqual(sent[0].to, ['eu@gmail.com']);
  const fin = await n.deliver(r, { status: 'completed', text: 'saldo', area: 'Financeiro' });
  assert.ok(fin.every(o => !o.ok && /financeiros/.test(o.error))); assert.equal(sent.length, 1);
});

test('rotina: guarda onde entregar e recusa envio para fora em projeto financeiro', () => {
  const base = { name: 'R', objective: 'o', projectId: 'p1', target: { type: 'agent', id: 'a' }, trigger: { type: 'manual' } };
  assert.deepEqual(validateRoutine({ ...base, deliver: { telegram: true, email: 'sim' } }).deliver, { telegram: true, email: false });
  const old = validateRoutine({ ...base, deliver: { email: true } }); assert.deepEqual(validateRoutine(base, old).deliver, { telegram: false, email: true }, 'editar sem o campo mantém a escolha');
  const store = memStore(); store.put('projects', { id: 'p1', area: 'Financeiro' });
  const rs = new Routines(store, () => ({})); rs.sync = () => {};
  assert.throws(() => rs.save({ ...base, deliver: { telegram: true } }), /financeiros/);
  assert.equal(rs.save(base).deliver.telegram, false);
});

test('métricas: lê o YouTube com cache de 30 min, guarda uma foto por dia e calcula a semana', async () => {
  const store = memStore(); let t = Date.parse('2026-11-01T12:00:00-03:00'), reads = 0, views = 1000;
  const publisher = { status: async () => ({ google: { connected: true, configured: true } }), channelReport: async () => { reads++; return { channel: { title: 'Canal', views, subscribers: 50, videos: 3 }, videos: [{ id: 'v', title: 'Vídeo', views: 10 }] }; } };
  const m = new Metrics(store, { publisher, now: () => t });
  let r = await m.youtube(); assert.equal(r.channel.views, 1000); assert.equal(r.week.views, null);
  t += 10 * 60000; await m.youtube(); assert.equal(reads, 1, 'dentro de 30 min usa a leitura guardada');
  await m.youtube({ refresh: true }); assert.equal(reads, 2); assert.equal(store.get('settings', 'metrics:youtube').history.length, 1, 'mesmo dia = uma foto só');
  t += 8 * 864e5; views = 1600; r = await m.youtube(); assert.equal(r.history.length, 2); assert.equal(r.week.views, 600);
  publisher.channelReport = async () => { throw new Error('cota estourada'); };
  t += 3600e3; r = await m.youtube(); assert.match(r.error, /última leitura.*cota/); assert.equal(r.channel.views, 1600);
  store.put('socialPosts', { id: 'a', network: 'bluesky', status: 'publicado', publishedAt: new Date(t).toISOString() });
  store.put('socialPosts', { id: 'b', network: 'bluesky', status: 'proposta', createdAt: new Date(t).toISOString() });
  assert.deepEqual(m.posts(), { bluesky: 1 });
  const off = new Metrics(memStore(), { publisher: { status: async () => ({ google: { connected: false, configured: false } }) } });
  assert.deepEqual(await off.youtube(), { connected: false, configured: false });
});
