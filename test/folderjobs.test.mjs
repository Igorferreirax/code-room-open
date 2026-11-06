import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, utimesSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { validateJob, scanFolder, FolderJobs, counts, itemKey, MAX_ITEMS } from '../server/folderjobs.mjs';
import { createTask } from '../server/tasks.mjs';
import { setup, addProject, addAgent, tempDir, waitFor } from './helpers.mjs';

const old = () => new Date(Date.now() - 60000);   // arquivos "antigos" (já estáveis)
async function rig(extra = {}) {
  const { store, runner, orchestrator } = await setup(), dir = await tempDir('fj'), project = await addProject(store, 'canal'); store.put('projects', { ...project, path: dir });
  const agent = addAgent(store, 'ed', { name: 'Editor', provider: 'codex', mode: 'write' });
  const put = (rel, body = 'x', when = old()) => { const f = join(dir, rel); mkdirSync(join(f, '..'), { recursive: true }); writeFileSync(f, body); utimesSync(f, when, when); return f; };
  const base = { name: 'Lote de vídeos', projectId: project.id, dir: 'ENTRADA', exts: 'mp4, .mov', agentId: agent.id, instruction: 'Edite o vídeo {arquivo} com a skill de cortes.', ...extra };
  const launched = []; const launch = (job, item, nonce) => { const { task } = createTask(store, { projectId: job.projectId, agentId: job.target.id, requestId: `folder:${job.id}:${nonce}`, objective: job.instruction.split('{arquivo}').join(item.rel) + ' [[fake sleep=50]]' }); launched.push(item.rel); void runner.pump(); return { taskId: task.id }; };
  const fj = new FolderJobs(store, launch); return { store, runner, orchestrator, dir, project, agent, put, base, fj, launched };
}

test('cadastro: instrução precisa citar {arquivo}; pasta é relativa ao projeto e não sai dele; extensões e agente validados', async () => {
  const { store, base, project } = await rig(); const ok = validateJob(base, store); assert.equal(ok.dir, 'ENTRADA'); assert.deepEqual(ok.exts, ['mp4', 'mov']); assert.deepEqual(ok.target.type, 'agent'); assert.equal(ok.parallel, 1);
  const bad = (o, re) => assert.throws(() => validateJob({ ...base, ...o }, store), re);
  bad({ instruction: 'sem o marcador' }, /\{arquivo\}/); bad({ dir: '../fora' }, /Pasta de entrada/); bad({ dir: 'C:/Windows' }, /Pasta de entrada/); bad({ dir: 'a/../../b' }, /Pasta de entrada/); bad({ exts: 'mp4; ../x' }, /Extensões/); bad({ exts: Array(13).fill('a').map((a, i) => a + i).join(',') }, /Extensões/);
  bad({ agentId: 'nao-existe' }, /Agente não encontrado/); bad({ agentId: undefined, teamId: undefined }, /Escolha o agente/); bad({ name: '' }, /Nome/); bad({ projectId: 'x' }, /Projeto/); bad({ instruction: 'x{arquivo}'.repeat(500) }, /3000/);
  assert.equal(validateJob({ ...base, parallel: 9 }, store).parallel, 3); assert.equal(validateJob({ ...base, dir: ' ENTRADA\\sub\\ ' }, store).dir, 'ENTRADA/sub'); bad({ dir: '/ENTRADA' }, /sem barra no começo/); bad({ dir: '\\ENTRADA' }, /sem barra no começo/);
});

test('varredura: só extensões pedidas, até 2 níveis, ignora ocultos e arquivos ainda sendo gravados; pasta ausente e atalho para fora são avisados', async () => {
  const { store, base, dir, put } = await rig(); const job = validateJob(base, store);
  put('ENTRADA/a.mp4'); put('ENTRADA/b.MOV'); put('ENTRADA/c.txt'); put('ENTRADA/sub/d.mp4'); put('ENTRADA/sub/fundo/e.mp4'); put('ENTRADA/sub/fundo/mais/f.mp4'); put('ENTRADA/.oculto.mp4'); put('ENTRADA/novo.mp4', 'x', new Date());
  const s = scanFolder(dir, job); assert.deepEqual(s.files.map(f => f.rel), ['ENTRADA/a.mp4', 'ENTRADA/b.MOV', 'ENTRADA/sub/d.mp4', 'ENTRADA/sub/fundo/e.mp4']);
  assert.equal(scanFolder(dir, { ...job, dir: 'NAO-EXISTE' }).missing, true); assert.deepEqual(scanFolder(dir, { ...job, exts: [] }).files.map(f => f.rel).includes('ENTRADA/c.txt'), true, 'sem filtro de extensão, pega todas');
  const fora = await tempDir('fora'); writeFileSync(join(fora, 'x.mp4'), 'x'); utimesSync(join(fora, 'x.mp4'), old(), old());
  try { symlinkSync(fora, join(dir, 'LINK'), 'junction'); const e = scanFolder(dir, { ...job, dir: 'LINK' }); assert.equal(e.escaped, true); assert.deepEqual(e.files, []); } catch (err) { if (!/EPERM|EACCES/.test(String(err))) throw err; }
});

