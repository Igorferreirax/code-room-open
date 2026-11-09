import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../server/store.mjs';
import { mask, headersView, bodyView, loggedFetch, Outbox } from '../server/outbound.mjs';
import { Social } from '../server/social.mjs';
import { ApiLibrary } from '../server/apilib.mjs';
import { outboundCardHtml } from '../public/outbound-ui.js';
import { tempDir } from './helpers.mjs';

const res = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } });

test('máscara: tokens, senhas, webhook, token do bot e JWT nunca ficam legíveis; texto comum não muda', () => {
  const t = 'Authorization: Bearer abcDEF1234567890xyz sk-abcdefghij123456 ghp_abcdefghij1234 /bot123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw1/sendMessage https://discord.com/api/webhooks/123456/AbCd-secreto eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcDEFghiJKL {"password":"minha-senha","identifier":"eu.bsky.social"} olá mundo';
  const m = mask(t);
  for (const segredo of ['abcDEF1234567890xyz', 'sk-abcdefghij123456', 'ghp_abcdefghij1234', 'AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw1', 'AbCd-secreto', 'eyJhbGciOiJIUzI1NiJ9', 'minha-senha']) assert.ok(!m.includes(segredo), segredo);
  assert.ok(m.includes('eu.bsky.social') && m.includes('olá mundo'));
  assert.equal(mask('Hoje: a lenda da Loira do Banheiro.'), 'Hoje: a lenda da Loira do Banheiro.');
});

test('cabeçalhos e corpo: autorização escondida; arquivo e formulário descritos sem o conteúdo', () => {
  assert.deepEqual(headersView({ Authorization: 'Bearer zzzzzzzzzzzz', 'xi-api-key': 'k', 'Content-Type': 'application/json' }), { Authorization: '***', 'xi-api-key': '***', 'Content-Type': 'application/json' });
  const fd = new FormData(); fd.append('content', 'oi'); fd.append('file', new Blob(['12345']), 'a.png');
  assert.equal(bodyView(fd), 'content: oi\nfile: [arquivo a.png, 5 bytes]'); assert.equal(bodyView(new Uint8Array(7)), '[dados binários, 7 bytes]'); assert.equal(bodyView(null), '');
  assert.match(bodyView('x'.repeat(2000)), /\+500 caracteres/);
});

test('fetch registrado: guarda o que saiu (mascarado) e só o código da resposta; erro de rede também; mantém só os 40 últimos', async () => {
  const store = new Store(':memory:'), f = loggedFetch(store, async (u, o) => u.includes('falha') ? Promise.reject(new Error('sem rede')) : res({ segredo: 'resposta-nao-guardada' }, 201), 'Teste');
  const r = await f('https://api.telegram.org/bot123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw1/sendMessage?x=1', { method: 'post', headers: { Authorization: 'Bearer abcdefghijkl' }, body: JSON.stringify({ text: 'olá', token: 'xyz12345' }) });
  assert.equal(r.status, 201); assert.equal((await r.json()).segredo, 'resposta-nao-guardada', 'a resposta chega intacta a quem chamou');
  await assert.rejects(f('https://x.dev/falha', {}), /sem rede/);
  const l = new Outbox(store).list(); assert.equal(l.length, 2); assert.equal(l[1].method, 'POST'); assert.equal(l[1].host, 'api.telegram.org'); assert.equal(l[1].status, 201); assert.ok(!JSON.stringify(l).includes('AAHdq') && !JSON.stringify(l).includes('abcdefghijkl') && !JSON.stringify(l).includes('xyz12345') && !JSON.stringify(l).includes('resposta-nao-guardada'));
  assert.equal(l[0].error, 'sem rede');
  for (let i = 0; i < 50; i++) await f('https://ok.dev/' + i, {}); assert.equal(new Outbox(store).list().length, 40); new Outbox(store).clear(); assert.equal(new Outbox(store).list().length, 0);
});

test('ligação real: teste de chave da Biblioteca e postagem no Telegram aparecem na lista, sem a chave', async () => {
  const dir = await tempDir('outbound'), store = new Store(':memory:'), net = async (u, o) => String(u).includes('elevenlabs') ? res({ tier: 'free', character_count: 1, character_limit: 10 }) : res({ ok: true, result: { message_id: 1 } });
  const lib = new ApiLibrary(store, { dataDir: dir, fetchFn: loggedFetch(store, net, 'Biblioteca de APIs') }), KEY = 'chave-super-secreta-123';
  const k = await lib.save({ service: 'elevenlabs', key: KEY }); await lib.check(k.id);
  const social = new Social(store, { dataDir: dir, fetchFn: loggedFetch(store, net, 'Redes sociais') }), TOKEN = '123456789:' + 'B'.repeat(35);
  const acc = await social.saveAccount({ network: 'telegram', name: 'Canal', label: 'canal-tg', fields: { chatId: '@canalteste', botToken: TOKEN } });
  const post = await social.createPost({ accountId: acc.id, text: 'Olá, canal!' }); await social.approve(post.id, { confirm: true }, { by: 'teste' });
  const l = new Outbox(store).list(), s = JSON.stringify(l);
  assert.ok(l.some(e => e.label === 'Biblioteca de APIs' && e.host === 'api.elevenlabs.io') && l.some(e => e.label === 'Redes sociais' && e.host === 'api.telegram.org'));
  assert.ok(!s.includes(KEY) && !s.includes(TOKEN) && !s.includes('B'.repeat(35)), 'nenhuma chave na lista'); assert.ok(s.includes('Olá, canal!'), 'o texto da postagem aparece (é o que saiu)');
});

test('cartão: lista com código, endereço e detalhes escapados; vazio explica; sem dados nada aparece', () => {
  assert.equal(outboundCardHtml({}), ''); assert.match(outboundCardHtml({ outbound: [] }), /Ainda não houve nenhum envio/);
  const h = outboundCardHtml({ outbound: [{ at: new Date().toISOString(), label: 'Redes sociais', method: 'POST', host: 'api.telegram.org', path: '/bot***/sendMessage', headers: { Authorization: '***' }, body: '<b>oi</b>', status: 200, error: null }, { at: new Date().toISOString(), label: 'Biblioteca de APIs', method: 'GET', host: 'x.dev', path: '/', headers: {}, body: '', status: null, error: 'sem rede' }] });
  assert.match(h, /api\.telegram\.org/); assert.ok(!h.includes('<b>oi</b>')); assert.match(h, /falhou/); assert.match(h, /data-act="outbound-clear"/); assert.match(h, /Authorization: \*\*\*/);
});
