import test from 'node:test';
import assert from 'node:assert/strict';
import { paletteItems, filterItems } from '../public/palette.js';

test('paleta Ctrl+K: lista telas, projetos e terminais; a busca ignora acento e prioriza o começo do nome', () => {
  const items = paletteItems({ projects: [{ id: 'p1', name: 'Causo Sombrio', area: 'Vídeo' }], current: 'p1', pages: [['tasks', 'Tarefas'], ['settings', 'Configurações']], terminals: [['shell', 'PowerShell'], ['claude', 'Claude Code']] });
  assert.ok(items.some(i => i.run.go === 'tasks')); assert.ok(items.some(i => i.run.project === 'p1' && /em foco/.test(i.label))); assert.ok(items.some(i => i.run.term === 'claude'));
  assert.equal(filterItems(items, 'configuracoes')[0].run.go, 'settings');
  assert.equal(filterItems(items, 'causo')[0].run.project, 'p1');
  assert.equal(filterItems(items, 'terminal claude')[0].run.term, 'claude');
  assert.equal(filterItems(items, 'zzz').length, 0); assert.equal(filterItems(items, '').length, items.length);
});
