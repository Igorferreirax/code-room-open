import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSubtasks, proposeSubtasks, approveSubtask, dismissSubtask } from '../server/subtasks.mjs';
import { approvalItems, approvalHtml } from '../public/approval-cards.js';
import { pendingList } from '../public/views.js';
import { buildPrompt } from '../server/context.mjs';
import { setup, addProject, addAgent, task, waitFor } from './helpers.mjs';

const bloco = j => '```code-room-subtask\n' + JSON.stringify(j) + '\n```';

test('leitura do bloco: só JSON válido, no máximo 3 por resposta, ignora lixo', () => {
  assert.deepEqual(parseSubtasks('Pronto.\n' + bloco({ agente: 'Revisor', objetivo: 'Revise X' })), [{ agente: 'Revisor', objetivo: 'Revise X' }]);
  assert.equal(parseSubtasks([1, 2, 3, 4, 5].map(i => bloco({ agente: 'A' + i, objetivo: 'o' })).join('\n')).length, 3);
  assert.deepEqual(parseSubtasks('```code-room-subtask\nnão é json\n```\n```code-room-subtask\n[1,2]\n```\nsem bloco'), []); assert.deepEqual(parseSubtasks(''), []);
});

test('pedido de ajuda: só vira PEDIDO (não roda sozinho), valida agente e objetivo, não duplica e só para tarefas concluídas', async () => {
  const { store } = await setup(), P = await addProject(store, 'sub1'), A = addAgent(store, 'dev', { mode: 'write' }), B = addAgent(store, 'rev', { role: 'Revisor' });
  store.put('agents', { ...store.get('agents', B.id), name: 'Revisor de Código' });
  const t = { id: 'tk1', kind: 'work', status: 'completed', project: { id: P.id, name: P.name }, agent: { id: A.id, name: 'dev' } };
  const r = proposeSubtasks(store, t, 'feito\n' + bloco({ agente: 'revisor de código', objetivo: 'Revise o script' }) + '\n' + bloco({ agente: 'dev', objetivo: 'a mim mesmo' }) + '\n' + bloco({ agente: 'Inexistente', objetivo: 'x' }) + '\n' + bloco({ agente: 'Revisor de Código', objetivo: '' }));
  assert.equal(r.length, 1); assert.equal(r[0].status, 'proposed'); assert.equal(r[0].agentName, 'Revisor de Código'); assert.equal(store.list('tasks').length, 0, 'nenhuma tarefa nasceu');
  assert.equal(proposeSubtasks(store, t, bloco({ agente: 'Revisor de Código', objetivo: 'Revise o script' })).length, 0, 'não duplica');
  assert.equal(proposeSubtasks(store, { ...t, status: 'failed' }, bloco({ agente: 'Revisor de Código', objetivo: 'outro' })).length, 0, 'só tarefa concluída'); assert.equal(proposeSubtasks(store, { ...t, project: { id: 'assistant-internal' } }, bloco({ agente: 'Revisor de Código', objetivo: 'outro' })).length, 0);
});

