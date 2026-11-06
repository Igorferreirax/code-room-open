import test from 'node:test';
import assert from 'node:assert/strict';
import { mdLite, assistantHtml } from '../public/assistant-ui.js';

test('markdown simples: escapa HTML da IA, aplica negrito, código e listas, sem links nem scripts', () => {
  const h = mdLite('Olá <script>alert(1)</script> **forte** e `cod`\n- um\n- dois\n\n```\n<b>x</b>\n```');
  assert.ok(!h.includes('<script>') && h.includes('&lt;script&gt;')); assert.ok(h.includes('<b>forte</b>') && h.includes('<code>cod</code>')); assert.match(h, /<ul><li>um<\/li><li>dois<\/li><\/ul>/); assert.ok(h.includes('<pre class="as-code">&lt;b&gt;x&lt;/b&gt;</pre>'));
  assert.ok(!/<a |onerror|href/.test(mdLite('[x](javascript:alert(1)) <img src=x onerror=alert(1)>')) || !/<img/.test(mdLite('<img src=x onerror=alert(1)>')));
});

const base = { manual: { available: true }, connected: ['claude', 'codex'], provider: 'claude', messages: [], briefed: true, stale: false, error: null, pending: null, briefing: null };
test('painel: cada estado mostra o certo (sem IA, sem apresentação, lendo, desatualizado, conversa, aguardando)', () => {
  assert.match(assistantHtml({ ...base, connected: [] }), /Nenhuma IA instalada/);
  assert.match(assistantHtml({ ...base, briefed: false }), /data-act="asst-brief"[^>]*>Apresentar o Code Room/); assert.match(assistantHtml({ ...base, briefed: false }), /não altera nada/);
  assert.match(assistantHtml({ ...base, briefing: { status: 'running' } }), /está lendo o manual/);
  assert.match(assistantHtml({ ...base, stale: true }), /O manual mudou[\s\S]*Apresentar de novo/);
  assert.match(assistantHtml(base), /asst-suggest/); assert.match(assistantHtml({ ...base, pending: { status: 'running' } }), /Pensando…[\s\S]*disabled/);
  assert.match(assistantHtml({ ...base, manual: { available: false } }), /não foi encontrado/);
});

test('cartões de ação: válida tem Criar e Descartar; inválida só explica; aplicada mostra o resultado', () => {
  const m = (a) => ({ ...base, messages: [{ id: 'm1', role: 'assistant', text: 'ok', at: '2026-01-01T10:00:00Z', actions: [a] }] });
  const ok = assistantHtml(m({ idx: 0, type: 'criar_equipe', valid: true, status: 'pending', summary: 'Criar a equipe “X”' }));
  assert.match(ok, /data-act="asst-apply" data-id="m1:0"[^>]*>Criar/); assert.match(ok, /asst-dismiss/);
  const bad = assistantHtml(m({ idx: 0, type: 'criar_equipe', valid: false, status: 'pending', summary: 'x', error: 'O agente “Y” não existe.' }));
  assert.ok(!bad.includes('asst-apply')); assert.match(bad, /não existe/);
  const done = assistantHtml(m({ idx: 0, type: 'criar_equipe', valid: true, status: 'applied', summary: 'x', result: 'Equipe criada.' }));
  assert.ok(!done.includes('asst-apply')); assert.match(done, /✔ Equipe criada/);
  assert.ok(!assistantHtml(m({ idx: 0, type: 'abrir_tela', valid: true, status: 'pending', summary: '<img src=x>' })).includes('<img src=x>'), 'resumo escapado');
});
