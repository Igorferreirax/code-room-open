// Regras de acesso das rotas sensíveis: o que só vale no próprio computador, o que o celular pode aprovar e o que o
// celular recebe do estado.
import test from 'node:test';
import assert from 'node:assert/strict';
import { localOnlyReason, mobileActionAllowed, MOBILE_ACTIONS, deviceState } from '../server/access-policy.mjs';

test('só no computador: terminal, abrir programas, voz global, rede, atualização e pareamento', () => {
  for (const [m, p] of [['POST', '/api/term'], ['GET', '/api/term/123e4567-e89b-12d3-a456-426614174000/out'], ['POST', '/api/term/x/input'], ['POST', '/api/terminal'], ['POST', '/api/open'], ['POST', '/api/voice/native'], ['GET', '/api/voice/global'], ['POST', '/api/voice-hotkey'], ['POST', '/api/network'], ['POST', '/api/network/firewall'], ['POST', '/api/updates/install'], ['POST', '/api/updates/download'], ['POST', '/api/devices/pair-code']])
    assert.ok(localOnlyReason(m, p), `${m} ${p} deveria ser só no computador`);
  for (const [m, p] of [['GET', '/api/state'], ['GET', '/api/network'], ['GET', '/api/updates'], ['POST', '/api/assistant/ask'], ['POST', '/api/voice/transcribe'], ['POST', '/api/approvals/x/decide']])
    assert.equal(localOnlyReason(m, p), '', `${m} ${p} não é só no computador`);
});

test('celular: só aprova ações da lista; o que roda programas, mexe em pastas ou em permissões fica no computador', () => {
  for (const t of ['abrir', 'abrir_terminal', 'enviar_terminal', 'importar_projeto', 'criar_pasta_entrada', 'criar_projeto', 'ajustar_agente', 'politica_orquestracao', 'criar_canal', 'criar_skill', 'tipo_que_ainda_nao_existe'])
    assert.equal(mobileActionAllowed({ type: t, payload: {} }), false, t);
  for (const t of MOBILE_ACTIONS) assert.equal(mobileActionAllowed({ type: t, payload: { agentId: 'a' } }, { agentOf: () => [{ id: 'a', unrestricted: false }] }), true, t);
  assert.equal(mobileActionAllowed({ type: 'criar_agente', payload: { unrestricted: true } }), false, 'modo irrestrito só no computador');
});

test('estado do celular: sem caminhos de pastas, instruções, ferramentas nem executáveis', () => {
  const st = deviceState({
    previewOrigin: 'http://127.0.0.1:4781',
    projects: [{ id: 'p', name: 'Site', area: 'Programação', path: 'C:/Users/x/site', workDirs: [{ path: 'C:/segredo' }], referenceDirs: ['C:/ref'] }],
    agents: [{ id: 'a', name: 'Dev', role: 'código', provider: 'codex', mode: 'write', instructions: 'segredo do prompt', mcpTools: ['x'], commands: ['git'], unrestricted: true }],
    connectors: [{ id: 'codex', label: 'Codex', available: true, path: 'C:/bin/codex.exe' }],
    runs: [{ id: 't', status: 'running', project: { id: 'p', name: 'Site', area: 'Programação', path: 'C:/Users/x/site' } }],
    folderJobs: [{ id: 'f', folder: 'C:/Downloads' }],
  });
  const flat = JSON.stringify(st);
  for (const leak of ['C:/', 'segredo', 'codex.exe', 'mcpTools', 'instructions', '4781']) assert.ok(!flat.includes(leak), `vazou ${leak}`);
  assert.equal(st.projects[0].name, 'Site'); assert.equal(st.agents[0].name, 'Dev'); assert.equal(st.runs[0].project.name, 'Site'); assert.equal(st.connectors[0].available, true);
});

test('celular: o conteúdo da ação também conta (agente com poderes, agente irrestrito, equipe e tarefa)', () => {
  const ok = { id: 'a', unrestricted: false }, livre = { id: 'b', unrestricted: true };
  for (const payload of [{ mode: 'write' }, { commands: ['git'] }, { mcpTools: ['x'] }, { web: true }, { browser: 'chrome' }, { skillTool: true }])
    assert.equal(mobileActionAllowed({ type: 'criar_agente', payload }), false, JSON.stringify(payload));
  assert.equal(mobileActionAllowed({ type: 'criar_agente', payload: { mode: 'read', browser: 'off' } }), true);
  const of = map => pl => map[pl.agentId || pl.teamId || pl.taskId] || [];
  const agentOf = of({ a: [ok], b: [livre], eq: [ok, livre], t1: [ok] });
  assert.equal(mobileActionAllowed({ type: 'iniciar_tarefa', payload: { agentId: 'a' } }, { agentOf }), true);
  assert.equal(mobileActionAllowed({ type: 'iniciar_tarefa', payload: { agentId: 'b' } }, { agentOf }), false, 'agente irrestrito');
  assert.equal(mobileActionAllowed({ type: 'iniciar_tarefa', payload: { teamId: 'eq' } }, { agentOf }), false, 'equipe com membro irrestrito');
  assert.equal(mobileActionAllowed({ type: 'iniciar_tarefa', payload: { agentId: 'sumiu' } }, { agentOf }), false, 'agente desconhecido');
  assert.equal(mobileActionAllowed({ type: 'repetir_tarefa', payload: { taskId: 't1' } }, { agentOf }), true);
});

test('ações que executam no computador: só quando o pedido vem do próprio computador (botão e Piloto)', async () => {
  const { hostActionAllowed, HOST_ACTIONS } = await import('../server/access-policy.mjs');
  const { canAutoApplyInPilot } = await import('../server/assistant.mjs');
  for (const type of HOST_ACTIONS) {
    assert.equal(hostActionAllowed({ type }, { local: false }), false, type);
    assert.equal(hostActionAllowed({ type }, { local: true }), true, type);
    assert.equal(canAutoApplyInPilot({ type, valid: true, payload: {} }, { local: false }), false, `${type}: o Piloto não aplica sozinho para pedido de fora`);
  }
  assert.equal(canAutoApplyInPilot({ type: 'abrir', valid: true, payload: {} }), true, 'no computador continua aplicando');
  assert.equal(hostActionAllowed({ type: 'criar_equipe' }, { local: false }), true);
});
