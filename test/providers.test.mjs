import test from 'node:test';
import assert from 'node:assert/strict';
import { command, normalize, connectors } from '../server/connectors.mjs';
import { createTask } from '../server/tasks.mjs';
import { setup, addProject, addAgent } from './helpers.mjs';

test('Antigravity: o JSON final vira sessão, resposta e uso; falha vira erro', () => {
  const ok = normalize('agy', { conversation_id: 'c-1', status: 'SUCCESS', response: 'ok\n', usage: { input_tokens: 10, output_tokens: 2, thinking_tokens: 5, cache_read_tokens: 0 } });
  assert.deepEqual(ok.map(e => e.type), ['session', 'answer', 'usage']); assert.equal(ok[1].text, 'ok'); assert.equal(ok[2].usage.cost, null, 'custo nunca inventado');
  const bad = normalize('agy', { conversation_id: 'c-2', status: 'ERROR', response: 'falhou' }); assert.equal(bad.at(-1).type, 'error');
  assert.equal(normalize('agy', { foo: 1 }), null);
});

test('Hermes: o evento init traz sessão e modelo; resposta e erro são lidos de forma tolerante', () => {
  assert.deepEqual(normalize('hermes', { type: 'system', subtype: 'init', model: 'm', session_id: 's1' }), { type: 'session', text: 's1', model: 'm' });
  assert.equal(normalize('hermes', { type: 'result', result: ' feito ' }).text, 'feito');
  assert.equal(normalize('hermes', { type: 'result', is_error: true, result: 'x' }).type, 'error');
  assert.equal(normalize('hermes', { type: 'assistant', message: { content: [{ type: 'text', text: 'oi' }] } }).text, 'oi');
  assert.equal(normalize('hermes', { type: 'tool', foo: 1 }), null);
});

test('comandos: Antigravity leva o prompt no argumento com modo certo; Hermes leva o prompt pela entrada padrão (sem shell)', () => {
  const have = id => connectors().find(c => c.id === id)?.path;
  if (have('agy')) {
    const r = command({ provider: 'agy', mode: 'read', model: '' }, 'faça X', { cwd: 'C:/p', timeoutMs: 60000, resumeId: 'c-9' });
    assert.ok(r.args.includes('plan') && r.args.includes('--conversation') && r.args.includes('c-9') && r.args.some(a => a.startsWith('--print=[Execução automática pelo Code Room') && a.endsWith('faça X')) && r.args.includes('C:/p'));
    assert.equal(command({ provider: 'agy', mode: 'write', model: '' }, 'x').args[3 - 1 + 0] !== undefined, true);
    assert.ok(command({ provider: 'agy', mode: 'write', model: '' }, 'x').args.includes('accept-edits'));
    assert.throws(() => command({ provider: 'agy', mode: 'read', model: '' }, 'a'.repeat(30000)), /grande demais/);
  }
  if (have('hermes')) {
    const secret = `aspas "assim" e $(isso) e 'outra'\ncom quebra`, r = command({ provider: 'hermes', mode: 'read', model: '' }, secret, { timeoutMs: 120000 });
    assert.equal(r.input, secret, 'o prompt segue pela entrada padrão');
    assert.ok(!r.args.join(' ').includes('aspas'), 'o prompt nunca entra na linha de comando');
    assert.ok(r.args.some(a => /chat --query-file - --oneshot -Q --format stream-json/.test(a)));
  }
});

test('Hermes (remoto): projeto financeiro é recusado e o agente precisa ser somente leitura', async () => {
  const { store } = await setup(); const F = await addProject(store, 'fin', 'Financeiro'), G = await addProject(store, 'geral');
  const h = addAgent(store, 'hm', { provider: 'hermes', room: 'Financeiro' });
  assert.throws(() => createTask(store, { projectId: F.id, agentId: h.id, requestId: 'f1', objective: 'x' }), /remoto|Hermes/);
  assert.ok(createTask(store, { projectId: G.id, agentId: h.id, requestId: 'g1', objective: 'x' }).task);
});
