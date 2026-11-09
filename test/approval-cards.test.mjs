import test from 'node:test';
import assert from 'node:assert/strict';
import { approvalItems, approvalHtml, mediaKind } from '../public/approval-cards.js';

const now = new Date().toISOString();
const run = (id, files, over = {}) => ({ id, status: 'completed', review: null, step: null, kind: 'work', createdAt: now, updatedAt: now, prompt: `Lote "Reel ${id}"`, agent: { id: 'a', name: 'Produtor' }, project: { id: 'p1', name: 'P' }, deliverables: files.map(path => ({ path, bytes: 1 })), ...over });
const ctx = (over = {}, ui = {}) => ({ project: 'p1', ui, cardMedia: {}, state: { runs: [], batches: [] }, ...over });

test('cartões: só entram entregas concluídas, sem revisão, do projeto e com vídeo ou imagem; prévias de lote vêm primeiro', () => {
  const c = ctx({ state: { runs: [run('a', ['x/final.mp4']), run('b', ['notas.md']), run('c', ['capa.jpg'], { review: { status: 'approved' } }), run('d', ['d.png'], { project: { id: 'p2' } }), run('e', ['e.png'], { status: 'running' }), run('f', ['f.png'], { step: 'review' })],
    batches: [{ id: 'b1', name: 'Lote', projectId: 'p1', episodes: [{ id: 'e1', title: 'EP 04', status: 'aguardando_previa' }, { id: 'e2', title: 'EP 05', status: 'pronto' }] }] } });
  const it = approvalItems(c); assert.deepEqual(it.map(i => i.key), ['p:b1:e1', 't:a']); assert.equal(it[1].file, 'x/final.mp4');
  assert.equal(mediaKind('A.MP4'), 'video'); assert.equal(mediaKind('capa.webp'), 'image'); assert.equal(mediaKind('x.md'), '');
  assert.equal(approvalHtml(ctx()), '', 'sem pendência, nada aparece');
});

test('cartão de vídeo e imagens: player, miniaturas, Aprovar/Pedir ajustes/Abrir e aviso de que não publica', () => {
  const c = ctx({ state: { runs: [run('a', ['final.mp4', 'c1.png'])], batches: [] }, cardMedia: { 't:a': [{ name: 'final.mp4', url: '/m/a/t/final' }, { name: 'c1.png', url: '/m/a/t/c1' }, { name: 'c2.png', url: '/m/a/t/c2' }] } });
  const h = approvalHtml(c); assert.match(h, /<video controls preload="metadata" src="\/m\/a\/t\/final"/); assert.match(h, /<img loading="lazy" src="\/m\/a\/t\/c1"/); assert.match(h, /class="ap-imgs sm"/);
  assert.match(h, /data-act="ap-approve" data-id="a"/); assert.match(h, /data-act="ap-changes-open"/); assert.match(h, /data-act="ap-open" data-id="a" data-file="final.mp4"/); assert.match(h, /Aprovar não publica nada/);
  assert.match(approvalHtml(ctx({ state: c.state })), /Carregando a prévia/, 'enquanto a mídia não chegou');
  assert.match(approvalHtml(ctx({ state: c.state, cardMedia: { 't:a': [] } })), /Sem prévia visual/);
});

test('cartão: pedir ajustes abre o campo; prévia de lote reaproveita o botão existente; navegação, recolher e HTML escapado', () => {
  const state = { runs: [run('a', ['a.mp4']), run('b', ['b.png'], { prompt: 'Lote "<img src=x onerror=1>"' })], batches: [{ id: 'b1', name: 'L', projectId: 'p1', episodes: [{ id: 'e1', title: 'EP <b>4</b>', status: 'aguardando_previa' }] }] };
  const pv = approvalHtml(ctx({ state })); assert.match(pv, /data-act="batch-preview-ok" data-id="b1" data-ep="e1"/); assert.ok(!pv.includes('<b>4</b>')); assert.match(pv, /1\/3/); assert.match(pv, /data-act="ap-nav" data-id="-1"[^>]*disabled/);
  const t = approvalHtml(ctx({ state }, { apIdx: 2 })); assert.ok(!t.includes('<img src=x'), 'título escapado'); assert.match(t, /data-act="ap-nav" data-id="1"[^>]*disabled/);
  const ask = approvalHtml(ctx({ state }, { apIdx: 1, apChanges: 't:a' })); assert.match(ask, /id="ap-note"/); assert.match(ask, /data-act="ap-changes-send" data-id="a"/);
  const min = approvalHtml(ctx({ state }, { apCollapsed: true })); assert.match(min, /ap-min/); assert.ok(!min.includes('data-act="ap-approve"') && !min.includes('batch-preview-ok'));
});
