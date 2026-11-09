import test from 'node:test';
import assert from 'node:assert/strict';
import { obsidianCardHtml } from '../public/obsidian-ui.js';
import { buildPrompt } from '../server/context.mjs';

const o = (over = {}) => ({ enabled: true, vault: 'C:\Cofre', exclude: ['Privado'], byProject: { p1: 'Marca' }, maxNotes: 5, allowWrite: false, writeFolder: 'Code Room', check: { ok: true, notes: 12, sample: ['a.md', 'b/c.md'] }, ...over });
const ctx = (obsidian, extra = {}) => ({ obsidian, ui: {}, state: { projects: [{ id: 'p1', name: 'Achadinhos', area: 'Vídeo' }, { id: 'p2', name: 'Contas', area: 'Financeiro' }] }, ...extra });

test('cartão do Obsidian: padrão "Só ler", escolha explícita de alimentar, projetos financeiros fora da lista e HTML escapado', () => {
  assert.equal(obsidianCardHtml({ ui: {} }), '');
  const h = obsidianCardHtml(ctx(o())); assert.match(h, /Ligado · só lê/); assert.match(h, /name="obs-mode" value="read" checked/); assert.match(h, /Permitir alimentar o Obsidian/); assert.match(h, /12 notas/);
  assert.match(h, /data-obs-proj="p1" value="Marca"/); assert.ok(!h.includes('data-obs-proj="p2"'), 'financeiro não tem pasta no cofre'); assert.match(h, /Projetos <b>Financeiro<\/b> nunca recebem notas/);
  const w = obsidianCardHtml(ctx(o({ allowWrite: true }))); assert.match(w, /Ligado · lê e alimenta/); assert.match(w, /value="write" checked/);
  assert.match(obsidianCardHtml(ctx(o({ enabled: false, check: null }))), /Desligado/); assert.match(obsidianCardHtml(ctx(o({ check: { ok: false, error: 'Esta pasta não parece um cofre' } }))), /role="alert"[^>]*>Esta pasta não parece um cofre/);
  assert.ok(!obsidianCardHtml(ctx(o({ vault: '"><script>x</script>' }))).includes('<script>'));
  const pv = obsidianCardHtml(ctx(o(), { obsPreview: { chars: 300, notes: [{ title: '<b>Tom</b>', rel: 'm/t.md', excerpt: 'texto '.repeat(60) }] } })); assert.ok(!pv.includes('<b>Tom</b>')); assert.match(pv, /300 caracteres/); assert.match(pv, /…/);
  assert.match(obsidianCardHtml(ctx(o(), { obsPreview: { chars: 0, notes: [] } })), /o agente não recebe nada do Obsidian/);
});

test('prompt da tarefa: o bloco do Obsidian entra depois do contexto do projeto e antes do papel; sem bloco, nada muda', async () => {
  const task = { objective: 'Faça X', criteria: [], inputs: [], project: { id: 'p', name: 'P', path: 'C:/p', area: 'Vídeo' } }, agent = { name: 'A', role: 'R', provider: 'claude', room: 'Vídeo', instructions: '' };
  const base = await buildPrompt({ task, agent, projectContext: null, skills: [], handoffs: [] }), com = await buildPrompt({ task, agent, projectContext: null, skills: [], handoffs: [], extra: '# Referências do Obsidian da pessoa (somente leitura)\n- Nota' });
  assert.ok(!base.prompt.includes('Obsidian')); assert.ok(com.prompt.indexOf('# Referências do Obsidian') > com.prompt.indexOf('# Regras do Code Room') && com.prompt.indexOf('# Referências do Obsidian') < com.prompt.indexOf('# Papel: A'));
});
