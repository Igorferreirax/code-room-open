import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, addProject, addAgent, task, status, waitFor, fakeCommand } from './helpers.mjs';
import { createTask, retryTask } from '../server/tasks.mjs';
import { command } from '../server/connectors.mjs';

test('comando: Codex retoma com "exec resume <id>" e Claude com --resume <id>; sem id o comando é o de sempre', () => {
  for (const [provider, key] of [['codex', 'resume'], ['claude', '--resume']]) {
    let fresh, resumed;
    try { fresh = command({ provider, mode: 'write', model: '' }, 'p'); resumed = command({ provider, mode: 'write', model: '' }, 'p', { resumeId: 'sess-123' }); } catch (e) { if (e.failureKind === 'executable_missing') continue; throw e; }
    assert.ok(!fresh.args.includes('sess-123') && !fresh.args.includes('resume') && !fresh.args.includes('--resume'));
    assert.ok(resumed.args.includes(key) && resumed.args.includes('sess-123'));
  }
  try {
    const c = command({ provider: 'codex', mode: 'read', model: '' }, 'p', { resumeId: 'x' });
    assert.ok(c.args.includes('sandbox_mode="read-only"') && !c.args.includes('--sandbox'), 'exec resume não aceita --sandbox: o modo vai por -c');
  } catch (e) { if (e.failureKind !== 'executable_missing') throw e; }
});

test('continuar conversa: mesmo provedor retoma a sessão; outro provedor começa limpo; nova tentativa descarta a retomada', async () => {
  const seen = [];
  const { store, runner } = await setup({ runnerOpts: { buildCommand: (agent, prompt, opts) => { seen.push(opts?.resumeId ?? null); return fakeCommand(agent, prompt); } } });
  const P = await addProject(store, 'rs'), cx = addAgent(store, 'cx', { provider: 'codex' }), cl = addAgent(store, 'cl', { provider: 'claude' });
  const first = task(store, P, cx, 'answer=um'); await runner.pump();
  await waitFor(() => status(store, first.id) === 'completed', 20000, 'primeira');
  const sid = store.get('runs', store.get('tasks', first.id).currentAttemptId).sessionId; assert.match(sid, /^fake-/);

  const same = createTask(store, { projectId: P.id, agentId: cx.id, requestId: 'f-same', objective: 'continue [[fake answer=dois]]', resumeFrom: first.id }).task;
  assert.deepEqual(same.resume, { fromTask: first.id, sessionId: sid });
  const other = createTask(store, { projectId: P.id, agentId: cl.id, requestId: 'f-other', objective: 'continue [[fake answer=tres]]', resumeFrom: first.id }).task;
  assert.equal(other.resume, null, 'outro provedor não retoma sessão');
  await runner.pump(); await waitFor(() => status(store, same.id) === 'completed', 20000, 'segunda');
  assert.equal(seen[1], sid, 'o executor recebeu o id da sessão anterior');
  assert.ok(store.events(store.get('tasks', same.id).currentAttemptId).some(e => /Continuando a conversa/.test(e.text || '')));

  const bad = createTask(store, { projectId: P.id, agentId: cx.id, requestId: 'f-bad', objective: 'x [[fake exit=2]]', resumeFrom: first.id, limits: { maxAttempts: 2 } }).task;
  assert.ok(bad.resume); await runner.pump(); await waitFor(() => status(store, bad.id) === 'failed', 20000, 'falha');
  retryTask(store, bad.id); assert.equal(store.get('tasks', bad.id).resume, null, 'tentativa nova começa limpa');
});
