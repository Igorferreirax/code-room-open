import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { setup, addProject, addAgent, waitFor } from './helpers.mjs';
import { Batches } from '../server/batches.mjs';

const FALAS = Array.from({ length: 9 }, (_, i) => `Fala número ${i + 1} do episódio, com algum texto para contar.`).join('\n');
const PROMPTS = '| Arquivo | Fala | Prompt |\n|---|---|---|\n' + ['c01', 'c02', 'c03', 'c04'].map(c => `| ${c} | 1 | cena ${c} |`).join('\n') + '\n| v01 | 3 | clipe |\n| v02 | 6 | clipe |\n';
async function episode(P, name, { falas = FALAS, prompts = PROMPTS } = {}) {
  const dir = join(P.path, 'episodios', name); await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'falas.txt'), falas); if (prompts) await writeFile(join(dir, 'PROMPTS-FLOW.md'), prompts); await writeFile(join(dir, 'BRIEF.md'), `# ${name}\n`);
  return `episodios/${name}`;
}
// Esteira de produção falsa do episódio "curupira": composição pronta e o script de volume da skill.
async function prodCurupira(P) {
  const proj = join(P.path, 'videos', '2026-01-01_cordel-curupira', 'projeto'); await mkdir(proj, { recursive: true }); await writeFile(join(proj, 'index.html'), '<html></html>');
  const skill = join(P.path, '.claude', 'skills', 'causo-sombrio', 'scripts'); await mkdir(skill, { recursive: true }); await writeFile(join(skill, 'loud.py'), '# volume');
  return join(P.path, 'videos', '2026-01-01_cordel-curupira');
}
// Executor de mentira: simula check, render do HyperFrames e o script de volume, e registra as chamadas.
function fakeExec() {
  const calls = [], st = { failCheck: false, failRender: false };
  const exec = async (cmd, args, { cwd, onLine }) => {
    calls.push({ cmd, args, cwd }); onLine?.('linha de progresso');
    if (cmd === 'hyperframes' && args[0] === 'check') return st.failCheck ? { code: 1, tail: 'erro de composição' } : { code: 0, tail: '' };
    if (cmd === 'hyperframes' && args[0] === 'render') { if (st.failRender) return { code: 2, tail: 'sem memória' }; const out = resolve(cwd, args[args.indexOf('-o') + 1]); await mkdir(dirname(out), { recursive: true }); await writeFile(out, Buffer.alloc(20000, 3)); return { code: 0, tail: '' }; }
    if (cmd === 'python') { await mkdir(dirname(args[3]), { recursive: true }); await writeFile(args[3], Buffer.alloc(20000, 4)); return { code: 0, tail: '' }; }
    return { code: 0, tail: '' };
  };
  return { exec, calls, st };
}
const boot = async () => {
  const { store, runner, orchestrator } = await setup({ concurrency: { global: 1, provider: { codex: 1 }, video: 1 } });
  const fx = fakeExec(); orchestrator.batches = new Batches(store, orchestrator, { exec: fx.exec });
  const P = await addProject(store, 'lote'), A = addAgent(store, 'produtor', { mode: 'write', role: 'Montador', instructions: '[[fake answer=ETAPA:_CONCLUÍDA]]' });
  return { store, runner, orchestrator, B: orchestrator.batches, P, A, fx };
};
const settled = (store, id, status) => waitFor(() => store.get('batches', id).episodes.every(e => e.status === status), 30000, `episódios ${status}`);
const stages = store => store.list('tasks').sort((x, y) => x.order - y.order).map(t => t.batchStage);

