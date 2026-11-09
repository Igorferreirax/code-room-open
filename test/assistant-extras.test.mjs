import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Store } from '../server/store.mjs';
import { Assistant } from '../server/assistant.mjs';
import { assistantHtml } from '../public/assistant-ui.js';
import { sentHtml, targetBodyHtml } from '../public/chat-ui.js';
import { tempDir } from './helpers.mjs';

const world = async () => ({ agents: [], teams: [], links: [], projects: [], skills: [], connected: new Set(['claude']), runs: [], flows: [], folderJobs: [] });
async function make(extra = {}) {
  const dir = await tempDir('asst-extra'), store = new Store(':memory:'), tasks = [];
  const asst = new Assistant({ store, root: process.cwd(), dataDir: dir, world, createTaskFn: (_s, t) => { tasks.push(t); const task = { id: 't1', currentAttemptId: 'att1', status: 'running', ...t }; store.put('tasks', task); return { task }; }, ...extra });
  store.put('settings', { id: 'assistant', provider: 'claude', briefedAt: 'x', manualHash: null, knowledge: 'ok', thread: { id: 't1', title: 'C' }, order: ['t1'], others: [], messages: [], pending: null });
  return { asst, store, tasks, dir };
}

test('Assistente usa o Obsidian: só ligado, só trechos, nunca com projeto Financeiro em foco', async () => {
  const { asst, store, tasks, dir } = await make(), v = join(dir, 'cofre'); await mkdir(join(v, '.obsidian'), { recursive: true }); await writeFile(join(v, 'Tom de voz achadinhos.md'), 'Fale direto, preço em destaque.', 'utf8');
  store.put('projects', { id: 'pj', name: 'Achadinhos', path: dir, area: 'Vídeo' }); store.put('projects', { id: 'pf', name: 'Contas', path: dir, area: 'Financeiro' });
  await asst.ask('escreva a legenda dos achadinhos', { projectId: 'pj' }); assert.doesNotMatch(tasks[0].objective, /Referências do Obsidian/, 'desligado: nada');
  store.put('settings', { id: 'obsidian', enabled: true, vault: v, exclude: [], byProject: {}, maxNotes: 5, allowWrite: false, writeFolder: 'Code Room' });
  store.put('settings', { ...store.get('settings', 'assistant'), pending: null }); await asst.ask('escreva a legenda dos achadinhos', { projectId: 'pj' });
  assert.match(tasks[1].objective, /Referências do Obsidian da pessoa/); assert.match(tasks[1].objective, /Tom de voz achadinhos/); assert.ok(tasks[1].objective.length < 30000);
  store.put('settings', { ...store.get('settings', 'assistant'), pending: null }); await asst.ask('escreva a legenda dos achadinhos', { projectId: 'pf' }); assert.doesNotMatch(tasks[2].objective, /Referências do Obsidian/, 'Financeiro nunca recebe');
});

test('piloto: o status do chat traz a última ferramenta usada pela IA (atividade ao vivo)', async () => {
  const { asst, store } = await make(); await asst.ask('faça algo');
  assert.equal((await asst.status()).pending.activity, '');
  store.event('att1', { type: 'status', text: 'running' }); store.event('att1', { type: 'activity', text: 'Bash, Read' }); store.event('att1', { type: 'answer', text: 'parcial' });
  assert.equal((await asst.status()).pending.activity, 'Bash, Read');
});

test('chat: aviso do piloto fora do Claude e atividade ao vivo no balão "Pensando…"', () => {
  const base = { connected: ['claude', 'codex'], manual: { available: true }, briefed: true, messages: [], alerts: [], autonomy: 'pilot' };
  assert.doesNotMatch(assistantHtml({ ...base, provider: 'claude' }), /não usa MCP/); assert.match(assistantHtml({ ...base, provider: 'agy' }), /não usa MCP nem o Chrome/);
  assert.match(assistantHtml({ ...base, provider: 'claude', pending: { status: 'running', activity: 'Bash <b>x</b>' } }), /as-act">⚙ Bash &lt;b&gt;x&lt;\/b&gt;/); assert.doesNotMatch(assistantHtml({ ...base, provider: 'claude', pending: { status: 'queued' } }), /as-act/);
});

test('chat: missão enviada a uma equipe aparece com o texto e o andamento (e some quando não há nada)', () => {
  const runs = [{ id: 'r1', flowId: 'f1', status: 'running', agent: { name: 'Desenvolvedor' } }, { id: 'r2', flowId: 'f1', status: 'waiting_dependency', agent: { name: 'Revisor' } }, { id: 'r3', flowId: 'f2', status: 'interrupted', agent: { name: 'Dev' } }, { id: 'r4', flowId: 'f3', status: 'completed', agent: { name: 'Dev' } }];
  const at = '2026-11-09T12:00:00.000Z', sent = { 't:1': [{ text: 'Crie <b>a equipe</b>', at, flowId: 'f1' }, { text: 'outra', at, flowId: 'f2' }, { text: 'ok', at, flowId: 'f3' }, { text: 'recém enviada', at, flowId: 'f9' }] };
  const h = sentHtml({ ui: { sent }, state: { runs } }, 't:1');
  assert.ok(!h.includes('<b>a equipe</b>'), 'texto escapado'); assert.match(h, /Em andamento: Desenvolvedor/); assert.match(h, /Parou: abra para ver o motivo/); assert.match(h, /Concluída/); assert.match(h, /· Enviada/); assert.match(h, /data-act="task" data-id="r1"/);
  assert.equal(sentHtml({ ui: { sent }, state: { runs } }, 't:outra'), ''); assert.equal(sentHtml({ ui: {}, state: { runs } }, 't:1'), '');
  const body = targetBodyHtml({ ui: { target: 't:1', sent }, state: { runs, agents: [], teams: [{ id: '1', name: 'Eq', members: [] }] }, prefs: {}, supervisorAgent: () => null, agentStatus: () => ({ label: '' }) });
  assert.match(body, /Você pediu/); assert.match(body, /Missão direta/);
});

import { buildPrompt, loadManual, TASK_BUDGET, screenLine } from '../server/assistant.mjs';
test('prompt real (estado enorme, histórico cheio, manual de 20 KB): tela e notas do Obsidian sobrevivem ao corte e o total cabe no limite da tarefa', () => {
  const manual = loadManual(process.cwd()).text, history = Array.from({ length: 12 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: 'h'.repeat(1500) }));
  const extras = [screenLine('Tela: Entregas · Projeto: Achadinhos · Entrega aberta: “Reel”').trim(), '# Referências do Obsidian da pessoa (somente leitura)\n- Status do projeto (SOFTWARE/CODE-ROOM/status.md)\n  ' + 'x'.repeat(3000)].join('\n');
  const out = buildPrompt({ manual, knowledge: 'K'.repeat(6000), summary: 'S'.repeat(20000), history, memory: 'm'.repeat(3000), question: 'Q'.repeat(2000), max: TASK_BUDGET, extras });
  assert.ok(out.length <= 30000, `prompt com ${out.length}`); assert.match(out, /TELA ABERTA AGORA[^\n]*Entrega aberta: “Reel”/); assert.match(out, /Referências do Obsidian da pessoa/); assert.ok(out.indexOf('CONTEXTO EXTRA') < out.indexOf('=== PERGUNTA DA PESSOA ==='));
  assert.doesNotMatch(buildPrompt({ manual: 'm', knowledge: '', summary: 's', question: 'q' }), /CONTEXTO EXTRA/, 'sem extras, nada muda');
});