test('aprovar cria a tarefa filha (parentTaskId, profundidade) com a passagem de contexto e ela roda; descartar encerra; limites de delegação valem', async () => {
  const { store, runner, orchestrator } = await setup({ concurrency: { global: 2, provider: { codex: 2, claude: 1 }, video: 1 } }), P = await addProject(store, 'sub2'), A = addAgent(store, 'dev', { mode: 'write', role: 'Dev' }), B = addAgent(store, 'rev', { role: 'Revisor' });
  const pai = task(store, P, A, 'write=out/a.txt:oi answer=Preciso_de_revisão'); await runner.pump(); await waitFor(() => store.get('tasks', pai.id).status === 'completed', 20000, 'pai');
  const ps = proposeSubtasks(store, store.get('tasks', pai.id), 'Preciso de revisão.\n' + bloco({ agente: 'rev', objetivo: 'Revise out/a.txt' })); assert.equal(ps.length, 1);
  const filha = approveSubtask(store, orchestrator, ps[0].id); await runner.pump(); await waitFor(() => store.get('tasks', filha.id).status === 'completed', 20000, 'filha');
  const f = store.get('tasks', filha.id); assert.equal(f.parentTaskId, pai.id); assert.equal(f.depth, 1); assert.equal(f.agent.id, B.id); assert.match(f.objective, /Pedido: Revise out\/a\.txt/);
  assert.equal(store.get('subtasks', ps[0].id).status, 'approved'); assert.equal(store.get('subtasks', ps[0].id).taskId, filha.id);
  const msg = store.list('messages').find(m => m.toTask === filha.id); assert.equal(msg.fromTask, pai.id); assert.deepEqual(msg.files.map(x => x.path), ['out/a.txt']);
  assert.throws(() => approveSubtask(store, orchestrator, ps[0].id), /já foi tratado/); assert.throws(() => approveSubtask(store, orchestrator, 'inexistente'), /não encontrado/);
  const p2 = proposeSubtasks(store, store.get('tasks', pai.id), bloco({ agente: 'rev', objetivo: 'outro pedido' }))[0]; assert.equal(dismissSubtask(store, p2.id).status, 'dismissed'); assert.throws(() => dismissSubtask(store, p2.id), /já foi tratado/);
});

test('a tarefa concluída propõe sozinha (gancho do orquestrador) e nada roda antes da aprovação', async () => {
  const { store, runner } = await setup(), P = await addProject(store, 'sub3'), A = addAgent(store, 'dev'), B = addAgent(store, 'rev');
  const t = task(store, P, A, 'answer=ok\n' + 'x'); store.put('tasks', { ...store.get('tasks', t.id), objective: `[[fake answerfile=${await mkAnswer(bloco({ agente: 'rev', objetivo: 'Revise por favor' }))}]] faça` }); await runner.pump();
  await waitFor(() => store.get('tasks', t.id).status === 'completed', 20000, 'tarefa'); await new Promise(r => setTimeout(r, 300));
  assert.equal(store.list('subtasks').length, 1); assert.equal(store.list('subtasks')[0].status, 'proposed'); assert.equal(store.list('tasks').length, 1, 'o outro agente não foi acionado');
});

test('chat e "Precisa de você": o pedido aparece como cartão com Aprovar/Descartar e conta nas pendências; o prompt dos agentes ensina o bloco', async () => {
  const st = { subtasks: [{ id: 'st1', status: 'proposed', projectId: 'p1', fromAgent: 'Dev <b>', agentName: 'Revisor', objective: 'Revise <i>x</i>' }, { id: 'st2', status: 'proposed', projectId: 'p9', fromAgent: 'A', agentName: 'B', objective: 'outro' }, { id: 'st3', status: 'approved', projectId: 'p1' }], runs: [], batches: [], agents: [] };
  const c = { project: 'p1', ui: {}, cardMedia: {}, state: st }; assert.deepEqual(approvalItems(c).map(i => i.key), ['sb:st1']);
  const h = approvalHtml(c); assert.match(h, /data-act="ap-sub-approve" data-id="st1"/); assert.match(h, /data-act="ap-sub-dismiss"/); assert.match(h, /Pedido de ajuda entre agentes/); assert.ok(!h.includes('Dev <b>') && !h.includes('<i>x</i>'), 'texto do agente escapado');
  assert.equal(pendingList({ ...c, state: st }).find(i => /pedido.* de ajuda/.test(i.text)).n, 1);
  const { prompt } = await buildPrompt({ task: { objective: 'x', criteria: [], inputs: [], project: { id: 'p', name: 'P', path: 'C:/p', area: 'Geral' } }, agent: { name: 'A', role: 'R', provider: 'claude', room: 'Geral' }, projectContext: null, skills: [], handoffs: [] });
  assert.match(prompt, /code-room-subtask/); assert.match(prompt, /A pessoa decide se o pedido vira tarefa/);
});

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tempDir } from './helpers.mjs';
async function mkAnswer(text) { const f = join(await tempDir('ans'), 'resposta.txt'); await writeFile(f, text, 'utf8'); return f.split('\\').join('/'); }
