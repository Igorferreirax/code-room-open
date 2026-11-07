import test from 'node:test';
import assert from 'node:assert/strict';
import { AutoClean, MIN_GAP_MS } from '../server/autoclean.mjs';
import { Store } from '../server/store.mjs';

const mk = (result = { removed: { tasks: 2, runs: 3, files: 1, anterior: false, notices: 0 }, freedBytes: 5 * 1048576 }) => {
  const store = new Store(':memory:'); let t = Date.parse('2026-11-07T12:00:00Z'); const calls = [];
  const ac = new AutoClean({ store, dataDir: 'D', appDir: 'A', now: () => t, clean: async o => { calls.push(o); return result; } });
  return { ac, store, calls, advance: ms => { t += ms; } };
};

test('limpeza automática: vem desligada e não apaga nada enquanto estiver desligada', async () => {
  const { ac, calls, store } = mk();
  assert.deepEqual(ac.status(), { auto: false, lastRun: null, last: null });
  assert.equal(await ac.tick(), null); assert.equal(calls.length, 0); assert.equal(store.list('notices').length, 0);
});

test('limpeza automática: ligada roda uma vez por dia, registra o resultado e avisa quanto liberou', async () => {
  const { ac, calls, store, advance } = mk();
  ac.setEnabled(true); assert.equal(ac.status().auto, true);
  await ac.tick(); assert.equal(calls.length, 1); assert.deepEqual({ ...calls[0], store: undefined }, { store: undefined, dataDir: 'D', appDir: 'A', now: calls[0].now });
  const st = ac.status(); assert.equal(st.last.items, 6); assert.equal(st.last.freedBytes, 5 * 1048576); assert.ok(st.lastRun);
  const n = store.list('notices'); assert.equal(n.length, 1); assert.equal(n[0].kind, 'cleanup'); assert.equal(n[0].seen, false);
  assert.match(n[0].text, /Apaguei 6 itens antigos e liberei 5,0 MB/); assert.match(n[0].text, /Nada seu foi tocado/);
  advance(3 * 3600e3); await ac.tick(); assert.equal(calls.length, 1, 'no mesmo dia não repete');
  advance(MIN_GAP_MS); await ac.tick(); assert.equal(calls.length, 2, 'no dia seguinte roda de novo');
});

test('limpeza automática: sem nada para apagar não faz barulho; falha do apagador não derruba o serviço', async () => {
  const vazio = mk({ removed: { tasks: 0, runs: 0, files: 0, anterior: false, notices: 0 }, freedBytes: 0 });
  vazio.ac.setEnabled(true); await vazio.ac.tick(); assert.equal(vazio.store.list('notices').length, 0, 'nada apagado: nenhum aviso'); assert.equal(vazio.ac.status().last.items, 0); assert.ok(vazio.ac.status().lastRun);
  const store = new Store(':memory:'), ruim = new AutoClean({ store, dataDir: 'D', appDir: 'A', clean: async () => { throw new Error('disco cheio'); } });
  ruim.setEnabled(true); assert.equal(await ruim.tick(), null); assert.equal(ruim.running, false, 'destrava depois da falha'); assert.equal(ruim.status().lastRun, null, 'falhou: tenta de novo na próxima conferência');
});

test('limpeza automática: desligar de novo para na hora; ligar e desligar mantém o resto da configuração', async () => {
  const { ac, calls, advance } = mk(); ac.setEnabled(true); await ac.tick(); const run = ac.status().lastRun;
  ac.setEnabled(false); advance(MIN_GAP_MS * 2); await ac.tick(); assert.equal(calls.length, 1); assert.equal(ac.status().auto, false); assert.equal(ac.status().lastRun, run);
  assert.equal(ac.setEnabled('sim').auto, false, 'só true liga (nada de valor truthy por engano)');
});

test('limpeza automática: o agendador usa timers que não seguram o programa aberto e para limpo', () => {
  const { ac } = mk(); ac.start(); assert.ok(ac.timer && ac.first); const t = ac.timer; ac.start(); assert.equal(ac.timer, t, 'não duplica'); ac.stop(); assert.equal(ac.timer, null);
});
