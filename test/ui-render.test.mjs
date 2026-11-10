import test from 'node:test';
import assert from 'node:assert/strict';
import { needsYou, viewRoom } from '../public/views.js';
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

test('Sala: a missão ligada mostra a passagem entre agentes, abre cada etapa e oferece o mapa do Canvas', () => {
  const a = { id: 'a1', name: 'Roteirista', role: 'Roteiro', provider: 'codex', mode: 'write', room: 'Geral', skillIds: [], capabilities: [] };
  const b = { id: 'a2', name: 'Revisor', role: 'Revisão', provider: 'claude', mode: 'read', room: 'Geral', skillIds: [], capabilities: [] };
  const root = { id: 't1', kind: 'work', status: 'completed', project: { id: 'p1', name: 'Projeto' }, agent: a, prompt: 'Escrever roteiro', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), deliverables: [] };
  const next = { ...root, id: 't2', status: 'running', agent: b, prompt: 'Revisar roteiro' };
  const ctx = { project: 'p1', maxStations: 3, state: { projects: [{ id: 'p1', name: 'Projeto', agentIds: [a.id, b.id] }], agents: [a, b], teams: [], runs: [next, root], plans: [], runtime: {} },
    roomAgents: () => [a, b], supervisorAgent: () => null, rooms: () => [], roomMode: () => '@projeto', projectAgentIds: () => new Set([a.id, b.id]), viewMode: () => 'scene', agentStatus: x => ({ status: x.id === b.id ? 'running' : 'done', label: x.id === b.id ? 'Trabalhando' : 'Concluído' }), usageTotals: () => ({ input: 0, inCount: 0, cost: 0, costCount: 0 }), currentMission: () => ({ kind: 'task', task: next, title: 'Escrever e revisar', handoffs: [root, next] }) };
  const html = viewRoom(ctx);
  assert.match(html, /Agentes que receberam esta missão/); assert.match(html, /Roteirista[\s\S]*Revisor/); assert.match(html, /data-act="task" data-id="t1"/); assert.match(html, /data-act="task" data-id="t2"/); assert.match(html, /A passagem leva o resumo e os arquivos da etapa anterior/); assert.match(html, /data-act="view-mode" data-id="canvas">Ver mapa no Canvas/);
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

test('confirmar nova tentativa: aviso específico para tarefa interrompida tem rótulos acessíveis', async () => {
  const { readFile } = await import('node:fs/promises');
  const index = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(index, /id="retry-title"/); assert.match(index, /id="retry-warning"/); assert.match(index, /id="retry-confirm"/);
  assert.match(app, /task\?\.status === 'interrupted'/);
  assert.match(app, /A tarefa parou sem confirmar o que chegou a fazer/);
  assert.match(app, /a nova tentativa começa do zero/);
});
