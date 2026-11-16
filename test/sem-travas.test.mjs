import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fixProposal } from '../server/assistant.mjs';
import { snapshot, diffSnapshots } from '../server/deliverables.mjs';
import { parseShellFolders, knownFolders } from '../server/known-folders.mjs';
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

test('pastas da pessoa: lê o caminho real do Windows (ex.: OneDrive) e cai no padrão se falhar', () => {
  const out = '\r\nHKEY_CURRENT_USER\\...\\User Shell Folders\r\n    Desktop    REG_EXPAND_SZ    %USERPROFILE%\\OneDrive\\Área de Trabalho\r\n    Personal    REG_SZ    D:\\Docs\r\n';
  assert.deepEqual(parseShellFolders(out, { USERPROFILE: 'C:\\Users\\Ana' }), { desktop: 'C:\\Users\\Ana\\OneDrive\\Área de Trabalho', documents: 'D:\\Docs' });
  const f = knownFolders({ platform: 'linux', home: '/home/ana' });
  assert.ok(f.desktop.endsWith('Desktop') && f.downloads.endsWith('Downloads') && f.documents.endsWith('Documents'));
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
