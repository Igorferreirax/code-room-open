import test from 'node:test';
import assert from 'node:assert/strict';
import { localParts, evaluate, validateRoutine, Routines, MISSED_GRACE_MS } from '../server/routines.mjs';
import { createTask } from '../server/tasks.mjs';
import { setup, addProject, addAgent } from './helpers.mjs';

const at = iso => new Date(iso);
const base = (o = {}) => ({ id: 'r1', status: 'active', overlap: 'skip_if_running', lastSlot: null, trigger: { type: 'time', freq: 'daily', time: '09:00' }, ...o });

test('fuso America/Sao_Paulo: 12:00Z é 09:00 em São Paulo', () => {
  assert.deepEqual(localParts(at('2026-10-30T12:00:00Z')), { date: '2026-10-30', time: '09:00', dow: 5 });
  assert.equal(localParts(at('2026-10-30T02:30:00Z')).date, '2026-10-29', 'madrugada UTC ainda é o dia anterior em São Paulo');
});

test('rotina diária e semanal: dispara na hora, uma vez por horário, e ignora outros dias', () => {
  const r = base();
  assert.equal(evaluate(r, at('2026-10-30T11:59:00Z')), null, 'antes da hora');
  const a = evaluate(r, at('2026-10-30T12:01:00Z')); assert.deepEqual(a, { action: 'fire', slot: '2026-10-30T09:00' });
  assert.equal(evaluate({ ...r, lastSlot: a.slot }, at('2026-10-30T12:02:00Z')), null, 'mesmo horário não repete');
  assert.equal(evaluate({ ...r, lastSlot: a.slot }, at('2026-10-31T12:01:00Z')).slot, '2026-10-31T09:00', 'dia seguinte dispara');
  const w = base({ trigger: { type: 'time', freq: 'weekly', time: '09:00', day: 5 } }); // sexta
  assert.equal(evaluate(w, at('2026-10-30T12:01:00Z')).action, 'fire'); assert.equal(evaluate(w, at('2026-10-31T12:01:00Z')), null, 'sábado não');
});

test('política de atraso e sobreposição; pausada e manual não disparam sozinhas', () => {
  const r = base();
  const late = evaluate(r, new Date(Date.parse('2026-10-30T12:00:00Z') + MISSED_GRACE_MS + 60000)); assert.equal(late.action, 'skip'); assert.match(late.reason, /serviço desligado/);
  assert.match(evaluate(r, at('2026-10-30T12:01:00Z'), { running: true }).reason, /anterior ainda/);
  assert.equal(evaluate(base({ status: 'paused' }), at('2026-10-30T12:01:00Z')), null);
  assert.equal(evaluate(base({ status: 'ready', trigger: { type: 'manual' } }), at('2026-10-30T12:01:00Z')), null);
});

test('validação: extensão do gatilho por arquivo; horário e destino obrigatórios', () => {
  const ok = { name: 'R', projectId: 'p', target: { type: 'agent', id: 'a' }, objective: 'x', trigger: { type: 'time', freq: 'daily', time: '09:00' } };
  assert.equal(validateRoutine(ok).status, 'active'); assert.equal(validateRoutine({ ...ok, trigger: { type: 'manual' } }).status, 'ready');
  assert.equal(validateRoutine({ ...ok, trigger: { type: 'file', ext: '.MP4' } }).trigger.ext, 'mp4'); assert.throws(() => validateRoutine({ ...ok, trigger: { type: 'file', ext: 'a/b' } }), /Extensão inválida/);
  assert.throws(() => validateRoutine({ ...ok, trigger: { type: 'time', freq: 'daily', time: '25:00' } }), /Horário inválido/);
  assert.throws(() => validateRoutine({ ...ok, target: {} }), /agente, uma equipe ou uma receita/);
});

