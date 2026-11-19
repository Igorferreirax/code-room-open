// O Nico não pode ficar em "pensando…" atrás de uma tarefa de agente (limite padrão = 1 tarefa por vez), e toda tarefa
// na fila precisa dizer por que ainda não começou.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, addProject, addAgent, task, waitFor, status } from './helpers.mjs';

test('Nico tem via própria: responde com uma tarefa de agente rodando, e não ocupa a vaga dos agentes', async () => {
  const { store, runner } = await setup();
  const pr = await addProject(store, 'via');
  const ag = addAgent(store, 'dev', { mode: 'read' }), nico = addAgent(store, 'assistant-codex', { mode: 'read' }), ag2 = addAgent(store, 'rev', { mode: 'read' });
  const longa = task(store, pr, ag, 'sleep=2500');
  await runner.pump(); await waitFor(() => status(store, longa.id) === 'running', 8000, 'agente rodando');
  const pergunta = task(store, pr, nico, 'answer=oi');
  await runner.pump();
  await waitFor(() => status(store, pergunta.id) === 'completed', 8000, 'Nico respondeu com o agente rodando');
  assert.equal(status(store, longa.id), 'running', 'a tarefa do agente continuou');
  // Uma segunda tarefa de agente espera e diz por quê (limite global 1).
  const outra = task(store, pr, ag2, 'answer=x');
  await runner.pump();
  assert.equal(status(store, outra.id), 'queued');
  assert.match(runner.whyWaiting(store.get('tasks', outra.id)), /Limite de 1 tarefa\(s\) ao mesmo tempo: esperando .*\(dev\) terminar/);
  await waitFor(() => status(store, outra.id) === 'completed', 15000, 'a segunda começa quando a primeira termina');
  runner.stop?.(); store.close?.();
});

test('motivo de espera: pausa vale para agentes, não para o Nico; mesma pasta e segunda resposta do Nico', async () => {
  const { store, runner } = await setup();
  const pr = await addProject(store, 'motivo');
  const w1 = addAgent(store, 'w1', { mode: 'write' }), w2 = addAgent(store, 'w2', { mode: 'write' }), nico = addAgent(store, 'assistant-codex', { mode: 'read' });
  store.put('settings', { id: 'concurrency', global: 3, provider: { codex: 3 } });
  store.put('settings', { id: 'runtime', paused: true });
  runner.paused = () => true;
  const q = task(store, pr, w1, 'answer=a');
  assert.match(runner.whyWaiting(store.get('tasks', q.id)), /pausadas/);
  const n1 = task(store, pr, nico, 'sleep=1500');
  await runner.pump();
  await waitFor(() => status(store, n1.id) === 'running', 8000, 'Nico roda mesmo com a fila pausada');
  assert.equal(status(store, q.id), 'queued', 'o agente continua pausado');
  const n2 = task(store, pr, nico, 'answer=b');
  assert.match(runner.whyWaiting(store.get('tasks', n2.id)), /O Nico ainda está terminando/);
  runner.paused = () => false;
  await runner.pump();
  await waitFor(() => status(store, q.id) === 'running' || status(store, q.id) === 'completed', 8000, 'agente sai da pausa');
  const q2 = task(store, pr, w2, 'answer=c');
  if (status(store, q.id) === 'running') assert.match(runner.whyWaiting(store.get('tasks', q2.id)), /mesma pasta/);
  await waitFor(() => ['completed'].includes(status(store, q2.id)) && ['completed'].includes(status(store, n2.id)), 15000, 'tudo termina');
  runner.stop?.(); store.close?.();
});
