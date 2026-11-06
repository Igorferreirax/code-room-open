import test from 'node:test';
import assert from 'node:assert/strict';
import { folderJobsCardHtml, folderJobDialogHtml, noticesBarHtml, emptyJobForm, formFromJob, payloadFromJobForm } from '../public/folderjobs-ui.js';

const job = (over = {}) => ({ id: 'j1', name: '<b>Cortes</b>', projectId: 'p1', dir: 'ENTRADA', exts: ['mp4'], target: { type: 'agent', id: 'a1' }, instruction: 'Edite {arquivo}', outputNote: '', parallel: 1, status: 'active', problem: '', counts: { total: 4, queued: 1, running: 1, done: 1, failed: 1 }, lastResult: null, items: [{ rel: 'ENTRADA/a.mp4', status: 'failed', reason: '<img src=x>', taskId: 't1' }, { rel: 'ENTRADA/b.mp4', status: 'done', files: 2 }], ...over });
const ctx = (jobs, ui = {}) => ({ project: 'p1', ui, state: { folderJobs: jobs, projects: [{ id: 'p1', name: 'Canal' }], agents: [{ id: 'a1', name: 'Editor', role: 'Edita' }], teams: [{ id: 't9', name: 'Vídeo' }], notices: [] } });

test('cartão: progresso, contagens, botões certos por estado e HTML escapado', () => {
  const h = folderJobsCardHtml(ctx([job()], { fjOpen: 'j1' }));
  assert.ok(!h.includes('<b>Cortes</b>') && !h.includes('<img src=x>')); assert.match(h, /aria-valuenow="1"[^>]*aria-label="1 de 4 prontos"/); assert.match(h, /<b>1<\/b> de <b>4<\/b> prontos/); assert.match(h, /1 processando/); assert.match(h, /1 na fila/); assert.match(h, /1 com problema/);
  assert.match(h, /data-act="fj-retry" data-id="j1">Tentar de novo \(1\)/); assert.match(h, /data-act="fj-pause"/); assert.match(h, /vigiando/); assert.match(h, /data-act="task" data-id="t1"/); assert.match(h, /ENTRADA\/b\.mp4[\s\S]*pronto · 2 arquivo/);
  const p = folderJobsCardHtml(ctx([job({ status: 'paused', counts: { total: 0, queued: 0, running: 0, done: 0, failed: 0 }, problem: 'A pasta de entrada ainda não existe.' })]));
  assert.match(p, /data-act="fj-resume"/); assert.match(p, /pausada/); assert.match(p, /ainda não existe/); assert.match(p, /Ponha arquivos em/); assert.ok(!p.includes('fj-retry'));
  assert.match(folderJobsCardHtml(ctx([])), /Nenhuma pasta de entrada ainda/); assert.match(folderJobsCardHtml(ctx([job({ lastResult: { at: '2026-11-07T10:00:00Z', done: 4, total: 4 }, counts: { total: 4, queued: 0, running: 0, done: 4, failed: 0 } })])), /Último lote: 4 de 4 prontos/);
  assert.match(folderJobsCardHtml(ctx([job({ target: { type: 'team', id: 't9' } })])), /Equipe Vídeo/);
});

test('formulário: vem preenchido para novo e para editar; o corpo da requisição separa agente e equipe', () => {
  const f = emptyJobForm('p1'); assert.equal(f.dir, 'ENTRADA'); assert.ok(f.instruction.includes('{arquivo}')); assert.equal(f.projectId, 'p1');
  const e = formFromJob(job({ exts: ['mp4', 'mov'] })); assert.equal(e.exts, 'mp4, mov'); assert.equal(e.who, 'a:a1'); assert.deepEqual(payloadFromJobForm({ ...e, parallel: '2' }), { id: 'j1', name: '<b>Cortes</b>', projectId: 'p1', dir: 'ENTRADA', exts: 'mp4, mov', agentId: 'a1', instruction: 'Edite {arquivo}', outputNote: '', parallel: 2 });
  const t = payloadFromJobForm({ ...emptyJobForm('p1'), name: 'N', who: 't:t9' }); assert.equal(t.teamId, 't9'); assert.ok(!('agentId' in t)); assert.ok(!('id' in t));
  const d = folderJobDialogHtml(ctx([], { fjForm: { ...e, name: '"><script>x</script>' } })); assert.ok(!d.includes('<script>x</script>')); assert.match(d, /value="a:a1"[^>]*selected/); assert.match(d, /Equipe Vídeo/); assert.match(d, /Salvar</); assert.match(folderJobDialogHtml(ctx([])), /Criar e começar a vigiar/);
});

test('aviso de lote concluído: até 3 faixas com Ver e Ok, escapadas; sem avisos, nada', () => {
  const c = ctx([]); assert.equal(noticesBarHtml(c), ''); c.state.notices = [{ id: 'n1', jobId: 'j1', title: 'Lote “<i>X</i>” terminou', text: '3 de 3 arquivo(s) prontos.' }];
  const h = noticesBarHtml(c); assert.ok(!h.includes('<i>X</i>')); assert.match(h, /data-act="notice-open" data-id="n1" data-job="j1"/); assert.match(h, /data-act="notice-seen" data-id="n1"/); assert.match(h, /3 de 3/);
  c.state.notices = Array.from({ length: 5 }, (_, i) => ({ id: 'n' + i, title: 't', text: 'x' })); assert.equal((noticesBarHtml(c).match(/notice-bar/g) || []).length, 3);
});
