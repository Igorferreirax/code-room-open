import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnoseNetwork } from '../server/network.mjs';

const ts = { installed: true, state: 'Running', ip: '100.1.2.3' };
const run = (cfg, extra = {}) => diagnoseNetwork({ cfg, port: 4780, bound: [{ kind: 'tailscale', ip: '100.1.2.3' }], tailscale: ts, probe: async () => ({ ok: true }), firewall: async () => ({ anyEnabled: false, allowed: false, publicLan: true }), ...extra });

test('diagnóstico: devolve itens com rótulo e não quebra quando o firewall não pode ser lido', async () => {
  const a = await run({ lan: false, tailscale: true });
  assert.ok(Array.isArray(a) && a.length > 0 && a.every(c => typeof c.label === 'string'));
  const b = await run({ lan: false, tailscale: true }, { firewall: async () => ({ error: 'Acesso negado' }) });
  assert.ok(b.some(c => c.id === 'fw' && c.ok === null));
  const off = await run({ lan: false, tailscale: false }, { bound: [] });
  assert.ok(off.some(c => c.ok === false || c.ok === null));
});

// ---- consulta rápida ao Firewall (não exige administrador) ----
import { windowsFirewall } from '../server/network.mjs';
const fakeRun = ({ rule = true, admin = false, pub = false, detail = '{"anyEnabled":true,"allowed":true}' } = {}) => {
  const calls = [];
  const run = (file, args, opts, cb) => {
    calls.push(file);
    if (file === 'netsh') return cb(rule ? null : Object.assign(new Error('x'), { code: 1 }), '');
    if (file === 'fltmc') return cb(admin ? null : Object.assign(new Error('x'), { code: 5 }), '');
    return cb(null, args.join(' ').includes('Get-NetConnectionProfile') ? (pub ? 'True' : 'False') : detail);
  };
  return { run, calls };
};

test('firewall rápido: com a regra do Code Room não precisa de administrador nem da leitura detalhada', async () => {
  const f = fakeRun({ rule: true }); const r = await windowsFirewall('node.exe', 4780, { profile: false, run: f.run });
  assert.deepEqual(r, { anyEnabled: true, allowed: true, publicLan: false, ours: true });
  assert.ok(!f.calls.includes('powershell.exe'), 'sem rede local, nem consulta o perfil de rede (o PowerShell é lento)');
});

test('firewall rápido: sem regra e sem administrador devolve aviso informativo e ainda diz se a rede é Pública', async () => {
  const f = fakeRun({ rule: false, admin: false, pub: true }); const r = await windowsFirewall('node.exe', 4780, { profile: true, run: f.run });
  assert.match(r.error, /administrador/); assert.equal(r.publicLan, true); assert.equal(r.ours, false);
});

test('firewall rápido: como administrador faz a leitura detalhada', async () => {
  const f = fakeRun({ rule: false, admin: true, detail: '{"anyEnabled":true,"allowed":false}' }); const r = await windowsFirewall('node.exe', 4780, { profile: false, run: f.run });
  assert.equal(r.allowed, false); assert.equal(r.anyEnabled, true); assert.equal(r.ours, false); assert.ok(f.calls.includes('powershell.exe'));
  const bad = await windowsFirewall('node.exe', 4780, { profile: false, run: fakeRun({ rule: false, admin: true, detail: 'lixo' }).run });
  assert.ok(bad.error, 'saída ilegível vira erro, não exceção');
});

test('diagnóstico: só consulta o perfil de rede quando a rede local está ligada', async () => {
  const seen = [];
  const mk = lan => diagnoseNetwork({ cfg: { lan, tailscale: true }, port: 4780, bound: [{ kind: 'tailscale', ip: '100.1.2.3' }], tailscale: { installed: true, state: 'Running', name: 'pc' }, probe: async () => ({ ok: true }), firewall: async (e, p, o) => { seen.push(o); return { anyEnabled: true, allowed: true, publicLan: false }; } });
  await mk(false); await mk(true);
  assert.deepEqual(seen, [{ profile: false }, { profile: true }]);
});
