import test from 'node:test';
import assert from 'node:assert/strict';
import { Recipes, cleanRecipe } from '../server/recipes.mjs';
import { transition } from '../server/tasks.mjs';
import { setup, addProject, addAgent } from './helpers.mjs';

const step = (o = {}) => ({ type: 'agent', title: 'Roteiro', agentId: 'a1', prompt: 'Escreva o roteiro', ...o });
const finish = (store, taskId, to = 'completed', patch = {}) => { const t = store.get('tasks', taskId); transition(store, t, 'running'); transition(store, store.get('tasks', taskId), to, patch); };

test('receita: valida passos, projeto e agente', async () => {
  const { store } = await setup(); const p = await addProject(store, 'rc'); addAgent(store, 'a1');
  assert.throws(() => cleanRecipe(store, { name: 'x', steps: [] }), /1 a 8 passos/);
  assert.throws(() => cleanRecipe(store, { name: 'x', steps: [step()] }), /projeto/);
  assert.throws(() => cleanRecipe(store, { name: 'x', projectId: p.id, steps: [step({ agentId: 'nao' })] }), /escolha um agente/);
  const ok = cleanRecipe(store, { name: 'Vídeo', kind: 'video', projectId: p.id, steps: [step(), { type: 'manual', title: 'Editar por fora' }] });
  assert.equal(ok.steps[1].approval, true, 'passo seu sempre espera por você');
  assert.equal(ok.steps[1].agentId, null);
});

test('receita: anda passo a passo, espera a sua aprovação e o seu passo manual', async () => {
  const { store } = await setup(); const p = await addProject(store, 'rc2'); addAgent(store, 'a1');
  const rec = new Recipes(store);
  const r = rec.save({ name: 'Vídeo', kind: 'video', projectId: p.id, steps: [step(), { type: 'manual', title: 'Editar por fora' }, step({ title: 'Revisar', prompt: 'Revise', approval: true })] });
  let run = rec.start(r.id, { objective: 'EP 10' });
  assert.equal(run.status, 'running'); assert.equal(run.steps[0].status, 'running');
  const t1 = store.get('tasks', run.steps[0].taskId); assert.match(t1.objective, /EP 10/);
  finish(store, t1.id, 'completed', { result: { summary: 'roteiro pronto' } });
  run = store.get('recipeRuns', run.id);
  assert.equal(run.status, 'waiting', 'chegou no passo manual'); assert.equal(run.steps[0].result, 'roteiro pronto'); assert.equal(run.i, 1);
  run = rec.approve(run.id);
  assert.equal(run.steps[1].status, 'done'); assert.equal(run.status, 'waiting', 'o passo de revisão pede aprovação antes');
  assert.equal(run.steps[2].taskId, null, 'ainda não criou a tarefa');
  run = rec.approve(run.id); assert.equal(run.steps[2].status, 'running');
  const t3 = store.get('tasks', run.steps[2].taskId); assert.match(t3.objective, /roteiro pronto/, 'recebe o resultado do passo anterior com agente');
  finish(store, t3.id, 'completed', { result: { summary: 'ok' } });
  assert.equal(store.get('recipeRuns', run.id).status, 'done');
  assert.throws(() => rec.approve(run.id), /não está esperando/);
});

test('receita: falha de um passo para a rodada e cancelar encerra', async () => {
  const { store } = await setup(); const p = await addProject(store, 'rc3'); addAgent(store, 'a1');
  const rec = new Recipes(store);
  const r = rec.save({ name: 'X', projectId: p.id, steps: [step(), step({ title: 'Depois' })] });
  const run = rec.start(r.id, { objective: 'o' });
  finish(store, run.steps[0].taskId, 'failed', { error: 'quebrou' });
  const f = store.get('recipeRuns', run.id); assert.equal(f.status, 'failed'); assert.equal(f.steps[0].result, 'quebrou'); assert.equal(f.steps[1].taskId, null);
  assert.equal(rec.cancel(run.id).status, 'cancelled');
  assert.throws(() => rec.start(r.id, {}), /obrigatório/);
});
