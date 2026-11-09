import test from 'node:test';
import assert from 'node:assert/strict';
import { viewSkills } from '../public/views2.js';

const skill = (name, over = {}) => ({ id: 'id-' + name, name, description: 'Descrição de ' + name, source: 'user', scope: 'user', path: '/x/' + name + '/SKILL.md', providers: ['claude'], dependencies: [], missingDependencies: [], missingReferences: [], preferred: true, ...over });
const base = (prefs, ui = {}) => ({ skills: [skill('alfa'), skill('beta'), skill('gama')], state: { agents: [] }, ui, skillPrefs: prefs });

test('skills: favoritas vêm primeiro e ganham estrela; escondidas saem da lista normal', () => {
  const h = viewSkills(base({ fav: ['gama'], hide: ['beta'] }));
  assert.ok(h.indexOf('gama') < h.indexOf('alfa'), 'favorita primeiro');
  assert.match(h, /class="star"/); assert.ok(!/<b>[^<]*beta<\/b>/.test(h), 'escondida não aparece');
  assert.match(h, /Favoritas \(1\)/); assert.match(h, /Escondidas \(1\)/); assert.match(h, /Todas \(2\)/);
});

test('skills: o filtro Escondidas mostra só as escondidas, com o botão de mostrar de novo; sem preferências nada muda', () => {
  const h = viewSkills(base({ fav: [], hide: ['beta'] }, { skillView: 'hidden', skillSel: 'id-beta' }));
  assert.match(h, /<b>beta<\/b>/); assert.ok(!/<b>alfa<\/b>/.test(h)); assert.match(h, /Mostrar de novo/);
  const n = viewSkills(base(undefined)); assert.match(n, /<b>alfa<\/b>/); assert.match(n, /Favoritar/); assert.match(n, /Todas \(3\)/);
});
