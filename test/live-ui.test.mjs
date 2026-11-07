import test from 'node:test';
import assert from 'node:assert/strict';
import { liveTaskOf, liveRows, liveHtml, ACTIVE } from '../public/live-ui.js';

const T = (id, status, at, extra = {}) => ({ id, status, updatedAt: at, createdAt: at, agent: { id: 'a1', name: 'Ana' }, project: { id: 'p1' }, prompt: 'faça X', ...extra });

test('ao vivo: escolhe a tarefa que está rodando; senão a mais recente do agente; ignora tarefas internas do Assistente', () => {
  const runs = [T('velha', 'completed', '2026-11-07T10:00:00Z'), T('rodando', 'running', '2026-11-07T11:00:00Z'), T('nova-pronta', 'completed', '2026-11-07T12:00:00Z'), T('outro-agente', 'running', '2026-11-07T12:30:00Z', { agent: { id: 'a2', name: 'Beto' } }), T('interna', 'running', '2026-11-07T13:00:00Z', { project: { id: 'assistant-internal' } })];
  assert.equal(liveTaskOf(runs, 'a1').id, 'rodando', 'a que roda agora vence a mais nova que já terminou');
  assert.equal(liveTaskOf(runs.filter(t => t.id !== 'rodando'), 'a1').id, 'nova-pronta');
  assert.equal(liveTaskOf(runs, 'a9'), null); assert.equal(liveTaskOf([], 'a1'), null); assert.equal(liveTaskOf(undefined, 'a1'), null);
  assert.ok(ACTIVE.has('queued') && ACTIVE.has('running') && !ACTIVE.has('completed'));
});

test('ao vivo: linhas só com o que importa (sem uso, sessão e contexto), cortadas e na ordem', () => {
  const ev = [{ type: 'context', text: 'Prompt de 900 caracteres' }, { type: 'session', text: 'abc' }, { type: 'status', text: 'running', at: '2026-11-07T12:00:01Z' },
    { type: 'activity', text: 'npm test\nlinha 2 da saída\nlinha 3', at: '2026-11-07T12:00:02Z' }, { type: 'answer', text: 'Estou lendo os arquivos' }, { type: 'usage', text: '{}' },
    { type: 'diagnostic', text: 'Executando em worktree isolado' }, { type: 'error', text: 'x'.repeat(300) }, { type: 'activity', text: '   ' }];
  const rows = liveRows(ev);
  assert.deepEqual(rows.map(r => r.kind), ['status', 'activity', 'answer', 'diag', 'error']);
  assert.equal(rows[0].text, 'Estado: trabalhando'); assert.equal(rows[1].text, 'npm test', 'só a primeira linha do comando'); assert.ok(rows[4].text.length <= 160 && rows[4].text.endsWith('…'));
  assert.equal(liveRows(Array.from({ length: 40 }, (_, i) => ({ type: 'answer', text: 'm' + i }))).length, 14, 'só as últimas 14');
  assert.deepEqual(liveRows(undefined), []);
});

test('ao vivo: HTML mostra estado, Parar só quando está ativa, resposta e motivo da falha; texto da IA nunca vira HTML', () => {
  const run = liveHtml(T('t1', 'running', '2026-11-07T12:00:00Z', { events: [{ type: 'activity', text: '<img src=x onerror=alert(1)>' }, { type: 'answer', text: 'ok' }], answer: 'Parcial <b>x</b>' }));
  assert.match(run, /Ao vivo/); assert.match(run, /trabalhando/); assert.match(run, /data-act="cancel" data-id="t1"/); assert.match(run, /aria-live="polite"/);
  assert.ok(!run.includes('<img') && !run.includes('<b>x</b>'), 'tudo escapado'); assert.match(run, /&lt;img/); assert.match(run, /<details class="live-answer" open>/);
  const done = liveHtml(T('t2', 'completed', '2026-11-07T12:00:00Z', { events: [], answer: 'Pronto' }));
  assert.match(done, /Última tarefa/); assert.ok(!done.includes('data-act="cancel"')); assert.match(done, /data-act="task" data-id="t2"/); assert.match(done, /Ainda sem movimento/); assert.ok(!done.includes('aria-live'));
  const bad = liveHtml(T('t3', 'failed', '2026-11-07T12:00:00Z', { events: [], reason: 'Provedor não instalado.' }));
  assert.match(bad, /role="alert"[^>]*>Provedor não instalado\./); assert.match(bad, /falhou/);
  assert.equal(liveHtml(null), '');
  assert.match(liveHtml(T('t4', 'completed', 'x', { answer: 'a'.repeat(5000) })), /…a{100}/, 'resposta enorme é cortada pelo fim');
});
