import test from 'node:test';
import assert from 'node:assert/strict';
import { simulateFlow } from '../server/simulate.mjs';
import { simHtml } from '../public/chat-ui.js';
import { setup, addProject, addAgent } from './helpers.mjs';

async function cenario(area = 'Geral') {
  const { store } = await setup(), pj = await addProject(store, 'sim', area);
  const dev = addAgent(store, 'dev', { provider: 'claude', mode: 'write', room: area === 'Financeiro' ? 'Financeiro' : 'Geral', commands: ['node', 'ffmpeg'], mcpTools: ['flow-studio'] }), rev = addAgent(store, 'rev', { provider: 'claude', mode: 'read', room: area === 'Financeiro' ? 'Financeiro' : 'Geral' });
  store.put('teams', { id: 'tm1', name: 'Eq', members: [{ role: 'desenvolvedor', agentId: dev.id }, { role: 'revisor', agentId: rev.id }] });
  return { store, pj, dev, rev };
}

test('simulação: equipe válida pode rodar, explica o que cada agente poderá fazer e NÃO cria tarefa nem fluxo', async () => {
  const { store, pj } = await cenario(), antes = [store.list('tasks').length, store.list('flows').length];
  const r = simulateFlow(store, { projectId: pj.id, teamId: 'tm1', objective: 'faça o vídeo' });
  assert.equal(r.ok, true); assert.deepEqual(r.problems, []); assert.deepEqual(r.tasks, { min: 2, max: 2 }); assert.equal(r.steps.length, 2);
  assert.match(r.steps[0].grants.join('|'), /edita arquivos.*roda programas: node, ffmpeg.*ferramentas MCP: flow-studio/); assert.match(r.steps[1].grants[0], /só lê/); assert.match(r.note, /nada foi criado/i);
  assert.deepEqual([store.list('tasks').length, store.list('flows').length], antes, 'nada foi gravado');
  assert.match(simulateFlow(store, { projectId: pj.id, teamId: 'tm1', objective: 'x', maxReviewRounds: 3 }).warnings.join(' '), /até 3 rodada\(s\) \(até 6 tarefas\)/);
});

test('simulação: aponta o que bloquearia (projeto, equipe, papéis, missão vazia, IA não instalada, regras do Financeiro) e avisa o que merece atenção', async () => {
  const { store, pj, dev, rev } = await cenario();
  assert.equal(simulateFlow(store, { projectId: 'x', teamId: 'y', objective: '' }).problems.length, 3);
  assert.match(simulateFlow(store, { projectId: pj.id, teamId: 'tm1', objective: '   ' }).problems[0], /Escreva a missão/); assert.match(simulateFlow(store, { projectId: pj.id, teamId: 'tm1', objective: 'x'.repeat(30001) }).problems[0], /30000/);
  store.put('teams', { id: 'tm2', name: 'Só dev', members: [{ role: 'desenvolvedor', agentId: dev.id }] }); assert.match(simulateFlow(store, { projectId: pj.id, teamId: 'tm2', objective: 'x' }).problems.join(' '), /revisor/);
  const sem = simulateFlow(store, { projectId: pj.id, teamId: 'tm1', objective: 'x' }, { installed: a => a.id !== rev.id }); assert.equal(sem.ok, false); assert.match(sem.problems[0], /Revisor “rev”: a IA deste agente \(claude\) não está instalada/);
  store.put('agents', { ...dev, mode: 'read', provider: 'codex' }); store.put('agents', { ...rev, mode: 'write' }); const w = simulateFlow(store, { projectId: pj.id, teamId: 'tm1', objective: 'x' }).warnings.join(' | ');
  assert.match(w, /desenvolvedor “dev” está em somente leitura/); assert.match(w, /revisor “rev” pode editar arquivos/); assert.match(w, /MCP liberado, mas isso só vale para o Claude/);
  store.put('teams', { id: 'tm3', name: 'Fantasma', members: [{ role: 'desenvolvedor', agentId: 'sumiu' }, { role: 'revisor', agentId: rev.id }] }); assert.match(simulateFlow(store, { projectId: pj.id, teamId: 'tm3', objective: 'x' }).problems.join(' '), /não existe mais/);
});

test('simulação: projeto Financeiro recusa agente com MCP, navegador, Hermes ou fora do ambiente Financeiro', async () => {
  const { store, pj, dev, rev } = await cenario('Financeiro');
  const r = simulateFlow(store, { projectId: pj.id, teamId: 'tm1', objective: 'x' }); assert.equal(r.ok, false); assert.match(r.problems.join(' '), /não aceita agente com ferramentas MCP/);
  store.put('agents', { ...dev, mcpTools: [], browser: 'isolado', room: 'Geral' }); store.put('agents', { ...rev, provider: 'hermes' });
  const t = simulateFlow(store, { projectId: pj.id, teamId: 'tm1', objective: 'x' }).problems.join(' | '); assert.match(t, /não é do ambiente Financeiro/); assert.match(t, /com navegador/); assert.match(t, /Hermes/);
});

test('tela da simulação: botão, resultado com problemas/avisos/permissões e escape de HTML', () => {
  assert.match(simHtml({}), /data-act="sim-flow"/); assert.match(simHtml({ sim: 'busy' }), /Conferindo/); assert.match(simHtml({ sim: { error: 'Falhou' } }), /role="alert">Falhou/);
  const h = simHtml({ sim: { ok: false, problems: ['Revisor “<b>x</b>”: IA ausente.'], warnings: ['Aviso'], steps: [{ role: 'desenvolvedor', agent: 'Dev', provider: 'claude', grants: ['edita arquivos'], issues: [] }], tasks: { min: 2, max: 4 }, note: 'Simulação: nada foi criado.' } });
  assert.match(h, /pill bad">Há problemas/); assert.match(h, /2 a 4/); assert.ok(!h.includes('<b>x</b>')); assert.match(h, /desenvolvedor: Dev/); assert.match(h, /edita arquivos/); assert.match(simHtml({ sim: { ok: true, problems: [], warnings: [], steps: [], tasks: { min: 2, max: 2 }, note: 'n' } }), /Pode rodar/);
});
