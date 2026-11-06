import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir, networkInterfaces } from 'node:os';
import { join, resolve } from 'node:path';
import http from 'node:http';
import { hostAllowed, originAllowed, wantedAddresses, Throttle } from '../server/network.mjs';
import { Devices } from '../server/devices.mjs';
import { Store } from '../server/store.mjs';

const lanIp = () => Object.entries(networkInterfaces()).flatMap(([n, l]) => (l || []).filter(i => i.family === 'IPv4' && !i.internal && /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(i.address) && !/virtual|vethernet|vmware|wsl|docker|hyper-v|bluetooth|vbox/i.test(n)).map(i => i.address))[0];

test('rede: Host e Origin só valem para endereços realmente servidos (anti DNS rebinding)', () => {
  const bound = [{ ip: '192.168.1.5', kind: 'lan' }, { ip: '100.101.102.103', kind: 'tailscale' }];
  assert.ok(hostAllowed('127.0.0.1:4780', 4780, [])); assert.ok(hostAllowed('localhost:4780', 4780, []));
  assert.ok(hostAllowed('192.168.1.5:4780', 4780, bound)); assert.ok(!hostAllowed('192.168.1.5:4780', 4780, [])); assert.ok(!hostAllowed('192.168.1.6:4780', 4780, bound));
  assert.ok(hostAllowed('meu-pc.tail1234.ts.net:4780', 4780, bound)); assert.ok(!hostAllowed('meu-pc.tail1234.ts.net:4780', 4780, [{ ip: '192.168.1.5', kind: 'lan' }]));
  assert.ok(!hostAllowed('evil.example.com:4780', 4780, bound)); assert.ok(!hostAllowed('192.168.1.5:9999', 4780, bound));
  assert.ok(originAllowed('http://192.168.1.5:4780', 4780, bound)); assert.ok(!originAllowed('https://192.168.1.5:4780', 4780, bound)); assert.ok(!originAllowed('http://evil.example', 4780, bound));
  assert.deepEqual(wantedAddresses({ lan: false, tailscale: false }), []);
});

test('pareamento: código de uso único, expira, token próprio (hash), revogável e sem tentativas ilimitadas', () => {
  const store = new Store(':memory:'), dv = new Devices(store);
  const { code } = dv.createCode(); assert.match(code, /^[A-Z2-9]{8}$/);
  assert.throws(() => dv.redeem('ZZZZZZZZ', 'x', '1.1.1.1'), /inválido|expirado/);
  const { token, device } = dv.redeem(code.toLowerCase(), 'iPhone', '1.1.1.1'); assert.equal(token.length, 64);
  assert.throws(() => dv.redeem(code, 'outro', '1.1.1.1'), /inválido|expirado/, 'código só vale uma vez');
  assert.ok(!JSON.stringify(store.list('settings')).includes(token), 'o token não é guardado em texto');
  assert.equal(dv.verify(token, '1.1.1.1').id, `device:${device.id}`); assert.equal(dv.verify('0'.repeat(64), '1.1.1.1'), null); assert.equal(dv.verify('curto', '1.1.1.1'), null);
  dv.revoke(device.id); assert.equal(dv.verify(token, '1.1.1.1'), null);
  for (let i = 0; i < 3; i++) dv.createCode(); assert.throws(() => dv.createCode(), /3 códigos/);
  const t = new Throttle({ max: 3, blockMs: 50 }); for (let i = 0; i < 3; i++) t.fail('9.9.9.9'); assert.ok(t.blocked('9.9.9.9')); assert.ok(!t.blocked('8.8.8.8'));
});

