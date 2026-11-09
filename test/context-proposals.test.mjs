import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Store } from '../server/store.mjs';
import { emptyContext, proposeDecision, resolveProposal } from '../server/context.mjs';

test('sugestão de decisão: título + primeira frase do resumo + revisão; uma por tarefa; no máximo 10; aceitar edita e entra em Decisões; descartar some', () => {
  let c = emptyContext('p1'); const r = proposeDecision(c, { taskId: 't1', title: 'Reel do suporte', summary: 'Montei o vídeo com preço em destaque. Depois fiz a legenda. Fim.', note: 'ótimo ritmo' });
  assert.equal(r.added, true); assert.equal(r.ctx.proposed[0].text, 'Reel do suporte — Montei o vídeo com preço em destaque. — Revisão: ótimo ritmo'); c = r.ctx;
  assert.equal(proposeDecision(c, { taskId: 't1', title: 'x', summary: 'y' }).added, false, 'uma sugestão por tarefa'); assert.equal(proposeDecision(c, { taskId: 't9', title: '', summary: '' }).added, false, 'sem texto não sugere');
  for (let i = 0; i < 12; i++) c = proposeDecision(c, { taskId: 'x' + i, title: 'T' + i, summary: 'resumo ' + i }).ctx; assert.equal(c.proposed.length, 10); assert.equal(c.proposed.at(-1).taskId, 'x11');
  const id = c.proposed[0].id, ac = resolveProposal(c, id, true, '  Decidido: preço sempre em destaque  '); assert.deepEqual(ac.decisions, ['Decidido: preço sempre em destaque']); assert.ok(!ac.proposed.some(p => p.id === id));
  const di = resolveProposal(c, c.proposed[1].id, false); assert.equal((di.decisions || []).length, 0); assert.equal(di.proposed.length, 9);
  assert.throws(() => resolveProposal(c, 'nao-existe', true), /não encontrada/); assert.throws(() => resolveProposal(c, c.proposed[0].id, true, '   '), /não pode ficar vazia/);
  assert.equal(proposeDecision(c, { taskId: 'longo', title: 'a'.repeat(300), summary: 'b'.repeat(900) }).ctx.proposed.at(-1).text.length <= 500, true);
});

test('HTTP: aprovar uma entrega gera a sugestão; aceitar vira decisão do projeto (e vai para o prompt dos agentes); descartar remove', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cr-prop-')), proj = await mkdtemp(join(tmpdir(), 'cr-propp-')), port = 19000 + Math.floor(Math.random() * 10000), now = new Date().toISOString();
  const seed = new Store(join(dir, 'code-room.sqlite')), pj = { id: 'pj1', name: 'Achadinhos', area: 'Vídeo', path: proj }, ag = { id: 'ag1', name: 'Produtor', role: 'r', room: 'Vídeo', provider: 'claude', mode: 'write' };
  seed.put('projects', { ...pj, createdAt: now });
  const task = id => ({ id, kind: 'work', status: 'completed', project: pj, agent: ag, objective: 'Lote "Reel ' + id + '"', createdAt: now, updatedAt: now, attempts: [], attemptCount: 0, criteria: [], inputs: [], limits: {}, result: { summary: 'Vídeo pronto com a chamada para o grupo. Sobrou tempo.', deliverables: { available: true, files: [] } } });
  seed.put('tasks', task('t1')); seed.put('tasks', task('t2')); seed.close();
  const child = spawn(process.execPath, ['server/main.mjs'], { cwd: resolve('.'), env: { ...process.env, CODE_ROOM_DATA: dir, CODE_ROOM_PORT: String(port) }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await Promise.race([once(child.stdout, 'data'), new Promise((_, no) => setTimeout(() => no(new Error('Servidor não iniciou')), 8000))]);
    const key = (await readFile(join(dir, 'access.key'), 'utf8')).trim(), H = { 'X-Code-Room-Key': key, 'Content-Type': 'application/json' }, base = `http://127.0.0.1:${port}`, post = (p, b) => fetch(base + p, { method: 'POST', headers: H, body: JSON.stringify(b) }), get = p => fetch(base + p, { headers: H });
    const ap = await (await post('/api/tasks/t1/approve', { note: 'ótimo' })).json(); assert.match(ap.proposal, /^p/);
    let c = await (await get('/api/projects/pj1/context')).json(); assert.equal(c.proposed.length, 1); assert.match(c.proposed[0].text, /^Reel t1 — Vídeo pronto com a chamada para o grupo\. — Revisão: ótimo$/); assert.deepEqual(c.decisions, []);
    const acc = await post(`/api/projects/pj1/context/proposals/${c.proposed[0].id}/accept`, { text: 'Sempre fechar com a chamada para o grupo na bio' }); assert.equal(acc.status, 200); c = await acc.json(); assert.deepEqual(c.decisions, ['Sempre fechar com a chamada para o grupo na bio']); assert.equal(c.proposed.length, 0);
    await post('/api/tasks/t2/approve', { note: '' }); c = await (await get('/api/projects/pj1/context')).json(); assert.equal(c.proposed.length, 1);
    const dis = await (await post(`/api/projects/pj1/context/proposals/${c.proposed[0].id}/dismiss`, {})).json(); assert.equal(dis.proposed.length, 0); assert.equal(dis.decisions.length, 1);
    assert.equal((await post('/api/projects/pj1/context/proposals/inexistente/accept', {})).status, 400);
    const salvo = await post('/api/projects/pj1/context', { goals: 'Postar 2 por dia' }); const sc = await salvo.json(); assert.equal(sc.goals, 'Postar 2 por dia'); assert.equal(sc.decisions.length, 1, 'salvar o formulário não perde as decisões');
  } finally { const closed = once(child, 'close'); child.kill(); await closed; await rm(dir, { recursive: true, force: true }); await rm(proj, { recursive: true, force: true }); }
});