test('lote: um arquivo vira uma tarefa com {arquivo} trocado, nenhum arquivo é processado duas vezes e o aviso sai quando termina', async () => {
  const { store, fj, base, put, launched } = await rig(); put('ENTRADA/um.mp4'); put('ENTRADA/dois.mp4'); put('ENTRADA/tres.mov');
  const job = fj.save(base); let c = fj.process(job.id); assert.equal(c.total, 3); assert.equal(launched.length, 1, 'paralelo 1: começa um por vez'); const first = store.list('tasks')[0]; assert.match(first.objective, /Edite o vídeo ENTRADA\/dois\.mp4 com a skill de cortes\./);
  await waitFor(() => { fj.process(job.id); return counts(store.get('folderjobs', job.id)).done >= 3; }, 20000, 'lote'); c = counts(store.get('folderjobs', job.id)); assert.deepEqual([c.total, c.done, c.failed, c.queued, c.running], [3, 3, 0, 0, 0]); assert.equal(launched.length, 3);
  const notices = store.list('notices'); assert.equal(notices.length, 1); assert.match(notices[0].title, /Lote “Lote de vídeos” terminou/); assert.match(notices[0].text, /3 de 3/); assert.equal(notices[0].seen, false);
  fj.process(job.id); fj.process(job.id); assert.equal(launched.length, 3, 'rodar de novo não repete'); assert.equal(store.list('notices').length, 1, 'e não avisa de novo');
  put('ENTRADA/quatro.mp4'); await waitFor(() => { fj.process(job.id); return counts(store.get('folderjobs', job.id)).done >= 4; }, 20000, 'quarto arquivo'); assert.equal(launched.length, 4, 'arquivo novo entra no mesmo lote'); assert.equal(store.list('notices').length, 2);
  assert.equal(store.get('folderjobs', job.id).history.length, 2);
});

test('lote: falha vira "com problema" com o motivo, o aviso conta as falhas e "tentar de novo" repete só as que falharam', async () => {
  const { store, fj, base, put, launched } = await rig({ parallel: 2 }); put('ENTRADA/ok.mp4'); put('ENTRADA/ruim.mp4');
  let fail = true; const realLaunch = fj.launch; fj.launch = (job, item, nonce) => { const out = realLaunch(job, item, nonce); if (item.rel.endsWith('ruim.mp4') && fail) { const t = store.get('tasks', out.taskId); store.put('tasks', { ...t, objective: t.objective.replace('[[fake sleep=50]]', '[[fake exit=1]]') }); } return out; };
  const job = fj.save(base); fj.process(job.id); await waitFor(() => { fj.process(job.id); const c = counts(store.get('folderjobs', job.id)); return c.done + c.failed === 2; }, 20000, 'lote com falha');
  let c = counts(store.get('folderjobs', job.id)); assert.deepEqual([c.done, c.failed], [1, 1]); const bad = store.get('folderjobs', job.id).items.find(i => i.status === 'failed'); assert.match(bad.rel, /ruim/); assert.ok(bad.reason.length > 0);
  assert.match(store.list('notices')[0].text, /1 de 2 arquivo\(s\) prontos, 1 com problema/);
  fail = false; assert.equal(fj.retryFailed(job.id).retried, 1); await waitFor(() => { fj.process(job.id); return counts(store.get('folderjobs', job.id)).done === 2; }, 20000, 'repetição'); assert.equal(launched.length, 3, 'só a que falhou foi repetida'); assert.equal(store.list('notices').length, 2);
});

test('lote: pausado não lança nada, "rodar agora" força, limite de itens e projeto removido não derrubam o serviço', async () => {
  const { store, fj, base, put, launched, project } = await rig(); put('ENTRADA/a.mp4'); const job = fj.save({ ...base, status: 'paused' });
  fj.tick(); assert.equal(launched.length, 0, 'pausado'); fj.runNow(job.id); assert.equal(launched.length, 1, 'rodar agora'); fj.setStatus(job.id, 'active'); assert.equal(store.get('folderjobs', job.id).status, 'active');
  assert.throws(() => fj.setStatus('x', 'paused'), /inexistente/); assert.throws(() => fj.save({ ...base, id: 'x' }), /inexistente/);
  const j = store.get('folderjobs', job.id); j.items = Array.from({ length: MAX_ITEMS }, (_, i) => ({ key: 'k' + i, rel: 'x' + i, status: 'done', attempt: 0 })); j.finished = true; store.put('folderjobs', j); put('ENTRADA/b.mp4'); fj.process(job.id); assert.equal(store.get('folderjobs', job.id).items.length, MAX_ITEMS, 'limite de itens');
  store.remove('projects', project.id); assert.doesNotThrow(() => fj.process(job.id)); assert.match(store.get('folderjobs', job.id).problem, /projeto foi removido/); fj.remove(job.id); assert.equal(store.list('folderjobs').length, 0);
  assert.equal(itemKey('a', 10, 5.9), 'a|10|5');
});

test('equipe: o lote pode usar uma equipe (fluxo desenvolvedor → revisor) em vez de um agente', async () => {
  const { store, orchestrator, project, agent, put, base } = await rig(); const rev = addAgent(store, 'rv', { name: 'Revisor', provider: 'claude' });
  const team = orchestrator.saveTeam({ name: 'Equipe Vídeo', members: [{ role: 'desenvolvedor', agentId: agent.id }, { role: 'revisor', agentId: rev.id }] }); put('ENTRADA/a.mp4');
  const calls = []; const fj = new FolderJobs(store, (job, item, nonce) => { calls.push([job.target, item.rel, nonce]); return { flowId: 'f1' }; });
  const job = fj.save({ ...base, agentId: undefined, teamId: team.id }); fj.process(job.id); assert.equal(calls.length, 1); assert.equal(calls[0][0].type, 'team');
  store.put('flows', { id: 'f1', status: 'completed', verdict: 'approved', kind: 'sequential' }); fj.process(job.id); assert.equal(counts(store.get('folderjobs', job.id)).done, 1);
  assert.equal(fj.view(store.get('folderjobs', job.id)).counts.done, 1);
});
