import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

// Endereços que o servidor só usa para montar um link que a pessoa abre (nada é enviado a eles).
const SO_LINK = new Set(['youtube.com', 'bsky.app', 't.me', 'mastodon.social']);

test('privacidade: todo endereço externo citado no código do servidor está em docs/PRIVACIDADE.md (ou é só link)', async () => {
  const doc = await readFile(new URL('../docs/PRIVACIDADE.md', import.meta.url), 'utf8'), hosts = new Set();
  for (const f of (await readdir(new URL('../server/', import.meta.url))).filter(n => n.endsWith('.mjs')))
    for (const m of (await readFile(new URL(`../server/${f}`, import.meta.url), 'utf8')).matchAll(/https:\/\/([a-z0-9-]+(?:\.[a-z0-9-]+)+)/g)) hosts.add(m[1]);
  assert.ok(hosts.size >= 10, 'a varredura achou os endereços conhecidos');
  const faltando = [...hosts].filter(h => !SO_LINK.has(h) && !doc.includes(h));
  assert.deepEqual(faltando, [], `Endereços que o código chama e o documento de privacidade não lista: ${faltando.join(', ')}`);
});

test('privacidade: o CI existe com permissão mínima e ações presas a um commit, e o README aponta para o documento', async () => {
  const ci = await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8'), readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
  assert.match(ci, /permissions:\s*\n\s*contents: read/); for (const m of ci.matchAll(/uses:\s*\S+@(\S+)/g)) assert.match(m[1], /^[0-9a-f]{40}$/, 'ação presa a um commit exato');
  assert.match(ci, /npm test/); assert.match(ci, /audit-security/); assert.match(readme, /docs\/PRIVACIDADE\.md/);
});
