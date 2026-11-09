import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Store } from '../server/store.mjs';
import { createTask, retryTask } from '../server/tasks.mjs';
import { setup, addProject, addAgent } from './helpers.mjs';

test('retomar: quem foi interrompido por reinício volta para a fila e o revisor bloqueado por ele volta a esperar', async () => {
  const { store } = await setup(), pj = await addProject(store, 'retry'), dev = addAgent(store, 'dev', { provider: 'claude' }), rev = addAgent(store, 'rev', { provider: 'claude' });
  const { task: a } = createTask(store, { projectId: pj.id, agentId: dev.id, requestId: 'a', objective: 'faça', limits: { maxAttempts: 1 } });
  const { task: b } = createTask(store, { projectId: pj.id, agentId: rev.id, requestId: 'b', objective: 'revise', dependsOn: [a.id] });
  store.put('tasks', { ...store.get('tasks', a.id), status: 'interrupted', attemptCount: 1, reason: 'Serviço reiniciado durante a execução.' });
  store.put('tasks', { ...store.get('tasks', b.id), status: 'blocked', reason: `Dependência ${a.id} está interrupted.` });
  assert.throws(() => retryTask(store, a.id), /Limite de 1 tentativa/, 'o limite continua valendo para quem não foi liberado pela rota');
  store.put('tasks', { ...store.get('tasks', a.id), limits: { ...store.get('tasks', a.id).limits, maxAttempts: 2 } });
  assert.equal(retryTask(store, a.id).status, 'queued'); assert.equal(store.get('tasks', b.id).status, 'waiting_dependency'); assert.equal(store.get('tasks', b.id).reason, null);
});

test('HTTP: POST /api/tasks/:id/retry com confirmação libera mais uma tentativa e grava o limite novo (antes: "Limite de 1 tentativa")', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cr-retry-')), projDir = await mkdtemp(join(tmpdir(), 'cr-retryp-')), port = 19000 + Math.floor(Math.random() * 10000), seed = new Store(join(dir, 'code-room.sqlite'));
  const pj = seed.put('projects', { id: 'pj1', name: 'P', path: projDir, area: 'Geral', createdAt: new Date().toISOString() }), ag = seed.put('agents', { id: 'ag1', name: 'Dev', role: 'r', room: 'Geral', provider: 'hermes', mode: 'read', skillIds: [], commands: [], capabilities: [], revision: 1 });
  const { task } = createTask(seed, { projectId: pj.id, agentId: ag.id, requestId: 'x', objective: 'faça', limits: { maxAttempts: 1 } });
  seed.put('tasks', { ...seed.get('tasks', task.id), status: 'interrupted', attemptCount: 1 }); seed.close();
  const child = spawn(process.execPath, ['server/main.mjs'], { cwd: resolve('.'), env: { ...process.env, CODE_ROOM_DATA: dir, CODE_ROOM_PORT: String(port) }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await Promise.race([once(child.stdout, 'data'), new Promise((_, no) => setTimeout(() => no(new Error('Servidor não iniciou')), 8000))]);
    const key = (await readFile(join(dir, 'access.key'), 'utf8')).trim(), H = { 'X-Code-Room-Key': key, 'Content-Type': 'application/json' }, post = b => fetch(`http://127.0.0.1:${port}/api/tasks/${task.id}/retry`, { method: 'POST', headers: H, body: JSON.stringify(b) });
    assert.equal((await post({})).status, 400, 'sem confirmação não repete');
    const r = await post({ confirm: true }); assert.equal(r.status, 200); assert.equal((await r.json()).status, 'queued');
  } finally { const closed = once(child, 'close'); child.kill(); await closed; await rm(dir, { recursive: true, force: true }); await rm(projDir, { recursive: true, force: true }); }
});
