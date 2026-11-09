import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Store } from '../server/store.mjs';
import { cleanConfig, checkVault, findNotes, termsOf, renderBlock, blockFor, clearCache, DEFAULTS } from '../server/obsidian.mjs';
import { tempDir } from './helpers.mjs';

async function vault() {
  const v = await tempDir('obsidian'); clearCache();
  await mkdir(join(v, '.obsidian'), { recursive: true }); await mkdir(join(v, 'SOFTWARE', 'CODE-ROOM'), { recursive: true }); await mkdir(join(v, 'Privado'), { recursive: true }); await mkdir(join(v, 'Receitas'), { recursive: true });
  await writeFile(join(v, 'SOFTWARE', 'CODE-ROOM', 'Achadinhos tom de voz.md'), '---\ntags: [marca, achadinhos]\n---\n# Tom\nFale de forma direta, com preço em destaque e chamada para o grupo na bio. [[Baratinho Tech]] usa **humor leve**.\n', 'utf8');
  await writeFile(join(v, 'SOFTWARE', 'CODE-ROOM', 'Roadmap.md'), 'Metas do produto e lançamento da versão final.', 'utf8');
  await writeFile(join(v, 'Privado', 'Senhas achadinhos.md'), 'segredo achadinhos preço', 'utf8');
  await writeFile(join(v, 'Receitas', 'Bolo.md'), 'Farinha, ovos e açúcar.', 'utf8');
  return v;
}

test('config: validada; caminho relativo, "..", barras e tamanhos são recusados', () => {
  assert.deepEqual(cleanConfig({}).exclude, DEFAULTS.exclude); assert.equal(cleanConfig({ enabled: true }).enabled, true);
  assert.throws(() => cleanConfig({ vault: 'pasta/relativa' }), /caminho completo/); assert.throws(() => cleanConfig({ exclude: ['a/b'] }), /sem barras/); assert.throws(() => cleanConfig({ exclude: new Array(25).fill('x') }), /até 20/);
  assert.deepEqual(cleanConfig({ byProject: { p1: '\\SOFTWARE\\CODE-ROOM\\' } }).byProject, { p1: 'SOFTWARE/CODE-ROOM' });
  assert.deepEqual(cleanConfig({ byProject: { p1: '/abs/x' } }).byProject, { p1: 'abs/x' }, 'barra inicial vira relativa ao cofre');
  for (const bad of ['../fora', 'a/../b', 'C:/x']) assert.throws(() => cleanConfig({ byProject: { p1: bad } }), /relativo/, bad);
  assert.equal(cleanConfig({ maxNotes: 99 }).maxNotes, 10);
});

test('cofre: exige a pasta .obsidian; conta as notas e ignora Privado e arquivos que não são .md', async () => {
  const v = await vault();
  assert.match((await checkVault(v + '-nao-existe')).error, /não existe/); const semObs = await tempDir('semobs'); assert.match((await checkVault(semObs)).error, /não parece um cofre/);
  const ok = await checkVault(v); assert.equal(ok.ok, true); assert.equal(ok.notes, 3, 'Privado fica de fora'); assert.ok(ok.sample.length >= 1);
});

