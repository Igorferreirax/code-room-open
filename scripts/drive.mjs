// Cliente de linha de comando para validação real: node scripts/drive.mjs <porta> <dataDir> <comando> ...
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const [port, data, cmd, ...rest] = process.argv.slice(2);
const key = readFileSync(join(data, 'access.key'), 'utf8').trim();
const base = `http://127.0.0.1:${port}`;
const h = { 'X-Code-Room-Key': key, 'Content-Type': 'application/json' };
const api = async (m, p, b) => { const r = await fetch(base + p, { method: m, headers: h, body: b ? JSON.stringify(b) : undefined }); const j = await r.json(); if (!r.ok) throw new Error(`${r.status} ${j.error}`); return j; };
const out = v => console.log(JSON.stringify(v, null, 2));
if (cmd === 'state') out(await api('GET', '/api/state'));
else if (cmd === 'post') out(await api('POST', rest[0], JSON.parse(rest[1])));
else if (cmd === 'get') out(await api('GET', rest[0]));
else if (cmd === 'wait') {
  const id = rest[0], limit = Date.now() + Number(rest[1] || 600) * 1000;
  for (;;) { const r = await api('GET', `/api/runs/${id}`); if (!['queued', 'running', 'cancelling'].includes(r.status)) { out({ ...r, events: r.events.length }); break; } if (Date.now() > limit) { console.log('timeout de espera', r.status); break; } await new Promise(s => setTimeout(s, 3000)); }
}