test('Routines: tick cria a tarefa uma única vez por horário e registra o histórico; manual idempotente por chamada', async () => {
  const { store } = await setup(); const P = await addProject(store, 'rt'), ag = addAgent(store, 'ra');
  let now = at('2026-10-30T12:01:00Z');
  const rt = new Routines(store, (r, slot) => ({ taskId: createTask(store, { projectId: r.projectId, agentId: r.target.id, requestId: `routine:${r.id}:${slot}`, objective: r.objective }).task.id }), { now: () => now });
  const r = rt.save({ name: 'Resumo', projectId: P.id, target: { type: 'agent', id: ag.id }, objective: 'resuma', trigger: { type: 'time', freq: 'daily', time: '09:00' } });
  rt.tick(); rt.tick();
  assert.equal(store.list('tasks').length, 1, 'tick repetido não duplica'); assert.equal(store.get('routines', r.id).history[0].status, 'started');
  now = at('2026-10-30T12:05:00Z'); rt.tick(); assert.equal(store.list('tasks').length, 1);
  now = at('2026-10-31T12:01:00Z'); rt.tick(); assert.equal(store.list('tasks').length, 1, 'tarefa anterior ainda ativa: política pular se em execução'); assert.equal(store.get('routines', r.id).history[0].status, 'skipped');
  for (const t of store.list('tasks')) store.put('tasks', { ...t, status: 'completed' });
  now = at('2026-11-01T12:01:00Z'); rt.tick(); assert.equal(store.list('tasks').length, 2, 'concluída a anterior, o próximo horário cria outra');
  for (const t of store.list('tasks')) store.put('tasks', { ...t, status: 'completed' });
  rt.setStatus(r.id, 'paused'); now = at('2026-11-02T12:01:00Z'); rt.tick(); assert.equal(store.list('tasks').length, 2, 'pausada não roda');
  rt.setStatus(r.id, 'active'); now = at('2026-11-02T15:30:00Z'); rt.tick(); assert.equal(store.get('routines', r.id).history[0].status, 'skipped', 'perdida por atraso');
  assert.throws(() => rt.setStatus('nao-existe', 'paused'), /inexistente/);
});

test('gatilho por arquivo: reage a arquivo novo da extensão certa, uma vez por intervalo, e ignora a própria execução', async () => {
  const { writeFileSync } = await import('node:fs'); const { join } = await import('node:path'); const { sleep, waitFor } = await import('./helpers.mjs');
  const { store } = await setup(); const P = await addProject(store, 'watch'), ag = addAgent(store, 'wa');
  const rt = new Routines(store, (r, slot) => ({ taskId: createTask(store, { projectId: r.projectId, agentId: r.target.id, requestId: `routine:${r.id}:${slot}`, objective: r.objective }).task.id }), { debounceMs: 150, cooldownMs: 700 });
  const r = rt.save({ name: 'Novo vídeo', projectId: P.id, target: { type: 'agent', id: ag.id }, objective: 'organize', trigger: { type: 'file', ext: 'mp4' } });
  const done = () => { for (const t of store.list('tasks')) store.put('tasks', { ...t, status: 'completed' }); };
  try {
    await sleep(200);
    writeFileSync(join(P.path, 'nota.txt'), 'x'); await sleep(500);
    assert.equal(store.list('tasks').length, 0, 'extensão diferente não dispara');
    writeFileSync(join(P.path, 'a.mp4'), 'x'); await waitFor(() => store.list('tasks').length === 1, 4000, 'disparo por arquivo');
    assert.match(store.get('routines', r.id).history[0].reason, /Novo arquivo: a\.mp4/);
    writeFileSync(join(P.path, 'b.mp4'), 'x'); await sleep(600);
    assert.equal(store.list('tasks').length, 1, 'enquanto a anterior roda, não dispara de novo (ela ainda está na fila)');
    done(); await sleep(800);
    writeFileSync(join(P.path, 'c.mp4'), 'x'); await waitFor(() => store.list('tasks').length === 2, 4000, 'novo disparo após concluir e passar o intervalo');
    rt.setStatus(r.id, 'paused'); done(); await sleep(300);
    writeFileSync(join(P.path, 'd.mp4'), 'x'); await sleep(700);
    assert.equal(store.list('tasks').length, 2, 'pausada não observa');
  } finally { rt.stop(); }
});
