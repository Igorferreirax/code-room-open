import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Store } from '../server/store.mjs';
import { gitSectionHtml } from '../public/git-ui.js';

test('HTTP: Git do projeto — estado, iniciar, commit da entrega, commit automático opcional ao aprovar e GitHub sem repositório', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cr-githttp-')), proj = await mkdtemp(join(tmpdir(), 'cr-gitproj-')), port = 19000 + Math.floor(Math.random() * 10000), now = new Date().toISOString();
  await mkdir(join(proj, 'reels')); await writeFile(join(proj, 'reels', 'v1.txt'), 'primeiro'); await writeFile(join(proj, 'reels', 'v2.txt'), 'segundo'); await writeFile(join(proj, 'reels', 'v3.txt'), 'terceiro');
  const seed = new Store(join(dir, 'code-room.sqlite')), pj = { id: 'pj1', name: 'Achadinhos', area: 'Vídeo', path: proj }, ag = { id: 'ag1', name: 'Produtor', role: 'r', room: 'Vídeo', provider: 'claude', mode: 'write' };
  seed.put('projects', { ...pj, createdAt: now });
  const task = (id, file) => ({ id, kind: 'work', status: 'completed', project: pj, agent: ag, objective: 'Lote "Reel ' + id + '"', createdAt: now, updatedAt: now, attempts: [], attemptCount: 0, criteria: [], inputs: [], limits: {}, result: { summary: 'ok', deliverables: { available: true, files: [{ path: file, bytes: 8, change: 'added' }] } } });
  seed.put('tasks', task('t1', 'reels/v1.txt')); seed.put('tasks', task('t2', 'reels/v2.txt')); seed.put('tasks', task('t3', 'reels/v3.txt')); seed.close();
  const child = spawn(process.execPath, ['server/main.mjs'], { cwd: resolve('.'), env: { ...process.env, CODE_ROOM_DATA: dir, CODE_ROOM_PORT: String(port) }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await Promise.race([once(child.stdout, 'data'), new Promise((_, no) => setTimeout(() => no(new Error('Servidor não iniciou')), 8000))]);
    const key = (await readFile(join(dir, 'access.key'), 'utf8')).trim(), base = `http://127.0.0.1:${port}`, H = { 'X-Code-Room-Key': key, 'Content-Type': 'application/json' };
    const get = p => fetch(base + p, { headers: H }), post = (p, b) => fetch(base + p, { method: 'POST', headers: H, body: JSON.stringify(b) });
    assert.equal((await fetch(`${base}/api/projects/pj1/git`)).status, 401, 'exige a chave');
    assert.equal((await (await get('/api/projects/pj1/git')).json()).repo, false);
    assert.equal((await post('/api/projects/pj1/git/commit', { taskId: 't1' })).status, 400, 'sem repositório não commita');
    const ini = await (await post('/api/projects/pj1/git/init', {})).json(); assert.equal(ini.repo, true);
    for (const [k, v] of [['user.email', 't@t.t'], ['user.name', 'Teste'], ['commit.gpgsign', 'false']]) execFileSync('git', ['config', k, v], { cwd: proj });
    let r = await post('/api/projects/pj1/git/commit', { taskId: 't1' }); assert.equal(r.status, 200); const c = await r.json(); assert.match(c.hash, /^[0-9a-f]{7,}$/); assert.deepEqual(c.files, ['reels/v1.txt']);
    const st = await (await get('/api/projects/pj1/git')).json(); assert.equal(st.commits[0].subject, 'Code Room: Reel t1'); assert.equal(st.dirty, 2, 'v2 e v3 ainda sem commit'); assert.equal(st.config.autoCommit, false);
    let ap = await (await post('/api/tasks/t2/approve', { note: '' })).json(); assert.equal(ap.gitCommit, null, 'automático desligado: aprovar não commita');
    assert.equal((await (await post('/api/git/config', { autoCommit: true })).json()).autoCommit, true);
    ap = await (await post('/api/tasks/t3/approve', { note: '' })).json(); assert.match(ap.gitCommit, /^[0-9a-f]{7,}$/, 'automático ligado: aprovar cria o commit local'); assert.equal(ap.gitError, null);
    assert.equal((await (await get('/api/projects/pj1/git')).json()).commits[0].subject, 'Code Room: Reel t3');
    assert.equal((await post('/api/projects/pj1/git/commit', { taskId: 'inexistente' })).status, 400);
    const hub = await (await get('/api/projects/pj1/github')).json(); assert.equal(hub.available === true || typeof hub.reason === 'string', true, 'GitHub: ou consulta ou explica por que não');
  } finally { const closed = once(child, 'close'); child.kill(); await closed; await rm(dir, { recursive: true, force: true }); await rm(proj, { recursive: true, force: true }); }
});

test('tela do Git: sem repositório oferece iniciar; com repositório mostra branch, alterações, commits e a promessa de nunca enviar', () => {
  assert.match(gitSectionHtml({}), /Carregando/);
  assert.match(gitSectionHtml({ gitInfo: { available: false } }), /não está instalado/);
  assert.match(gitSectionHtml({ gitInfo: { available: true, repo: false } }), /data-act="git-init"/); assert.doesNotMatch(gitSectionHtml({ gitInfo: { available: true, repo: false, parent: true } }), /git-init/);
  const g = { available: true, repo: true, branch: 'main', dirty: 2, files: [{ state: '??', path: 'a.txt' }, { state: 'M', path: '<b>b</b>.md' }], ahead: 1, behind: 0, remote: { url: 'https://github.com/a/b', web: 'https://github.com/a/b' }, commits: [{ hash: 'abc1234', subject: 'Primeiro <i>commit</i>', author: 'Igor', at: new Date().toISOString() }], config: { autoCommit: true } };
  const h = gitSectionHtml({ gitInfo: g, githubInfo: { available: true, prs: [{ number: 7, title: 'PR', url: 'https://github.com/a/b/pull/7', branch: 'x' }], runs: [{ name: 'CI', status: 'completed', conclusion: 'success', url: 'https://github.com/a/b/actions/1', branch: 'main' }] } });
  assert.match(h, /<b>main<\/b> · 1 a enviar/); assert.match(h, /github\.com\/a\/b<\/a>/); assert.match(h, /2 alterações ainda sem commit/); assert.ok(!h.includes('<b>b</b>.md') && !h.includes('<i>commit</i>'), 'HTML escapado'); assert.match(h, /id="git-auto" type="checkbox" checked/); assert.match(h, /nunca envia \(push\)/); assert.match(h, /#7 PR/); assert.match(h, /d-ok/);
  assert.match(gitSectionHtml({ gitInfo: g, githubInfo: { available: false, reason: 'O GitHub CLI não está logado.' } }), /GitHub: O GitHub CLI não está logado/);
});
