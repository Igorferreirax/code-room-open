import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, addProject, addAgent } from './helpers.mjs';
import { usageReport, suggest, applySuggestions, undoEconomy, tokenBudget } from '../server/economy.mjs';
import { economyCardHtml } from '../public/economy-ui.js';

const nowIso = () => new Date().toISOString();
function usedTask(store, project, agent, id, usage, over = {}) {
  return store.put('tasks', { id, requestId: id, kind: 'work', status: 'completed', project: { id: project.id, name: project.name }, agent: { id: agent.id, name: agent.name, provider: agent.provider, model: agent.model }, objective: 'x', createdAt: nowIso(), updatedAt: nowIso(), usage, attempts: [], ...over });
}

test('relatório: soma entrada + saída (sem cache), por agente, projeto e dia; tarefa sem uso informado não conta', async () => {
  const { store } = await setup(), p = await addProject(store, 'yt'), a = addAgent(store, 'a1', { name: 'Pesquisador', provider: 'claude', model: 'opus' });
  usedTask(store, p, a, 't1', { input: 1000, output: 200, cached: 9999 }); usedTask(store, p, a, 't2', { input: 3000, output: 100 }); usedTask(store, p, a, 't3', null);
  const r = usageReport(store); assert.equal(r.total, 4300); assert.equal(r.today, 4300); assert.equal(r.withUsage, 2); assert.equal(r.agents[0].runs, 2); assert.equal(r.agents[0].avgInput, 2000); assert.equal(r.projects[0].tokens, 4300); assert.equal(r.perDay.length, 1);
});

test('Codex: a entrada inclui o cache, então só o que não veio do cache conta; no Claude o cache já é separado', async () => {
  const { store } = await setup(), p = await addProject(store, 'yt'), cx = addAgent(store, 'cx', { name: 'Montador', provider: 'codex' }), cl = addAgent(store, 'cl', { name: 'Pesq', provider: 'claude' });
  usedTask(store, p, cx, 'x', { input: 600000, output: 4000, cached: 590000 }); usedTask(store, p, cl, 'y', { input: 10, output: 500, cached: 90000 });
  const r = usageReport(store); assert.equal(r.agents.find(a => a.agentId === 'cx').tokens, 14000); assert.equal(r.agents.find(a => a.agentId === 'cl').tokens, 510); assert.equal(r.total, 14510);
});

test('sugestões: Opus em agente simples, esforço alto sem necessidade, contexto grande; quem revisa fica como está; limite do Claude alto sugere Codex só para quem apenas lê', async () => {
  const { store } = await setup(), p = await addProject(store, 'yt');
  const simples = addAgent(store, 'simples', { name: 'Pesquisador', provider: 'claude', model: 'claude-opus-4', effort: 'high', mode: 'read' });
  addAgent(store, 'rev', { name: 'Revisor de Código', provider: 'claude', model: 'opus', effort: 'max' });
  const leitor = addAgent(store, 'leitor', { name: 'Leitor', provider: 'claude', model: '', mode: 'read' }); addAgent(store, 'tools', { name: 'Baixador', provider: 'claude', mode: 'read', commands: ['yt-dlp'] });
  usedTask(store, p, simples, 'a', { input: 80000, output: 300 }); usedTask(store, p, leitor, 'b', { input: 100, output: 50 }); usedTask(store, p, leitor, 'c', { input: 100, output: 50 });
  const s = suggest(store, { connected: new Set(['claude', 'codex']), claudeWindows: [{ usedPercent: 90 }] }), ids = s.map(x => x.id);
  assert.ok(ids.includes('simples:model') && ids.includes('simples:effort') && ids.includes('simples:info') && ids.includes('leitor:model'));
  assert.ok(!ids.some(i => i.startsWith('rev:')), 'revisor mantém o modelo forte'); assert.ok(ids.includes('leitor:provider') && ids.includes('simples:provider') && !ids.includes('tools:provider'), 'agente com programa liberado não muda de IA');
  assert.equal(s.find(x => x.id === 'leitor:provider').risky, true); assert.equal(s.find(x => x.id === 'simples:info').patch, null);
  assert.ok(!suggest(store, { connected: new Set(['claude']), claudeWindows: [{ usedPercent: 90 }] }).some(x => x.kind === 'provider'), 'sem Codex instalado não sugere');
  assert.ok(!suggest(store, { connected: new Set(['codex']), claudeWindows: [{ usedPercent: 10 }] }).some(x => x.kind === 'provider'));
});