test('busca: acha pelo título/tags/texto, tira o frontmatter e os links, respeita a pasta do projeto e ignora Privado', async () => {
  const v = await vault();
  const t = termsOf('Faça um Reel de achadinhos com o tom de voz da marca'); assert.ok(t.includes('achadinhos') && t.includes('marca') && !t.includes('para') && !t.includes('voz'), 'palavras curtas e comuns ficam de fora');
  const r = await findNotes({ vault: v, terms: t }); assert.equal(r[0].rel, 'SOFTWARE/CODE-ROOM/Achadinhos tom de voz.md'); assert.ok(r[0].tags.includes('marca'));
  assert.doesNotMatch(r[0].excerpt, /---|\[\[|\*\*/); assert.match(r[0].excerpt, /Baratinho Tech usa humor leve/); assert.ok(!r.some(n => n.rel.startsWith('Privado')));
  assert.equal((await findNotes({ vault: v, terms: ['bolo'] }))[0].title, 'Bolo');
  const f = await findNotes({ vault: v, terms: ['inexistente'], folder: 'SOFTWARE/CODE-ROOM' }); assert.equal(f.length, 2, 'com pasta do projeto, mostra as mais recentes dela mesmo sem coincidência');
  assert.equal((await findNotes({ vault: v, terms: ['inexistente'] })).length, 0, 'sem pasta e sem coincidência, nada vai ao agente');
});

test('segurança: atalho para fora do cofre não é seguido', async () => {
  const v = await vault(), fora = await tempDir('fora'); await writeFile(join(fora, 'segredo.md'), 'achadinhos token secreto', 'utf8');
  try { await symlink(fora, join(v, 'atalho'), 'junction'); } catch { return; }   // sem permissão de atalho neste computador: nada a provar
  clearCache(); const r = await findNotes({ vault: v, terms: ['achadinhos', 'segredo'] }); assert.ok(!r.some(n => /segredo|atalho/.test(n.rel)), 'não leu fora do cofre');
});

test('bloco do prompt: cabeça, trechos, limite de tamanho; vazio sem notas', async () => {
  const v = await vault(), notes = await findNotes({ vault: v, terms: ['achadinhos', 'roadmap'] });
  const b = renderBlock(notes, v); assert.match(b, /^# Referências do Obsidian da pessoa \(somente leitura/); assert.match(b, /Achadinhos tom de voz \(SOFTWARE\/CODE-ROOM\//); assert.ok(b.length <= 3700);
  assert.equal(renderBlock([], v), ''); assert.ok(renderBlock(new Array(30).fill({ title: 'N', rel: 'n.md', tags: [], excerpt: 'x'.repeat(550) }), v).length <= 3700);
});

test('por tarefa: desligado não envia nada; ligado envia; projeto Financeiro e conversa interna nunca recebem; erro não derruba a tarefa', async () => {
  const v = await vault(), store = new Store(':memory:'), task = (over = {}) => ({ objective: 'Escreva a legenda dos achadinhos no tom de voz da marca', project: { id: 'p1', name: 'Achadinhos', area: 'Vídeo' }, ...over }), ag = { role: 'Roteirista' };
  assert.deepEqual(await blockFor(store, task(), ag), { text: '', n: 0 });
  store.put('settings', { id: 'obsidian', enabled: true, vault: v, exclude: DEFAULTS.exclude, byProject: {}, maxNotes: 5 });
  const on = await blockFor(store, task(), ag); assert.ok(on.n >= 1); assert.match(on.text, /Achadinhos tom de voz/);
  assert.equal((await blockFor(store, task({ project: { id: 'p9', name: 'Contas', area: 'Financeiro' } }), ag)).n, 0);
  assert.equal((await blockFor(store, task({ project: { id: 'assistant-internal', name: 'x', area: 'Geral' } }), ag)).n, 0);
  store.put('settings', { id: 'obsidian', enabled: true, vault: v + '-sumiu', exclude: [], byProject: {}, maxNotes: 5 }); assert.deepEqual(await blockFor(store, task(), ag), { text: '', n: 0 });
});

import { saveNote, renderNote } from '../server/obsidian.mjs';
import { readFile, readdir } from 'node:fs/promises';

test('escrita: só com permissão; grava nota nova em <pasta de destino>/<projeto>, nunca sobrescreve, nunca em Financeiro', async () => {
  const v = await vault(), cfg = { enabled: true, vault: v, allowWrite: false, writeFolder: 'Code Room' }, args = { project: 'Achadinhos (Instagram)', area: 'Vídeo', agent: 'Produtor', title: 'Reel do suporte: R$ 23,90?', summary: 'Vídeo pronto.', files: [{ path: 'reels/reel-1.mp4', bytes: 6600000 }], review: 'ok' };
  await assert.rejects(() => saveNote(cfg, args), /Só ler/); await assert.rejects(() => saveNote({ ...cfg, allowWrite: true }, { ...args, area: 'Financeiro' }), /financeiros/); await assert.rejects(() => saveNote({ ...cfg, enabled: false, allowWrite: true }, args), /desligado/);
  const a = await saveNote({ ...cfg, allowWrite: true }, args), b = await saveNote({ ...cfg, allowWrite: true }, args);
  assert.match(a.rel, /^Code Room\/Achadinhos \(Instagram\)\/\d{4}-\d{2}-\d{2} Reel do suporte R\$ 23,90\.md$/); assert.match(b.name, /\(2\)\.md$/, 'segunda nota igual ganha sufixo em vez de sobrescrever');
  const txt = await readFile(join(v, ...a.rel.split('/')), 'utf8'); assert.match(txt, /^---\ncode-room: true\nprojeto: "Achadinhos \(Instagram\)"/); assert.match(txt, /## Resumo\nVídeo pronto\./); assert.match(txt, /- reels\/reel-1\.mp4 \(6445 KB\)/); assert.match(txt, /## Observação da revisão\nok/);
  assert.deepEqual((await readdir(join(v, 'SOFTWARE', 'CODE-ROOM'))).sort(), ['Achadinhos tom de voz.md', 'Roadmap.md'], 'as notas da pessoa ficam intactas');
  assert.ok(!renderNote({ project: 'X', title: '../../etc/passwd' }).includes('../'), 'título não vira caminho');
});

test('escrita: destino e nomes não escapam do cofre', async () => {
  assert.equal(cleanConfig({ writeFolder: '' }).writeFolder, 'Code Room'); assert.equal(cleanConfig({ writeFolder: 'Meu/Painel' }).writeFolder, 'Meu/Painel');
  for (const bad of ['../fora', 'a/../b', '.oculta', 'C:/x']) assert.throws(() => cleanConfig({ writeFolder: bad }), /Pasta de destino/, bad);
  const v = await vault(), r = await saveNote({ enabled: true, vault: v, allowWrite: true, writeFolder: 'Code Room' }, { project: '../../Windows', title: 'a/b\c:d', area: 'Vídeo' });
  assert.ok(r.rel.startsWith('Code Room/') && !r.rel.includes('..'), r.rel);
});

import { pickExcerpt } from '../server/obsidian.mjs';
test('trecho: começo da nota + o pedaço onde as palavras do pedido aparecem (sem acento, mesma posição)', () => {
  const longo = 'Introdução do projeto. ' + 'blá '.repeat(150) + 'A VERSÃO publicada foi a 0.3.0 em 09/11 e o marco seguinte é a voz. ' + 'fim '.repeat(100);
  const e = pickExcerpt(longo, ['versao']); assert.match(e, /^Introdução do projeto\./); assert.match(e, / … /); assert.match(e, /VERSÃO publicada foi a 0\.3\.0/); assert.ok(e.length <= 620);
  assert.equal(pickExcerpt('curta', ['x']), 'curta'); assert.ok(pickExcerpt(longo, ['inexistente']).length <= 550, 'sem coincidência adiante, só o começo');
});
