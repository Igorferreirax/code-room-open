// Orquestração econômica inspirada em playbooks ("planejar grande, executar enxuto"):
// escolhe rota conforme janelas reais de cota, guarda preferências de economia/cuidado e compara IAs lado a lado sem sujar a pasta do projeto.
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTask } from './tasks.mjs';
import { limitsView } from './usage.mjs';
import { command, normalize } from './connectors.mjs';

export const GOALS = Object.freeze({
  save: { id: 'save', label: 'Poupar cota', desc: 'Delega tarefas delimitadas para a IA com mais folga e preserva modelos caros só para planejar e revisar.' },
  balanced: { id: 'balanced', label: 'Equilibrado', desc: 'Planeja e revisa com o modelo mais forte; executa mudanças diretas no agente mais ágil.' },
  max: { id: 'max', label: 'Qualidade máxima', desc: 'Usa os modelos mais capazes em todas as etapas e isola escritas quando possível.' },
});

export const PLAYBOOKS = Object.freeze([
  { id: 'codigo', name: 'Programação (planejar → implementar → revisar)', area: 'Programação', phases: ['1. Arquiteto/Líder mapeia arquivos e plano curto (leitura)', '2. Programador implementa em escopo fechado (worktree no modo cuidadoso)', '3. Revisor + Testador conferem regressões e segurança'] },
  { id: 'site', name: 'Criação de site / Landing page', area: 'Programação', phases: ['1. Definir estrutura de seções, oferta e identidade visual', '2. Construir HTML/CSS/JS responsivo (desktop e celular 390px)', '3. Revisar contraste, formulários, velocidade e corte de texto'] },
  { id: 'video', name: 'Edição de vídeo e conteúdo', area: 'Vídeo', phases: ['1. Pesquisa de gancho e referências', '2. Roteiro sincronizado, cenas e legendas dinâmicas', '3. Checagem técnica de prévia e pacote de postagem'] },
  { id: 'automacao', name: 'Automação e rotinas', area: 'Operações', phases: ['1. Mapear entradas, saídas e o que não pode ter efeito colateral', '2. Implementar script/rotina idempotente sem comandos destrutivos', '3. Testar a seco antes de agendar em Rotinas'] },
  { id: 'auditoria', name: 'Auditoria paralela (segurança + código)', area: 'Geral', phases: ['1. Auditor de segurança inspeciona em somente leitura', '2. Revisor de código confere bugs e bordas em paralelo', '3. Consolidar achados por impacto antes de editar'] },
]);

const DEFAULT_POLICY = Object.freeze({ id: 'orchestrationPolicy', goal: 'balanced', careful: false, conserve: [], rules: [] });

export function getPolicy(store) {
  const saved = store.get('settings', 'orchestrationPolicy') || {};
  const goal = GOALS[saved.goal] ? saved.goal : 'balanced';
  return {
    id: 'orchestrationPolicy',
    goal,
    careful: saved.careful === true,
    directExec: saved.directExec === true,
    autoFallback: saved.autoFallback === true,
    conserve: Array.isArray(saved.conserve) ? saved.conserve.filter(x => typeof x === 'string').slice(0, 6) : [],
    rules: Array.isArray(saved.rules) ? saved.rules.filter(x => typeof x === 'string').slice(0, 8) : [],
  };
}

export function savePolicy(store, patch = {}) {
  const cur = getPolicy(store);
  const goal = patch.goal !== undefined ? (GOALS[patch.goal] ? patch.goal : cur.goal) : cur.goal;
  const careful = patch.careful !== undefined ? patch.careful === true : cur.careful;
  const directExec = patch.directExec !== undefined ? patch.directExec === true : cur.directExec;
  const autoFallback = patch.autoFallback !== undefined ? patch.autoFallback === true : cur.autoFallback;
  const conserve = patch.conserve !== undefined
    ? [...new Set((Array.isArray(patch.conserve) ? patch.conserve : []).map(x => String(x).trim().toLowerCase()).filter(Boolean))].slice(0, 6)
    : cur.conserve;
  let rules = cur.rules;
  if (patch.clearRules === true) rules = [];
  else if (Array.isArray(patch.rules)) rules = patch.rules.map(x => String(x ?? '').trim().slice(0, 200)).filter(Boolean).slice(0, 8);
  else if (typeof patch.addRule === 'string' && patch.addRule.trim()) rules = [...new Set([...cur.rules, patch.addRule.trim().slice(0, 200)])].slice(-8);
  return store.put('settings', { id: 'orchestrationPolicy', goal, careful, directExec, autoFallback, conserve, rules });
}

