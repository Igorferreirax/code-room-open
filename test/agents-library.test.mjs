import test from 'node:test';
import assert from 'node:assert/strict';
import { AGENT_LIBRARY, listAgentLibrary, hireLibraryAgent } from '../server/agents-library.mjs';
import { KNOWN_CAPABILITIES } from '../server/supervisor.mjs';

const mem = () => { const t = { agents: new Map(), projects: new Map() }; return { list: k => [...t[k].values()], get: (k, id) => t[k].get(id) || null, put: (k, v) => { t[k].set(v.id, v); return v; } }; };
const save = store => b => store.put('agents', { id: 'ag-' + (store.list('agents').length + 1), ...b });

test('biblioteca de agentes: pelo menos 10 especialistas válidos, com o de segurança em somente leitura', () => {
  assert.ok(AGENT_LIBRARY.length >= 10);
  assert.equal(new Set(AGENT_LIBRARY.map(a => a.id)).size, AGENT_LIBRARY.length); assert.equal(new Set(AGENT_LIBRARY.map(a => a.name)).size, AGENT_LIBRARY.length);
  for (const a of AGENT_LIBRARY) {
    assert.ok(['read', 'write'].includes(a.mode), a.id); assert.ok(a.capabilities.every(c => KNOWN_CAPABILITIES.includes(c)), a.id);
    assert.ok(a.name.length <= 100 && a.role.length <= 200 && a.instructions.length > 200 && a.instructions.length < 4000 && a.description.length > 30, a.id);
    for (const key of ['commands', 'mcpTools', 'browser', 'web', 'pilot']) assert.equal(a[key], undefined, `${a.id} não pode vir com ${key} ligado`);
  }
  const sec = AGENT_LIBRARY.find(a => a.id === 'seguranca'); assert.equal(sec.mode, 'read'); assert.match(sec.instructions, /portas/); assert.match(sec.instructions, /Não ataque/);
});

test('contratar cria o agente, traz para o projeto e não duplica', () => {
  const store = mem(); store.put('projects', { id: 'p1', name: 'Loja', agentIds: ['x'] });
  const r = hireLibraryAgent(store, save(store), { id: 'seguranca', provider: 'claude', projectId: 'p1' });
  assert.equal(r.agent.name, 'Auditor de segurança'); assert.equal(r.agent.provider, 'claude'); assert.equal(r.agent.mode, 'read'); assert.deepEqual(r.agent.skillIds, []);
  assert.deepEqual(store.get('projects', 'p1').agentIds, ['x', r.agent.id]);
  assert.equal(listAgentLibrary(store).find(a => a.id === 'seguranca').hired, true); assert.equal(listAgentLibrary(store).find(a => a.id === 'revisor').hired, false);
  assert.equal(listAgentLibrary(store)[0].instructions, undefined, 'a lista manda só uma prévia das instruções');
  assert.throws(() => hireLibraryAgent(store, save(store), { id: 'seguranca', provider: 'claude' }), /já tem um agente/);
  assert.throws(() => hireLibraryAgent(store, save(store), { id: 'nao-existe', provider: 'claude' }), /não encontrado/);
  assert.throws(() => hireLibraryAgent(store, save(store), { id: 'revisor', provider: 'claude', projectId: 'sumiu' }), /Projeto não encontrado/);
  assert.equal(store.list('agents').length, 1, 'erro não deixa agente pela metade');
  assert.equal(hireLibraryAgent(store, save(store), { id: 'revisor', provider: 'codex' }).projectId, null);
});
