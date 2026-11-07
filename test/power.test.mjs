import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { Power, helperScript, fmtDuration, SLEEP_GAP_MS } from '../server/power.mjs';
import { Store } from '../server/store.mjs';

const mk = (opts = {}) => {
  const store = new Store(':memory:'); let t = 1_000_000, running = 0; const spawned = [];
  const spawnImpl = (...a) => { const h = new EventEmitter(); h.kill = () => { h.killed = true; h.emit('exit'); }; h.unref = () => {}; spawned.push({ args: a, h }); return h; };
  const p = new Power({ store, countRunning: () => running, spawnImpl, now: () => t, platform: 'win32', pid: 4321, ...opts });
  return { p, store, spawned, advance: ms => { t += ms; }, setRunning: n => { running = n; } };
};

test('duração legível', () => {
  assert.equal(fmtDuration(30 * 1000), '1 min'); assert.equal(fmtDuration(5 * 60000), '5 min'); assert.equal(fmtDuration(60 * 60000), '1 h');
  assert.equal(fmtDuration(150 * 60000), '2 h 30 min'); assert.equal(fmtDuration(26 * 3600000), '1 d 2 h');
});

test('suspensão: salto de relógio vira aviso com horário e duração; sem salto não avisa', () => {
  const { p, store, advance } = mk();
  advance(5000); p.tick(); assert.equal(store.list('notices').length, 0, 'tique normal não avisa');
  advance(3 * 3600000); p.tick();
  const n = store.list('notices'); assert.equal(n.length, 1); assert.equal(n[0].kind, 'sleep'); assert.equal(n[0].seen, false);
  assert.match(n[0].text, /\(3 h\)/); assert.match(n[0].text, /acesso pelo celular e as rotinas ficaram parados/);
  assert.ok(p.status().lastSleep.from < p.status().lastSleep.to);
});

test('suspensão: curta sem tarefa não incomoda; com tarefa rodando avisa mesmo sendo curta', () => {
  const a = mk(); a.advance(SLEEP_GAP_MS + 1000); a.p.tick(); assert.equal(a.store.list('notices').length, 0, 'suspensão curta sem tarefa só fica registrada'); assert.ok(a.p.status().lastSleep);
  const b = mk(); b.setRunning(2); b.advance(SLEEP_GAP_MS + 1000); b.p.tick();
  assert.match(b.store.list('notices')[0].text, /2 tarefas estavam em andamento/);
  const c = mk(); c.setRunning(1); c.advance(2 * 3600000); c.p.tick(); assert.match(c.store.list('notices')[0].text, /1 tarefa estava em andamento: confira se terminou/);
});

test('manter acordado: desligado por padrão; ligado só segura enquanto há tarefa rodando e solta quando acaba', () => {
  const { p, spawned, setRunning } = mk();
  setRunning(1); p.tick(); assert.equal(spawned.length, 0, 'desligado por padrão: nada é segurado');
  p.setKeepAwake(true); assert.equal(spawned.length, 1); assert.equal(p.status().holding, true);
  assert.equal(spawned[0].args[0], 'powershell.exe'); assert.ok(spawned[0].args[1].includes('-Command')); assert.ok(spawned[0].args[1].at(-1).includes('$pp=4321'));
  p.tick(); assert.equal(spawned.length, 1, 'não cria um segundo ajudante');
  setRunning(0); p.tick(); assert.equal(spawned[0].h.killed, true); assert.equal(p.status().holding, false);
  setRunning(2); p.tick(); assert.equal(spawned.length, 2, 'volta a segurar quando há tarefa de novo');
  p.setKeepAwake(false); assert.equal(spawned[1].h.killed, true); assert.equal(p.status().holding, false);
  p.setKeepAwake(true); p.stop(); assert.equal(p.status().holding, false, 'stop() sempre solta');
});

test('manter acordado: ajudante que morre sozinho é refeito; fora do Windows não faz nada', () => {
  const { p, spawned, setRunning } = mk(); p.setKeepAwake(true); setRunning(1); p.tick();
  spawned[0].h.emit('exit'); assert.equal(p.status().holding, false); p.tick(); assert.equal(spawned.length, 2);
  const lin = mk({ platform: 'linux' }); lin.p.setKeepAwake(true); lin.setRunning(1); lin.p.tick(); assert.equal(lin.spawned.length, 0); assert.equal(lin.p.status().supported, false);
});

test('ajudante: PID tem de ser inteiro positivo (nada de injeção no comando)', () => {
  for (const bad of ['1; calc', 0, -1, 1.5, NaN, null]) assert.throws(() => helperScript(bad), /PID inválido/);
  assert.match(helperScript(99), /SetThreadExecutionState\(0x80000001\)/);
});

test('ajudante real: roda no Windows e se encerra sozinho quando o processo pai não existe', { skip: process.platform !== 'win32' }, async () => {
  const t0 = Date.now();
  const h = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', helperScript(2147483000)], { windowsHide: true, stdio: 'ignore' });
  const code = await new Promise(res => { h.on('exit', c => res(c)); setTimeout(() => { h.kill(); res('travou'); }, 25000); });
  assert.equal(code, 0, 'saiu sozinho em vez de ficar segurando o PC'); assert.ok(Date.now() - t0 < 24000);
});
