import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('HTTP: POST /api/agents valida mcpTools (só Claude, nomes simples, até 6) e guarda os válidos', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cr-mcpagent-')), port = 19000 + Math.floor(Math.random() * 10000);
  const child = spawn(process.execPath, ['server/main.mjs'], { cwd: resolve('.'), env: { ...process.env, CODE_ROOM_DATA: dir, CODE_ROOM_PORT: String(port) }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await Promise.race([once(child.stdout, 'data'), new Promise((_, no) => setTimeout(() => no(new Error('Servidor não iniciou')), 8000))]);
    const key = (await readFile(join(dir, 'access.key'), 'utf8')).trim(), base = `http://127.0.0.1:${port}`;
    const post = body => fetch(`${base}/api/agents`, { method: 'POST', headers: { 'X-Code-Room-Key': key, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'A', role: 'r', room: 'Geral', provider: 'claude', mode: 'read', skillIds: [], ...body }) });
    const ok = await post({ mcpTools: ['flow-studio', 'notion'] }); assert.equal(ok.status, 200); assert.deepEqual((await ok.json()).mcpTools, ['flow-studio', 'notion']);
    for (const bad of [['a b'], ['x;y'], ['../x'], ['a', 'b', 'c', 'd', 'e', 'f', 'g']]) { const r = await post({ mcpTools: bad }); assert.equal(r.status, 400, JSON.stringify(bad)); assert.match((await r.json()).error, /MCP/); }
    const cx = await post({ provider: 'codex', mcpTools: ['flow-studio'] }); assert.equal(cx.status, 400); assert.match((await cx.json()).error, /só vale para o Claude/);
  } finally { const closed = once(child, 'close'); child.kill(); await closed; await rm(dir, { recursive: true, force: true }); }
});
