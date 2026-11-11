import test from 'node:test';
import assert from 'node:assert/strict';
import { loginLaunchSpec, launchLogin, cliActionLaunchSpec, launchCliAction, checkKiroLogin } from '../server/connectors.mjs';
import { PassThrough } from 'node:stream';
import { EventEmitter } from 'node:events';

const catalog = ['codex', 'claude', 'agy'].map(id => ({ id, path: process.execPath }));

test('login abre somente os comandos oficiais fixos no PowerShell destacado do Windows', () => {
  for (const [provider, command] of [['codex', '& $env:CODE_ROOM_LOGIN_CLI login'], ['claude', '& $env:CODE_ROOM_LOGIN_CLI auth login'], ['agy', '& $env:CODE_ROOM_LOGIN_CLI']]) {
    const spec = loginLaunchSpec(provider, catalog, 'win32');
    assert.equal(spec.program, 'powershell.exe'); assert.deepEqual(spec.args.slice(0, 4), ['-NoLogo', '-NoProfile', '-NoExit', '-Command']);
    assert.equal(spec.args[4], command); assert.equal(spec.options.detached, true); assert.equal(spec.options.windowsHide, false);
    assert.equal(spec.options.env.CODE_ROOM_LOGIN_CLI, process.execPath);
    assert.ok(!spec.args.join(' ').includes(process.execPath), 'caminho do executável não é interpolado no script do shell');
  }
});

test('login recusa provedor arbitrário, CLI ausente e plataformas não Windows', () => {
  assert.throws(() => loginLaunchSpec('custom', catalog, 'win32'), /Provedor não aceito/);
  assert.throws(() => loginLaunchSpec('codex', [], 'win32'), /CLI não encontrado/);
  assert.throws(() => loginLaunchSpec('codex', catalog, 'linux'), /disponível no Windows/);
});

test('lançador injeta o processo e não depende de credenciais ou argumentos do pedido HTTP', () => {
  let args, opts, unref = false;
  const result = launchLogin('codex', { catalog, platform: 'win32', spawnProcess: (file, argv, options) => { args = [file, argv]; opts = options; return { unref() { unref = true; } }; } });
  assert.deepEqual(result, { opened: true, provider: 'codex' }); assert.equal(args[0], 'powershell.exe'); assert.equal(unref, true);
  assert.equal(args[1].at(-1), '& $env:CODE_ROOM_LOGIN_CLI login'); assert.equal(opts.env.CODE_ROOM_LOGIN_CLI, process.execPath);
});

test('Kiro CLI: login e atualização usam apenas comandos fixos; atualizar nunca força downgrade', () => {
  for (const [action, suffix] of [['login', 'login'], ['update', 'update']]) {
    const spec = cliActionLaunchSpec('kiro', action, { platform: 'win32', find: () => process.execPath });
    assert.equal(spec.options.env.CODE_ROOM_LOGIN_CLI, process.execPath); assert.equal(spec.args.at(-1), `& $env:CODE_ROOM_LOGIN_CLI ${suffix}`);
    assert.ok(!spec.args.join(' ').includes('--force'));
  }
  assert.throws(() => cliActionLaunchSpec('kiro', 'logout', { platform: 'win32', find: () => process.execPath }), /Ação não permitida/);
  assert.throws(() => cliActionLaunchSpec('kiro', 'update', { platform: 'win32', find: () => null }), /CLI não encontrado/);
  let args;
  const launched = launchCliAction('kiro', 'update', { platform: 'win32', find: () => process.execPath, spawnProcess: (file, argv) => { args = [file, argv]; return { unref() {} }; } });
  assert.deepEqual(launched, { opened: true, provider: 'kiro', action: 'update' }); assert.equal(args[1].at(-1), '& $env:CODE_ROOM_LOGIN_CLI update');
});

test('verificação Kiro não devolve nem persiste e-mail da conta e diferencia instalado, não autenticado e confirmado', async () => {
  assert.deepEqual(await checkKiroLogin({ find: () => null }), { installed: false, authenticated: false, status: 'not-found', message: 'Kiro CLI não encontrado no PATH deste Code Room.' });
  const checkWith = async (output, code) => checkKiroLogin({ find: () => process.execPath, spawnProcess: (_file, args, opts) => {
    assert.deepEqual(args, ['whoami', '--format', 'plain']); assert.equal(opts.shell, false);
    const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    queueMicrotask(() => { child.stdout.end(output); child.stderr.end(); child.emit('close', code); }); return child;
  } });
  const signed = await checkWith('Logged in with Builder ID\nEmail: private@example.test', 0);
  assert.equal(signed.authenticated, true); assert.equal(signed.status, 'signed-in'); assert.ok(!JSON.stringify(signed).includes('private@example.test'));
  const out = await checkWith('Not logged in', 1); assert.equal(out.authenticated, false); assert.equal(out.status, 'signed-out');
  const unknown = await checkWith('Unexpected status', 0); assert.equal(unknown.authenticated, null); assert.equal(unknown.status, 'unknown');
});
