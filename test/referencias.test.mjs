import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile, readdir, rm, access, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { Store } from '../server/store.mjs';
import { cleanRefs, scanReference, syncReference, prepareReferences, referenceBlock, forbiddenRef, REF_DIR } from '../server/referencias.mjs';
import { tempDir } from './helpers.mjs';

async function origem() {
  const d = await tempDir('ref-origem');
  await mkdir(join(d, 'src')); await mkdir(join(d, 'scripts')); await mkdir(join(d, 'node_modules', 'x'), { recursive: true }); await mkdir(join(d, 'data')); await mkdir(join(d, '.git'));
  await writeFile(join(d, 'src', 'pauta.js'), 'export const a = 1;'); await writeFile(join(d, 'scripts', 'make-reel.js'), '// monta o reel'); await writeFile(join(d, 'README.md'), '# GerouPromo');
  await writeFile(join(d, '.env'), 'TOKEN=segredo'); await writeFile(join(d, '.env.local'), 'X=1'); await writeFile(join(d, 'chave.pem'), 'KEY'); await writeFile(join(d, 'app.db'), 'banco'); await writeFile(join(d, 'data', 'a.json'), '{}'); await writeFile(join(d, 'node_modules', 'x', 'i.js'), 'x'); await writeFile(join(d, '.git', 'config'), 'c'); await writeFile(join(d, 'grande.txt'), 'x'.repeat(1024 * 1024 + 1)); await writeFile(join(d, 'credentials.json'), '{}');
  return d;
}

test('validação: caminhos completos e existentes, fora do sistema, sem conter o projeto nem estar dentro dele, rótulos únicos e no máximo 5', async () => {
  const proj = await tempDir('ref-proj'), o = await origem(), o2 = await tempDir('ref-origem');
  const ok = await cleanRefs([{ path: o, label: 'Gerou Promo!' }, { path: o2 }, { path: o }], proj); assert.equal(ok.length, 2, 'repetida some'); assert.equal(ok[0].label, 'Gerou-Promo'); assert.notEqual(ok[0].label, ok[1].label);
  await assert.rejects(() => cleanRefs([{ path: 'relativa/x' }], proj), /caminho completo/); await assert.rejects(() => cleanRefs([{ path: join(o, 'nao-existe') }], proj), /não existe/);
  await assert.rejects(() => cleanRefs([{ path: 'C:\\Windows' }], proj), /protegida/); await assert.rejects(() => cleanRefs([{ path: proj }], proj), /próprio projeto/);
  await mkdir(join(proj, 'sub')); await assert.rejects(() => cleanRefs([{ path: join(proj, 'sub') }], proj), /dentro ou ao redor/); await assert.rejects(() => cleanRefs([{ path: o }], join(o, 'filho')), /dentro ou ao redor/);
  await assert.rejects(() => cleanRefs(new Array(6).fill({ path: o }), proj), /No máximo 5/); assert.equal(forbiddenRef('C:\\'), true);
});

test('cópia: leva o código, deixa de fora segredos, bancos, chaves, node_modules, .git, data e arquivos grandes; nunca escreve na origem', async () => {
  const o = await origem(), proj = await tempDir('ref-proj'), s = await scanReference(o);
  assert.deepEqual(s.files.map(f => f.rel).sort(), ['README.md', 'scripts/make-reel.js', 'src/pauta.js']); assert.ok(s.skipped.segredo >= 5 && s.skipped.grande === 1, JSON.stringify(s.skipped));
  const r = await syncReference(proj, { path: o, label: 'gerou' }); assert.equal(r.files, 3); assert.equal(r.copied, 3);
  assert.equal(await readFile(join(proj, REF_DIR, 'gerou', 'src', 'pauta.js'), 'utf8'), 'export const a = 1;');
  for (const proibido of ['.env', '.env.local', 'chave.pem', 'app.db', 'credentials.json', 'grande.txt']) await assert.rejects(() => access(join(proj, REF_DIR, 'gerou', proibido)), proibido);
  await assert.rejects(() => access(join(proj, REF_DIR, 'gerou', 'node_modules')), 'node_modules'); await assert.rejects(() => access(join(proj, REF_DIR, 'gerou', '.git')), '.git');
  assert.deepEqual((await readdir(o)).sort(), ['.env', '.env.local', '.git', 'README.md', 'app.db', 'chave.pem', 'credentials.json', 'data', 'grande.txt', 'node_modules', 'scripts', 'src'], 'a origem ficou intacta');
  // segunda rodada: nada a copiar; mudança na origem é refeita; arquivo removido na origem some da cópia; edição na cópia é desfeita
  assert.equal((await syncReference(proj, { path: o, label: 'gerou' })).copied, 0);
  await writeFile(join(o, 'src', 'pauta.js'), 'export const a = 2; // novo'); await rm(join(o, 'README.md')); await writeFile(join(proj, REF_DIR, 'gerou', 'scripts', 'make-reel.js'), 'EDITADO PELO AGENTE');
  const r3 = await syncReference(proj, { path: o, label: 'gerou' }); assert.equal(r3.copied >= 1, true); assert.match(await readFile(join(proj, REF_DIR, 'gerou', 'src', 'pauta.js'), 'utf8'), /a = 2/); await assert.rejects(() => access(join(proj, REF_DIR, 'gerou', 'README.md')));
});

test('atalho dentro da origem não é seguido (nada de fora entra na cópia)', async () => {
  const o = await origem(), fora = await tempDir('ref-fora'); await writeFile(join(fora, 'segredo.md'), 'fora');
  try { await symlink(fora, join(o, 'atalho'), 'junction'); } catch { return; }
  assert.ok(!(await scanReference(o)).files.some(f => f.rel.startsWith('atalho')));
});

test('por tarefa: só com referências; Financeiro e conversa interna nunca; bloco explica que é cópia somente leitura; .referencias fica fora do Git; erro não derruba', async () => {
  const o = await origem(), proj = await tempDir('ref-git'), store = new Store(':memory:'); await mkdir(join(proj, '.git', 'info'), { recursive: true });
  const task = (over = {}) => ({ project: { id: 'p1', name: 'P', area: 'Vídeo' }, ...over });
  store.put('projects', { id: 'p1', name: 'P', path: proj, area: 'Vídeo', referenceDirs: [] }); assert.deepEqual(await prepareReferences(store, task(), proj), { text: '', n: 0 });
  store.put('projects', { id: 'p1', name: 'P', path: proj, area: 'Vídeo', referenceDirs: [{ path: o, label: 'gerou' }, { path: join(o, 'sumiu'), label: 'x' }] });
  const r = await prepareReferences(store, task(), proj); assert.equal(r.n, 1, 'a pasta que sumiu é ignorada'); assert.match(r.text, /CÓPIA SOMENTE LEITURA/); assert.match(r.text, /\.referencias\/gerou\/ — 3 arquivo\(s\)/); assert.match(r.text, /ficaram de fora/);
  assert.match(await readFile(join(proj, '.git', 'info', 'exclude'), 'utf8'), /\.referencias\//); await access(join(proj, REF_DIR, 'LEIA-ME.txt'));
  assert.equal((await prepareReferences(store, task({ project: { id: 'p1', name: 'P', area: 'Financeiro' } }), proj)).n, 0); assert.equal((await prepareReferences(store, task({ project: { id: 'assistant-internal', area: 'Geral' } }), proj)).n, 0);
  assert.equal(referenceBlock([]), '');
});
