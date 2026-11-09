import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, writeFile, readFile, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Store } from '../server/store.mjs';
import { createTask } from '../server/tasks.mjs';
import { referencesSectionHtml } from '../public/refs-ui.js';
import { setup, addProject, addAgent, waitFor, tempDir } from './helpers.mjs';

test('execução: antes da tarefa a cópia entra no projeto, o prompt avisa que é somente leitura e a cópia não vira "entrega"', async () => {
  const { store, runner } = await setup(), pj = await addProject(store, 'refrun'), ag = addAgent(store, 'a'), orig = await tempDir('refrun-origem');
  await mkdir(join(orig, 'src')); await writeFile(join(orig, 'src', 'pauta.js'), 'export const x = 1;'); await writeFile(join(orig, '.env'), 'TOKEN=1');
  store.put('projects', { ...pj, referenceDirs: [{ path: orig, label: 'gerou' }] });
  const { task } = createTask(store, { projectId: pj.id, agentId: ag.id, requestId: 'r1', objective: '[[fake echo=1 write=saida.txt:ola]] leia a referência' });
  await runner.pump(); const done = await waitFor(() => { const t = store.get('tasks', task.id); return ['completed', 'failed'].includes(t.status) ? t : null; }, 20000, 'tarefa');
  assert.equal(done.status, 'completed'); assert.equal(await readFile(join(pj.path, '.referencias', 'gerou', 'src', 'pauta.js'), 'utf8'), 'export const x = 1;');
  await assert.rejects(() => access(join(pj.path, '.referencias', 'gerou', '.env')));
  assert.ok(!(done.result.deliverables.files || []).some(f => f.path.includes('.referencias')), 'a cópia não conta como entrega');
  const ev = store.events(done.currentAttemptId || done.attempts.at(-1)).map(e => e.text || '').join('\n'); assert.match(ev, /Pastas de referência: 1/);
});

test('HTTP: pastas de referência — validação, estatísticas, Financeiro recusado e tela', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cr-refhttp-')), proj = await mkdtemp(join(tmpdir(), 'cr-refproj-')), orig = await mkdtemp(join(tmpdir(), 'cr-reforig-')), port = 19000 + Math.floor(Math.random() * 10000), now = new Date().toISOString();
  await writeFile(join(orig, 'a.js'), '1'); await writeFile(join(orig, '.env'), 'X=1');
  const seed = new Store(join(dir, 'code-room.sqlite')); seed.put('projects', { id: 'pj1', name: 'Achadinhos', area: 'Vídeo', path: proj, createdAt: now }); seed.put('projects', { id: 'pf', name: 'Contas', area: 'Financeiro', path: proj + '-fin', createdAt: now }); seed.close();
  const child = spawn(process.execPath, ['server/main.mjs'], { cwd: resolve('.'), env: { ...process.env, CODE_ROOM_DATA: dir, CODE_ROOM_PORT: String(port) }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await Promise.race([once(child.stdout, 'data'), new Promise((_, no) => setTimeout(() => no(new Error('Servidor não iniciou')), 8000))]);
    const key = (await readFile(join(dir, 'access.key'), 'utf8')).trim(), H = { 'X-Code-Room-Key': key, 'Content-Type': 'application/json' }, post = (p, b) => fetch(`http://127.0.0.1:${port}${p}`, { method: 'POST', headers: H, body: JSON.stringify(b) }), get = p => fetch(`http://127.0.0.1:${port}${p}`, { headers: H });
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/projects/pj1/references`)).status, 401);
    assert.deepEqual((await (await get('/api/projects/pj1/references')).json()).dirs, []);
    let r = await post('/api/projects/pj1/references', { dirs: [{ path: 'relativa' }] }); assert.equal(r.status, 400); r = await post('/api/projects/pj1/references', { dirs: [{ path: proj }] }); assert.equal(r.status, 400); assert.match((await r.json()).error, /próprio projeto/);
    r = await post('/api/projects/pf/references', { dirs: [{ path: orig }] }); assert.equal(r.status, 400); assert.match((await r.json()).error, /financeiros/);
    r = await post('/api/projects/pj1/references', { dirs: [{ path: orig, label: 'Gerou Promo' }] }); assert.equal(r.status, 200); assert.equal((await r.json()).dirs[0].label, 'Gerou-Promo');
    const g = await (await get('/api/projects/pj1/references')).json(); assert.equal(g.dirs[0].stats.files, 1); assert.equal(g.dirs[0].stats.skipped.segredo, 1);
    const h = referencesSectionHtml({ refs: g }); assert.match(h, /cópia somente leitura/); assert.match(h, /Gerou-Promo=/); assert.match(h, /1 de fora/); assert.match(referencesSectionHtml({ refs: { dirs: [], financeiro: true } }), /financeiros não usam/); assert.match(referencesSectionHtml({}), /Carregando/);
    assert.ok(!referencesSectionHtml({ refs: { dirs: [{ label: '<b>x</b>', path: '<i>p</i>', stats: null }] } }).includes('<b>x</b>'), 'HTML escapado');
  } finally { const closed = once(child, 'close'); child.kill(); await closed; for (const d of [dir, proj, orig]) await rm(d, { recursive: true, force: true }); }
});