test('HTTP remoto: escuta só nos endereços liberados, token de aparelho tem menos poder, revogação e bloqueio por tentativas', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'code-room-remote-')), port = 19000 + Math.floor(Math.random() * 10000), lan = lanIp();
  await writeFile(join(dir, 'network.json'), JSON.stringify({ lan: !!lan, tailscale: false }));
  const child = spawn(process.execPath, ['server/main.mjs'], { cwd: resolve('.'), env: { ...process.env, CODE_ROOM_DATA: dir, CODE_ROOM_PORT: String(port) }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const req = (host, method, path, { headers = {}, body } = {}) => new Promise(res => { const r = http.request({ host, port, method, path, headers, agent: false }, x => { let b = ''; x.on('data', c => b += c); x.on('end', () => { let j = null; try { j = JSON.parse(b); } catch {} res({ status: x.statusCode, json: j }); }); }); r.on('error', e => res({ status: 0, error: e.code })); if (body) r.write(body); r.end(); });
  try {
    await Promise.race([once(child.stdout, 'data'), new Promise((_, rej) => setTimeout(() => rej(new Error("Servidor não iniciou")), 20000))]);
    await new Promise(r => setTimeout(r, 800)); // dá tempo de abrir os endereços extras
    const key = (await readFile(join(dir, 'access.key'), 'utf8')).trim(), H = { 'X-Code-Room-Key': key, 'Content-Type': 'application/json' };
    const hostHdr = `127.0.0.1:${port}`;
    if (lan) {
      assert.equal((await req(lan, 'GET', '/api/state', { headers: { ...H, Host: `${lan}:${port}` } })).status, 200, 'rede local liberada responde');
      assert.equal((await req(lan, 'GET', '/api/state', { headers: { Host: `${lan}:${port}` } })).status, 401, 'sem chave: 401');
      assert.equal((await req(lan, 'GET', '/api/state', { headers: { ...H, Host: 'evil.example.com' } })).status, 403, 'Host forjado: 403');
    }
    // com a rede local desligada o endereço da LAN não pode nem conectar
    const dir2 = await mkdtemp(join(tmpdir(), 'code-room-remote2-')), port2 = port + 1;
    const c2 = spawn(process.execPath, ['server/main.mjs'], { cwd: resolve('.'), env: { ...process.env, CODE_ROOM_DATA: dir2, CODE_ROOM_PORT: String(port2) }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    try {
      await once(c2.stdout, 'data'); await new Promise(r => setTimeout(r, 800));
      if (lan) { const r = await new Promise(res => { const q = http.request({ host: lan, port: port2, path: '/', agent: false }, () => res('respondeu')); q.on('error', e => res(e.code)); q.end(); }); assert.equal(r, 'ECONNREFUSED', 'sem liberar a rede local, o serviço não escuta nela'); }
    } finally { const cl = once(c2, 'close'); c2.kill(); await cl; await rm(dir2, { recursive: true, force: true }); }

    const pc = await req('127.0.0.1', 'POST', '/api/devices/pair-code', { headers: { ...H, Host: hostHdr }, body: '{}' }); assert.equal(pc.status, 200);
    const pair = body => req('127.0.0.1', 'POST', '/api/pair', { headers: { Host: hostHdr, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const ok = await pair({ code: pc.json.code, name: 'Celular teste' }); assert.equal(ok.status, 200); const token = ok.json.token, D = { 'X-Code-Room-Key': token, 'Content-Type': 'application/json', Host: hostHdr };
    assert.equal((await pair({ code: pc.json.code })).status, 400, 'código reutilizado');
    assert.equal((await req('127.0.0.1', 'GET', '/api/state', { headers: D })).status, 200, 'token do aparelho acessa o estado');
    assert.equal((await req('127.0.0.1', 'GET', '/api/whoami', { headers: D })).json.level, 'device');
    for (const [m, p] of [['GET', '/api/devices'], ['GET', '/api/network'], ['POST', '/api/devices/pair-code'], ['POST', '/api/network'], ['POST', '/api/projects'], ['POST', '/api/settings/skill-roots']]) {
      const r = await req('127.0.0.1', m, p, { headers: D, body: m === 'POST' ? JSON.stringify({ name: 'x', path: dir, lan: true }) : undefined });
      assert.equal(r.status, 403, `${m} ${p} é só do computador`); assert.match(r.json.error, /computador/);
    }
    const list = (await req('127.0.0.1', 'GET', '/api/devices', { headers: { ...H, Host: hostHdr } })).json; assert.equal(list.length, 1); assert.ok(!JSON.stringify(list).includes(token), 'a lista não devolve o token');
    assert.equal((await req('127.0.0.1', 'POST', `/api/devices/${list[0].id}/revoke`, { headers: { ...H, Host: hostHdr }, body: '{}' })).status, 200);
    assert.equal((await req('127.0.0.1', 'GET', '/api/state', { headers: D })).status, 401, 'token revogado deixa de funcionar');
    // o próprio computador nunca é bloqueado, por mais que erre
    let loc; for (let i = 0; i < 12; i++) loc = await pair({ code: 'ERRADO' + i });
    assert.equal(loc.status, 400, 'no computador local o código errado continua só dando erro');
    assert.equal((await req('127.0.0.1', 'GET', '/api/state', { headers: { ...H, Host: hostHdr } })).status, 200, 'a chave principal continua entrando no computador local');
    // quem vem de fora (rede) é bloqueado depois de várias tentativas, inclusive com a chave certa
    if (lan) {
      const pairLan = body => req(lan, 'POST', '/api/pair', { headers: { Host: `${lan}:${port}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      let last; for (let i = 0; i < 10; i++) last = await pairLan({ code: 'ERRADO' + i });
      assert.equal(last.status, 429, 'bloqueio pela rede depois de várias tentativas');
      assert.equal((await req(lan, 'GET', '/api/state', { headers: { ...H, Host: `${lan}:${port}` } })).status, 429, 'endereço bloqueado também não entra com a chave');
    }
  } finally { const closed = once(child, 'close'); child.kill(); await closed; await rm(dir, { recursive: true, force: true }); }
});
