import test from 'node:test';
import assert from 'node:assert/strict';
import { needsYou } from '../public/views.js';
import { batchesCard } from '../public/views2.js';

// Renderização das telas de lote com dados fictícios (sem navegador): o que precisa aparecer para você decidir.
const ep = (status, extra = {}) => ({ id: 'e-' + status, title: 'EP Teste ' + status, folder: 'fila/EP01-teste', status, ...extra });
const ctx = (episodes, bstatus = 'aguardando_previa') => ({
  state: { projects: [{ id: 'p1', name: 'Projeto' }], agents: [{ id: 'a1', name: 'Montador', mode: 'write' }], batchCosts: {}, batches: [{ id: 'b1', name: 'Canal Teste: lote', agentId: 'a1', status: bstatus, estimate: {}, episodes }] },
  ui: {}, net: {}, pairing: null,
});

test('cartão "Precisa de você agora": aparece com prévia a aprovar, crédito a liberar e falha; some sem pendência', () => {
  const html = needsYou(ctx([ep('aguardando_previa'), ep('falhou', { note: 'render falhou' }), ep('pronto')], 'aguardando_creditos'));
  assert.match(html, /Precisa de você agora/); assert.match(html, /Liberar créditos do lote/); assert.match(html, /Aprovar a prévia: EP Teste aguardando_previa/); assert.match(html, /Falhou: EP Teste falhou/);
  assert.doesNotMatch(html, /EP Teste pronto/, 'episódio pronto não é pendência');
  assert.equal(needsYou(ctx([ep('pronto'), ep('reprovado')], 'concluido')), '', 'sem pendência o cartão some');
});

test('lote: Reprovar aparece em prévia pronta e em episódio entregue; não aparece em outros estados', () => {
  const html = (s, extra) => batchesCard(ctx([ep(s, extra)])), card = s => html(s);
  assert.match(html('aguardando_previa'), /data-act="batch-reject"/); assert.match(html('aguardando_previa'), /Aprovar prévia/);
  assert.match(html('pronto', { postar: 'POSTAR_CANAL_TESTE/EP01-teste' }), /data-act="batch-reject"/);
  assert.match(html('pronto', { postar: 'POSTAR_CANAL_TESTE/EP01-teste' }), /POSTAR_CANAL_TESTE\/EP01-teste/, 'mostra a pasta de entrega');
  for (const s of ['planejado', 'em_andamento', 'reprovado']) assert.doesNotMatch(card(s), /data-act="batch-reject"/, s);
  assert.match(html('reprovado', { trash: 'LIXEIRA/CANAL_TESTE/EP01-teste-x' }), /Reprovado: foi para a LIXEIRA/);
  assert.match(html('aguardando_previa', { waiting: 'AGUARDANDO_APROVACAO/CANAL_TESTE/EP01-teste' }), /AGUARDANDO_APROVACAO\/CANAL_TESTE\/EP01-teste/);
});

test('rodapé: "Desenvolvido por Bytelab" com link seguro no app e na tela de entrada', async () => {
  const { readFile } = await import('node:fs/promises');
  const { viewLogin } = await import('../public/views.js');
  const index = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const link = /Desenvolvido por <a href="https:\/\/www\.agenciabytelab\.com\.br" target="_blank" rel="noopener noreferrer">Bytelab<\/a>/;
  assert.match(index, link, 'rodapé do app');
  assert.doesNotMatch(index, /donate|Pix|contribuir/i, 'o Pix fica só na landing page, nunca dentro do app');
  const login = viewLogin({ state: { runtime: {} }, ui: {}, net: {}, pairing: null, loginTab: 'local' });
  assert.match(login, link, 'rodapé da tela de entrada');
});
