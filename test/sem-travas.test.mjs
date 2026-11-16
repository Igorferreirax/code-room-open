import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fixProposal } from '../server/assistant.mjs';
import { snapshot, diffSnapshots } from '../server/deliverables.mjs';
import { parseFolders, knownFolders } from '../server/known-folders.mjs';
import { tempDir } from './helpers.mjs';

const world = (over = {}) => ({
  agents: [{ id: 'a1', name: 'Desenvolvedor', role: 'dev', provider: 'codex', mode: 'write' }, { id: 'a2', name: 'Revisor', role: 'rev', provider: 'agy', mode: 'read' }],
  teams: [{ name: 'Equipe Site', members: [] }], connected: new Set(['claude']), projects: [{ id: 'p1', name: 'Loja', agentIds: ['a1'] }], skills: [], ...over });
const agente = extra => ({ acao: 'criar_agente', nome: 'Redator', funcao: 'Escreve textos', provedor: 'codex', ...extra });

test('Nico: agente que já existe é reaproveitado em vez de travar a equipe', () => {
  const r = fixProposal(agente({ nome: 'Desenvolvedor' }), world());
  assert.equal(r.n, null, 'sem projeto: o cartão some e a equipe usa o agente existente');
  assert.match(r.notes.join(), /reaproveitei o agente “Desenvolvedor”/);
  const team = fixProposal({ acao: 'criar_equipe', nome: 'Nova', membros: [{ papel: 'desenvolvedor', agente: 'Desenvolvedor' }] }, world());
  assert.equal(team.n.valid, true); assert.equal(team.n.payload.members[0].agentId, 'a1');
  const inProject = fixProposal(agente({ nome: 'Revisor', provedor: 'claude' }), world(), undefined, { focusProject: 'Loja' });
  assert.equal(inProject.n.type, 'vincular_agente'); assert.equal(inProject.n.payload.agentId, 'a2');
  const already = fixProposal(agente({ nome: 'Desenvolvedor' }), world(), undefined, { focusProject: 'Loja' });
  assert.equal(already.n, null); assert.match(already.notes.join(), /já está no projeto/);
});

test('Nico: IA que não está conectada é trocada pela conectada, sem perder o agente', () => {
  const r = fixProposal(agente({ modelo: 'gpt-5.5', esforco: 'high' }), world());
  assert.equal(r.n.valid, true); assert.equal(r.n.payload.provider, 'claude'); assert.equal(r.n.payload.model, '');
  assert.match(r.notes.join(), /vai usar claude, porque codex não está conectada/);
  const kiro = fixProposal(agente(), world({ connected: new Set(['x-kiro']) }));
  assert.equal(kiro.n.payload.provider, 'x-kiro', 'IA conectada pela pessoa também serve');
});

test('Nico: detalhe que só vale para outra IA sai do agente; equipe com nome repetido ganha sufixo', () => {
  const r = fixProposal(agente({ provedor: 'claude', pesquisar_web: true }), world({ connected: new Set(['codex', 'claude']) }));
  assert.equal(r.n.valid, true);
  const p = fixProposal(agente({ programas: ['ffmpeg'] }), world({ connected: new Set(['codex']) }));
  assert.equal(p.n.valid, true); assert.deepEqual(p.n.payload.commands, []); assert.match(p.notes.join(), /sem a lista de programas/);
  const t = fixProposal({ acao: 'criar_equipe', nome: 'Equipe Site', membros: [{ papel: 'desenvolvedor', agente: 'Desenvolvedor' }] }, world());
  assert.equal(t.n.valid, true); assert.equal(t.n.payload.name, 'Equipe Site (2)');
});

