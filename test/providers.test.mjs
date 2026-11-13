import test from 'node:test';
import assert from 'node:assert/strict';
import { command, normalize, connectors } from '../server/connectors.mjs';
import { createTask } from '../server/tasks.mjs';
import { setup, addProject, addAgent } from './helpers.mjs';

test('Antigravity: o JSON final vira sessão, resposta e uso; falha vira erro', () => {
  const ok = normalize('agy', { conversation_id: 'c-1', status: 'SUCCESS', response: 'ok\n', usage: { input_tokens: 10, output_tokens: 2, thinking_tokens: 5, cache_read_tokens: 0 } });
  assert.deepEqual(ok.map(e => e.type), ['session', 'answer', 'usage']); assert.equal(ok[1].text, 'ok'); assert.equal(ok[2].usage.cost, null, 'custo nunca inventado');
  const bad = normalize('agy', { conversation_id: 'c-2', status: 'ERROR', response: 'falhou' }); assert.equal(bad.at(-1).type, 'error');
  const streamed = normalize('agy', { event: 'result', result: { conversation_id: 'c-3', status: 'SUCCESS', response: 'feito' } });
  assert.deepEqual(streamed.map(e => e.type), ['session', 'answer']); assert.equal(streamed[1].text, 'feito');
  assert.equal(normalize('agy', { event: 'init', session: 'x' }), null);
  assert.equal(normalize('agy', { foo: 1 }), null);
});

test('Hermes: o evento init traz sessão e modelo; resposta e erro são lidos de forma tolerante', () => {
  assert.deepEqual(normalize('hermes', { type: 'system', subtype: 'init', model: 'm', session_id: 's1' }), { type: 'session', text: 's1', model: 'm' });
  assert.equal(normalize('hermes', { type: 'result', result: ' feito ' }).text, 'feito');
  assert.equal(normalize('hermes', { type: 'result', is_error: true, result: 'x' }).type, 'error');
  assert.equal(normalize('hermes', { type: 'assistant', message: { content: [{ type: 'text', text: 'oi' }] } }).text, 'oi');
  assert.equal(normalize('hermes', { type: 'tool', foo: 1 }), null);
});

test('comandos: Antigravity e Hermes recebem o prompt pela entrada padrão, sem shell', () => {
  const have = id => connectors().find(c => c.id === id)?.path;
  {
    const catalog = [{ id: 'agy', path: 'C:/fake/agy.exe' }], long = 'a'.repeat(40000);
    const r = command({ provider: 'agy', mode: 'read', model: '' }, long, { cwd: 'C:/p', timeoutMs: 60000, resumeId: 'c-9', catalog });
    assert.ok(r.args.includes('plan') && r.args.includes('--conversation') && r.args.includes('c-9') && r.args.includes('C:/p'));
    assert.equal(r.args[r.args.indexOf('--output-format') + 1], 'stream-json');
    assert.equal(r.args[r.args.indexOf('--input-format') + 1], 'stream-json');
    assert.ok(!r.args.join(' ').includes(long), 'pedido longo não entra nos argumentos');
    assert.ok(JSON.parse(r.input).message.content.endsWith(long));
    assert.ok(command({ provider: 'agy', mode: 'write', model: '' }, 'x', { catalog }).args.includes('accept-edits'));
  }
  if (have('hermes')) {
    const secret = `aspas "assim" e $(isso) e 'outra'\ncom quebra`, r = command({ provider: 'hermes', mode: 'read', model: '' }, secret, { timeoutMs: 120000 });
    assert.equal(r.input, secret, 'o prompt segue pela entrada padrão');
    assert.ok(!r.args.join(' ').includes('aspas'), 'o prompt nunca entra na linha de comando');
    assert.ok(r.args.some(a => /chat --query-file - --oneshot -Q --format stream-json/.test(a)));
  }
});

test('pasta extra autorizada entra só na execução e no provedor escolhido', () => {
  const catalog = ['codex', 'claude', 'agy'].map(id => ({ id, path: `C:/fake/${id}.exe` }));
  for (const provider of ['codex', 'claude', 'agy']) {
    const args = command({ provider, mode: 'write', model: '' }, 'ler e editar', { cwd: 'C:/projeto', extraDir: 'C:/extra', catalog }).args;
    assert.ok(args.some((arg, i) => arg === '--add-dir' && args[i + 1] === 'C:/extra'));
    assert.ok(!command({ provider, mode: 'write', model: '' }, 'sem acesso extra', { cwd: 'C:/projeto', catalog }).args.includes('C:/extra'));
  }
  assert.throws(() => command({ provider: 'codex', mode: 'write' }, 'x', { cwd: 'C:/projeto', extraDir: 'C:/extra', resumeId: 'sessao', catalog }), /tarefa nova/);
});

test('tarefa individual valida pasta extra, modo leitura e projeto financeiro', async () => {
  const { store } = await setup(), project = await addProject(store, 'extra-individual');
  const agent = addAgent(store, 'leitor-extra', { mode: 'read', provider: 'codex' });
  const extraDir = new URL('.', import.meta.url).pathname;
  const path = process.platform === 'win32' ? decodeURIComponent(extraDir).replace(/^\//, '') : decodeURIComponent(extraDir);
  const accepted = createTask(store, { projectId: project.id, agentId: agent.id, requestId: 'extra-ok', objective: 'Ler pasta', extraDir: path }).task;
  assert.ok(accepted.extraDir.endsWith('test'));
  assert.equal(createTask(store, { projectId: project.id, agentId: agent.id, requestId: 'extra-sem', objective: 'Só projeto' }).task.extraDir, null);
  assert.throws(() => createTask(store, { projectId: project.id, agentId: agent.id, requestId: 'extra-falta', objective: 'Ler', extraDir: 'C:/nao-existe' }), /não existe/);
  const finance = await addProject(store, 'extra-financeiro', 'Financeiro');
  assert.throws(() => createTask(store, { projectId: finance.id, agentId: agent.id, requestId: 'extra-fin', objective: 'Ler', extraDir: path }), /financeiros/);
});

test('Hermes (remoto): projeto financeiro é recusado e o agente precisa ser somente leitura', async () => {
  const { store } = await setup(); const F = await addProject(store, 'fin', 'Financeiro'), G = await addProject(store, 'geral');
  const h = addAgent(store, 'hm', { provider: 'hermes', room: 'Financeiro' });
  assert.throws(() => createTask(store, { projectId: F.id, agentId: h.id, requestId: 'f1', objective: 'x' }), /remoto|Hermes/);
  assert.ok(createTask(store, { projectId: G.id, agentId: h.id, requestId: 'g1', objective: 'x' }).task);
});
