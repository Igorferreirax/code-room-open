import test from 'node:test';
import assert from 'node:assert/strict';
import { handoffPanel, noFileChangesNotice } from '../public/views.js';

test('repasse mostra origem, destino, resumo e arquivos do projeto sem executar ação', () => {
  const html = handoffPanel({ handoffContext: { incoming: [{ fromTask: 't1', fromAgent: 'Diretor', summary: 'Use <roteiro>', files: ['roteiro.md'], nextStatus: 'completed' }], outgoing: [{ toTask: 't3', toAgent: 'Editor', summary: 'Montar a cena', files: [], nextStatus: 'queued' }] } });
  assert.match(html, /Recebido de Diretor/);
  assert.match(html, /Enviado para Editor/);
  assert.match(html, /roteiro.md/);
  assert.match(html, /Use &lt;roteiro&gt;/);
  assert.match(html, /data-act="task" data-id="t3"/);
  assert.match(html, /pasta extra não passam automaticamente/);
  assert.doesNotMatch(html, /<roteiro>/);
  assert.equal(handoffPanel({}), '');
});

test('tarefa de escrita sem arquivo registra aviso sem acusar falha de tarefas textuais', () => {
  const base = { kind: 'work', status: 'completed', agent: { mode: 'write' }, deliverables: { available: true, files: [] } };
  assert.match(noFileChangesNotice(base), /Nenhuma alteração registrada/);
  assert.match(noFileChangesNotice(base), /Isso não confirma que o pedido foi concluído/);
  assert.equal(noFileChangesNotice({ ...base, deliverables: { available: true, files: [{ path: 'feito.txt' }] } }), '');
  assert.equal(noFileChangesNotice({ ...base, extraDir: 'C:/extra', result: { externalDeliverables: { available: true, files: [{ path: 'feito.txt' }] } } }), '');
  assert.equal(noFileChangesNotice({ ...base, extraDir: 'C:/extra', result: { externalDeliverables: { available: false, files: [] } } }), '');
  assert.equal(noFileChangesNotice({ ...base, agent: { mode: 'read' } }), '');
});
