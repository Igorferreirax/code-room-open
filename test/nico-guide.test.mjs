import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldGreet, helloHtml, PATHS, GUIDE_TOUR, placeNear, AWAY_DAYS } from '../public/nico-guide.js';

test('Nico guia: aparece na instalação nova e na volta depois de muitos dias; quem já configurou não vê de novo', () => {
  assert.equal(shouldGreet({}, Date.now(), true), 'first');
  assert.equal(shouldGreet({ setupDone: true }, Date.now(), true), '', 'já configurou');
  assert.equal(shouldGreet({}, Date.now(), false), '', 'já tem agentes ou projetos');
  assert.equal(shouldGreet({ helloSeen: true, lastSeen: new Date(Date.now() - (AWAY_DAYS + 1) * 864e5).toISOString() }), 'back');
  assert.equal(shouldGreet({ helloSeen: true, lastSeen: new Date().toISOString() }), '');
});

test('Nico guia: pergunta o que fazer, oferece caminhos e Pular; ao escolher, explica para onde vai; balão do tour fica na tela', () => {
  const h = helloHtml({ reason: 'first' }, { name: '<b>Ana</b>' });
  assert.match(h, /O que vamos fazer hoje\?/); assert.ok(!h.includes('<b>Ana</b>')); assert.equal((h.match(/data-act="ng-path"/g) || []).length, PATHS.length); assert.match(h, /data-act="ng-skip"/);
  const v = helloHtml({ reason: 'first', path: 'video' }); assert.match(v, /data-act="ng-go"/); assert.match(v, /vídeo/);
  assert.match(helloHtml({ reason: 'back' }), /Que bom te ver de volta/);
  for (const s of PATHS) assert.ok(s.ask.length > 40 && s.view, s.id); assert.ok(GUIDE_TOUR.length >= 6);
  const p = placeNear({ left: 1300, right: 1340, top: 700, bottom: 740, width: 40, height: 40 }, { width: 360, height: 160 }, { width: 1366, height: 768 });
  assert.ok(p.x >= 12 && p.x + 360 <= 1366 && p.y >= 12 && p.y + 160 <= 768, JSON.stringify(p));
});
