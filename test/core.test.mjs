import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Store } from '../server/store.mjs';
import { Runner } from '../server/runner.mjs';
import { createTask, transition, retryTask, TRANSITIONS } from '../server/tasks.mjs';
import { normalize, classifyFailure, labelUsage } from '../server/connectors.mjs';
import { alive, killTree } from '../server/procs.mjs';
import { setup, addProject, addAgent, task, status, waitFor, tempDir, sleep, fakeCommand } from './helpers.mjs';

test('migração v1→v2 preserva dados; eventId deduplica; claim é atômico', async () => {
  const dir = await tempDir('mig'), file = join(dir, 'd.sqlite');
  const old = new DatabaseSync(file);
  old.exec(`CREATE TABLE records(kind TEXT, id TEXT, body TEXT NOT NULL, PRIMARY KEY(kind,id)); CREATE TABLE events(seq INTEGER PRIMARY KEY AUTOINCREMENT, run TEXT NOT NULL, body TEXT NOT NULL); PRAGMA user_version=1; INSERT INTO records VALUES('agents','a','{"id":"a","name":"Luna"}'); INSERT INTO events(run,body) VALUES('r','{"type":"x"}');`);
  old.close();
  const s = new Store(file);
  assert.equal(s.get('agents', 'a').name, 'Luna'); assert.equal(s.events('r').length, 1);
  const first = s.event('r', { type: 'a', eventId: 'e1' }), dup = s.event('r', { type: 'a', eventId: 'e1' });
  assert.ok(first > 0); assert.equal(dup, null); assert.equal(s.events('r').length, 2);
  assert.equal(s.claim('t', 'a1', 'ex1'), true); assert.equal(s.claim('t', 'a2', 'ex2'), false);
  s.release('t'); assert.equal(s.claim('t', 'a3', 'ex2'), true);
  s.close(); await rm(dir, { recursive: true });
});

test('estados: transições inválidas são recusadas; dependências, idempotência e projetos isolados', async () => {
  const { store } = await setup(); const A = await addProject(store, 'a'), B = await addProject(store, 'b'), ag = addAgent(store, 'x');
  const t1 = task(store, A, ag, ''), t2 = task(store, A, ag, '', { dependsOn: [t1.id] });
  assert.equal(t1.status, 'queued'); assert.equal(t2.status, 'waiting_dependency');
  assert.throws(() => transition(store, t1, 'completed'), /Transição inválida: queued → completed/);
  assert.throws(() => transition(store, store.get('tasks', t2.id), 'running'), /Transição inválida/);
  const same = createTask(store, { projectId: A.id, agentId: ag.id, requestId: t1.requestId, objective: 'x' });
  assert.equal(same.duplicate, true); assert.equal(same.task.id, t1.id);
  const other = store.put('agents', { ...ag, id: 'y' });
  assert.throws(() => createTask(store, { projectId: B.id, agentId: other.id, requestId: 'q', objective: 'x', dependsOn: [t1.id] }), /outro projeto/);
  assert.throws(() => createTask(store, { projectId: A.id, agentId: ag.id, requestId: 'q2', objective: 'x', inputs: ['../segredo.txt'] }), /fora do projeto/);
  assert.throws(() => createTask(store, { projectId: A.id, agentId: ag.id, requestId: 'q3', objective: 'x', inputs: ['C:/Windows/win.ini'] }), /fora do projeto/);
  for (const [from, list] of Object.entries(TRANSITIONS)) for (const to of list) assert.ok(to in TRANSITIONS, `${from}→${to}`);
});

