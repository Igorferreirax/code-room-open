// Atividade dos agentes: o que cada um faz agora (para dicas ao passar o mouse) e a linha do tempo do projeto. Funções puras.
import { esc } from './views.js';

const ACTIVE = ['running', 'cancelling'], WAIT = ['queued', 'waiting_dependency', 'waiting_approval'];
const VERB = { running: 'trabalhando em', cancelling: 'cancelando', queued: 'na fila:', waiting_dependency: 'esperando a vez:', completed: 'concluiu', failed: 'falhou em', cancelled: 'cancelado:', interrupted: 'interrompido:', timeout: 'estourou o tempo em', blocked: 'bloqueado:' };
const SHORT = (t, n = 70) => { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

// "há 3 min", "há 2 h", "há 4 dias"
export function ago(ms) {
  if (ms == null || ms < 0 || !Number.isFinite(ms)) return '';
  const s = Math.floor(ms / 1000); if (s < 45) return 'agora há pouco'; const m = Math.round(s / 60); if (m < 60) return `há ${m} min`;
  const h = Math.round(m / 60); if (h < 24) return `há ${h} h`; const d = Math.round(h / 24); return `há ${d} ${d === 1 ? 'dia' : 'dias'}`;
}

// Eventos do projeto, do mais novo para o mais antigo. Cada tarefa vira um evento com o estado atual dela.
export function activityEvents(ctx, { projectId = ctx.project, agentId = null, agentIds = null, limit = 30, now = Date.now() } = {}) {
  return (ctx.state.runs || []).filter(t => (!projectId || t.project?.id === projectId) && (!agentId || t.agent?.id === agentId) && (!agentIds || agentIds.includes(t.agent?.id)))
    .map(t => ({ id: t.id, at: Date.parse(t.updatedAt || t.createdAt) || 0, status: t.status, agent: t.agent?.name || '?', agentId: t.agent?.id, text: SHORT(t.prompt, 90), reason: t.reason || '', files: (t.deliverables || []).length, project: t.project?.name || '' }))
    .sort((a, b) => b.at - a.at).slice(0, limit).map(e => ({ ...e, ago: ago(now - e.at) }));
}

// Texto curto para a dica do agente: o que está fazendo agora, ou a última coisa que fez.
export function agentTip(ctx, agent, now = Date.now()) {
  const mine = (ctx.state.runs || []).filter(t => t.agent?.id === agent.id).sort((a, b) => (Date.parse(b.updatedAt || b.createdAt) || 0) - (Date.parse(a.updatedAt || a.createdAt) || 0));
  const cur = mine.find(t => ACTIVE.includes(t.status)), waiting = mine.find(t => WAIT.includes(t.status)), last = mine[0];
  const lines = [`${agent.name} · ${agent.role}`];
  if (cur) lines.push(`Agora: ${VERB[cur.status]} “${SHORT(cur.prompt)}” (${ago(now - (Date.parse(cur.createdAt) || now)).replace('agora há pouco', 'começou agora') || ''})`.replace(' ()', ''));
  else if (waiting) lines.push(`Esperando: “${SHORT(waiting.prompt)}” (${VERB[waiting.status].replace(':', '')})`);
  else if (last) lines.push(`Última atividade ${ago(now - (Date.parse(last.updatedAt || last.createdAt) || now))}: ${VERB[last.status] || last.status} “${SHORT(last.prompt)}”${last.reason && ['failed', 'blocked', 'timeout'].includes(last.status) ? ` — ${SHORT(last.reason, 80)}` : ''}`);
  else lines.push('Sem atividade ainda.');
  if (last?.deliverables?.length) lines.push(`${last.deliverables.length} arquivo(s) na última entrega.`);
  return lines.join('\n');
}

const DOT = { running: 'run', cancelling: 'run', queued: 'warn', waiting_dependency: 'warn', waiting_approval: 'warn', completed: 'ok', failed: 'bad', timeout: 'bad', blocked: 'bad', cancelled: 'idle', interrupted: 'idle' };
export function activityCardHtml(ctx, opts = {}) {
  const ev = activityEvents(ctx, { limit: 20, ...opts });   // mais histórico, mas dentro de uma lista com altura máxima e rolagem própria
  const rows = ev.map(e => `<li><span class="dot d-${DOT[e.status] || 'idle'}"></span><button type="button" class="link" data-act="task" data-id="${esc(e.id)}"><b>${esc(e.agent)}</b> ${esc(VERB[e.status] || e.status)} <span class="muted">“${esc(e.text)}”</span></button><small class="muted"> ${esc(e.ago)}${e.files ? ` · ${e.files} arquivo(s)` : ''}</small></li>`).join('');
  return `<section class="card activity-card"><div class="card-h"><h2>Atividade recente</h2><button type="button" class="linkbtn" data-nav="tasks">Ver tudo</button></div>${rows ? `<ul class="dots-list activity-list" tabindex="0" aria-label="Atividades recentes (role para ver mais)">${rows}</ul>` : '<p class="muted small">Nada aconteceu neste projeto ainda. Quando os agentes trabalharem, cada passo aparece aqui.</p>'}</section>`;
}
