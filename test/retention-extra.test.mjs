import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, readdir, stat, utimes } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/store.mjs';
import { retentionScan, retentionClean } from '../server/retention.mjs';

const DAY = 86400000;
async function setup() {
  const base = await mkdtemp(join(tmpdir(), 'cr-ret-')), dataDir = join(base, 'dados'), appDir = join(base, 'CodeRoom');
  await mkdir(join(dataDir, 'updates'), { recursive: true }); await mkdir(appDir, { recursive: true });
  const store = new Store(':memory:');
  const put = async (rel, bytes, ageDays) => { const p = join(dataDir, 'updates', rel); await writeFile(p, Buffer.alloc(bytes, 1)); const t = new Date(Date.now() - ageDays * DAY); await utimes(p, t, t); return p; };
  return { base, dataDir, appDir, store, put, done: () => rm(base, { recursive: true, force: true }) };
}

test('retenção ampliada: pacotes de atualização antigos entram; os recentes e arquivos alheios ficam', async () => {
  const s = await setup();
  try {
    await s.put('Code-Room-0.2.1-portatil-win-x64.zip', 5000, 10); await s.put('SHA256SUMS.txt', 100, 10); await s.put('Code-Room-0.2.2-portatil-win-x64.zip.part', 2000, 5);
    await s.put('Code-Room-0.2.3-portatil-win-x64.zip', 7000, 0.5); await s.put('anotacao-do-usuario.txt', 300, 90);
    const scan = await retentionScan({ store: s.store, dataDir: s.dataDir, appDir: s.appDir });
    const up = scan.items.find(i => i.id === 'updates'); assert.equal(up.count, 3); assert.equal(up.bytes, 7100);
    assert.equal(scan.totalBytes, 7100); assert.equal((await readdir(join(s.dataDir, 'updates'))).length, 5, 'a prévia não apaga nada');
    assert.ok(!JSON.stringify(scan).includes(s.base), 'a prévia não vaza caminhos do disco');
    const r = await retentionClean({ store: s.store, dataDir: s.dataDir, appDir: s.appDir });
    assert.equal(r.removed.files, 3); assert.equal(r.freedBytes, 7100);
    assert.deepEqual((await readdir(join(s.dataDir, 'updates'))).sort(), ['Code-Room-0.2.3-portatil-win-x64.zip', 'anotacao-do-usuario.txt'], 'só o que casa com o padrão e é antigo');
    assert.equal((await retentionScan({ store: s.store, dataDir: s.dataDir, appDir: s.appDir })).items.length, 0, 'repetir não acha mais nada');
  } finally { await s.done(); }
});

test('retenção ampliada: a cópia da versão anterior só é oferecida depois de 7 dias da troca', async () => {
  const s = await setup();
  try {
    const ant = s.appDir + '.anterior'; await mkdir(join(ant, 'runtime'), { recursive: true }); await writeFile(join(ant, 'runtime', 'node.exe'), Buffer.alloc(20000, 1)); await writeFile(join(ant, 'package.json'), '{}');
    assert.equal((await retentionScan({ store: s.store, dataDir: s.dataDir, appDir: s.appDir })).items.length, 0, 'recém-criada: guarda para poder voltar atrás');
    const depois = Date.now() + 8 * DAY, scan = await retentionScan({ store: s.store, dataDir: s.dataDir, appDir: s.appDir, now: depois });
    const it = scan.items.find(i => i.id === 'anterior'); assert.ok(it); assert.equal(it.bytes, 20002); assert.ok(existsSync(ant), 'prévia não apaga');
    const tooSoon = await retentionClean({ store: s.store, dataDir: s.dataDir, appDir: s.appDir, now: Date.now() + 3 * DAY });
    assert.equal(tooSoon.removed.anterior, false); assert.ok(existsSync(ant), 'com menos de 7 dias nada é apagado');
    const r = await retentionClean({ store: s.store, dataDir: s.dataDir, appDir: s.appDir, now: depois });
    assert.equal(r.removed.anterior, true); assert.equal(r.freedBytes, 20002); assert.ok(!existsSync(ant)); assert.ok(existsSync(s.appDir), 'a versão em uso nunca é tocada');
  } finally { await s.done(); }
});

test('retenção ampliada: avisos já vistos e antigos saem; os não vistos e os recentes ficam', async () => {
  const s = await setup();
  try {
    const at = d => new Date(Date.now() - d * DAY).toISOString();
    s.store.put('notices', { id: 'velho-visto', seen: true, at: at(40) }); s.store.put('notices', { id: 'velho-nao-visto', seen: false, at: at(40) }); s.store.put('notices', { id: 'novo-visto', seen: true, at: at(2) });
    const scan = await retentionScan({ store: s.store, dataDir: s.dataDir, appDir: s.appDir }); assert.equal(scan.items.find(i => i.id === 'notices').count, 1);
    const r = await retentionClean({ store: s.store, dataDir: s.dataDir, appDir: s.appDir }); assert.equal(r.removed.notices, 1);
    assert.deepEqual(s.store.list('notices').map(n => n.id).sort(), ['novo-visto', 'velho-nao-visto']);
  } finally { await s.done(); }
});

test('retenção ampliada: sem pasta de dados ou de app não quebra; tarefas do Assistente continuam entrando', async () => {
  const store = new Store(':memory:');
  store.put('tasks', { id: 't1', project: { id: 'assistant-internal' }, status: 'completed', updatedAt: new Date(Date.now() - 10 * DAY).toISOString(), attempts: ['r1'] }); store.put('runs', { id: 'r1' });
  const scan = await retentionScan({ store, dataDir: undefined, appDir: undefined });
  assert.deepEqual(scan.items.map(i => i.id), ['assistant']); assert.equal(scan.counts.tasks, 1);
  const r = await retentionClean({ store, dataDir: '/nao/existe', appDir: '/nao/existe/app' }); assert.equal(r.removed.tasks, 1); assert.equal(store.list('tasks').length, 0);
});
