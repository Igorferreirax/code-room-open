import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, addProject, addAgent } from './helpers.mjs';
import { createTask } from '../server/tasks.mjs';
import { command } from '../server/connectors.mjs';
import { panelRoutine, ROUTINE_TEMPLATES } from '../public/views2.js';
import { sentHtml } from '../public/chat-ui.js';

test('pesquisar na web: só entra nos argumentos do Claude quando o agente liga a opção; Codex não recebe', () => {
  const off = command({ provider: 'claude', mode: 'read' }, 'oi').args; assert.ok(!off.includes('WebSearch'));
  const on = command({ provider: 'claude', mode: 'read', web: true }, 'oi').args;
  assert.deepEqual([on[on.indexOf('WebSearch') - 1], on[on.indexOf('WebFetch') - 1]], ['--allowedTools', '--allowedTools']);
  assert.ok(!command({ provider: 'codex', mode: 'read', web: true }, 'oi').args.includes('WebSearch'));
});

test('pesquisar na web: projeto Financeiro recusa o agente', async () => {
  const { store } = await setup(); const fin = await addProject(store, 'fin', 'Financeiro'), ag = addAgent(store, 'pesq', { provider: 'claude', web: true, room: 'Financeiro' });
  assert.throws(() => createTask(store, { projectId: fin.id, agentId: ag.id, requestId: 'r-web', objective: 'x' }), /pesquisa na web/);
});

const base = (over = {}) => ({ project: 'p1', state: { routines: [], agents: [{ id: 'a1', name: 'Pesquisador', role: 'Notícias' }], teams: [{ id: 't1', name: 'Dupla' }], recipes: [], projects: [{ id: 'p1', name: 'Achadinhos' }, { id: 'p2', name: 'Outro' }], runs: [] }, ui: {}, ...over });

test('painel de rotina: modelos versáteis aparecem em rotina nova; rascunho de um pedido vem preenchido (diário 08:00, equipe e projeto certos)', () => {
  assert.ok(ROUTINE_TEMPLATES.length >= 4); const h = panelRoutine(base());
  for (const x of ROUTINE_TEMPLATES) assert.ok(h.includes(`data-id="${x.id}"`), x.id); assert.match(h, /name="time" value="08:00"/); assert.match(h, /Nova rotina/);
  const d = panelRoutine(base({ ui: { routineDraft: { fromTask: true, name: 'Vagas de dev', objective: 'Pesquise vagas <b>', projectId: 'p2', target: 't:t1', time: '08:00' } } }));
  assert.match(d, /Repetir todo dia/); assert.match(d, /value="Vagas de dev"/); assert.match(d, /<option value="p2" selected>/); assert.match(d, /<option value="t:t1" selected>/); assert.ok(!d.includes('vagas <b>'), 'objetivo escapado'); assert.match(d, /Entregas/);
});

test('“Você pediu” oferece repetir todo dia, com a chave do alvo e o índice do pedido', () => {
  const h = sentHtml({ ui: { sent: { 'a:a1': [{ text: 'Notícias de IA', at: new Date().toISOString(), taskId: 't9' }] } }, state: { runs: [] } }, 'a:a1');
  assert.match(h, /data-act="routine-from-sent" data-id="a:a1" data-i="0"/);
});
