import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { cleanRemote, gitInfo, gitInit, commitFiles, gitAvailable } from '../server/gitinfo.mjs';
import { tempDir } from './helpers.mjs';

const g = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8' }).trim();
async function repo(name = 'git') { const d = await tempDir(name); g(d, 'init', '-q'); g(d, 'config', 'user.email', 't@t.t'); g(d, 'config', 'user.name', 'Teste'); g(d, 'config', 'commit.gpgsign', 'false'); return d; }

test('remoto: tira usuário e senha e vira o link do GitHub quando for de lá', () => {
  assert.deepEqual(cleanRemote('https://user:ghp_SEGREDO@github.com/Igor/code-room.git'), { url: 'https://github.com/Igor/code-room', web: 'https://github.com/Igor/code-room' });
  assert.equal(cleanRemote('git@github.com:Igor/code-room.git').web, 'https://github.com/Igor/code-room');
  assert.deepEqual(cleanRemote('https://gitlab.com/a/b.git'), { url: 'https://gitlab.com/a/b', web: null }); assert.equal(cleanRemote(''), null);
  assert.ok(!JSON.stringify(cleanRemote('https://u:token123@github.com/a/b')).includes('token123'));
});

test('git: pasta sem repositório; iniciar; estado, alterações e commits', async () => {
  assert.equal(await gitAvailable(), true);
  const d = await tempDir('semgit'); const sem = await gitInfo(d); assert.equal(sem.repo, false);
  const ini = await gitInit(d); assert.equal(ini.repo, true); await assert.rejects(() => gitInit(d), /já é um repositório/);
  g(d, 'config', 'user.email', 't@t.t'); g(d, 'config', 'user.name', 'Teste'); g(d, 'config', 'commit.gpgsign', 'false');
  await writeFile(join(d, 'a.txt'), 'um'); let info = await gitInfo(d); assert.equal(info.dirty, 1); assert.deepEqual(info.files[0], { state: '??', path: 'a.txt' }); assert.deepEqual(info.commits, []);
  g(d, 'add', '.'); g(d, 'commit', '-q', '-m', 'Primeiro commit'); info = await gitInfo(d); assert.equal(info.dirty, 0); assert.equal(info.commits.length, 1); assert.equal(info.commits[0].subject, 'Primeiro commit'); assert.equal(info.commits[0].author, 'Teste'); assert.match(info.commits[0].at, /^\d{4}-\d\d-\d\dT/);
  g(d, 'remote', 'add', 'origin', 'https://u:tok@github.com/x/y.git'); assert.equal((await gitInfo(d)).remote.web, 'https://github.com/x/y');
});

test('pasta dentro de um repositório maior não conta como repositório do projeto', async () => {
  const d = await repo('pai'); await mkdir(join(d, 'sub')); const r = await gitInfo(join(d, 'sub')); assert.equal(r.repo, false); assert.equal(r.parent, true);
});

test('commit da entrega: só os arquivos indicados, só dentro da pasta, nunca .git, e recusa quando não há mudança', async () => {
  const d = await repo('commit'); await writeFile(join(d, 'entrega.md'), 'resultado'); await writeFile(join(d, 'outro.md'), 'não é da entrega'); await mkdir(join(d, 'reels')); await writeFile(join(d, 'reels', 'v.txt'), 'vídeo');
  const r = await commitFiles(d, ['entrega.md', 'reels/v.txt', '../fora.txt', '.git/config', '/abs.txt', '-rf', 'nao-existe.md'], 'Code Room: Reel do suporte\n\nAgente: Produtor');
  assert.match(r.hash, /^[0-9a-f]{7,}$/); assert.deepEqual(r.files.sort(), ['entrega.md', 'reels/v.txt']);
  const info = await gitInfo(d); assert.equal(info.commits[0].subject, 'Code Room: Reel do suporte'); assert.deepEqual(info.files, [{ state: '??', path: 'outro.md' }], 'o que não era da entrega continua sem commit');
  await assert.rejects(() => commitFiles(d, ['entrega.md'], 'de novo'), /Nada para commitar/); await assert.rejects(() => commitFiles(d, ['nao-existe.md'], 'x'), /existe mais na pasta/); await assert.rejects(() => commitFiles(d, [], 'x'), /não tem arquivos/);
  const nr = await tempDir('naorepo'); await assert.rejects(() => commitFiles(nr, ['a'], 'x'), /não é um repositório/);
});
