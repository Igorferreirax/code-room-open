import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanLook } from '../server/looks.mjs';

test('visual do boneco: valida cores, opções e limites', () => {
  assert.equal(cleanLook(null), null);
  const l = cleanLook({ skin: 'red', shirt: '#ABCDEF', hat: 'foguete', hair: 'longo', size: 9, thumb: 'http://x/y.png' });
  assert.equal(l.skin, '#f1c27d'); assert.equal(l.shirt, '#abcdef'); assert.equal(l.hat, 'none'); assert.equal(l.hair, 'longo'); assert.equal(l.size, 1.2); assert.equal(l.thumb, null);
  assert.ok(cleanLook({ thumb: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==' }).thumb);
  assert.throws(() => cleanLook([]), /inválido/);
});
