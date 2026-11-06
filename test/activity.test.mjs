import test from 'node:test';
import assert from 'node:assert/strict';
import { ago, activityEvents, agentTip, activityCardHtml } from '../public/activity.js';
import { skillCategory, skillState } from '../public/views2.js';

const NOW = Date.parse('2026-11-07T12:00:00Z'), iso = min => new Date(NOW - min * 60000).toISOString();
const run = (id, agent, status, min, extra = {}) => ({ id, status, agent: { id: agent, name: agent.toUpperCase() }, project: { id: 'p1', name: 'Canal' }, prompt: `tarefa ${id}`, createdAt: iso(min + 1), updatedAt: iso(min), deliverables: [], reason: null, ...extra });
const ctx = runs => ({ project: 'p1', state: { runs } });

test('tempo relativo: agora, minutos, horas e dias, sem inventar para datas inválidas', () => {
  assert.equal(ago(10000), 'agora há pouco'); assert.equal(ago(5 * 60000), 'há 5 min'); assert.equal(ago(3 * 3600000), 'há 3 h'); assert.equal(ago(24 * 3600000), 'há 1 dia'); assert.equal(ago(3 * 86400000), 'há 3 dias'); assert.equal(ago(null), ''); assert.equal(ago(NaN), '');
});

test('linha do tempo: do mais novo ao mais antigo, só do projeto, filtra por agente e respeita o limite', () => {
  const c = ctx([run('a', 'dev', 'completed', 30), run('b', 'rev', 'running', 2), run('c', 'dev', 'failed', 10, { reason: 'sem login' }), { ...run('d', 'dev', 'completed', 1), project: { id: 'outro', name: 'Outro' } }]);
  assert.deepEqual(activityEvents(c, { now: NOW }).map(e => e.id), ['b', 'c', 'a']); assert.deepEqual(activityEvents(c, { agentId: 'dev', now: NOW }).map(e => e.id), ['c', 'a']); assert.equal(activityEvents(c, { limit: 1, now: NOW }).length, 1);
  assert.equal(activityEvents(c, { now: NOW })[0].ago, 'há 2 min');
});

test('dica do agente: o que faz agora, o que espera, a última coisa feita (com o motivo da falha) ou nada', () => {
  const dev = { id: 'dev', name: 'Dev', role: 'Escreve' };
  assert.match(agentTip(ctx([run('a', 'dev', 'running', 2)]), dev, NOW), /Agora: trabalhando em “tarefa a”/);
  assert.match(agentTip(ctx([run('a', 'dev', 'waiting_dependency', 2)]), dev, NOW), /Esperando: “tarefa a”/);
  assert.match(agentTip(ctx([run('a', 'dev', 'failed', 20, { reason: 'sem login no Codex' })]), dev, NOW), /Última atividade há 20 min: falhou em “tarefa a” — sem login no Codex/);
  assert.match(agentTip(ctx([run('a', 'dev', 'completed', 5, { deliverables: [{ path: 'x' }, { path: 'y' }] })]), dev, NOW), /2 arquivo\(s\) na última entrega/);
  assert.match(agentTip(ctx([]), dev, NOW), /Sem atividade ainda/);
});

test('cartão de atividade: lista com ação de abrir a tarefa, tempo e escape de HTML; vazio explica', () => {
  const c = ctx([run('a', 'dev', 'completed', 5, { prompt: '<img src=x onerror=1>', deliverables: [{ path: 'v.mp4' }] })]);
  const h = activityCardHtml(c, { now: NOW }); assert.ok(!h.includes('<img src=x')); assert.match(h, /data-act="task" data-id="a"/); assert.match(h, /1 arquivo\(s\)/);
  assert.match(activityCardHtml(ctx([])), /Nada aconteceu neste projeto ainda/);
});

test('categorias de skills e estado: vídeo, código, marketing, pesquisa, texto, design e outras; apoio ausente não vira aviso', () => {
  const k = (name, description = '') => skillCategory({ name, description });
  assert.equal(k('editar-video'), 'video'); assert.equal(k('hyperframes'), 'video'); assert.equal(k('firebase-basics'), 'codigo'); assert.equal(k('seo-audit'), 'marketing'); assert.equal(k('copywriting'), 'marketing');
  assert.equal(k('customer-research'), 'pesquisa'); assert.equal(k('docx', 'Cria documentos Word'), 'texto'); assert.equal(k('figma', 'design'), 'design'); assert.equal(k('zzz', 'nada a ver'), 'outros');
  const base = { missingDependencies: [], recognized: true, missingReferences: ['../../tools/REGISTRY.md'] };
  assert.deepEqual(skillState(base), ['ok', 'Compatível']); assert.equal(skillState({ ...base, recognized: false })[0], 'warn'); assert.equal(skillState({ ...base, missingDependencies: ['x: y'] })[0], 'bad');
});
