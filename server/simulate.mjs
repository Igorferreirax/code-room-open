import { mayShare } from './context.mjs';

// Simulação de uma missão de equipe: confere tudo o que o início de verdade conferiria (projeto, equipe, agentes, IA instalada,
// regras do projeto financeiro, permissões) e explica o que cada agente poderá fazer. NÃO cria tarefa, NÃO chama IA e NÃO gasta cota.
const GRANTS = a => [
  a.mode === 'write' ? 'edita arquivos na pasta do projeto' : 'só lê (não altera arquivos)',
  ...((a.commands || []).length ? [`roda programas: ${a.commands.slice(0, 6).join(', ')}${a.commands.length > 6 ? '…' : ''}`] : []),
  ...((a.mcpTools || []).length ? [`usa ferramentas MCP: ${a.mcpTools.join(', ')}`] : []),
  ...(a.browser && a.browser !== 'off' ? [a.browser === 'chrome' ? 'usa o seu Chrome' : 'usa um navegador separado'] : []),
  ...((a.skillIds || []).length ? [`${a.skillIds.length} skill(s)`] : []),
];

export function simulateFlow(store, { projectId, teamId, objective, maxReviewRounds = 1 }, { installed = () => true } = {}) {
  const problems = [], warnings = [], steps = [];
  const project = store.get('projects', projectId), team = store.get('teams', teamId), text = String(objective ?? '').trim();
  if (!project) problems.push('Escolha um projeto.');
  if (!team) problems.push('Escolha uma equipe.');
  if (!text) problems.push('Escreva a missão (o objetivo não pode ficar vazio).'); else if (text.length > 30000) problems.push('A missão passa de 30000 caracteres.');
  const members = team?.members || [], dev = members.find(m => m.role === 'desenvolvedor'), reviewer = members.find(m => m.role === 'revisor');
  if (team && !dev) problems.push('A equipe precisa de um agente com o papel de desenvolvedor.');
  if (team && !reviewer) problems.push('A equipe precisa de um agente com o papel de revisor.');
  for (const [role, m] of [['desenvolvedor', dev], ['revisor', reviewer]]) {
    if (!m) continue; const a = store.get('agents', m.agentId), issues = [];
    if (!a) { problems.push(`O ${role} da equipe não existe mais (agente apagado).`); steps.push({ role, agent: '(apagado)', provider: null, mode: null, grants: [], issues: ['agente inexistente'] }); continue; }
    if (!installed(a)) issues.push(`a IA deste agente (${a.provider}) não está instalada neste computador`);
    if (project?.area === 'Financeiro') {
      if (!mayShare('Financeiro', a.room)) issues.push('projeto financeiro: o agente não é do ambiente Financeiro');
      if (a.browser && a.browser !== 'off') issues.push('projeto financeiro não aceita agente com navegador');
      if (a.web) issues.push('projeto financeiro não aceita agente com pesquisa na web');
      if ((a.mcpTools || []).length) issues.push('projeto financeiro não aceita agente com ferramentas MCP');
      if (a.provider === 'hermes') issues.push('projeto financeiro não envia dados a um provedor remoto (Hermes)');
    }
    if (role === 'desenvolvedor' && a.mode === 'read') warnings.push(`O desenvolvedor “${a.name}” está em somente leitura: ele não vai conseguir gravar arquivos (só escrever a resposta).`);
    if (role === 'revisor' && a.mode === 'write') warnings.push(`O revisor “${a.name}” pode editar arquivos; o mais seguro é deixá-lo somente leitura.`);
    if ((a.mcpTools || []).length && a.provider !== 'claude') warnings.push(`“${a.name}” tem MCP liberado, mas isso só vale para o Claude Code.`);
    for (const i of issues) problems.push(`${role === 'desenvolvedor' ? 'Desenvolvedor' : 'Revisor'} “${a.name}”: ${i}.`);
    steps.push({ role, agent: a.name, provider: a.provider, mode: a.mode, grants: GRANTS(a), issues });
  }
  const rounds = Math.min(3, Math.max(1, Math.trunc(Number(maxReviewRounds)) || 1));
  const maxTasks = 2 + (rounds - 1) * 2;
  if (rounds > 1) warnings.push(`Se o revisor reprovar, a equipe repete a correção e a revisão até ${rounds} rodada(s) (até ${maxTasks} tarefas).`);
  return { ok: problems.length === 0, problems, warnings, steps, tasks: { min: 2, max: maxTasks }, project: project?.name || null, team: team?.name || null, note: 'Simulação: nada foi criado e nenhuma IA foi chamada.' };
}
