// Janela de chat única (estilo mensageiro): cabeçalho com foto e conversas, corpo conforme com quem se fala e balão minimizado. Funções puras.
import { esc, idx, targetOf } from './views.js';
import { agentAv, avatar } from './art.js';
import { activityEvents } from './activity.js';
import { PROV } from './assistant-ui.js';

const DOT = { running: 'run', queued: 'warn', waiting_dependency: 'warn', completed: 'ok', failed: 'bad', timeout: 'bad', blocked: 'bad', cancelled: 'idle', interrupted: 'idle' };
const VERB = { running: 'trabalhando em', queued: 'na fila:', waiting_dependency: 'esperando a vez:', completed: 'concluiu', failed: 'falhou em', cancelled: 'cancelado:', interrupted: 'interrompido:', timeout: 'estourou o tempo em', blocked: 'bloqueado:' };

// Com quem a pessoa está falando agora: foto, título e subtítulo.
export function whoIs(ctx) {
  const t = targetOf(ctx), a = ctx.asst, st = ctx.state || {};
  if (t === 'assistant') return { kind: 'assistant', face: avatar(3, 36), title: 'Assistente', sub: a?.briefed ? `${PROV[a.provider] || a.provider || 'IA'} · só propõe, você aprova` : 'Ainda não apresentado ao Code Room' };
  if (t.startsWith('a:')) { const ag = (st.agents || []).find(x => x.id === t.slice(2)); if (ag) return { kind: 'agent', face: agentAv(ag, idx(ctx, ag), 36), title: ag.name, sub: `${ag.role} · missão direta`, agent: ag }; }
  if (t.startsWith('t:')) { const tm = (st.teams || []).find(x => x.id === t.slice(2)); if (tm) { const first = (st.agents || []).find(x => x.id === tm.members?.[0]?.agentId); return { kind: 'team', face: first ? agentAv(first, idx(ctx, first), 36) : avatar(3, 36), title: `Equipe ${tm.name}`, sub: 'desenvolvedor → revisor · missão direta', team: tm }; } }
  if (t === 's') { const sup = ctx.supervisorAgent?.(); return { kind: 'supervisor', face: sup ? agentAv(sup, idx(ctx, sup), 36) : avatar(3, 36), title: 'Supervisor', sub: 'propõe um plano para você aceitar', agent: sup }; }
  return { kind: 'none', face: avatar(3, 36), title: 'Chat', sub: '' };
}

export function chatHeaderHtml(ctx) {
  const w = whoIs(ctx), a = ctx.asst, threads = w.kind === 'assistant' ? (a?.threads || []) : [];
  const chips = threads.length ? `<div class="cw-threads" role="tablist" aria-label="Conversas">${threads.map(t => `<span class="cw-th ${t.active ? 'on' : ''}">${ctx.ui.renameId === t.id ? `<input class="cw-rename" data-rename="${esc(t.id)}" value="${esc(t.title)}" maxlength="40" aria-label="Nome da conversa">` : `<button type="button" role="tab" aria-selected="${t.active}" data-act="asst-thread" data-id="${esc(t.id)}" title="${esc(t.title)}${t.active ? ' (duplo clique para renomear)' : ''}">${esc(t.title)}${t.waiting ? ' <i class="cw-wait" aria-label="esperando resposta"></i>' : ''}</button>`}${t.active && ctx.ui.renameId !== t.id ? `<button type="button" class="cw-x" data-act="asst-thread-rename" data-id="${esc(t.id)}" aria-label="Renomear esta conversa" title="Renomear">✎</button>` : ''}${t.active && threads.length > 1 ? `<button type="button" class="cw-x" data-act="asst-thread-del" data-id="${esc(t.id)}" aria-label="Apagar esta conversa">×</button>` : ''}</span>`).join('')}<button type="button" class="cw-th add" data-act="asst-new-thread" aria-label="Nova conversa" title="Nova conversa">＋</button></div>` : '';
  return `<div class="cw-top"><span class="cw-face">${w.face}</span><div class="cw-who"><b id="chat-title">${esc(w.title)}</b><small>${esc(w.sub)}</small></div>
    ${w.kind === 'assistant' && a?.briefed ? '<button type="button" class="iconbtn" data-act="asst-reset" aria-label="Limpar esta conversa" title="Limpar esta conversa">🗑</button>' : ''}<button type="button" class="iconbtn" data-act="chat-min" aria-label="Minimizar o chat" title="Minimizar">–</button></div>${chips}`;
}

// Corpo para quem não é o Assistente: estado e atividade do agente ou da equipe (o resultado de verdade aparece em Tarefas).
export function targetBodyHtml(ctx) {
  const w = whoIs(ctx), st = ctx.state || {};
  if (w.kind === 'none') return '<p class="muted">Crie um agente em <button type="button" class="linkbtn" data-nav="agents">Agentes</button> para dar missões, ou fale com o Assistente.</p>';
  const ids = w.kind === 'agent' || w.kind === 'supervisor' ? (w.agent ? [w.agent.id] : []) : (w.team?.members || []).map(m => m.agentId);
  const ev = ids.length ? activityEvents(ctx, { agentIds: ids, limit: 8 }) : [];
  const status = w.agent ? `<p class="small">${esc(ctx.agentStatus(w.agent).label)}</p>` : '';
  const rows = ev.map(e => `<li><span class="dot d-${DOT[e.status] || 'idle'}"></span><button type="button" class="link" data-act="task" data-id="${esc(e.id)}"><b>${esc(e.agent)}</b> ${esc(VERB[e.status] || e.status)} <span class="muted">“${esc(e.text)}”</span></button><small class="muted"> ${esc(e.ago)}</small></li>`).join('');
  return `<div class="cw-direct"><p><b>Missão direta.</b> Escreva abaixo o que ${w.kind === 'team' ? 'a equipe' : 'o agente'} deve fazer. Use <code>/skill</code> para anexar uma skill (agente) e o clipe para critérios de conclusão. O resultado aparece em <button type="button" class="linkbtn" data-nav="tasks">Tarefas</button>.</p>${status}
    <h3 class="small">Atividade recente</h3>${rows ? `<ul class="dots-list activity-list">${rows}</ul>` : '<p class="muted small">Ainda sem atividade.</p>'}</div>`;
}

export const bubbleHtml = (ctx, { unread = false, busy = false, alert = false } = {}) => `<span class="cb-face">${avatar(3, 46)}</span>${busy ? '<span class="cb-busy" aria-hidden="true"></span>' : ''}${unread ? '<span class="cb-dot" role="status" aria-label="Resposta nova"></span>' : alert ? '<span class="cb-dot cb-alert" role="status" aria-label="O Assistente notou algo"></span>' : ''}`;
