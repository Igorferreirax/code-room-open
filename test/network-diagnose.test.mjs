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
