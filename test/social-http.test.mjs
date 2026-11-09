import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('HTTP: redes sociais — contas, segredo nunca volta, proposta manual vira pacote, descarte, marcar postado e chave exigida', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cr-sochttp-')), port = 19000 + Math.floor(Math.random() * 10000);
  const child = spawn(process.execPath, ['server/main.mjs'], { cwd: resolve('.'), env: { ...process.env, CODE_ROOM_DATA: dir, CODE_ROOM_PORT: String(port) }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await Promise.race([once(child.stdout, 'data'), new Promise((_, no) => setTimeout(() => no(new Error('Servidor não iniciou')), 8000))]);
    const key = (await readFile(join(dir, 'access.key'), 'utf8')).trim(), base = `http://127.0.0.1:${port}`, H = { 'X-Code-Room-Key': key, 'Content-Type': 'application/json' };
    const post = (p, b) => fetch(`${base}${p}`, { method: 'POST', headers: H, body: JSON.stringify(b ?? {}) }), get = p => fetch(`${base}${p}`, { headers: H });
    assert.equal((await fetch(`${base}/api/social`)).status, 401, 'exige a chave');
    const s0 = await (await get('/api/social')).json(); assert.ok(s0.catalog.bluesky && s0.catalog.x); assert.deepEqual(s0.accounts, []);
    let r = await post('/api/social/accounts', { network: 'telegram', name: 'Canal', fields: { chatId: 'xx', botToken: 'ruim' } }); assert.equal(r.status, 400);
    const TOKEN = '123456789:' + 'A'.repeat(35);
    r = await post('/api/social/accounts', { network: 'telegram', name: 'Canal Terror', label: 'terror-tg', fields: { chatId: '@canalterror', botToken: TOKEN } }); assert.equal(r.status, 200); const tg = await r.json();
    assert.equal(tg.mode, 'api'); assert.equal(tg.hasSecret, true); assert.ok(!JSON.stringify(tg).includes(TOKEN), 'token não volta na resposta');
    r = await post('/api/social/accounts', { network: 'x', name: 'Perfil X', label: 'terror-x' }); const x = await r.json(); assert.equal(x.mode, 'manual');
    r = await post('/api/social/accounts', { network: 'x', name: 'Outro', label: 'terror-x' }); assert.equal(r.status, 400, 'apelido repetido');
    const lista = await (await get('/api/social')).json(); assert.equal(lista.accounts.length, 2); assert.ok(!JSON.stringify(lista).includes(TOKEN));
    assert.ok(!(await (await get('/api/state')).text()).includes(TOKEN), 'estado também não vaza o token');
    // postagem escrita à mão -> proposta -> aprovar sem confirmar falha -> aprovar rede manual vira pacote
    r = await post('/api/social/posts', { accountId: x.id, text: 'Hoje: a lenda da Loira do Banheiro.' }); assert.equal(r.status, 201); const p1 = await r.json(); assert.equal(p1.status, 'proposta');
    assert.equal((await get('/api/state').then(v => v.json())).socialProposals.length, 1, 'aparece em “Precisa de você agora”');
    r = await post(`/api/social/posts/${p1.id}/approve`, {}); assert.equal(r.status, 400, 'sem confirm não aprova');
    r = await post(`/api/social/posts/${p1.id}/approve`, { confirm: true, text: 'Texto editado.' }); const ap = await r.json(); assert.equal(ap.status, 'manual'); assert.equal(ap.text, 'Texto editado.');
    r = await post(`/api/social/posts/${p1.id}/mark`, { url: 'javascript:alert(1)' }); assert.equal(r.status, 400);
    r = await post(`/api/social/posts/${p1.id}/mark`, { url: 'https://x.com/eu/status/1' }); assert.equal((await r.json()).status, 'publicado');
    r = await post('/api/social/posts', { accountId: x.id, text: 'Rascunho' }); const p2 = await r.json(); r = await post(`/api/social/posts/${p2.id}/dismiss`); assert.equal((await r.json()).status, 'descartada');
    assert.equal((await get('/api/state').then(v => v.json())).socialProposals.length, 0);
    r = await post(`/api/social/accounts/${tg.id}/delete`); assert.equal(r.status, 200); assert.equal((await (await get('/api/social')).json()).accounts.length, 1);
    assert.ok(!(await readFile(join(dir, 'social-secrets.json'), 'utf8')).includes(TOKEN), 'segredo apagado junto com a conta');
  } finally { const closed = once(child, 'close'); child.kill(); await closed; await rm(dir, { recursive: true, force: true }); }
});
