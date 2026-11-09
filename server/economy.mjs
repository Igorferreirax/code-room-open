// Economia de tokens: mostra onde o consumo foi, propõe ajustes (modelo mais leve, menos esforço, outra IA) e aplica só o que a pessoa marcar.
// Nada muda sozinho. Tudo que é aplicado pode ser desfeito. Só usa números que a própria IA informou; sem dado, sem sugestão.

const DECIDE = /revis|supervis|diretor|planej|arquitet|segur|audit|decid/i;   // quem decide ou confere mantém o modelo forte
const HIGH = ['high', 'xhigh', 'max'];
const isDecider = a => DECIDE.test(`${a.name || ''} ${a.role || ''}`) || (a.capabilities || []).includes('supervise');
// No Codex a entrada inclui o que veio do cache; no Claude o cache é contado à parte. Aqui vale só o que foi processado de novo + a saída.
const inOf = (u, provider) => Math.max(0, (u?.input ?? 0) - (provider === 'codex' ? (u?.cached ?? 0) : 0));
const tok = (u, provider) => inOf(u, provider) + (u?.output ?? 0);

export function usageReport(store, { days = 30, now = Date.now() } = {}) {
  const since = now - days * 86400000, start = new Date(now); start.setHours(0, 0, 0, 0);
  const agents = new Map(), projects = new Map(), perDay = new Map(); let total = 0, today = 0, withUsage = 0;
  for (const t of store.list('tasks')) {
    const at = Date.parse(t.updatedAt || t.createdAt); if (!(at >= since) || !t.usage || (t.usage.input == null && t.usage.output == null)) continue;
    withUsage++; const n = tok(t.usage, t.agent.provider); total += n; if (at >= start.getTime()) today += n;
    const a = agents.get(t.agent.id) || { agentId: t.agent.id, name: t.agent.name, provider: t.agent.provider, model: t.agent.model || '', runs: 0, input: 0, output: 0, cached: 0, failed: 0 };
    a.runs++; a.input += inOf(t.usage, t.agent.provider); a.output += t.usage.output ?? 0; a.cached += t.usage.cached ?? 0; if (t.status === 'failed') a.failed++; agents.set(a.agentId, a);
    const p = projects.get(t.project.id) || { projectId: t.project.id, name: t.project.name, runs: 0, tokens: 0 }; p.runs++; p.tokens += n; projects.set(p.projectId, p);
    const d = new Date(at).toISOString().slice(0, 10); perDay.set(d, (perDay.get(d) || 0) + n);
  }
  const rows = [...agents.values()].map(a => ({ ...a, tokens: a.input + a.output, avgInput: Math.round(a.input / a.runs), avgOutput: Math.round(a.output / a.runs) })).sort((x, y) => y.tokens - x.tokens);
  return { days, total, today, withUsage, agents: rows.slice(0, 12), projects: [...projects.values()].sort((x, y) => y.tokens - x.tokens).slice(0, 8), perDay: [...perDay.entries()].sort().slice(-7).map(([day, tokens]) => ({ day, tokens })) };
}

// connected: ids das IAs instaladas neste computador. claudeWindows: janelas de limite do Claude (se houver leitura).
export function suggest(store, { connected = new Set(), claudeWindows = [], report } = {}) {
  const rep = report || usageReport(store), by = new Map(rep.agents.map(a => [a.agentId, a])), out = [];
  const claudeHot = claudeWindows.some(w => (w.usedPercent ?? 0) >= 80);
  for (const a of store.list('agents')) {
    if (String(a.id).startsWith('assistant-')) continue; const u = by.get(a.id), decider = isDecider(a);
    const add = (kind, text, patch) => out.push({ id: `${a.id}:${kind}`, agentId: a.id, agentName: a.name, kind, text, patch: patch || null, risky: kind === 'provider' });
    if (a.provider === 'claude' && !decider) {
      if (/opus/i.test(a.model || '')) add('model', `“${a.name}” usa ${a.model}, o modelo mais caro, e não decide nem revisa. Sonnet costuma bastar.`, { model: 'sonnet' });
      else if (!a.model && u && u.runs >= 2) add('model', `“${a.name}” usa o modelo padrão da conta (pode ser o mais caro) em ${u.runs} execuções. Fixar o Sonnet garante gasto menor.`, { model: 'sonnet' });
    }
    if (HIGH.includes(a.effort) && !decider && (!u || u.avgOutput < 2500)) add('effort', `“${a.name}” roda com esforço ${a.effort}${u ? ` e responde em média ${u.avgOutput} tokens` : ''}. Esforço médio costuma bastar.`, { effort: 'medium' });
    if (u && u.avgInput > 60000) add('info', `“${a.name}” recebe em média ${u.avgInput.toLocaleString('pt-BR')} tokens de contexto por execução. Reduza notas do Obsidian, pastas de referência ou skills ligadas a ele.`);
    if (claudeHot && a.provider === 'claude' && a.mode === 'read' && !decider && !(a.commands || []).length && !(a.mcpTools || []).length && !a.web && (!a.browser || a.browser === 'off') && connected.has('codex'))
      add('provider', `O limite do Claude está acima de 80%. “${a.name}” só lê e pesquisa, sem ferramentas especiais: pode rodar no Codex (confira o resultado nas primeiras tarefas).`, { provider: 'codex', model: '', effort: '' });
  }
  return out;
}

export function applySuggestions(store, ids, ctx) {
  const wanted = new Set(Array.isArray(ids) ? ids.map(String) : []); if (!wanted.size) throw new Error('Marque pelo menos uma sugestão.');
  const plan = suggest(store, ctx).filter(s => s.patch && wanted.has(s.id)); if (!plan.length) throw new Error('Essas sugestões não valem mais. Atualize a tela.');
  const undo = [], done = [];
  for (const s of plan) {
    const a = store.get('agents', s.agentId); if (!a) continue;
    if (!undo.some(u => u.agentId === a.id)) undo.push({ agentId: a.id, prev: { model: a.model || '', effort: a.effort || '', provider: a.provider } });   // guarda o estado de antes uma vez por agente
    store.put('agents', { ...a, ...s.patch, revision: (a.revision || 0) + 1 }); done.push(s.agentName);
  }
  store.put('settings', { id: 'economy:undo', at: new Date().toISOString(), items: undo });
  return { applied: done.length, agents: done };
}
export function undoEconomy(store) {
  const u = store.get('settings', 'economy:undo'); if (!u?.items?.length) throw new Error('Não há nada para desfazer.');
  let n = 0; for (const it of u.items) { const a = store.get('agents', it.agentId); if (!a) continue; store.put('agents', { ...a, ...it.prev, revision: (a.revision || 0) + 1 }); n++; }
  store.put('settings', { id: 'economy:undo', at: u.at, items: [] }); return { restored: n };
}

// Orçamento diário de tokens (entrada + saída reportadas). Vale para INICIAR tarefas; a que já está rodando termina.
export function tokenBudget(store, now = Date.now()) {
  const l = store.get('settings', 'limits') || {}, start = new Date(now); start.setHours(0, 0, 0, 0);
  const used = store.list('tasks').filter(t => t.usage && Date.parse(t.updatedAt) >= start.getTime()).reduce((n, t) => n + tok(t.usage, t.agent?.provider), 0), limit = Number(l.budgetTokens) > 0 ? Number(l.budgetTokens) : null, enabled = !!l.budgetTokensEnabled && limit != null;
  return { enabled, limit, used, warn: enabled && used >= limit * 0.8, reached: enabled && used >= limit };
}
