import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Store } from '../server/store.mjs';
import { auditHtml } from '../public/audit-ui.js';

test('HTTP: histórico de ações registra só o que deu certo, com quem/onde/quando, e exige a chave', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cr-audit-')), proj = await mkdtemp(join(tmpdir(), 'cr-auditp-')), orig = await mkdtemp(join(tmpdir(), 'cr-audito-')), port = 19000 + Math.floor(Math.random() * 10000), now = new Date().toISOString();
  const seed = new Store(join(dir, 'code-room.sqlite')), pj = { id: 'pj1', name: 'Achadinhos', area: 'Vídeo', path: proj }, ag = { id: 'ag1', name: 'Produtor', role: 'r', room: 'Vídeo', provider: 'claude', mode: 'write' };
  seed.put('projects', { ...pj, createdAt: now });
  const task = (id, status) => ({ id, kind: 'work', status, project: pj, agent: ag, objective: 'Lote "Reel ' + id + '"', createdAt: now, updatedAt: now, attempts: [], attemptCount: 0, criteria: [], inputs: [], limits: {}, result: { summary: 'ok', deliverables: { available: true, files: [] } } });
  seed.put('tasks', task('t1', 'completed')); seed.put('tasks', task('t2', 'running')); seed.close();
  const child = spawn(process.execPath, ['server/main.mjs'], { cwd: resolve('.'), env: { ...process.env, CODE_ROOM_DATA: dir, CODE_ROOM_PORT: String(port) }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await Promise.race([once(child.stdout, 'data'), new Promise((_, no) => setTimeout(() => no(new Error('Servidor não iniciou')), 8000))]);
    const key = (await readFile(join(dir, 'access.key'), 'utf8')).trim(), H = { 'X-Code-Room-Key': key, 'Content-Type': 'application/json' }, base = `http://127.0.0.1:${port}`, post = (p, b) => fetch(base + p, { method: 'POST', headers: H, body: JSON.stringify(b) }), get = p => fetch(base + p, { headers: H });
    assert.equal((await fetch(`${base}/api/audit`)).status, 401); assert.deepEqual((await (await get('/api/audit')).json()).entries, []);
    assert.equal((await post('/api/tasks/t2/approve', {})).status, 400, 'aprovar tarefa que não terminou falha');
    assert.equal((await post('/api/tasks/t1/approve', { note: 'ok' })).status, 200);
    await mkdir(join(orig, 'x')); assert.equal((await post('/api/projects/pj1/references', { dirs: [{ path: orig }] })).status, 200);
    await post('/api/assistant/autonomy', { mode: 'ask' });   // sem IA instalada pode falhar: se falhar, não entra no histórico
    const e = (await (await get('/api/audit')).json()).entries;
    assert.equal(e.some(x => /aprovou uma entrega/.test(x.what) && x.title === 'Reel t1' && x.project === 'Achadinhos' && x.agent === 'Produtor' && x.who === 'Você' && x.via === 'computador' && /^\d{4}-/.test(x.at)), true);
    assert.equal(e.some(x => /pastas de referência/.test(x.what) && x.project === 'Achadinhos'), true);
    assert.equal(e.filter(x => /aprovou uma entrega/.test(x.what)).length, 1, 'a aprovação que falhou não foi registrada');
    assert.ok(e[0].at >= e.at(-1).at, 'mais recente primeiro'); assert.ok(!JSON.stringify(e).includes(key), 'a chave nunca aparece');
  } finally { const closed = once(child, 'close'); child.kill(); await closed; for (const d of [dir, proj, orig]) await rm(d, { recursive: true, force: true }); }
});

test('tela do histórico: carregando, vazio e lista com ação, projeto, agente e escape de HTML', () => {
  assert.match(auditHtml({}), /Carregando/); assert.match(auditHtml({ audit: { entries: [] } }), /Nenhuma ação registrada/);
  const h = auditHtml({ audit: { entries: [{ who: 'Você', what: 'aprovou uma entrega', title: '<b>Reel</b>', project: 'Achadinhos', agent: 'Produtor', via: 'celular', detail: '', at: '2026-11-09T12:00:00.000Z' }, { who: 'Você', what: 'cancelou uma tarefa', title: '', project: null, agent: null, via: 'computador', at: '2026-11-09T12:01:00.000Z' }] } });
  assert.ok(!h.includes('<b>Reel</b>')); assert.match(h, /pill ok">aprovou/); assert.match(h, /pill bad">cancelou/); assert.match(h, /Achadinhos · Produtor · pelo celular/);
});
