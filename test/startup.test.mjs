import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startupLink, startupState, setStartup } from '../server/startup.mjs';

test('iniciar com o Windows: o atalho fica na pasta Inicializar do usuário (ou na pasta de teste)', () => {
  assert.equal(startupLink({ CODE_ROOM_ATALHOS_DIR: 'X' }), join('X', 'Startup', 'Code Room.lnk'));
  assert.equal(startupLink({ APPDATA: 'A' }), join('A', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'Code Room.lnk'));
});

test('iniciar com o Windows: estado lê o atalho; fora do Windows não é suportado', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cr-startup-')), env = { CODE_ROOM_ATALHOS_DIR: dir };
  try {
    assert.deepEqual(startupState(env, 'win32'), { supported: true, on: false });
    await mkdir(join(dir, 'Startup')); await writeFile(join(dir, 'Startup', 'Code Room.lnk'), 'x');
    assert.deepEqual(startupState(env, 'win32'), { supported: true, on: true });
    assert.deepEqual(startupState(env, 'linux'), { supported: false, on: false });
    await assert.rejects(setStartup(true, { root: dir, platform: 'linux', env }), /só existe no Windows/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('iniciar com o Windows: liga e desliga chamando o script com o caminho como argumento (espaços não quebram)', async () => {
  const calls = [];
  const run = (file, args, opts, cb) => { calls.push([file, args]); cb(null); };
  await setStartup(true, { root: 'C:/Users/João Silva/CodeRoom', run, platform: 'win32', env: { CODE_ROOM_ATALHOS_DIR: tmpdir() } });
  await setStartup(false, { root: 'C:/Users/João Silva/CodeRoom', run, platform: 'win32', env: { CODE_ROOM_ATALHOS_DIR: tmpdir() } });
  assert.equal(calls[0][0], 'powershell.exe');
  assert.ok(calls[0][1].includes('-File') && calls[0][1].some(a => a.endsWith('iniciar-com-windows.ps1') && a.includes('João Silva')));
  assert.ok(!calls[0][1].includes('-Remover')); assert.ok(calls[1][1].includes('-Remover'));
  await assert.rejects(setStartup(true, { root: 'x', run: (f, a, o, cb) => cb(new Error('negado')), platform: 'win32' }), /Não consegui mudar o início automático: negado/);
});