test('execução real de processo: eventos, uso rotulado, entregas e tentativa separada da tarefa', async () => {
  const { store, runner } = await setup(); const P = await addProject(store, 'p'), ag = addAgent(store, 'dev', { mode: 'write' });
  const t = task(store, P, ag, 'write=out/index.html:oi answer=pronto'); await runner.pump();
  await waitFor(() => status(store, t.id) === 'completed', 20000, 'conclusão');
  const done = store.get('tasks', t.id), attempt = store.get('runs', done.currentAttemptId);
  assert.equal(attempt.taskId, t.id); assert.equal(attempt.n, 1); assert.equal(attempt.provider, 'codex'); assert.equal(attempt.status, 'completed');
  assert.equal(attempt.modelReported, null); // indisponível, nunca inventado
  assert.equal(attempt.usage.cost, null); assert.equal(attempt.usage.costKind, null); assert.equal(attempt.usage.input, 10);
  assert.deepEqual(done.result.deliverables.files.map(f => [f.path, f.change, f.bytes]), [['out/index.html', 'created', 2]]);
  assert.match(done.result.deliverables.files[0].sha256, /^[0-9a-f]{64}$/);
  assert.equal(store.claims().length, 0);
  const seqs = store.events(attempt.id).map(e => e.seq); assert.deepEqual(seqs, [...seqs].sort((a, b) => a - b));
  assert.equal(store.list('tasks').length, 1); assert.equal(store.list('runs').length, 1);
});

test('falhas classificadas: erro do provedor, saída com código, pasta inválida, executável ausente, autenticação', async () => {
  const { store, runner } = await setup(); const P = await addProject(store, 'p'), ag = addAgent(store, 'a');
  const exit = task(store, P, ag, 'exit=3'), err = task(store, P, ag, 'error=Not_logged_in_please_login');
  const gone = await addProject(store, 'gone'); const g = task(store, gone, ag, ''); await rm(gone.path, { recursive: true });
  await runner.pump();
  await waitFor(() => [exit, err, g].every(t => status(store, t.id) === 'failed'), 20000, 'falhas');
  assert.equal(store.get('tasks', exit.id).failureKind, 'exit_code'); assert.match(store.get('tasks', exit.id).error, /falha simulada/);
  assert.equal(store.get('tasks', err.id).failureKind, 'auth');
  assert.equal(store.get('tasks', g.id).failureKind, 'invalid_directory');
  const { store: s2, runner: r2 } = await setup({ runnerOpts: { buildCommand: () => { throw Object.assign(new Error('CLI indisponível'), { failureKind: 'executable_missing' }); } } });
  const P2 = await addProject(s2, 'p2'), a2 = addAgent(s2, 'a'); const m = task(s2, P2, a2, ''); await r2.pump();
  await waitFor(() => status(s2, m.id) === 'failed'); assert.equal(s2.get('tasks', m.id).failureKind, 'executable_missing');
  assert.equal(classifyFailure('HTTP 401 Unauthorized'), 'auth'); assert.equal(classifyFailure('usage limit reached'), 'rate_limit'); assert.equal(classifyFailure('boom'), null);
});

test('tempo limite encerra a árvore de processos e marca timeout', async () => {
  const { store, runner } = await setup(); const P = await addProject(store, 'p'), ag = addAgent(store, 'a');
  const pid = join(P.path, '..', `gc-${Date.now()}.pid`);
  const t = task(store, P, ag, `sleep=60000 grandchild=${pid}`, { limits: { timeoutMs: 2000 } }); await runner.pump();
  await waitFor(() => status(store, t.id) === 'failed', 30000, 'timeout');
  const done = store.get('tasks', t.id); assert.equal(done.failureKind, 'timeout');
  const gc = Number(readFileSync(pid, 'utf8')); await waitFor(() => !alive(gc), 5000, 'neto encerrado');
  assert.equal(store.get('runs', done.currentAttemptId).killResult.ok, true, JSON.stringify(store.get('runs', done.currentAttemptId).killResult));
});

