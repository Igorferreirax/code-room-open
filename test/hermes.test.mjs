import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateHermes, saveHermesFile, loadHermesFile, clearHermesFile, sshArgs, explainSsh, testHermes, findSsh, HERMES_FILE } from '../server/hermes.mjs';
import { setHermesDir, connectors, command } from '../server/connectors.mjs';

const ok = { host: 'ubuntu@meu-servidor.com', port: '2222', key: 'C:/Users/x/.ssh/id_ed25519', bin: '/usr/local/bin/hermes' };
const exists = () => true;

test('hermes: aceita servidor, porta, chave e programa válidos e normaliza', () => {
  const c = validateHermes({ ...ok, key: '"C:/Users/x/.ssh/id_ed25519"', trustNew: true }, { fileExists: exists });
  assert.deepEqual(c, { host: 'ubuntu@meu-servidor.com', port: 2222, key: 'C:/Users/x/.ssh/id_ed25519', bin: '/usr/local/bin/hermes', trustNew: true });
  const d = validateHermes({ host: '10.0.0.5', key: 'k', port: '', bin: '' }, { fileExists: exists });
  assert.equal(d.port, 22); assert.equal(d.bin, 'hermes'); assert.equal(d.trustNew, false); assert.equal(d.host, '10.0.0.5');
});

test('hermes: recusa tudo que poderia virar injeção de opção ou de comando no SSH', () => {
  const bad = (patch, re) => assert.throws(() => validateHermes({ ...ok, ...patch }, { fileExists: exists }), re);
  for (const host of ['-oProxyCommand=calc', '-J evil', 'a b@c', 'user@host;rm -rf /', 'user@host$(id)', 'user@host`id`', 'u@h|x', 'user@', '', 'x'.repeat(300), 'a..b', 'user@host\nHost evil', '@host']) bad({ host }, /Servidor inválido/);
  for (const bin of ['hermes; rm -rf /', 'hermes && calc', '$(id)', '`id`', 'hermes --exec', '-rf', 'a b', 'hermes|cat', 'hermes\nid', "h'ermes", 'h"ermes', 'x'.repeat(200)]) bad({ bin }, /Programa remoto inválido/);
  for (const port of [0, 70000, -1, 'abc', '22; id', 1.5]) bad({ port }, /Porta inválida/);
  bad({ key: '' }, /caminho do arquivo da chave/); bad({ key: 'a\u0000b' }, /caminho do arquivo da chave/);
  assert.throws(() => validateHermes(ok, { fileExists: () => false }), /Não achei o arquivo da chave/);
});

test('hermes: argumentos do ssh vão em matriz (sem shell), com "--" antes do servidor e o comando remoto como um só argumento', () => {
  const c = validateHermes({ ...ok, trustNew: false }, { fileExists: exists });
  const a = sshArgs(c, 'hermes --version');
  assert.deepEqual(a, ['-T', '-p', '2222', '-i', 'C:/Users/x/.ssh/id_ed25519', '-o', 'IdentitiesOnly=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20', '--', 'ubuntu@meu-servidor.com', 'hermes --version']);
  assert.ok(!sshArgs({ ...c, trustNew: false }, 'x').includes('StrictHostKeyChecking=accept-new'), 'por padrão exige conhecer o servidor');
  assert.ok(sshArgs({ ...c, trustNew: true }, 'x').includes('StrictHostKeyChecking=accept-new'), 'só confia na primeira conexão se a pessoa marcar');
  assert.ok(sshArgs(c, 'x', { connectTimeout: 10 }).includes('ConnectTimeout=10'));
  assert.ok(a.indexOf('--') < a.indexOf('ubuntu@meu-servidor.com'));
});

test('hermes: erros comuns do ssh viram frases que dá para agir', () => {
  assert.match(explainSsh('Host key verification failed.'), /Primeira conexão.*Confiar neste servidor/);
  assert.match(explainSsh('Host key verification failed.', { trustNew: true }), /confirmar a identidade/);
  assert.match(explainSsh('WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED! Host key verification failed.'), /identidade do servidor mudou/);
  assert.match(explainSsh('ubuntu@x: Permission denied (publickey).'), /recusou a chave.*authorized_keys/);
  assert.match(explainSsh('ssh: Could not resolve hostname foo'), /Não encontrei esse endereço/);
  assert.match(explainSsh('Connection timed out'), /não respondeu a tempo/); assert.match(explainSsh('', {}), /Não consegui conectar/);
  assert.match(explainSsh('ssh: connect to host x port 22: Connection refused'), /recusou a conexão nessa porta/);
  assert.match(explainSsh('bash: hermes: command not found'), /não achei o programa Hermes/);
  assert.match(explainSsh('Load key: bad permissions'), /aberto demais/);
});

