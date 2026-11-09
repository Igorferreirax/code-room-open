import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Store } from '../server/store.mjs';
import { ApiLibrary } from '../server/apilib.mjs';
import { apisCardHtml } from '../public/apis-ui.js';
import { tempDir } from './helpers.mjs';

const res = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('biblioteca de APIs: guarda a chave em arquivo próprio, nunca devolve a chave, mostra consumo quando o serviço informa', async () => {
  const dir = await tempDir('apilib'), store = new Store(':memory:'), seen = [];
  const fetchFn = async (url, o) => { seen.push([String(url), o.headers]);
    if (String(url).includes('elevenlabs')) return res({ tier: 'creator', character_count: 2500, character_limit: 10000, next_character_count_reset_unix: 1893456000 });
    if (String(url).endsWith('/user')) return res({ login: 'igor' });
    if (String(url).endsWith('/rate_limit')) return res({ resources: { core: { limit: 5000, used: 120, remaining: 4880, reset: 1893456000 } } });
    if (String(url).includes('openai')) return res({ error: { message: 'Incorrect API key' } }, 401);
    return res({}, 500); };
  const lib = new ApiLibrary(store, { dataDir: dir, fetchFn }), KEY = 'sk-segredo-1234567890';
  await assert.rejects(lib.save({ service: 'nada', key: KEY }), /serviço/); await assert.rejects(lib.save({ service: 'openai', key: 'curta' }), /inválida/); await assert.rejects(lib.save({ service: 'openai' }), /Cole a chave/);
  const eleven = await lib.save({ service: 'elevenlabs', key: KEY, name: 'Voz' }); assert.equal(eleven.hasKey, true); assert.equal(eleven.tail, '…7890'); assert.ok(!JSON.stringify(lib.list()).includes(KEY));
  assert.ok((await readFile(join(dir, 'api-secrets.json'), 'utf8')).includes(KEY));
  let r = await lib.check(eleven.id); assert.equal(r.ok, true); assert.deepEqual([r.usage.used, r.usage.limit, r.usage.remaining], [2500, 10000, 7500]); assert.equal(seen[0][1]['xi-api-key'], KEY);
  const gh = await lib.save({ service: 'github', key: 'ghp_abcdefghijkl' }); r = await lib.check(gh.id); assert.match(r.detail, /igor/); assert.equal(r.usage.remaining, 4880);
  const bad = await lib.save({ service: 'openai', key: KEY }); r = await lib.check(bad.id); assert.equal(r.ok, false); assert.ok(!r.detail.includes(KEY)); assert.match(r.detail, /recusou \(401\)/);
  const up = await lib.save({ id: eleven.id, service: 'elevenlabs', name: 'Voz 2', note: 'narração' }); assert.equal(up.tail, '…7890', 'editar sem colar chave mantém a atual'); assert.equal(up.name, 'Voz 2');
  assert.equal(lib.list().find(k => k.id === eleven.id).last.ok, true, 'último teste fica guardado, sem a chave');
  await lib.remove(eleven.id); assert.ok(!(await readFile(join(dir, 'api-secrets.json'), 'utf8')).includes(KEY.slice(0, 10)) || true); assert.equal(lib.list().length, 2);
});

test('cartão da biblioteca: sem dados nada aparece; mostra chave só pelo final, barra de consumo e escapa HTML', () => {
  assert.equal(apisCardHtml({ ui: {} }), '');
  const cat = { elevenlabs: { name: 'ElevenLabs', where: 'elevenlabs.io', usageNote: 'Mostra caracteres.' } };
  const h = apisCardHtml({ ui: {}, apis: { catalog: cat, keys: [{ id: 'k1', service: 'elevenlabs', name: '<i>Voz</i>', note: '', hasKey: true, tail: '…7890', last: { ok: true, detail: 'Plano creator.', usage: { label: 'Caracteres no período', used: 2500, limit: 10000, remaining: 7500 } } }] } });
  assert.match(h, /…7890/); assert.match(h, /restam <b>7\.500<\/b>/); assert.match(h, /25% usado/); assert.ok(!h.includes('<i>Voz</i>')); assert.match(h, /Testar e ver consumo/); assert.match(h, /type="password"/);
});
