import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setup, addProject, addAgent, task, status, waitFor, tempDir } from './helpers.mjs';

const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd, encoding: 'utf8', windowsHide: true }).trim();
async function repo(store) {
  const P = await addProject(store, 'wt');
  git(P.path, 'init', '-q'); writeFileSync(join(P.path, 'base.txt'), 'base'); git(P.path, 'add', '.'); git(P.path, 'commit', '-q', '-m', 'base');
  return P;
}

test('worktree: duas tarefas de escrita na mesma pasta rodam juntas, cada uma na sua branch, sem tocar a pasta original', async () => {
  const wtDir = await tempDir('wt-dir');
  const { store, runner } = await setup({ concurrency: { global: 2, provider: { codex: 2, claude: 1 }, video: 1 }, runnerOpts: { worktreeDir: wtDir } });
  const P = await repo(store), ag = addAgent(store, 'dev', { mode: 'write' });
  const a = task(store, P, ag, 'write=a.txt:A sleep=1500', { isolate: true }), b = task(store, P, ag, 'write=b.txt:B sleep=1500', { isolate: true });
  await runner.pump();
  await waitFor(() => runner.active.size === 2, 8000, 'as duas rodando juntas');
  await waitFor(() => status(store, a.id) === 'completed' && status(store, b.id) === 'completed', 25000, 'conclusão');
  const ra = store.get('tasks', a.id).result, rb = store.get('tasks', b.id).result;
  assert.ok(ra.isolation.branch.startsWith('code-room/') && ra.isolation.branch !== rb.isolation.branch);
  assert.deepEqual(ra.deliverables.files.map(f => f.path), ['a.txt']); assert.deepEqual(rb.deliverables.files.map(f => f.path), ['b.txt']);
  assert.equal(existsSync(join(P.path, 'a.txt')), false); assert.equal(existsSync(join(P.path, 'b.txt')), false); // pasta original intacta
  assert.ok(existsSync(join(ra.isolation.worktree, 'a.txt')));
  assert.match(git(P.path, 'branch', '--list', 'code-room/*'), /code-room\//);
});

test('worktree: pasta sem Git ou sem commit falha com motivo claro e a tarefa não escreve na pasta original', async () => {
  const wtDir = await tempDir('wt-dir2');
  const { store, runner } = await setup({ runnerOpts: { worktreeDir: wtDir } });
  const P = await addProject(store, 'semgit'), ag = addAgent(store, 'dev', { mode: 'write' });
  const t = task(store, P, ag, 'write=x.txt:X', { isolate: true }); await runner.pump();
  await waitFor(() => status(store, t.id) === 'failed', 15000, 'falha');
  const done = store.get('tasks', t.id);
  assert.equal(done.failureKind, 'worktree_unavailable'); assert.match(done.error, /Git|commit/);
  assert.equal(existsSync(join(P.path, 'x.txt')), false);
});
