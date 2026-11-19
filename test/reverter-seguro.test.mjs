// "Reverter alterações" não pode apagar o que a pessoa (ou outra IA) fez depois da tarefa, e o modo irrestrito não
// começa sem ponto de restauração. Casos pedidos na revisão: edição posterior com o MESMO tamanho, arquivo com
// alterações preparadas no índice do Git e falha na criação do ponto de restauração.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFileSync, readFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { captureTaskCheckpoint, captureFileBackup, planRevert, revertTaskChanges } from '../server/task-checkpoint.mjs';
import { snapshot, diffSnapshots } from '../server/deliverables.mjs';
import { setup, addAgent, tempDir, task, waitFor, status } from './helpers.mjs';

const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const sha = s => createHash('sha256').update(s).digest('hex');
async function repo() {
  const r = await tempDir('rv-git');
  git(r, 'init'); git(r, 'config', 'user.email', 't@local'); git(r, 'config', 'user.name', 'T'); git(r, 'config', 'core.autocrlf', 'false');
  writeFileSync(join(r, 'meu.txt'), 'aaaa'); writeFileSync(join(r, 'dele.txt'), 'bbbb'); writeFileSync(join(r, 'some.txt'), 'cccc');
  git(r, 'add', '.'); git(r, 'commit', '-m', 'inicial');
  return r;
}

test('Git: edição posterior com o mesmo tamanho fica preservada; o que só a tarefa mexeu volta; o índice não muda', async () => {
  const r = await repo();
  // Antes da tarefa: a pessoa já tinha preparado (git add) uma mudança em some.txt.
  writeFileSync(join(r, 'some.txt'), 'CCCC'); git(r, 'add', 'some.txt');
  const before = await snapshot(r);
  const ck = await captureTaskCheckpoint(r); assert.equal(ck?.available, true);
  // A tarefa (IA) altera três arquivos e cria um.
  writeFileSync(join(r, 'meu.txt'), 'IA11'); writeFileSync(join(r, 'dele.txt'), 'IA22'); writeFileSync(join(r, 'some.txt'), 'IA33'); writeFileSync(join(r, 'novo.txt'), 'gerado');
  await new Promise(res => setTimeout(res, 20));
  const del = await diffSnapshots(r, before, await snapshot(r));
  assert.ok(del.files.every(f => f.sha256), 'as entregas gravam o hash do estado final');
  // Depois da tarefa, VOCÊ edita meu.txt com o mesmo tamanho (a checagem antiga, só por tamanho, apagaria isto).
  writeFileSync(join(r, 'meu.txt'), 'EU!!');
  const indexBefore = git(r, 'ls-files', '-s');
  const plan = await planRevert(r, ck, del);
  const by = Object.fromEntries(plan.items.map(i => [i.path, i]));
  assert.equal(by['meu.txt'].action, 'keep'); assert.match(by['meu.txt'].reason, /editado depois/);
  assert.equal(by['dele.txt'].action, 'restore'); assert.equal(by['novo.txt'].action, 'trash');
  assert.equal(by['some.txt'].action, 'restore'); assert.equal(by['some.txt'].staged, true); assert.match(by['some.txt'].reason, /índice/);
  const out = await revertTaskChanges(r, ck, del);
  assert.equal(readFileSync(join(r, 'meu.txt'), 'utf8'), 'EU!!', 'a sua edição continua lá');
  assert.equal(readFileSync(join(r, 'dele.txt'), 'utf8'), 'bbbb');
  assert.equal(readFileSync(join(r, 'some.txt'), 'utf8'), 'CCCC', 'volta ao estado de antes da tarefa (com a sua mudança preparada)');
  assert.ok(!existsSync(join(r, 'novo.txt')));
  assert.equal(git(r, 'ls-files', '-s'), indexBefore, 'o índice do Git fica intacto');
  assert.equal(out.restored, 2); assert.equal(out.trashed, 1); assert.equal(out.partial, true); assert.match(out.summary, /1 preservado/);
});

test('arquivo criado pela tarefa e editado depois com o mesmo tamanho não vai para a lixeira; reverter só os marcados', async () => {
  const r = await repo();
  const ck = await captureTaskCheckpoint(r);
  writeFileSync(join(r, 'a.txt'), 'xxxx'); writeFileSync(join(r, 'b.txt'), 'yyyy'); writeFileSync(join(r, 'meu.txt'), 'IA!!');
  const del = { files: [{ path: 'a.txt', change: 'created', bytes: 4, sha256: sha('xxxx') }, { path: 'b.txt', change: 'created', bytes: 4, sha256: sha('yyyy') }, { path: 'meu.txt', change: 'modified', bytes: 4, sha256: sha('IA!!') }] };
  writeFileSync(join(r, 'a.txt'), 'EU!!');
  const out = await revertTaskChanges(r, ck, del, { paths: ['b.txt'] });
  assert.equal(readFileSync(join(r, 'a.txt'), 'utf8'), 'EU!!'); assert.ok(!existsSync(join(r, 'b.txt')));
  assert.equal(readFileSync(join(r, 'meu.txt'), 'utf8'), 'IA!!', 'ficou de fora porque você desmarcou');
  assert.equal(out.trashed, 1); assert.ok(out.skipped.some(s => /deixou de fora/.test(s)));
  // Sem hash registrado (tarefa antiga ou arquivo grande): não dá para confirmar, então preserva.
  const p2 = await planRevert(r, ck, { files: [{ path: 'meu.txt', change: 'modified', bytes: 4 }] });
  assert.equal(p2.items[0].action, 'keep'); assert.match(p2.items[0].reason, /sem registro/);
  await assert.rejects(revertTaskChanges(r, ck, { files: [{ path: 'meu.txt', change: 'modified' }] }), /Nada foi revertido/);
});

