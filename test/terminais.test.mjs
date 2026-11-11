import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { viewRoom, topbarHtml, agentTerm, termLinesHtml } from '../public/views.js';

// Modo "Terminais" da Sala: um painel só de leitura por agente, com a saída recente da tarefa dele neste projeto.
const a = { id: 'a1', name: 'Ana', role: 'Dev', provider: 'codex', mode: 'write', room: 'Geral', skillIds: [], capabilities: [] };
const b = { id: 'a2', name: 'Beto', role: 'Revisão', provider: 'claude', mode: 'read', room: 'Geral', skillIds: [], capabilities: [] };
const run = { id: 't1', kind: 'work', status: 'running', project: { id: 'p1', name: 'Projeto' }, agent: a, prompt: 'Criar a tela', createdAt: '2026-11-10T10:00:00Z', updatedAt: '2026-11-10T10:00:00Z', deliverables: [] };
const fake = (mode, term = {}) => ({ project: 'p1', maxStations: 3, term, state: { projects: [{ id: 'p1', name: 'Projeto', agentIds: [a.id, b.id] }], agents: [a, b], teams: [], runs: [run], plans: [], runtime: {} },
  roomAgents: () => [a, b], supervisorAgent: () => null, rooms: () => [], roomMode: () => '@projeto', projectAgentIds: () => new Set([a.id, b.id]), viewMode: () => mode, termTask: x => (x.id === a.id ? run : null),
  agentStatus: x => ({ status: x.id === a.id ? 'running' : 'idle', label: x.id === a.id ? 'Trabalhando' : 'Livre' }), usageTotals: () => ({ input: 0, inCount: 0, cost: 0, costCount: 0 }), currentMission: () => null });

test('Sala oferece o modo Terminais e desenha um painel por agente, sem vazar HTML da saída', () => {
  const html = viewRoom(fake('term', { t1: { html: termLinesHtml({ prompt: 'Criar a tela', status: 'running', lines: [{ type: 'activity', text: 'lendo <b>index.html</b>' }, { type: 'error', text: 'falhou' }] }) } }));
  assert.match(html, /data-act="view-mode" data-id="term" aria-pressed="true">Terminais/);
  assert.equal((html.match(/class="term"/g) || []).length, 2, 'um painel por agente');
  assert.match(html, /class="term-out" data-task="t1"/); assert.match(html, /\$ Criar a tela/);
  assert.match(html, /lendo &lt;b&gt;index\.html&lt;\/b&gt;/, 'a saída do agente é escapada'); assert.match(html, /class="tl-error">falhou/);
  assert.match(html, /Nenhuma tarefa deste agente neste projeto ainda/, 'agente sem tarefa no projeto não mostra saída de outro projeto');
  assert.match(agentTerm(fake('term'), a), /Carregando a saída/);
  assert.match(termLinesHtml({ prompt: 'x', status: 'queued', lines: [] }), /Na fila/);
  assert.doesNotMatch(viewRoom(fake('term')), /data-id="list"/, 'a Lista saiu: Terminais ficou no lugar');
});

test('o seletor de projeto do topo tem “Todos os projetos (geral)” e o marca quando não há projeto em foco', () => {
  const html = topbarHtml({ project: '', prefs: {}, ui: {}, agentStatus: () => ({ status: 'idle' }), state: { projects: [{ id: 'p1', name: 'Projeto' }], agents: [], notices: [], runs: [], runtime: {} } });
  assert.match(html, /<option value="" selected>Todos os projetos \(geral\)<\/option>/);
});

test('GET /api/tasks/:id/tail devolve poucas linhas curtas e 404 para tarefa inexistente', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'code-room-tail-')); const port = 19000 + Math.floor(Math.random() * 10000);
  const child = spawn(process.execPath, ['server/main.mjs'], { cwd: resolve('.'), env: { ...process.env, CODE_ROOM_DATA: dir, CODE_ROOM_PORT: String(port), CODE_ROOM_NO_OPEN: '1' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await Promise.race([once(child.stdout, 'data'), new Promise((_, reject) => setTimeout(() => reject(new Error('Servidor não iniciou')), 8000))]);
    const key = (await readFile(join(dir, 'access.key'), 'utf8')).trim(), base = `http://127.0.0.1:${port}`, headers = { 'X-Code-Room-Key': key, 'Content-Type': 'application/json' };
    const post = async (path, body) => (await fetch(base + path, { method: 'POST', headers, body: JSON.stringify(body) })).json();
    assert.equal((await fetch(base + '/api/tasks/nao-existe/tail', { headers })).status, 404);
    assert.equal((await fetch(base + '/api/tasks/nao-existe/tail')).status, 401, 'exige a chave como as outras rotas');
    const gone = await mkdtemp(join(tmpdir(), 'code-room-gone-')); const p = await post('/api/projects', { name: 'Sumiu', path: gone }); await rm(gone, { recursive: true, force: true });
    const ag = await post('/api/agents', { name: 'Caio', role: 'Teste', room: 'Geral', provider: 'codex', model: '', mode: 'read', skillIds: [] });
    const t = await post('/api/tasks', { projectId: p.id, agentId: ag.id, requestId: 'tail-1', objective: 'tarefa de teste do terminal ' + 'x'.repeat(400) });
    const id = t.task?.id || t.id; assert.ok(id, JSON.stringify(t).slice(0, 200));
    const tail = await (await fetch(`${base}/api/tasks/${id}/tail`, { headers })).json();
    assert.equal(tail.id, id); assert.ok(tail.prompt.length <= 200); assert.ok(Array.isArray(tail.lines) && tail.lines.length <= 40);
    assert.deepEqual(Object.keys(tail).sort(), ['id', 'lines', 'prompt', 'reason', 'status'], 'não devolve resposta completa, arquivos nem tentativas');
  } finally { const closed = once(child, 'close'); child.kill(); await closed; await rm(dir, { recursive: true, force: true }); }
});