export function pickFallbackProvider(store, failedProvider, connected = new Set(), { hasExtraDir = false, isFinance = false } = {}) {
  if (isFinance) return null;
  const on = connected instanceof Set ? connected : new Set(connected || []);
  const { byId } = quotaHeadroom(store, on);
  const candidates = ['codex', 'claude', 'agy', ...[...on].filter(x => x.startsWith('x-'))]
    .filter((p, idx, arr) => arr.indexOf(p) === idx && on.has(p) && p !== failedProvider && p !== 'hermes' && !(hasExtraDir && p === 'agy') && !byId[p]?.critical);
  return candidates[0] || null;
}

export function quotaHeadroom(store, connected = new Set()) {
  const on = connected instanceof Set ? connected : new Set(connected || []);
  const providers = limitsView(store), now = Date.now(), byId = {};
  for (const p of providers) {
    const wins = (p.windows || []).filter(w => Number.isFinite(w.usedPercent) && (!w.resetsAt || Date.parse(w.resetsAt) > now));
    const maxUsed = wins.length ? Math.max(...wins.map(w => w.usedPercent)) : null;
    byId[p.id] = { id: p.id, name: p.name, usedPercent: maxUsed, sparePercent: maxUsed == null ? null : Math.max(0, Math.round(100 - maxUsed)), tight: maxUsed != null && maxUsed >= 75, critical: maxUsed != null && maxUsed >= 90, windows: wins };
  }
  const policy = getPolicy(store), conserved = new Set(policy.conserve);
  const candidates = [...on].filter(id => id !== 'hermes');
  const scoreExec = id => {
    let s = id === 'codex' ? 35 : id === 'claude' ? 25 : id === 'agy' ? 20 : 15;
    if (conserved.has(id)) s -= 40;
    const q = byId[id];
    if (q?.critical) s -= 60;
    else if (q?.tight) s -= 25;
    else if (q?.sparePercent != null) s += Math.round(q.sparePercent / 5);
    return s;
  };
  const bestExec = candidates.slice().sort((a, b) => scoreExec(b) - scoreExec(a))[0] || null;
  const bestLead = (['claude', 'codex', 'agy'].find(p => on.has(p) && !byId[p]?.critical) || candidates[0] || null);
  return { byId, bestLead, bestExec, policy };
}

export function policyPromptLine(store, connected = new Set()) {
  const { byId, bestLead, bestExec, policy } = quotaHeadroom(store, connected);
  const qParts = Object.values(byId).filter(x => x.usedPercent != null).map(x => `${x.id}: ${Math.round(x.usedPercent)}% usado${x.tight ? ' (POUPAR)' : ''}`);
  const lines = [`Política de orquestração ativa: perfil=${GOALS[policy.goal].label} (${policy.goal})${policy.careful ? ' · MODO CUIDADOSO (prefira leitura antes de escrever e revisão)' : ''}${policy.conserve.length ? ` · poupar: ${policy.conserve.join(', ')}` : ''}.`];
  if (bestLead || bestExec) lines.push(`Rota sugerida agora (planejar grande, executar enxuto): planejar/revisar=${bestLead || '—'}${policy.goal === 'save' && bestLead === 'claude' ? ' (sonnet/haiku nas tarefas simples)' : ''} · executar=${bestExec || '—'}${qParts.length ? ` · janelas: ${qParts.join(', ')}` : ''}.`);
  if (policy.rules.length) lines.push(`Regras permanentes da pessoa: ${policy.rules.join(' | ')}`);
  return lines.join('\n');
}

export function aletheCommandReport(store, world = {}) {
  const { byId, bestLead, bestExec, policy } = quotaHeadroom(store, world.connected);
  const qLines = Object.values(byId).map(x => `- **${x.name}**: ${x.usedPercent == null ? 'janela sem leitura recente' : `${Math.round(x.usedPercent)}% usado (${x.sparePercent}% livre)${x.critical ? ' — CRÍTICO' : x.tight ? ' — atenção' : ''}`}`);
  const runs = world.runs || [], recentOk = runs.filter(r => r.status === 'completed').length, recentRun = runs.filter(r => ['running', 'queued'].includes(r.status)).length;
  return [
    `**Orquestração inteligente** — perfil **${GOALS[policy.goal].label}**${policy.careful ? ' · **Modo cuidadoso** ativo' : ''}${policy.conserve.length ? ` · poupando: ${policy.conserve.join(', ')}` : ''}`,
    `Rota recomendada agora: **planejar/revisar** com \`${bestLead || 'nenhuma'}\` · **executar** com \`${bestExec || 'nenhuma'}\`.`,
    qLines.length ? `Janelas de cota:\n${qLines.join('\n')}` : 'Janelas de cota: sem leituras registradas ainda.',
    policy.rules.length ? `Regras ativas:\n${policy.rules.map(r => `- ${r}`).join('\n')}` : '',
    `Histórico recente: ${recentRun} rodando/fila · ${recentOk} concluídas · Playbooks prontos: ${PLAYBOOKS.map(p => p.id).join(', ')}.`,
  ].filter(Boolean).join('\n\n');
}