test('aplicar e desfazer: só o que está no plano atual, guarda o anterior, revisão sobe, Assistente é ignorado', async () => {
  const { store } = await setup(); addAgent(store, 'ag', { name: 'Resumidor', provider: 'claude', model: 'opus', effort: 'high' }); addAgent(store, 'assistant-claude', { name: 'Assistente', provider: 'claude', model: 'opus' });
  const ctx = { connected: new Set(['claude']), claudeWindows: [] };
  assert.throws(() => applySuggestions(store, [], ctx), /pelo menos uma/); assert.throws(() => applySuggestions(store, ['inventada:model'], ctx), /não valem mais/); assert.throws(() => applySuggestions(store, ['assistant-claude:model'], ctx), /não valem mais/);
  const r = applySuggestions(store, ['ag:model', 'ag:effort'], ctx); assert.equal(r.applied, 2); const a = store.get('agents', 'ag'); assert.equal(a.model, 'sonnet'); assert.equal(a.effort, 'medium'); assert.equal(a.revision, 3);
  const u = undoEconomy(store); assert.equal(u.restored, 1); const b = store.get('agents', 'ag'); assert.equal(b.model, 'opus'); assert.equal(b.effort, 'high'); assert.throws(() => undoEconomy(store), /nada para desfazer/i);
});

test('teto diário de tokens: só conta hoje, avisa em 80% e trava em 100% (o runner para de iniciar tarefas)', async () => {
  const { store, runner } = await setup(), p = await addProject(store, 'yt'), a = addAgent(store, 'a1', { name: 'A', provider: 'claude' });
  assert.deepEqual(tokenBudget(store), { enabled: false, limit: null, used: 0, warn: false, reached: false });
  usedTask(store, p, a, 'hoje', { input: 8000, output: 1000 }); usedTask(store, p, a, 'ontem', { input: 99999, output: 1 }, { updatedAt: new Date(Date.now() - 2 * 864e5).toISOString() });
  store.put('settings', { id: 'limits', timeoutMs: 1200000, budgetDays: 30, budgetTokens: 10000, budgetTokensEnabled: true });
  const t = tokenBudget(store); assert.equal(t.used, 9000); assert.equal(t.warn, true); assert.equal(t.reached, false);
  store.put('settings', { id: 'limits', timeoutMs: 1200000, budgetDays: 30, budgetTokens: 9000, budgetTokensEnabled: true }); assert.equal(runner.budget().tokens.reached, true);
  store.put('settings', { id: 'limits', timeoutMs: 1200000, budgetDays: 30, budgetTokens: 9000, budgetTokensEnabled: false }); assert.equal(runner.budget().tokens.reached, false, 'desligado nunca trava');
});

test('cartão: barras por agente, sugestões marcáveis (a de outra IA vem desmarcada), teto com aviso, HTML escapado', () => {
  assert.equal(economyCardHtml({}), '');
  const e = { report: { days: 30, total: 5000, today: 900, withUsage: 3, agents: [{ agentId: 'a', name: '<b>Ag</b>', provider: 'claude', model: 'opus', runs: 2, tokens: 5000, avgInput: 2000, avgOutput: 500 }], projects: [{ name: 'P', tokens: 5000 }], perDay: [{ day: '2026-11-09', tokens: 5000 }] },
    suggestions: [{ id: 'a:model', agentId: 'a', kind: 'model', text: 'Use Sonnet', patch: { model: 'sonnet' }, risky: false }, { id: 'a:provider', agentId: 'a', kind: 'provider', text: 'Mude', patch: { provider: 'codex' }, risky: true }, { id: 'a:info', kind: 'info', text: 'Contexto grande', patch: null }], canUndo: true, budget: { enabled: true, limit: 10000, used: 8500, warn: true, reached: false } };
  const h = economyCardHtml({ economy: e }); assert.ok(!h.includes('<b>Ag</b>')); assert.match(h, /value="a:model" checked/); assert.match(h, /value="a:provider" >/); assert.ok(!h.includes('value="a:info"')); assert.match(h, /Aplicar as marcadas/); assert.match(h, /Desfazer/); assert.match(h, /Mais de 80%/);
  assert.match(economyCardHtml({ economy: { ...e, budget: { ...e.budget, used: 10000, reached: true } } }), /Teto atingido/);
});
