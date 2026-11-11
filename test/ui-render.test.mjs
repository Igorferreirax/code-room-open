import test from 'node:test';
import assert from 'node:assert/strict';
import { needsYou, viewHome, viewRoom, viewExecution } from '../public/views.js';
import { batchesCard, viewSkills, viewAgents } from '../public/views2.js';

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

test('Início: chat conversa com o Assistente e mostra só o trabalho do projeto em foco', () => {
  const a = { id: 'a1', name: 'Agente A', role: 'Desenvolvedor', provider: 'codex', room: 'Programação', mode: 'read', skillIds: [], capabilities: ['code'] };
  const b = { id: 'a2', name: 'Agente B de outro projeto', role: 'Editor', provider: 'claude', room: 'Vídeo', mode: 'read', skillIds: [], capabilities: ['writing'] };
  const task = (id, projectId, prompt, agent) => ({ id, project: { id: projectId, name: projectId === 'p1' ? 'Code Room' : 'Outro Projeto' }, prompt, agent, status: 'running', kind: 'work', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), deliverables: [] });
  const ctx = { project: 'p1', prefs: { displayName: 'Igor' }, asstOk: true, state: { projects: [{ id: 'p1', name: 'Code Room', area: 'Programação' }, { id: 'p2', name: 'Outro Projeto', area: 'Vídeo' }], runs: [task('t1', 'p1', 'Ajustar a tela inicial', a), task('t2', 'p2', 'Editar o vídeo reservado', b)], agents: [a, b], teams: [] }, projectAgentIds: () => new Set(['a1']), agentStatus: () => ({ status: 'running', label: 'Trabalhando' }) };
  const html = viewHome(ctx);
  assert.match(html, /(Bom dia|Boa tarde|Boa noite), Igor/); assert.match(html, /id="home-composer"/); assert.match(html, /Conversar com o Assistente/); assert.match(html, /data-act="home-pick-project"/);
  assert.match(html, /Ajustar a tela inicial/); assert.doesNotMatch(html, /Editar o vídeo reservado|Agente B de outro projeto/);
});

test('Início: mantém a equipe grande compacta e informa quando há mais agentes', () => {
  const agents = Array.from({ length: 7 }, (_, i) => ({ id: `a${i + 1}`, name: `Agente ${i + 1}`, role: 'Especialista', provider: 'codex', room: 'Projeto', mode: 'read', skillIds: [], capabilities: [] }));
  const ctx = { project: 'p1', prefs: {}, asstOk: true, state: { projects: [{ id: 'p1', name: 'Projeto' }], runs: [], agents, teams: [] }, projectAgentIds: () => new Set(agents.map(a => a.id)), agentStatus: () => ({ status: 'idle', label: 'Disponível' }) };
  const html = viewHome(ctx);
  assert.equal((html.match(/class="home-member"/g) || []).length, 5);
  assert.match(html, /Ver equipe completa \(7\) na Sala/);
  assert.doesNotMatch(html, /Agente 6|Agente 7/);
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
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const link = /Desenvolvido por <a href="https:\/\/www\.agenciabytelab\.com\.br" target="_blank" rel="noopener noreferrer">Bytelab<\/a>/;
  assert.match(index, link, 'rodapé do app');
  assert.match(index, /id="footer-tip"/); assert.match(app, /Conecte o Obsidian para incluir notas autorizadas como contexto das tarefas/);
  assert.doesNotMatch(app, /fica mais inteligente automaticamente|aprende sozinho com seu uso/i);
  assert.match(index, /Modelo \(--model\)/); assert.match(index, /id="model-hint"/);
  assert.doesNotMatch(index, /donate|Pix|contribuir/i, 'o Pix fica só na landing page, nunca dentro do app');
  const login = viewLogin({ state: { runtime: {} }, ui: {}, net: {}, pairing: null, loginTab: 'local' });
  assert.match(login, link, 'rodapé da tela de entrada');
});