test('estimativa vem dos arquivos reais; o que não se sabe fica indisponível (nunca zero)', async () => {
  const { B, P, A } = await boot();
  const f = await episode(P, 'EP04-a');
  const batch = await B.create({ name: 'Lote 1', projectId: P.id, agentId: A.id, folders: [f] });
  assert.equal(batch.status, 'aguardando_creditos'); assert.equal(batch.estimate.images, 4); assert.equal(batch.estimate.clips, 2);
  assert.equal(batch.estimate.voiceCredits, batch.episodes[0].chars); assert.equal(batch.estimate.flowCredits, null, 'sem preço por imagem informado');
  B.saveCosts({ flowPerImage: 10, flowPerClip: 30 });
  assert.equal(B.estimate(batch.episodes).flowCredits, 4 * 10 + 2 * 30);
  await assert.rejects(B.create({ name: 'x', projectId: P.id, agentId: A.id, folders: [await episode(P, 'EP05-ruim', { prompts: null })] }), /incompleto/);
  await assert.rejects(B.create({ name: 'x', projectId: P.id, agentId: A.id, folders: ['../fora'] }), /fora do projeto|incompleto/i);
});

test('nada roda antes da aprovação; aprovação exige os números certos; etapas de crédito só depois', async () => {
  const { store, B, P, A } = await boot();
  B.saveCosts({ flowPerImage: 10, flowPerClip: 30 });
  const batch = await B.create({ name: 'Lote', projectId: P.id, agentId: A.id, folders: [await episode(P, 'EP04-a')] });
  await new Promise(r => setTimeout(r, 300)); assert.equal(store.list('tasks').length, 0, 'nenhuma tarefa antes da aprovação');
  assert.throws(() => B.approve(batch.id, { voiceCredits: 1, flowCap: 1000 }), /Confirme os créditos de voz/);
  assert.throws(() => B.approve(batch.id, { voiceCredits: batch.estimate.voiceCredits }), /teto/i);
  assert.throws(() => B.approve(batch.id, { voiceCredits: batch.estimate.voiceCredits, flowCap: 10 }), /menor que a estimativa/);
  const ok = B.approve(batch.id, { voiceCredits: batch.estimate.voiceCredits, flowCap: 500 });
  assert.equal(ok.status, 'em_producao'); assert.equal(ok.approval.flowCap, 500);
  assert.throws(() => B.approve(batch.id, { voiceCredits: batch.estimate.voiceCredits, flowCap: 500 }), /não está aguardando/);
});

test('esteira: agente monta; o Code Room renderiza a prévia; para no portão; ajuste refaz montagem+render sem regastar crédito; aprovar gera o final', async () => {
  const { store, B, P, A, fx } = await boot(); const prod = await prodCurupira(P);
  const batch = await B.create({ name: 'Lote', projectId: P.id, agentId: A.id, folders: [await episode(P, 'EP04-curupira')] });
  B.approve(batch.id, { voiceCredits: batch.estimate.voiceCredits, flowCap: 900 });
  await settled(store, batch.id, 'aguardando_previa');
  let b = store.get('batches', batch.id); assert.equal(b.status, 'aguardando_previa');
  assert.deepEqual(stages(store), ['preparar', 'voz', 'imagens', 'clipes', 'montagem'], 'prévia e final NÃO são tarefas de agente');
  assert.match(store.list('tasks').find(t => t.batchStage === 'imagens').objective, /teto de créditos do Flow aprovado para o LOTE é 900/);
  assert.match(store.list('tasks').find(t => t.batchStage === 'montagem').objective, /NÃO renderize o MP4/);
  assert.deepEqual(fx.calls.map(c => c.args[0]), ['check', 'render'], 'o Code Room rodou check e render');
  assert.ok(existsSync(join(prod, 'saida', 'previa-curupira.mp4')), 'a prévia existe em saida/');
  const ep = b.episodes[0];
  assert.throws(() => B.requestChanges(batch.id, ep.id, ''), /o que ajustar/);
  B.requestChanges(batch.id, ep.id, 'legenda menor');
  await settled(store, batch.id, 'aguardando_previa');
  const mont = store.list('tasks').filter(t => t.batchStage === 'montagem').sort((x, y) => x.order - y.order); assert.equal(mont.length, 2); assert.match(mont.at(-1).objective, /legenda menor/);
  assert.equal(store.list('tasks').filter(t => ['voz', 'imagens', 'clipes'].includes(t.batchStage)).length, 3, 'o ajuste não regasta créditos');
  assert.equal(fx.calls.filter(c => c.args[0] === 'render').length, 2);
  B.approvePreview(batch.id, ep.id);
  await settled(store, batch.id, 'pronto');
  b = store.get('batches', batch.id); assert.equal(b.status, 'concluido');
  const py = fx.calls.find(c => c.cmd === 'python'); assert.match(py.args[1], /loud\.py$/); assert.ok(py.args.includes('libx264'));
  assert.ok(existsSync(join(prod, 'saida', 'final-curupira.mp4')), 'o final foi gerado a partir da prévia');
});

