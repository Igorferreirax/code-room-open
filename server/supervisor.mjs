import { mayShare } from './context.mjs';

export const KNOWN_CAPABILITIES = ['code', 'review', 'research', 'writing', 'video.edit', 'video.render', 'finance', 'ops', 'supervise'];
export const PLAN_LIMITS = { steps: 6, text: 4000, criteria: 8 };
// Campos que um plano nunca pode trazer: permissões, comandos e ambiente pertencem ao backend e ao perfil do agente.
const FORBIDDEN = ['mode', 'permissions', 'sandbox', 'env', 'command', 'cmd', 'args', 'cwd', 'path', 'provider', 'model', 'status', 'limits', 'skills', 'skillIds'];

export function planPrompt({ request, agents, project }) {
  const roster = agents.map(a => ({ id: a.id, nome: a.name, ambiente: a.room, papel: a.role, provedor: a.provider, permissao: a.mode === 'write' ? 'edita arquivos' : 'somente leitura', capacidades: a.capabilities || [] }));
  return `Você é o supervisor do Code Room. Decida como executar o pedido do usuário no projeto "${project.name}" e responda SOMENTE com um objeto JSON (sem texto antes ou depois, sem Markdown).

Pedido do usuário:
${request}

Agentes disponíveis (use apenas estes ids):
${JSON.stringify(roster, null, 1)}

Formato obrigatório:
{"mode":"direct"|"plan","rationale":"por que","steps":[{"id":"s1","title":"curto","agentId":"<id da lista>","objective":"o que entregar","criteria":["critério verificável"],"dependsOn":["s1"],"requires":["capacidade"]}]}

Regras:
- "direct" = pedido simples, exatamente 1 passo. "plan" = 2 a ${PLAN_LIMITS.steps} passos com dependências reais.
- Escolha o agente pela capacidade e pelo papel. Não invente agentes, capacidades, ferramentas nem permissões: o sistema rejeita o plano inteiro.
- Quem edita arquivos é decidido pelo perfil do agente; não peça permissões.
- Passo de revisão deve depender do passo que produz a entrega e citar os critérios.
- Não inclua publicação, deploy, pagamentos nem alterações fora da pasta do projeto.`;
}

// Extrai o primeiro objeto JSON balanceado do texto (aceita cerca ```json).
export function parsePlan(text) {
  const clean = String(text || '').replace(/```(?:json)?/gi, '');
  const start = clean.indexOf('{');
  if (start < 0) throw new Error('A resposta do supervisor não contém JSON.');
  let depth = 0, inString = false, escaped = false;
  for (let i = start; i < clean.length; i++) {
    const c = clean[i];
    if (inString) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') inString = false; continue; }
    if (c === '"') inString = true; else if (c === '{') depth++; else if (c === '}' && --depth === 0) return JSON.parse(clean.slice(start, i + 1));
  }
  throw new Error('JSON do supervisor incompleto.');
}

// O backend valida: o plano só é aceito se cada exigência abaixo for atendida.
export function validatePlan(plan, { agents, project, available = () => true }) {
  const errors = [];
  if (!plan || typeof plan !== 'object') return { ok: false, errors: ['Plano não é um objeto.'] };
  if (!['direct', 'plan'].includes(plan.mode)) errors.push('mode deve ser "direct" ou "plan".');
  const steps = Array.isArray(plan.steps) ? plan.steps : [];
  if (!steps.length) errors.push('O plano não tem passos.');
  if (steps.length > PLAN_LIMITS.steps) errors.push(`Máximo de ${PLAN_LIMITS.steps} passos.`);
  if (plan.mode === 'direct' && steps.length !== 1) errors.push('Execução direta exige exatamente 1 passo.');
  if (plan.mode === 'plan' && steps.length < 2) errors.push('Um plano com 1 passo deve usar mode "direct".');
  const ids = new Set(), byId = new Map(agents.map(a => [a.id, a]));
  for (const [i, s] of steps.entries()) {
    const label = `Passo ${s?.id ?? i + 1}`;
    if (!s || typeof s !== 'object') { errors.push(`${label}: inválido.`); continue; }
    const bad = FORBIDDEN.filter(k => k in s);
    if (bad.length) errors.push(`${label}: campos não permitidos (${bad.join(', ')}).`);
    if (typeof s.id !== 'string' || !/^[a-z0-9_-]{1,20}$/i.test(s.id)) errors.push(`${label}: id inválido.`);
    else if (ids.has(s.id)) errors.push(`${label}: id duplicado.`); else ids.add(s.id);
    if (typeof s.objective !== 'string' || !s.objective.trim() || s.objective.length > PLAN_LIMITS.text) errors.push(`${label}: objetivo ausente ou longo demais.`);
    if (s.criteria != null && (!Array.isArray(s.criteria) || s.criteria.length > PLAN_LIMITS.criteria || s.criteria.some(c => typeof c !== 'string' || c.length > 500))) errors.push(`${label}: critérios inválidos.`);
    const agent = byId.get(s.agentId);
    if (!agent) { errors.push(`${label}: agente inexistente (${String(s.agentId).slice(0, 40)}).`); continue; }
    if (!mayShare(project.area || 'Geral', agent.room)) errors.push(`${label}: o projeto é financeiro e o agente não é do ambiente financeiro.`);
    for (const need of s.requires || []) {
      if (!KNOWN_CAPABILITIES.includes(need)) errors.push(`${label}: capacidade inexistente (${String(need).slice(0, 40)}).`);
      else if (!(agent.capabilities || []).includes(need)) errors.push(`${label}: o agente ${agent.name} não declara a capacidade ${need}.`);
      else if (!available(need)) errors.push(`${label}: a capacidade ${need} não foi validada neste computador.`);
    }
  }
  // Dependências existentes e sem ciclo (busca em profundidade).
  const deps = new Map(steps.filter(s => s && typeof s.id === 'string').map(s => [s.id, Array.isArray(s.dependsOn) ? s.dependsOn : []]));
  for (const [id, list] of deps) for (const d of list) if (!deps.has(d)) errors.push(`Passo ${id}: depende de passo inexistente (${String(d).slice(0, 20)}).`); else if (d === id) errors.push(`Passo ${id}: depende de si mesmo.`);
  const state = new Map();
  const visit = id => { if (state.get(id) === 2) return false; if (state.get(id) === 1) return true; state.set(id, 1); for (const d of deps.get(id) || []) if (deps.has(d) && visit(d)) return true; state.set(id, 2); return false; };
  for (const id of deps.keys()) if (visit(id)) { errors.push('As dependências formam um ciclo.'); break; }
  if (errors.length) return { ok: false, errors };
  return { ok: true, errors: [], plan: { mode: plan.mode, rationale: String(plan.rationale || '').slice(0, 1000), steps: steps.map(s => ({ id: s.id, title: String(s.title || s.id).slice(0, 100), agentId: s.agentId, objective: s.objective.trim(), criteria: (s.criteria || []).map(c => c.trim()), dependsOn: [...new Set(s.dependsOn || [])], requires: s.requires || [] })) } };
}
