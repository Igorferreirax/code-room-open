import test from 'node:test';
import assert from 'node:assert/strict';
import { preflight } from '../server/preflight.mjs';
import { tempDir } from './helpers.mjs';

test('verificação do ambiente: devolve itens com status e nunca vaza o valor da chave da voz', async () => {
  process.env.ELEVENLABS_API_KEY = 'segredo-xyz-123';
  const r = await preflight({ workDir: await tempDir('pf') });
  const ids = r.items.map(i => i.id);
  for (const id of ['ffmpeg', 'ffprobe', 'python', 'node', 'hyperframes', 'disk', 'ram', 'cpu', 'voz', 'flow']) assert.ok(ids.includes(id), `falta o item ${id}`);
  assert.ok(r.items.every(i => ['ok', 'aviso', 'falha'].includes(i.status)));
  assert.equal(r.items.find(i => i.id === 'voz').status, 'ok');
  assert.ok(!JSON.stringify(r).includes('segredo-xyz-123'), 'o valor da chave nunca é exibido');
  assert.match(r.items.find(i => i.id === 'ram').detail, /GB livres de/);
  delete process.env.ELEVENLABS_API_KEY;
});