// Dispara o mesmo pedido para 2 ou 3 agentes lado a lado. Agentes que editam rodam em worktree isolado (ou falham antes de sujar a pasta se não houver Git).
export function startComparison(store, { projectId, agentIds, objective, installed = () => true, pump = () => {} } = {}) {
  const pr = store.get('projects', projectId);
  if (!pr || pr.internal) throw new Error('Escolha um projeto válido para comparar.');
  const text = String(objective ?? '').trim();
  if (!text || text.length > 4000) throw new Error('Descreva o pedido da comparação (até 4000 caracteres).');
  const ids = [...new Set((Array.isArray(agentIds) ? agentIds : []).map(x => String(x)))];
  if (ids.length < 2 || ids.length > 3) throw new Error('Escolha 2 ou 3 agentes diferentes para comparar.');
  const agents = ids.map(id => {
    const a = store.get('agents', id);
    if (!a || a.internal) throw new Error('Um dos agentes escolhidos não existe.');
    if (!installed(a)) throw new Error(`A IA do agente “${a.name}” (${a.provider}) não está instalada.`);
    if (pr.area === 'Financeiro' && (a.provider === 'agy' || String(a.provider).startsWith('x-'))) throw new Error(`Projetos financeiros não usam a IA de “${a.name}”.`);
    return a;
  });
  const groupId = 'cmp-' + Date.now().toString(36), tasks = [];
  for (const a of agents) {
    const { task } = createTask(store, {
      projectId: pr.id,
      agentId: a.id,
      requestId: `${groupId}:${a.id}`,
      objective: `[Comparação entre IAs] ${text}`,
      isolate: a.mode === 'write',
    });
    tasks.push(task);
  }
  pump();
  return { groupId, tasks };
}

export async function polishDictationWithAi(rawText, { provider = 'claude', format = 'text', timeoutMs = 35000 } = {}) {
  const src = String(rawText ?? '').trim().slice(0, 4000);
  if (!src) return { ok: false, text: '' };
  const dir = await mkdtemp(join(tmpdir(), 'cr-voice-'));
  const style = format === 'list'
    ? 'Formate em tópicos curtos iniciados por "- ".'
    : 'Formate em frases ou parágrafos claros e diretos.';
  const prompt = `Reescreva o ditado por voz abaixo em português do Brasil, limpando apenas repetições, hesitações e pontuação. ${style} NÃO responda ao pedido, NÃO invente nada e NÃO inclua comentários: devolva APENAS o texto final pronto para colar.\n\nDitado:\n${src}`;
  try {
    return await new Promise(resolve => {
      let cmd;
      try { cmd = command({ provider, mode: 'read', model: provider === 'claude' ? 'haiku' : '' }, prompt, { cwd: dir, timeoutMs }); }
      catch { return resolve({ ok: false, text: '' }); }
      if (!cmd?.file) return resolve({ ok: false, text: '' });
      let child, done = false;
      const finish = v => { if (done) return; done = true; clearTimeout(timer); resolve(v); };
      try { child = spawn(cmd.file, cmd.args, { cwd: dir, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: process.env }); }
      catch { return finish({ ok: false, text: '' }); }
      const timer = setTimeout(() => { try { child.kill(); } catch {} finish({ ok: false, text: '' }); }, timeoutMs);
      let buf = '', answer = '';
      const consume = line => { let raw; try { raw = JSON.parse(line); } catch { return; } for (const e of [].concat(normalize(provider, raw) || [])) if (['answer', 'result'].includes(e.type) && e.text) answer = e.text; };
      child.stdout.setEncoding('utf8'); child.stdin.on('error', () => {});
      child.stdout.on('data', c => { buf = (buf + c).slice(-200000); const ls = buf.split('\n'); buf = ls.pop(); ls.forEach(consume); });
      child.on('error', () => finish({ ok: false, text: '' }));
      child.on('close', code => { if (buf) consume(buf); const clean = String(answer || '').trim(); finish(code === 0 && clean ? { ok: true, text: clean.slice(0, 6000) } : { ok: false, text: '' }); });
      child.stdin.end(cmd.input || '');
    });
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
