import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanMini, addMini, miniBodyHtml, MAX_MINI } from '../public/minichat.js';

const agents = [{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }, { id: 'a4' }, { id: 'a5' }];

test('janelas extras: no máximo 3, sem repetir, só agentes que existem', () => {
  assert.equal(MAX_MINI, 3);
  assert.deepEqual(cleanMini(['a1', 'a1', 'a2', 'sumiu', 7, null], agents), ['a1', 'a2']);
  assert.deepEqual(cleanMini(['a1', 'a2', 'a3', 'a4'], agents), ['a2', 'a3', 'a4'], 'passou do limite: ficam as 3 mais recentes');
  assert.deepEqual(cleanMini(undefined, agents), []); assert.deepEqual(cleanMini('a1', agents), []); assert.deepEqual(cleanMini(['a1'], undefined), []);
});

test('janelas extras: abrir uma que já existe não duplica e a mais antiga sai quando passa do limite', () => {
  assert.deepEqual(addMini(['a1', 'a2'], 'a3'), ['a1', 'a2', 'a3']);
  assert.deepEqual(addMini(['a1', 'a2', 'a3'], 'a4'), ['a2', 'a3', 'a4']);
  assert.deepEqual(addMini(['a1', 'a2'], 'a1'), ['a2', 'a1'], 'reabrir move para o fim, sem repetir');
  assert.deepEqual(addMini(undefined, 'a1'), ['a1']);
});

test('janelas extras: corpo mostra convite quando não há tarefa e a sessão ao vivo quando há', () => {
  assert.match(miniBodyHtml(null), /Sem atividade ainda/);
  const html = miniBodyHtml({ id: 't1', status: 'running', agent: { name: 'Ana' }, prompt: 'faça <b>X</b>', events: [], answer: '' });
  assert.match(html, /Ao vivo/); assert.ok(!html.includes('<b>X</b>'), 'texto escapado');
});