test('pasta extra grande: o primeiro nível é acompanhado e mudanças nele aparecem', async () => {
  const dir = await tempDir('cr-shallow-');
  try {
    await writeFile(join(dir, 'solto.pdf'), 'x'); await mkdir(join(dir, 'Projeto Grande')); await writeFile(join(dir, 'Projeto Grande', 'a.txt'), 'a');
    const before = await snapshot(dir, { strict: true, shallow: true });
    assert.equal(before.complete, true); assert.equal(before.shallow, true); assert.ok(before.files.has('Projeto Grande/')); assert.ok(!before.files.has('Projeto Grande/a.txt'));
    await mkdir(join(dir, 'Documentos PDF')); await rm(join(dir, 'solto.pdf')); await writeFile(join(dir, 'Documentos PDF', 'solto.pdf'), 'x');
    const diff = await diffSnapshots(dir, before, await snapshot(dir, { strict: true, shallow: true }));
    assert.equal(diff.available, true);
    assert.deepEqual(diff.files.map(f => `${f.change}:${f.path}`), ['created:Documentos PDF/', 'deleted:solto.pdf']);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('pastas da pessoa: usa o caminho que o Windows informa (com acento) e cai no OneDrive ou no padrão', () => {
  const home = join('C:', 'Users', 'Ana'), desk = join(home, 'OneDrive', 'Área de Trabalho'), docs = join('D:', 'Docs');
  assert.deepEqual(parseFolders(`desktop=${desk}\r\ndocuments=${docs}\r\ndownloads=\r\n`), { desktop: desk, documents: docs });
  const has = new Set([desk, docs, join(home, 'Downloads')]), exists = p => has.has(p);
  const f = knownFolders({ found: { desktop: desk, documents: docs }, home, exists, env: {} });
  assert.equal(f.desktop, desk); assert.equal(f.documents, docs); assert.equal(f.downloads, join(home, 'Downloads'));
  const g = knownFolders({ found: { desktop: join(home, 'Ãrea quebrada') }, home, exists, env: { OneDrive: join(home, 'OneDrive') } });
  assert.equal(g.desktop, desk, 'resposta estragada: acha a pasta do OneDrive');
});

test('print do chat: pasta própria por print, apagada depois; nada fora de assistant-images é tocado', async () => {
  const { saveChatImage, removeChatImage } = await import('../server/chat-image.mjs');
  const { existsSync } = await import('node:fs'); const { dirname, basename } = await import('node:path');
  const data = await tempDir('cr-print-');
  try {
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRwAAAABJRU5ErkJggg==';
    const a = saveChatImage(data, png), b = saveChatImage(data, png);
    assert.notEqual(dirname(a), dirname(b), 'cada print numa pasta'); assert.equal(basename(a), 'print.png');
    removeChatImage(data, a); assert.ok(!existsSync(dirname(a))); assert.ok(existsSync(b));
    removeChatImage(data, join(data, 'outra', 'x.png')); removeChatImage(data, data); assert.ok(existsSync(data) && existsSync(b), 'caminho estranho não apaga nada');
  } finally { await rm(data, { recursive: true, force: true }); }
});


test('Nico: "Só ver" uma pasta funciona sem Modo Piloto e, com Piloto ligado, roda só leitura', async () => {
  const { Store } = await import('../server/store.mjs'); const { Assistant, loadManual } = await import('../server/assistant.mjs');
  const data = await tempDir('cr-ver-'), store = new Store(join(data, 'db.sqlite')), tasks = [];
  try {
    const world = async () => ({ agents: [], teams: [], projects: [], connected: new Set(['claude']), skills: [], runs: [] });
    const asst = new Assistant({ store, root: process.cwd(), dataDir: data, world, pump: () => {}, mcpFn: () => [], createTaskFn: (st, input) => { const task = { id: 't' + tasks.length, ...input, extraDir: input.extraDir }; tasks.push(task); return { task }; } });
    store.put('settings', { id: 'assistant', provider: 'claude', briefedAt: new Date().toISOString(), manualHash: loadManual(process.cwd()).hash, knowledge: 'x', messages: [], thread: { id: 't1', title: 'T' }, others: [], order: ['t1'] });
    await asst.ask('Você consegue ver minha área de trabalho?', { extraDir: data, readOnly: true });
    assert.equal(tasks[0].extraDir, data); assert.equal(store.get('agents', tasks[0].agentId).mode, 'read', 'consulta: agente só leitura');
    let s = await asst.status(); assert.equal(s.messages.filter(m => m.role === 'user').at(-1).context.extraAccess, 'read');
    store.put('settings', { ...store.get('settings', 'assistant'), pending: null }); await asst.setAutonomy('pilot');
    await asst.ask('Só olhe a pasta', { extraDir: data, readOnly: true });
    assert.equal(store.get('agents', tasks[1].agentId).mode, 'read', 'Piloto ligado + "Só ver": esta resposta roda sem edição');
    store.put('settings', { ...store.get('settings', 'assistant'), pending: null });
    await asst.ask('Organize a pasta', { extraDir: data });
    assert.equal(store.get('agents', tasks[2].agentId).mode, 'write'); s = await asst.status(); assert.equal(s.messages.filter(m => m.role === 'user').at(-1).context.extraAccess, 'edit');
  } finally { store.close?.(); }
});

test('Nico: o seletor guarda IA, modelo e esforço por IA, e a próxima resposta usa a escolha', async () => {
  const { Store } = await import('../server/store.mjs'); const { Assistant, loadManual } = await import('../server/assistant.mjs');
  const data = await tempDir('cr-sel-'), store = new Store(join(data, 'db.sqlite')), tasks = [];
  const world = async () => ({ agents: [], teams: [], projects: [], connected: new Set(['claude', 'codex']), skills: [], runs: [] });
  const asst = new Assistant({ store, root: process.cwd(), dataDir: data, world, pump: () => {}, mcpFn: () => [], createTaskFn: (st, input) => { const task = { id: 't' + tasks.length, ...input }; tasks.push(task); return { task }; } });
  store.put('settings', { id: 'assistant', provider: 'claude', briefedAt: new Date().toISOString(), manualHash: loadManual(process.cwd()).hash, knowledge: 'x', messages: [], thread: { id: 't1', title: 'T' }, others: [], order: ['t1'] });
  let s = await asst.setProvider('codex', { model: 'gpt-5.5', effort: 'high' });
  assert.equal(s.provider, 'codex'); assert.equal(s.model, 'gpt-5.5'); assert.equal(s.effort, 'high');
  await asst.ask('oi');
  const ag = store.get('agents', tasks[0].agentId); assert.equal(ag.provider, 'codex'); assert.equal(ag.model, 'gpt-5.5'); assert.equal(ag.effort, 'high');
  s = await asst.setProvider('claude'); assert.equal(s.model, '', 'cada IA guarda o seu: o Claude continua no padrão');
  s = await asst.setProvider('codex'); assert.equal(s.model, 'gpt-5.5');
  await assert.rejects(() => asst.setProvider('agy'), /não está instalada/);
});
