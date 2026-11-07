import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanEffort, cleanModel, effortsFor } from '../server/effort.mjs';
import { command } from '../server/connectors.mjs';
import { createTask } from '../server/tasks.mjs';
import { setup, addProject, addAgent, tempDir } from './helpers.mjs';

test('modelo e esforço: aceita opções válidas por provedor e rejeita valores inseguros ou incompatíveis', () => {
  assert.equal(cleanModel(' claude-sonnet-4-5 '), 'claude-sonnet-4-5');
  assert.equal(cleanModel(''), '');
  assert.throws(() => cleanModel('sonnet; del *'), /Modelo inválido/);
  assert.equal(cleanEffort('codex', ' XHIGH '), 'xhigh');
  assert.equal(cleanEffort('claude', 'max'), 'max');
  assert.equal(cleanEffort('agy', 'high'), 'high');
  assert.equal(cleanEffort('codex', ''), '');
  assert.throws(() => cleanEffort('codex', 'max'), /Esforço inválido/);
  assert.throws(() => cleanEffort('hermes', 'high'), /não tem ajuste/);
  assert.deepEqual(effortsFor('hermes'), []);
});

test('missão: modelo e esforço opcionais ficam no snapshot da tarefa sem alterar o agente', async () => {
  const { store } = await setup();
  const project = await addProject(store, 'mission-model');
  const agent = addAgent(store, 'codex-default', { model: 'codex-default-model', effort: 'medium' });
  const task = createTask(store, { projectId: project.id, agentId: agent.id, requestId: 'mission-override', objective: 'Use configuração especial', model: 'gpt-5-codex', effort: 'xhigh' }).task;
  assert.equal(task.agent.model, 'gpt-5-codex');
  assert.equal(task.agent.effort, 'xhigh');
  assert.equal(store.get('agents', agent.id).model, 'codex-default-model');
  assert.equal(store.get('agents', agent.id).effort, 'medium');
  const inherited = createTask(store, { projectId: project.id, agentId: agent.id, requestId: 'mission-inherited', objective: 'Use configuração do agente' }).task;
  assert.equal(inherited.agent.model, 'codex-default-model');
  assert.equal(inherited.agent.effort, 'medium');
  const nextOrder = store.get('settings', 'counter').n;
  assert.throws(() => createTask(store, { projectId: project.id, agentId: agent.id, requestId: 'bad-effort', objective: 'Inválido', effort: 'max' }), /Esforço inválido/);
  assert.equal(store.get('settings', 'counter').n, nextOrder, 'pedido inválido não avança o contador da fila');
});

test('conectores: traduz modelo e esforço em argumentos próprios de Codex, Claude Code e Antigravity', async () => {
  const bin = await tempDir('fake-clis'), oldPath = process.env.PATH;
  try {
    for (const id of ['codex', 'claude', 'agy']) writeFileSync(join(bin, process.platform === 'win32' ? `${id}.exe` : id), 'fake');
    process.env.PATH = `${bin}${process.platform === 'win32' ? ';' : ':'}${oldPath || ''}`;
    const cases = [
      ['codex', ['--model', 'gpt-5-codex'], ['-c', 'model_reasoning_effort="high"']],
      ['claude', ['--model', 'claude-sonnet-4-5'], ['--effort', 'high']],
      ['agy', ['--model', 'gemini-3-pro'], ['--effort', 'high']]
    ];
    for (const [provider, modelArgs, effortArgs] of cases) {
      const result = command({ provider, model: modelArgs[1], effort: 'high', mode: 'read' }, 'pedido de teste');
      for (const arg of [...modelArgs, ...effortArgs]) assert.ok(result.args.includes(arg), `${provider}: faltou argumento ${arg}`);
    }
  } finally {
    if (oldPath === undefined) delete process.env.PATH; else process.env.PATH = oldPath;
  }
});
