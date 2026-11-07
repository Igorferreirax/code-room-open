import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../server/store.mjs';
import { Assistant } from '../server/assistant.mjs';
import { tempDir } from './helpers.mjs';

test('limpar erros: tira só as mensagens de erro de todas as conversas e guarda o resto', async () => {
  const dir = await tempDir('asst-err'), store = new Store(':memory:');
  const world = async () => ({ agents: [], teams: [], links: [], projects: [], skills: [], connected: new Set(['codex']), runs: [], flows: [], folderJobs: [] });
  const asst = new Assistant({ store, root: process.cwd(), dataDir: dir, world });
  store.put('settings', { id: 'assistant', provider: 'codex', briefedAt: null, manualHash: null, knowledge: '', thread: { id: 't1', title: 'Conversa 1' }, order: ['t1', 't2'], pending: null,
    messages: [{ id: 'a', role: 'user', text: 'oi', at: 'x' }, { id: 'b', role: 'assistant', text: '', error: 'Não foi possível responder: Prompt grande demais', at: 'x' }, { id: 'c', role: 'assistant', text: 'resposta boa', at: 'x' }],
    others: [{ id: 't2', title: 'Conversa 2', messages: [{ id: 'd', role: 'assistant', text: '', error: 'falha antiga', at: 'x' }, { id: 'e', role: 'user', text: 'pergunta', at: 'x' }] }] });
  const r = await asst.clearErrors();
  assert.equal(r.removed, 2);
  const s = store.get('settings', 'assistant');
  assert.deepEqual(s.messages.map(m => m.id), ['a', 'c']);
  assert.deepEqual(s.others[0].messages.map(m => m.id), ['e']);
  assert.equal((await asst.clearErrors()).removed, 0);
});
