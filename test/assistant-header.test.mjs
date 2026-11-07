import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPrompt as taskPrompt } from '../server/context.mjs';
import { AGY_BUDGET } from '../server/assistant.mjs';

test('Assistente: o contexto do projeto interno nunca entra no prompt, então o Antigravity não estoura o limite', async () => {
  const task = { objective: 'x'.repeat(AGY_BUDGET), criteria: [], inputs: [], project: { id: 'assistant-internal', name: 'Assistente (interno)', path: 'C:/x', area: 'Geral' } };
  const ctx = { deliverables: Array.from({ length: 20 }, (_, i) => ({ summary: 'resposta longa '.repeat(30), files: [], at: i })), notes: '', decisions: [] };
  const { prompt } = await taskPrompt({ task, agent: { name: 'Assistente', role: 'Ajuda', instructions: '', provider: 'agy', room: 'Assistente' }, projectContext: ctx, skills: [], handoffs: [], workRoot: 'C:/x' });
  assert.ok(!prompt.includes('Entregas recentes'));
  assert.ok(prompt.length < 28000 - 1000, `prompt ${prompt.length}`);
});