test('cancelar encerra só a árvore da tarefa cancelada, dentro do prazo, sem afetar a outra', async () => {
  const { store, runner } = await setup({ concurrency: { global: 2, provider: { codex: 2, claude: 1 }, video: 1 } });
  const A = await addProject(store, 'a'), B = await addProject(store, 'b'), ag = addAgent(store, 'ag');
  const pa = join(A.path, '..', `ga-${Date.now()}.pid`), pb = join(B.path, '..', `gb-${Date.now()}.pid`);
  const ta = task(store, A, ag, `sleep=60000 grandchild=${pa}`), tb = task(store, B, ag, `sleep=16000 grandchild=${pb} answer=outra_terminou`);
  await runner.pump(); await waitFor(() => existsSync(pa) && existsSync(pb), 15000, 'netos');
  const ga = Number(readFileSync(pa, 'utf8')), gb = Number(readFileSync(pb, 'utf8'));
  const started = Date.now(); await runner.cancel(ta.id);
  assert.ok(Date.now() - started < 10000, 'cancelamento dentro do prazo');
  await waitFor(() => status(store, ta.id) === 'cancelled', 10000, 'cancelamento');
  assert.equal(alive(ga), false); assert.equal(alive(gb), true, 'processo alheio continua vivo');
  assert.equal(store.get('runs', store.get('tasks', ta.id).currentAttemptId).killResult.ok, true);
  await waitFor(() => status(store, tb.id) === 'completed', 45000, 'outra tarefa');
  assert.equal(store.get('tasks', tb.id).result.summary, 'outra terminou');
  await killTree(gb); // limpeza do processo que o teste deixou vivo de propósito
});

test('reinício: claim órfão é recuperado, processo órfão encerrado, dependente bloqueado, fila preservada', async () => {
  const dir = await tempDir('restart'), file = join(dir, 'd.sqlite');
  const A = await setup({ file }); const P = await addProject(A.store, 'p'), ag = addAgent(A.store, 'ag');
  const pid = join(dir, 'proc.pid');
  const t = task(A.store, P, ag, `sleep=60000 pidfile=${pid}`), dep = task(A.store, P, ag, '', { dependsOn: [t.id] });
  await A.runner.pump(); await waitFor(() => existsSync(pid), 15000, 'processo');
  const orphan = Number(readFileSync(pid, 'utf8')); assert.ok(alive(orphan));
  const queued = task(A.store, P, ag, 'sleep=10'); // ficou na fila; não pode ser perdida nem repetida às cegas
  // "Queda" do serviço: o executor A some sem limpar nada e o filho segue vivo. B assume o mesmo banco.
  A.runner.stop(); const B = new Runner(A.store, { buildCommand: fakeCommand, hooks: A.orchestrator.hooks(), cancelDeadlineMs: 8000 });
  await B.recover({ force: true });
  const rec = A.store.get('tasks', t.id);
  assert.equal(rec.status, 'interrupted'); assert.match(rec.reason, /efeitos no projeto são incertos/);
  assert.equal(A.store.get('tasks', dep.id).status, 'blocked');
  await waitFor(() => !alive(orphan), 8000, 'órfão encerrado');
  assert.equal(A.store.get('runs', rec.currentAttemptId).status, 'interrupted');
  await waitFor(() => A.store.claims().length === 0, 8000, 'claims liberados');
  assert.ok(['queued', 'running', 'completed'].includes(A.store.get('tasks', queued.id).status), 'a tarefa que estava na fila não foi perdida nem interrompida');
  // Repetir respeita o limite de tentativas (padrão 1): sem confirmação explícita do usuário, não reexecuta.
  assert.throws(() => retryTask(A.store, t.id), /Limite de 1 tentativa/);
});

test('executor perdido (heartbeat vencido) é detectado sem reinício', async () => {
  const { store, runner } = await setup({ runnerOpts: { staleMs: 200 } }); const P = await addProject(store, 'p'), ag = addAgent(store, 'a');
  const t = task(store, P, ag, ''); const attemptId = 'att-1';
  store.put('runs', { id: attemptId, taskId: t.id, status: 'running', pid: null }); transition(store, t, 'running', { attempts: [attemptId], currentAttemptId: attemptId, attemptCount: 1 });
  store.claim(t.id, attemptId, 'executor-morto'); await sleep(350);
  await runner.recover({ force: false });
  assert.equal(status(store, t.id), 'interrupted'); assert.equal(store.claims().length, 0);
});