test('Skills: oferece importar skills próprias ou adicionar só as skills iniciais disponíveis', () => {
  const html = viewSkills({ ui: {}, skills: [], skillPrefs: { fav: [], hide: [] }, skillLibrary: [
    { id: 'planejar-entrega', name: 'Planejar uma entrega', description: 'Plano curto e verificável.', available: true, installed: false },
    { id: 'revisar-alteracoes', name: 'Revisar alterações', description: 'Revisão com evidências.', available: true, installed: true },
    { id: 'externa', name: 'Skill indisponível', description: 'Não empacotada.', available: false, installed: false },
  ], state: { agents: [] } });
  assert.match(html, /Para aproveitar melhor o Code Room, importe suas skills/); assert.match(html, /Importar minhas skills/);
  assert.match(html, /data-act="skill-library-install" data-id="planejar-entrega"[^>]*>Adicionar/);
  assert.match(html, /data-act="skill-library-install" data-id="revisar-alteracoes"[^>]*disabled>Adicionada/);
  assert.doesNotMatch(html, /Skill indisponível/);
});

test('Ferramentas instaladas: lista somente CLIs detectadas localmente e oferece atualização da detecção', () => {
  const base = {
    ui: { agentsTab: 'tools' },
    state: {
      agents: [], runs: [],
      connectors: [
        { id: 'codex', available: false },
        { id: 'claude', available: false },
        { id: 'agy', available: true },
        { id: 'hermes', available: true, remote: true },
        { id: 'gemini', available: false },
        { id: 'custom-local', name: 'Minha CLI', available: true, custom: true },
      ],
    },
  };
  const checks = [
    { id: 'codex', installed: false },
    { id: 'claude', installed: false },
    { id: 'agy', installed: true, path: 'C:\\Tools\\agy.exe', version: '1.5.5' },
    { id: 'hermes', installed: true, path: 'ssh.exe', version: 'remoto' },
    { id: 'gemini', installed: false, supported: false },
    { id: 'custom-local', installed: true, custom: true, path: 'C:\\Tools\\minha-cli.exe', version: '2.0' },
  ];
  const html = viewAgents({ ...base, checks });
  assert.match(html, /Ferramentas detectadas neste computador/);
  assert.match(html, /Antigravity \(Gemini\)/);
  assert.match(html, /Minha CLI/);
  assert.match(html, /Gerenciar ferramenta/);
  assert.doesNotMatch(html, /<h3[^>]*>Instalar<\/h3>|npm install -g @google\/gemini-cli/);
  assert.match(html, /Atualizar detecção/);
  assert.doesNotMatch(html, /Codex CLI|Claude Code|Hermes Agent|Gemini CLI/);

  const none = viewAgents({ ...base, checks: checks.map(c => ({ ...c, installed: false })) });
  assert.match(none, /Nenhuma CLI compatível foi detectada/);
  assert.doesNotMatch(none, /Codex CLI|Claude Code|Antigravity \(Gemini\)|Hermes Agent|Gemini CLI|Minha CLI/);
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

test('execução com falha: apresenta diagnóstico local e diferencia modelo solicitado do reportado', () => {
  const agent = { id: 'a1', name: 'Pesquisador', role: 'Pesquisa', provider: 'codex', model: 'gpt-5-codex', mode: 'read', room: 'Pesquisa', skillIds: [], capabilities: [] };
  const detail = { id: 't1', kind: 'work', status: 'failed', project: { id: 'p1', name: 'Projeto' }, agent, environment: 'Pesquisa', objective: 'Investigar um tema', reason: 'O provedor terminou sem devolver resposta.', failureKind: 'no_output', attempts: [], attemptCount: 1, limits: { maxAttempts: 1 }, events: [], dependsOn: [], deliverables: { files: [] }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  const html = viewExecution({ detail, execTab: 'resumo', projectNameOf: () => 'Projeto', flowPosition: () => null, project: null, state: { runs: [], agents: [agent], runtime: { paused: false } }, ui: { fullOut: false }, prefs: {} });
  assert.match(html, /Verificação sugerida/); assert.match(html, /Testar a IA deste agente/); assert.match(html, /data-act="connector-test" data-id="codex"/); assert.match(html, /Corrigir com a IA/);
  assert.match(html, /Modelo solicitado[\s\S]*gpt-5-codex[\s\S]*Modelo informado pela CLI[\s\S]*não informado pelo provedor/);
  assert.match(html, /nada é aplicado sem a sua aprovação/);
});