test('pastas de aprovação: prévia espera em AGUARDANDO_APROVACAO, aprovar entrega em POSTAR_<CANAL>, reprovar vai para a LIXEIRA (nada apagado)', async () => {
  const { store, B, P, A } = await boot(); const prod = await prodCurupira(P);
  const batch = await B.create({ name: 'Canal Teste: lote', projectId: P.id, agentId: A.id, folders: [await episode(P, 'EP04-curupira')] });
  B.approve(batch.id, { voiceCredits: batch.estimate.voiceCredits, flowCap: 900 });
  await settled(store, batch.id, 'aguardando_previa');
  const root = P.path, wait = join(root, 'AGUARDANDO_APROVACAO', 'CANAL_TESTE', 'EP04-curupira');
  assert.ok(existsSync(join(wait, 'previa-curupira.mp4')), 'prévia copiada para a pasta de espera');
  assert.ok(!existsSync(join(root, 'POSTAR_CANAL_TESTE')), 'nada em POSTAR antes de aprovar');
  const ep = store.get('batches', batch.id).episodes[0];
  B.approvePreview(batch.id, ep.id); await settled(store, batch.id, 'pronto');
  assert.ok(existsSync(join(root, 'POSTAR_CANAL_TESTE', 'EP04-curupira', 'final-curupira.mp4')), 'final entregue em POSTAR_<CANAL>');
  assert.ok(!existsSync(wait), 'cópia de espera removida');
  await B.reject(batch.id, ep.id);
  const after = store.get('batches', batch.id); assert.equal(after.episodes[0].status, 'reprovado');
  assert.ok(!existsSync(join(root, 'POSTAR_CANAL_TESTE', 'EP04-curupira')), 'saiu de POSTAR');
  assert.ok(existsSync(join(root, after.episodes[0].trash, 'EP04-curupira', 'final-curupira.mp4')) || existsSync(join(root, after.episodes[0].trash)), 'foi para a LIXEIRA, não apagado');
});

test('falha de check ou de render vira "falhou" com o motivo; "tentar de novo" refaz só o render', async () => {
  const { store, B, P, A, fx } = await boot(); await prodCurupira(P);
  const batch = await B.create({ name: 'Lote', projectId: P.id, agentId: A.id, folders: [await episode(P, 'EP04-curupira')] });
  fx.st.failCheck = true; B.approve(batch.id, { voiceCredits: batch.estimate.voiceCredits, flowCap: 900 });
  await settled(store, batch.id, 'falhou');
  let b = store.get('batches', batch.id); assert.equal(b.status, 'com_falha'); assert.match(b.episodes[0].note, /check do HyperFrames falhou/); assert.equal(fx.calls.filter(c => c.args[0] === 'render').length, 0, 'sem check bom não renderiza');
  fx.st.failCheck = false; fx.st.failRender = true; B.retry(batch.id, b.episodes[0].id); await settled(store, batch.id, 'falhou');
  assert.match(store.get('batches', batch.id).episodes[0].note, /render falhou/);
  fx.st.failRender = false; B.retry(batch.id, b.episodes[0].id); await settled(store, batch.id, 'aguardando_previa');
  assert.deepEqual(stages(store), ['preparar', 'voz', 'imagens', 'clipes', 'montagem'], 'nenhuma etapa de agente (nem crédito) foi repetida');
});