test('hermes: teste de conexão não chama modelo, devolve versão ou o motivo, e avisa se falta o OpenSSH', async () => {
  const c = validateHermes(ok, { fileExists: exists }); let seen;
  const good = await testHermes(c, { ssh: 'ssh.exe', run: (f, a, o, cb) => { seen = [f, a]; cb(null, 'Hermes Agent v1.4.2\nextra', ''); } });
  assert.deepEqual(good, { ok: true, version: 'Hermes Agent v1.4.2' }); assert.equal(seen[0], 'ssh.exe'); assert.equal(seen[1].at(-1), '/usr/local/bin/hermes --version');
  const denied = await testHermes(c, { ssh: 'ssh.exe', run: (f, a, o, cb) => cb(new Error('exit 255'), '', 'Permission denied (publickey).') }); assert.equal(denied.ok, false); assert.match(denied.error, /recusou a chave/);
  const slow = await testHermes(c, { ssh: 'ssh.exe', run: (f, a, o, cb) => cb(Object.assign(new Error('x'), { killed: true }), '', '') }); assert.match(slow.error, /não respondeu a tempo/);
  const noSsh = await testHermes(c, { ssh: null }); assert.match(noSsh.error, /Cliente OpenSSH/);
  assert.equal(findSsh({ SystemRoot: 'Z:/Win' }, () => false), null);
});

test('hermes: salvar, carregar e remover a configuração no diretório de dados (só caminhos, nunca o conteúdo da chave)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cr-hermes-')), keyFile = join(dir, 'chave_privada');
  try {
    await writeFile(keyFile, 'SEGREDO-DA-CHAVE-NAO-PODE-SER-COPIADO');
    assert.equal(loadHermesFile(dir), null);
    const saved = saveHermesFile(dir, { ...ok, key: keyFile }); assert.equal(saved.port, 2222);
    const raw = await readFile(join(dir, HERMES_FILE), 'utf8'); assert.ok(!raw.includes('SEGREDO-DA-CHAVE'), 'o conteúdo da chave nunca é lido nem gravado'); assert.ok(raw.includes(keyFile.replace(/\\/g, '\\\\')) || raw.includes('chave_privada'));
    assert.equal(loadHermesFile(dir).host, 'ubuntu@meu-servidor.com');
    assert.throws(() => saveHermesFile(dir, { ...ok, key: join(dir, 'nao-existe') }), /Não achei o arquivo da chave/);
    assert.equal(loadHermesFile(dir).host, 'ubuntu@meu-servidor.com', 'salvar inválido não estraga o que já estava salvo');
    await writeFile(join(dir, HERMES_FILE), '{"host":"-oProxyCommand=calc","key":"x","port":22,"bin":"hermes"}');
    assert.equal(loadHermesFile(dir), null, 'arquivo adulterado com valor perigoso é ignorado');
    clearHermesFile(dir); assert.equal(loadHermesFile(dir), null);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('hermes: a configuração do app vira o conector remoto e o comando usa o ssh seguro; sem configuração o conector não aparece como instalado', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cr-hermes2-')), keyFile = join(dir, 'k');
  try {
    await writeFile(keyFile, 'x'); setHermesDir(dir);
    const antes = connectors().find(c => c.id === 'hermes');
    if (!findSsh()) { assert.equal(antes.remote, null); return; }   // máquina sem OpenSSH
    if (!antes.remote || antes.remote.source !== 'app') saveHermesFile(dir, { ...ok, key: keyFile });
    const h = connectors().find(c => c.id === 'hermes'); assert.equal(h.remote.source, 'app'); assert.equal(h.remote.host, 'ubuntu@meu-servidor.com'); assert.equal(h.remote.port, '2222');
    const cmd = command({ provider: 'hermes', mode: 'read' }, 'faça X', { timeoutMs: 120000 });
    assert.equal(cmd.input, 'faça X', 'o prompt vai pela entrada padrão, nunca na linha de comando');
    assert.ok(cmd.args.includes('--') && cmd.args.at(-1).startsWith('/usr/local/bin/hermes chat --query-file -'));
    assert.ok(!cmd.args.join(' ').includes('faça X'));
  } finally { setHermesDir(null); await rm(dir, { recursive: true, force: true }); }
});
