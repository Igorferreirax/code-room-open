import test from 'node:test';
import assert from 'node:assert/strict';
import { viewDeliveries, deliveryList, deliveryGroups } from '../public/views2.js';

const T = (id, over = {}) => ({ id, status: 'completed', review: null, updatedAt: '2026-11-09T10:00:00.000Z', prompt: 'Lote "Causo Sombrio: EP 06 Saci (montagem)", episódio longo com muito texto depois', agent: { id: 'a1', name: 'Montador', role: 'Monta', room: 'Vídeo' }, project: { id: 'p1', name: 'P' }, deliverables: [{ path: 'saida/gerar.py', bytes: 10 }, { path: 'saida/final.mp4', bytes: 5000 }, { path: 'debug-0.log', bytes: 3 }, { path: 'POST.md', bytes: 100 }], ...over });
const ctx = (runs, ui = {}) => ({ state: { runs, agents: [] }, project: 'p1', ui, skills: [], inProject: () => true });

test('entregas: uma entrega por tarefa, com o título limpo e os arquivos de trabalho recolhidos', () => {
  const g = deliveryGroups(deliveryList(ctx([T('t1')])));
  assert.equal(g.length, 1); assert.deepEqual(g[0].main.map(i => i.file.path), ['saida/final.mp4', 'POST.md']); assert.deepEqual(g[0].tech.map(i => i.file.path).sort(), ['debug-0.log', 'saida/gerar.py']);
});

test('entregas: tela mostra título do lote, "Para revisar", aprovar/pedir ajustes e escapa HTML', () => {
  const html = viewDeliveries(ctx([T('t1', { prompt: 'Lote "<b>X</b> EP"' }), T('t2', { review: { status: 'approved', note: 'ok' } })]));
  assert.ok(!html.includes('<b>X</b>'), 'título escapado'); assert.match(html, /Para revisar/); assert.match(html, /Aprovada/);
  assert.match(html, /data-act="approve"/); assert.match(html, /data-act="request-changes"/); assert.match(html, /id="review-note"/);
  assert.match(html, /Arquivos de trabalho \(2\)/, 'logs e scripts da entrega selecionada ficam recolhidos');
  assert.doesNotMatch(html, /lights/, 'sem a barra falsa de navegador');
});

test('entregas: filtro "Para revisar" esconde as já revisadas; sem pendência o filtro some; sem entrega mostra estado vazio', () => {
  const runs = [T('t1'), T('t2', { review: { status: 'approved' } })];
  const only = viewDeliveries(ctx(runs, { delFilter: 'review' })); assert.match(only, /aria-pressed="true">Para revisar \(1\)/); assert.equal((only.match(/class="dl-card/g) || []).length, 1);
  const none = viewDeliveries(ctx([T('t2', { review: { status: 'approved' } })], { delFilter: 'review' })); assert.doesNotMatch(none, /Para revisar \(/);
  assert.match(viewDeliveries(ctx([])), /Nenhuma entrega neste projeto ainda/);
  const run = viewDeliveries(ctx([T('t3', { status: 'running', deliverables: [] })])); assert.match(run, /dl-live/);
});

test('entrega aprovada exibe botão verde Aprovado sem permitir nova decisão', () => {
  const approved = viewDeliveries(ctx([T('t1', { review: { status: 'approved', note: 'ok' } })]));
  assert.match(approved, /class="btn approved" type="button" disabled>[\s\S]*?Aprovado<\/button>/);
  assert.doesNotMatch(approved, /data-act="approve"|data-act="request-changes"|id="review-note"/);
  const rejected = viewDeliveries(ctx([T('t2', { review: { status: 'rejected' } })]));
  assert.doesNotMatch(rejected, /data-act="approve"|data-act="request-changes"/);
});

test('mudança só na pasta extra aparece na lista para conferência', () => {
  const html = viewDeliveries(ctx([T('externa', { deliverables: [], externalCount: 2, prompt: 'Editar <roteiro>' })]));
  assert.match(html, /Todas \(1\)/);
  assert.match(html, /Para revisar \(1\)/);
  assert.match(html, /2 arquivo\(s\) alterado\(s\) na pasta extra/);
  assert.match(html, /data-act="changes" data-id="externa">Conferir alterações/);
  assert.match(html, /data-act="approve"/);
  assert.match(html, /data-act="request-changes"/);
  assert.doesNotMatch(html, /data-act="git-commit"|data-act="open-folder"/);
  assert.doesNotMatch(html, /<roteiro>/);
  const approved = viewDeliveries(ctx([T('externa', { deliverables: [], externalCount: 1, review: { status: 'approved' } })]));
  assert.match(approved, /class="btn approved" type="button" disabled/);
  assert.doesNotMatch(approved, /data-act="approve"|data-act="request-changes"/);
});