test('concorrência: padrão serial; limites global/provedor; escrita exclusiva por projeto; leitura simultânea', async () => {
  const { store, runner } = await setup(); const A = await addProject(store, 'a'), B = await addProject(store, 'b');
  const w = addAgent(store, 'w', { mode: 'write' }), r = addAgent(store, 'r'), cl = addAgent(store, 'cl', { provider: 'claude' });
  const peak = { n: 0 }; const watch = setInterval(() => { peak.n = Math.max(peak.n, runner.active.size); }, 20);
  const serial = [task(store, A, w, 'sleep=400'), task(store, B, w, 'sleep=400')]; await runner.pump();
  await waitFor(() => serial.every(t => status(store, t.id) === 'completed'), 20000); assert.equal(peak.n, 1);
  store.put('settings', { id: 'concurrency', global: 3, provider: { codex: 2, claude: 1 }, video: 1 }); peak.n = 0;
  const w1 = task(store, A, w, 'sleep=1500'), w2 = task(store, A, w, 'sleep=300'), wB = task(store, B, w, 'sleep=1500'), c1 = task(store, B, cl, 'sleep=300');
  await runner.pump(); await sleep(600);
  const running = id => status(store, id) === 'running';
  assert.ok(running(w1.id) && running(wB.id), 'projetos independentes escrevem em paralelo');
  assert.equal(status(store, w2.id), 'queued', 'segundo escritor do mesmo projeto espera');
  assert.equal(status(store, c1.id), 'queued', 'conflito de escrita em B segura o leitor');
  await waitFor(() => [w1, w2, wB, c1].every(t => ['completed', 'failed'].includes(status(store, t.id))), 30000);
  assert.ok(peak.n <= 3); clearInterval(watch); // c1 usa o formato do Codex com provedor claude: falha por no_output, o que não importa aqui
  const r1 = task(store, A, r, 'sleep=800'), r2 = task(store, A, r, 'sleep=800'); await runner.pump(); await sleep(400);
  assert.ok(running(r1.id) && running(r2.id), 'dois leitores no mesmo projeto rodam juntos');
  await waitFor(() => [r1, r2].every(t => status(store, t.id) === 'completed'));
});

test('dependências: executa em ordem; falha bloqueia dependentes; pausa não inicia', async () => {
  const { store, runner } = await setup({ concurrency: { global: 3, provider: { codex: 3, claude: 1 }, video: 1 } });
  const A = await addProject(store, 'a'), B = await addProject(store, 'b'), ag = addAgent(store, 'ag');
  const first = task(store, A, ag, 'sleep=500'), second = task(store, A, ag, 'sleep=50', { dependsOn: [first.id] });
  const bad = task(store, B, ag, 'exit=2'), after = task(store, B, ag, '', { dependsOn: [bad.id] });
  store.put('settings', { id: 'queue', paused: true }); await runner.pump(); await sleep(300);
  assert.equal(status(store, first.id), 'queued', 'pausa: nada novo inicia');
  store.put('settings', { id: 'queue', paused: false }); await runner.pump();
  await waitFor(() => status(store, second.id) === 'completed', 20000);
  const t1 = store.get('tasks', first.id), t2 = store.get('tasks', second.id);
  assert.ok(Date.parse(t1.result ? t1.updatedAt : '9999') <= Date.parse(t2.updatedAt));
  assert.equal(status(store, bad.id), 'failed'); assert.equal(status(store, after.id), 'blocked'); assert.match(store.get('tasks', after.id).reason, /Dependência .* está failed/);
});

test('conectores: eventos normalizados, custo de assinatura rotulado como referência', () => {
  assert.equal(normalize('codex', { type: 'item.completed', item: { type: 'agent_message', text: 'feito' } }).type, 'answer');
  const u = normalize('claude', { type: 'result', is_error: false, result: 'ok', total_cost_usd: 0.19, usage: { input_tokens: 6, output_tokens: 3 } }).usage;
  assert.equal(labelUsage('claude', u).costKind, 'api-equivalent-not-billing'); assert.equal(labelUsage('codex', { cost: null }).costKind, null);
  assert.equal(normalize('claude', { type: 'result', is_error: true, errors: ['limite'] }).usage.cost, null);
});
