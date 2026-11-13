import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setup, addProject, addAgent, waitFor } from './helpers.mjs';
import { createTask } from '../server/tasks.mjs';
import { changesDialog } from '../public/views2.js';

test('pasta extra autorizada: registra arquivo e diff sem misturar com entregas do projeto', async () => {
  const extraDir = await mkdtemp(join(process.cwd(), 'test', '.extra-review-'));
  try {
    const script = `const fs=require('node:fs'); fs.writeFileSync(process.argv[1], 'texto <script>'); for (const e of [{type:'thread.started',thread_id:'s1'},{type:'item.completed',item:{type:'agent_message',text:'feito'}},{type:'turn.completed',usage:{input_tokens:1,output_tokens:1}}]) console.log(JSON.stringify(e));`;
    const { store, runner } = await setup({ runnerOpts: { buildCommand: (_agent, _prompt, options) => ({ file: process.execPath, args: ['-e', script, join(options.extraDir, 'externo.txt')], input: '' }) } });
    const project = await addProject(store, 'projeto-review'), agent = addAgent(store, 'editor-review', { mode: 'write' });
    const task = createTask(store, { projectId: project.id, agentId: agent.id, requestId: 'review-extra', objective: 'Crie um texto na pasta autorizada', extraDir }).task;
    await runner.pump();
    await waitFor(() => store.get('tasks', task.id).status === 'completed', 10000, 'tarefa externa');
    const result = store.get('tasks', task.id).result;
    assert.equal(await readFile(join(extraDir, 'externo.txt'), 'utf8'), 'texto <script>');
    assert.deepEqual(result.deliverables.files, []);
    assert.equal(result.externalDeliverables.available, true);
    assert.equal(result.externalDeliverables.files[0].path, 'externo.txt');
    assert.match(result.externalDeliverables.files[0].diff, /\+texto <script>/);
    const html = changesDialog({}, { extraDir, deliverables: result.deliverables, result });
    assert.match(html, /Pasta extra autorizada/);
    assert.match(html, /&lt;script&gt;/);
    assert.doesNotMatch(html, /<script>/);
  } finally { await rm(extraDir, { recursive: true, force: true }); }
});

test('pasta extra grande demais falha antes de iniciar a CLI', async () => {
  const extraDir = await mkdtemp(join(process.cwd(), 'test', '.extra-limit-'));
  try {
    await Promise.all(Array.from({ length: 5001 }, (_, i) => writeFile(join(extraDir, `f-${String(i).padStart(4, '0')}.txt`), '')));
    const sentinel = join(extraDir, 'cli-iniciou.txt');
    const { store, runner } = await setup({ runnerOpts: { buildCommand: () => ({ file: process.execPath, args: ['-e', `require('node:fs').writeFileSync(process.argv[1], 'rodou')`, sentinel], input: '' }) } });
    const project = await addProject(store, 'projeto-limit'), agent = addAgent(store, 'editor-limit', { mode: 'write' });
    const task = createTask(store, { projectId: project.id, agentId: agent.id, requestId: 'limit-extra', objective: 'Tarefa que não pode iniciar', extraDir }).task;
    await runner.pump();
    await waitFor(() => store.get('tasks', task.id).status === 'failed', 60000, 'pasta grande');
    const result = store.get('tasks', task.id);
    assert.equal(result.failureKind, 'external_snapshot_unavailable');
    assert.match(result.reason, /5\.000 arquivos/);
    await assert.rejects(readFile(sentinel), { code: 'ENOENT' });
  } finally { await rm(extraDir, { recursive: true, force: true }); }
});
