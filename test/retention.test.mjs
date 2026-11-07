import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../server/store.mjs';
import { retentionPlan, retentionPurge } from '../server/retention.mjs';

const DAY = 86400000, NOW = Date.parse('2026-11-07T12:00:00Z');
const iso = d => new Date(NOW - d * DAY).toISOString();
const task = (id, project, status, ageDays, attempts = []) => ({ id, project: { id: project }, status, updatedAt: iso(ageDays), attempts });

test('retenção: só tarefas internas do Assistente, terminadas e antigas; prévia não apaga nada', () => {
  const store = new Store(':memory:');
  store.put('tasks', task('old-done', 'assistant-internal', 'completed', 10, ['r1']));
  store.put('tasks', task('old-failed', 'assistant-internal', 'failed', 30, ['r2']));
  store.put('tasks', task('new-done', 'assistant-internal', 'completed', 1));
  store.put('tasks', task('old-running', 'assistant-internal', 'running', 40));
  store.put('tasks', task('user-old', 'meu-projeto', 'completed', 400, ['r3']));
  for (const id of ['r1', 'r2', 'r3']) { store.put('runs', { id }); store.event(id, { type: 'x' }); }
  store.event('old-done', { type: 'task' });

  const plan = retentionPlan(store, { days: 7, now: NOW });
  assert.deepEqual(plan.counts, { tasks: 2, runs: 2 });
  assert.equal(store.list('tasks').length, 5, 'a prévia não apaga');

  const removed = retentionPurge(store, { days: 7, now: NOW });
  assert.deepEqual(removed, { tasks: 2, runs: 2 });
  assert.deepEqual(store.list('tasks').map(t => t.id).sort(), ['new-done', 'old-running', 'user-old'], 'projetos do usuário, recentes e em andamento ficam');
  assert.equal(store.get('runs', 'r3')?.id, 'r3');
  assert.equal(store.events('r1').length, 0, 'eventos das tentativas apagadas saem junto');
  assert.equal(store.events('r3').length, 1);
  assert.equal(retentionPlan(store, { days: 7, now: NOW }).counts.tasks, 0, 'repetir não acha mais nada');
});

test('retenção: dias inválidos viram 7 e o limite máximo é 365', () => {
  const store = new Store(':memory:');
  assert.equal(retentionPlan(store, { days: 'abc' }).days, 7);
  assert.equal(retentionPlan(store, { days: 99999 }).days, 365);
  assert.equal(retentionPlan(store, { days: 0 }).days, 7);
});