test('cópia de segurança (sem Git): mesma regra; arquivo apagado pela tarefa e recriado por você fica', async () => {
  const p = await tempDir('rv-copy'), bk = join(await tempDir('rv-bk'), 'T');
  writeFileSync(join(p, 'x.txt'), 'orig'); writeFileSync(join(p, 'y.txt'), 'orig'); writeFileSync(join(p, 'z.txt'), 'orig');
  const ck = await captureFileBackup(p, bk);
  writeFileSync(join(p, 'x.txt'), 'IA-1'); writeFileSync(join(p, 'y.txt'), 'IA-2'); rmSync(join(p, 'z.txt'));
  const del = { files: [{ path: 'x.txt', change: 'modified', sha256: sha('IA-1') }, { path: 'y.txt', change: 'modified', sha256: sha('IA-2') }, { path: 'z.txt', change: 'deleted' }] };
  writeFileSync(join(p, 'y.txt'), 'meu!'); writeFileSync(join(p, 'z.txt'), 'novo meu');
  const out = await revertTaskChanges(p, ck, del);
  assert.equal(readFileSync(join(p, 'x.txt'), 'utf8'), 'orig'); assert.equal(readFileSync(join(p, 'y.txt'), 'utf8'), 'meu!'); assert.equal(readFileSync(join(p, 'z.txt'), 'utf8'), 'novo meu');
  assert.equal(out.restored, 1); assert.equal(out.skipped.length, 2);
});

test('modo irrestrito: se o ponto de restauração falha, a CLI não inicia e a tarefa explica o motivo e a pasta', async () => {
  const blocker = join(await tempDir('rv-blk'), 'arquivo-no-lugar-da-pasta'); writeFileSync(blocker, 'x');   // mkdir dentro de um arquivo falha
  let launched = 0;
  const { store, runner } = await setup({ runnerOpts: { backupDir: blocker, launch: () => { launched++; throw new Error('não deveria iniciar'); } } });
  const path = await tempDir('rv-free');   // sem Git
  writeFileSync(join(path, 'a.txt'), 'oi');
  const pr = store.put('projects', { id: 'p-free', name: 'livre', path, area: 'Geral', createdAt: new Date().toISOString() });
  const ag = addAgent(store, 'livre', { mode: 'write', unrestricted: true });
  const t = task(store, pr, ag, 'write=a.txt:mudou');
  await runner.pump();
  await waitFor(() => ['failed', 'blocked'].includes(status(store, t.id)), 15000, 'falha por falta de ponto de restauração');
  const got = store.get('tasks', t.id);
  assert.equal(launched, 0, 'a IA não foi iniciada');
  assert.equal(got.failureKind, 'checkpoint_unavailable');
  assert.match(got.error || got.reason || '', /Modo irrestrito bloqueado/);
  assert.ok((got.error || got.reason || '').includes(path), 'mostra a pasta que precisava ser coberta');
  assert.equal(readFileSync(join(path, 'a.txt'), 'utf8'), 'oi');
  runner.stop?.(); store.close?.();
});

test('modo irrestrito com cópia ok: registra o que ficou coberto e o que ficou fora', async () => {
  const bk = await tempDir('rv-bk2');
  const { store, runner } = await setup({ runnerOpts: { backupDir: bk } });
  const path = await tempDir('rv-free2'), outside = await tempDir('rv-fora');
  writeFileSync(join(path, 'a.txt'), 'oi');
  const pr = store.put('projects', { id: 'p-free2', name: 'livre2', path, area: 'Geral', workDirs: [{ path: outside, write: true }], createdAt: new Date().toISOString() });
  const ag = addAgent(store, 'livre2', { mode: 'write', unrestricted: true });
  const t = task(store, pr, ag, 'write=a.txt:mudou');
  await runner.pump();
  await waitFor(() => status(store, t.id) === 'completed' || status(store, t.id) === 'failed', 15000, 'conclusão');
  const got = store.get('tasks', t.id), ck = got.result?.checkpoint;
  assert.equal(status(store, t.id), 'completed', got.error || '');
  assert.equal(ck?.kind, 'copy'); assert.deepEqual(ck.covers, [path]); assert.deepEqual(ck.notCovered, [outside]);
  const ev = store.events(got.currentAttemptId).map(e => e.text || '').join('\n');
  assert.match(ev, /Fora do ponto de restauração/);
  runner.stop?.(); store.close?.();
});