test('serviço reiniciado no meio do render: o episódio não fica preso, vira falhou', async () => {
  const { store, orchestrator, P, A } = await boot();
  store.put('batches', { id: 'bx', name: 'x', projectId: P.id, agentId: A.id, status: 'em_producao', approval: { at: 'x' }, createdAt: new Date().toISOString(), episodes: [{ id: 'ex', folder: 'episodios/EP04-curupira', stage: 'previa', status: 'em_andamento', render: { stage: 'previa' }, tasks: {} }] });
  new Batches(store, orchestrator);
  const e = store.get('batches', 'bx').episodes[0]; assert.equal(e.status, 'falhou'); assert.match(e.note, /reiniciado durante o render/); assert.equal(store.get('batches', 'bx').status, 'com_falha');
});

test('cancelar o lote encerra as etapas em andamento', async () => {
  const { store, B, P, A } = await boot();
  const batch = await B.create({ name: 'Lote', projectId: P.id, agentId: A.id, folders: [await episode(P, 'EP04-a')] });
  B.approve(batch.id, { voiceCredits: batch.estimate.voiceCredits, flowCap: 900 });
  await waitFor(() => store.list('tasks').length >= 1, 5000);
  const t = store.list('tasks')[0]; await waitFor(() => store.get('tasks', t.id).status === 'completed', 15000);
  await waitFor(() => store.list('tasks').length >= 2, 15000);
  const cur = () => store.get('batches', batch.id);
  B.cancel(batch.id); await waitFor(() => cur().status === 'cancelado', 5000);
  assert.ok(cur().episodes.every(e => e.status === 'cancelado' || e.status === 'pronto'));
});

test('lê também o formato "**Cena N (fala N) — CLIPE N**" dos roteiros da fábrica', async () => {
  const { B, P, A } = await boot();
  const prompts = ['**Cena 1 (fala 1)** — a', '**Cena 2 (fala 2)** — b', '**Cena 3 (fala 3) — CLIPE 1** — c', '**Cena 4 (fala 4)** — d'].join('\n\n');
  const f = await episode(P, 'EP06-cena', { prompts });
  const b = await B.create({ name: 'Lote', projectId: P.id, agentId: A.id, folders: [f] });
  assert.equal(b.estimate.images, 4); assert.equal(b.estimate.clips, 1);
});

test('etapa que o agente declara BLOQUEADA (ou sem a linha ETAPA) não avança nem gasta a próxima', async () => {
  const { store, B, P, A } = await boot();
  store.put('agents', { ...A, instructions: '[[fake answer=ETAPA:_BLOQUEADA_—_Flow_não_autorizado_no_agente]]' });
  const batch = await B.create({ name: 'Lote', projectId: P.id, agentId: A.id, folders: [await episode(P, 'EP04-a')] });
  B.approve(batch.id, { voiceCredits: batch.estimate.voiceCredits, flowCap: 900 });
  await settled(store, batch.id, 'falhou');
  const b = store.get('batches', batch.id); assert.equal(b.status, 'com_falha'); assert.match(b.episodes[0].note, /Flow não autorizado/);
  assert.equal(store.list('tasks').length, 1, 'parou na primeira etapa; nada foi criado depois');
  store.put('agents', { ...A, instructions: '[[fake answer=feito]]' });
  B.retry(batch.id, b.episodes[0].id); await settled(store, batch.id, 'falhou');
  assert.match(store.get('batches', batch.id).episodes[0].note, /não declarou/);
});

test('lote que recomeça de "imagens" não cobra voz de novo e pula as etapas anteriores', async () => {
  const { store, B, P, A } = await boot(); await prodCurupira(P);
  B.saveCosts({ flowPerImage: 8, flowPerClip: 30 });
  const batch = await B.create({ name: 'Lote', projectId: P.id, agentId: A.id, fromStage: 'imagens', folders: [await episode(P, 'EP04-curupira')] });
  assert.equal(batch.estimate.voiceCredits, 0); assert.equal(batch.estimate.flowCredits, 4 * 8 + 2 * 30);
  B.approve(batch.id, { voiceCredits: 0, flowCap: 300 });
  await settled(store, batch.id, 'aguardando_previa');
  assert.deepEqual(stages(store), ['imagens', 'clipes', 'montagem']);
});
