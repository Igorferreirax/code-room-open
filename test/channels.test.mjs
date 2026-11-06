import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../server/store.mjs';
import { saveChannel, removeChannel, postadorAgent } from '../server/channels.mjs';

test('canal: valida campos, limpa @ dos perfis, limita posts por dia e edita sem duplicar', () => {
  const store = new Store(':memory:');
  assert.throws(() => saveChannel(store, {}), /Nome obrigatório/);
  const a = saveChannel(store, { name: 'Causo Sombrio', style: 'vhs', niche: 'terror e folclore', youtube: '@causosombrio', instagram: 'causo.sombrio', tiktok: '@causo<script>', perDay: 99 });
  assert.equal(a.style, 'vhs'); assert.deepEqual(a.networks, { youtube: 'causosombrio', instagram: 'causo.sombrio', tiktok: 'causoscript' }); assert.equal(a.perDay, 4);
  assert.equal(saveChannel(store, { name: 'X', style: 'inventado' }).style, 'outro');
  const b = saveChannel(store, { id: a.id, name: 'Causo Sombrio VHS', style: 'vhs' }); assert.equal(b.id, a.id); assert.equal(b.createdAt, a.createdAt); assert.equal(store.list('channels').length, 2);
  assert.throws(() => saveChannel(store, { id: 'nao-existe', name: 'Y' }), /inexistente/);
  removeChannel(store, a.id); assert.equal(store.list('channels').length, 1);
});

test('Postador do canal: só prepara (leitura), conhece os limites das 3 redes e proíbe engajamento falso e credenciais', () => {
  const ag = postadorAgent({ name: 'Cordel Sombrio', niche: 'lendas em xilogravura', tone: 'misterioso e popular', windows: '19h e 21h' });
  assert.equal(ag.mode, 'read'); assert.deepEqual(ag.commands, []);
  for (const re of [/100 caracteres/, /2200/, /150 caracteres/, /nunca publique/i, /engajamento falso/, /19h e 21h/, /Cordel Sombrio/]) assert.match(ag.instructions, re);
});
