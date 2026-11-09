import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, addProject, addAgent, task, waitFor } from './helpers.mjs';

const FINAL = ['completed', 'failed', 'cancelled', 'blocked', 'interrupted'];
const allFinal = store => { const ts = store.list('tasks'); return ts.length && ts.every(t => FINAL.includes(t.status)); };
const link = (store, P, from, to, extra = {}) => store.put('links', { id: `l-${from.id}-${to.id}`, projectId: P.id, from: from.id, to: to.id, maxHops: 3, enabled: true, ...extra });

test('ligação A → B: o trabalho de A vira tarefa de B com resumo e arquivos (passagem registrada)', async () => {
  const { store, runner } = await setup({ concurrency: { global: 2, provider: { codex: 2, claude: 1 }, video: 1 } });
  const P = await addProject(store, 'lk1'), A = addAgent(store, 'a', { mode: 'write', role: 'Montador' }), B = addAgent(store, 'b', { role: 'Revisor' });
  link(store, P, A, B);
  const t = task(store, P, A, 'write=out/x.txt:oi answer=pronto'); await runner.pump();
  await waitFor(() => store.list('tasks').length === 2 && allFinal(store), 25000, 'A e B concluídas');
  const next = store.list('tasks').find(x => x.id !== t.id);
  assert.equal(next.agent.id, B.id); assert.equal(next.hops, 1); assert.equal(next.linkFrom, t.id); assert.equal(next.status, 'completed');
  const msg = store.list('messages').find(m => m.toTask === next.id);
  assert.equal(msg.type, 'repasse'); assert.equal(msg.fromTask, t.id); assert.deepEqual(msg.files.map(f => f.path), ['out/x.txt']);
  assert.ok(store.events(t.id).some(e => /Repassado para/.test(e.text || '')));
});

test('A ↔ B se respondem, mas param no limite de repasses', async () => {
  const { store, runner } = await setup({ concurrency: { global: 2, provider: { codex: 2, claude: 1 }, video: 1 } });
  const P = await addProject(store, 'lk2'), A = addAgent(store, 'a'), B = addAgent(store, 'b');
  link(store, P, A, B, { maxHops: 3 }); link(store, P, B, A, { maxHops: 3 });
  const t = task(store, P, A, 'answer=feito'); await runner.pump();
  await waitFor(() => store.list('tasks').length === 4 && allFinal(store), 40000, 'quatro tarefas');
  await new Promise(r => setTimeout(r, 800));
  const ts = store.list('tasks').sort((x, y) => x.order - y.order);
  assert.equal(ts.length, 4, 'A, B(1), A(2), B(3) e nada além disso'); assert.deepEqual(ts.map(x => x.hops), [0, 1, 2, 3]); assert.deepEqual(ts.map(x => x.agent.id), ['a', 'b', 'a', 'b']);
  assert.ok(store.events(ts[3].id).some(e => /Limite de 3 repasse/.test(e.text || '')));
});

test('parada por "SEM PENDÊNCIAS", ligação desligada e tarefa de fluxo de equipe não repassam', async () => {
  const { store, runner } = await setup({ concurrency: { global: 2, provider: { codex: 2, claude: 1 }, video: 1 } });
  const P = await addProject(store, 'lk3'), A = addAgent(store, 'a'), B = addAgent(store, 'b'), C = addAgent(store, 'c');
  link(store, P, A, B); link(store, P, C, B, { enabled: false });
  const stop = task(store, P, A, 'answer=SEM_PENDÊNCIAS'), off = task(store, P, C, 'answer=feito'); await runner.pump();
  await waitFor(() => allFinal(store), 25000, 'duas tarefas'); await new Promise(r => setTimeout(r, 800));
  assert.equal(store.list('tasks').length, 2, 'nenhuma tarefa nova nasceu');
  assert.ok(store.events(stop.id).some(e => /não há pendências/i.test(e.text || '')));
  assert.equal(store.list('messages').length, 0);
});

test('ligação com condição: "só se aprovado" segue no APROVADO e não no REPROVADO; "só se reprovado" faz o contrário; "sempre" continua parando no SEM PENDÊNCIAS', async () => {
  const { store, runner } = await setup({ concurrency: { global: 3, provider: { codex: 3, claude: 1 }, video: 1 } });
  const P = await addProject(store, 'lk-when'), R = addAgent(store, 'rev', { role: 'Revisor' }), OK = addAgent(store, 'ok'), FIX = addAgent(store, 'fix'), ALW = addAgent(store, 'alw');
  link(store, P, R, OK, { when: 'approved' }); link(store, P, R, FIX, { when: 'rejected' }); link(store, P, R, ALW);
  const aprovado = task(store, P, R, 'answer=Tudo_certo._VEREDITO:_APROVADO'); await runner.pump();
  await waitFor(() => store.list('tasks').length === 2 && allFinal(store), 25000, 'aprovado → só OK'); await new Promise(r => setTimeout(r, 600));
  assert.deepEqual(store.list('tasks').filter(t => t.id !== aprovado.id).map(t => t.agent.id), ['ok'], 'só a ligação “aprovado” seguiu (a “sempre” para no veredito de aprovação)');
  assert.ok(store.events(aprovado.id).some(e => /só se reprovado.*não foi atendida.*aprovado/.test(e.text || '')));
  const antes = store.list('tasks').length, rep = task(store, P, R, 'answer=Faltou_cobrir_o_caso_X._VEREDITO:_REPROVADO'); await runner.pump();
  await waitFor(() => store.list('tasks').length === antes + 3 && allFinal(store), 25000, 'reprovado → FIX e ALW'); await new Promise(r => setTimeout(r, 600));
  assert.deepEqual(store.list('tasks').filter(t => t.linkFrom === rep.id).map(t => t.agent.id).sort(), ['alw', 'fix'], 'reprovado: segue a “reprovado” e a “sempre”, não a “aprovado”');
});
