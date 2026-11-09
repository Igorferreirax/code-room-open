import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Store } from '../server/store.mjs';

test('HTTP: Obsidian — config validada, busca, aprovar com "Só ler" não grava, com "Permitir alimentar" grava nota nova; abrir pasta é ignorado em teste', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cr-obshttp-')), vault = await mkdtemp(join(tmpdir(), 'cr-vault-')), projDir = await mkdtemp(join(tmpdir(), 'cr-proj-')), port = 19000 + Math.floor(Math.random() * 10000), now = new Date().toISOString();
  await mkdir(join(vault, '.obsidian')); await mkdir(join(vault, 'Marca')); await writeFile(join(vault, 'Marca', 'Tom de voz achadinhos.md'), '---\ntags: [marca]\n---\nFale direto, preço em destaque, grupo na bio.', 'utf8');
  const seed = new Store(join(dir, 'code-room.sqlite')), pj = { id: 'pj1', name: 'Achadinhos', area: 'Vídeo', path: projDir }, ag = { id: 'ag1', name: 'Produtor', role: 'Reels', room: 'Vídeo', provider: 'claude', mode: 'write' };
  seed.put('projects', { ...pj, createdAt: now });
  const task = id => ({ id, kind: 'work', status: 'completed', project: pj, agent: ag, objective: 'Lote "Reel do suporte"', createdAt: now, updatedAt: now, attempts: [], attemptCount: 0, criteria: [], inputs: [], limits: {}, result: { summary: 'Vídeo pronto.', deliverables: { available: true, files: [{ path: 'reels/reel.mp4', bytes: 2048, change: 'added' }] } } });
  seed.put('tasks', task('t-ler')); seed.put('tasks', task('t-gravar')); seed.close();
  const child = spawn(process.execPath, ['server/main.mjs'], { cwd: resolve('.'), env: { ...process.env, CODE_ROOM_DATA: dir, CODE_ROOM_PORT: String(port) }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await Promise.race([once(child.stdout, 'data'), new Promise((_, no) => setTimeout(() => no(new Error('Servidor não iniciou')), 8000))]);
    const key = (await readFile(join(dir, 'access.key'), 'utf8')).trim(), base = `http://127.0.0.1:${port}`, H = { 'X-Code-Room-Key': key, 'Content-Type': 'application/json' };
    const post = (p, b) => fetch(`${base}${p}`, { method: 'POST', headers: H, body: JSON.stringify(b) }), get = p => fetch(`${base}${p}`, { headers: H });
    assert.equal((await fetch(`${base}/api/obsidian`)).status, 401, 'exige a chave');
    const st0 = await (await get('/api/obsidian')).json(); assert.equal(st0.enabled, false); assert.equal(st0.allowWrite, false);
    let r = await post('/api/obsidian/config', { enabled: true, vault: projDir }); assert.equal(r.status, 400); assert.match((await r.json()).error, /não parece um cofre/);
    r = await post('/api/obsidian/config', { enabled: true, vault: 'relativo' }); assert.equal(r.status, 400);
    r = await post('/api/obsidian/config', { enabled: true, vault, allowWrite: false, byProject: { pj1: 'Marca' } }); assert.equal(r.status, 200); const st = await r.json(); assert.equal(st.check.ok, true); assert.equal(st.check.notes, 1); assert.equal(st.byProject.pj1, 'Marca');
    r = await post('/api/obsidian/preview', { q: 'legenda do reel', projectId: 'pj1' }); const pv = await r.json(); assert.equal(pv.notes[0].title, 'Tom de voz achadinhos'); assert.match(pv.notes[0].excerpt, /preço em destaque/);
    r = await post(`/api/tasks/t-ler/approve`, { note: '' }); assert.equal(r.status, 200); assert.equal((await r.json()).obsidian, null, '“Só ler”: nada é gravado');
    assert.deepEqual(await readdir(join(vault, 'Marca')), ['Tom de voz achadinhos.md']);
    assert.equal((await post('/api/obsidian/save', { taskId: 't-gravar' })).status, 400, 'salvar à mão também respeita o “Só ler”');
    r = await post('/api/obsidian/config', { allowWrite: true, writeFolder: 'Code Room' }); assert.equal((await r.json()).allowWrite, true);
    r = await post(`/api/tasks/t-gravar/approve`, { note: 'ótimo' }); const ap = await r.json(); assert.match(ap.obsidian, /^Code Room\/Achadinhos\/\d{4}-\d{2}-\d{2} Reel do suporte\.md$/); assert.equal(ap.obsidianError, null);
    const note = await readFile(join(vault, ...ap.obsidian.split('/')), 'utf8'); assert.match(note, /code-room: true/); assert.match(note, /reels\/reel\.mp4 \(2 KB\)/); assert.match(note, /ótimo/);
    r = await post('/api/obsidian/config', { enabled: false }); assert.equal((await r.json()).allowWrite, false, 'desligar também desliga a escrita');
    r = await post('/api/projects/pj1/open', {});
    if (process.platform === 'win32') assert.deepEqual(await r.json(), { ok: true, skipped: true });
    else { assert.equal(r.status, 400); assert.match((await r.json()).error, /só está disponível no Windows/); }
  } finally { const closed = once(child, 'close'); child.kill(); await closed; await rm(dir, { recursive: true, force: true }); await rm(vault, { recursive: true, force: true }); await rm(projDir, { recursive: true, force: true }); }
});
