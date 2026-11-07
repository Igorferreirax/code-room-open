// Sessão ao vivo no chat com um agente: o que a tarefa dele está fazendo agora (ou fez por último). Funções puras: recebem
// o detalhe da tarefa (GET /api/tasks/:id) e devolvem HTML. Nada aqui executa ações.
import { esc } from './views.js';

const STATE = { queued: ['warn', 'na fila'], waiting_dependency: ['warn', 'esperando a vez'], starting: ['run', 'iniciando'], running: ['run', 'trabalhando'], cancelling: ['warn', 'cancelando'], completed: ['ok', 'concluída'], failed: ['bad', 'falhou'], timeout: ['bad', 'tempo esgotado'], blocked: ['bad', 'bloqueada'], cancelled: ['idle', 'cancelada'], interrupted: ['idle', 'interrompida'] };
export const stateLabel = s => STATE[s] || ['idle', String(s || '')];
export const ACTIVE = new Set(['queued', 'waiting_dependency', 'starting', 'running', 'cancelling']);
const SKIP = new Set(['usage', 'session', 'result', 'context']);
const first = (t, n = 140) => { const s = String(t || '').split('\n').find(l => l.trim()) || ''; const c = s.replace(/\s+/g, ' ').trim(); return c.length > n ? c.slice(0, n - 1) + '…' : c; };
const hm = t => t ? new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';

// Qual tarefa mostrar: a que está rodando (ou na fila) agora; senão a mais recente do agente.
export function liveTaskOf(runs, agentId) {
  const mine = (runs || []).filter(t => t.agent?.id === agentId && !t.project?.id?.startsWith('assistant-'));
  const stamp = t => Date.parse(t.updatedAt || t.createdAt) || 0;
  const live = mine.filter(t => ACTIVE.has(t.status)).sort((a, b) => stamp(b) - stamp(a))[0];
  return live || mine.sort((a, b) => stamp(b) - stamp(a))[0] || null;
}

// Linhas da linha do tempo: o que o agente fez, em ordem, sem o ruído técnico.
export function liveRows(events, max = 14) {
  const rows = [];
  for (const e of events || []) {
    if (SKIP.has(e.type)) continue;
    const text = first(e.text, 160);
    if (e.type === 'status') { const st = STATE[e.text]; rows.push({ kind: 'status', icon: '●', text: st ? `Estado: ${st[1]}` : `Estado: ${esc(String(e.text || ''))}`, at: e.at }); continue; }
    if (!text) continue;
    if (e.type === 'activity') rows.push({ kind: 'activity', icon: '⚙', text, at: e.at });
    else if (e.type === 'answer') rows.push({ kind: 'answer', icon: '💬', text, at: e.at });
    else if (e.type === 'error') rows.push({ kind: 'error', icon: '⚠', text, at: e.at });
    else if (e.type === 'diagnostic') rows.push({ kind: 'diag', icon: 'ℹ', text, at: e.at });
  }
  return rows.slice(-max);
}

export function liveHtml(task) {
  if (!task) return '';
  const [dot, label] = STATE[task.status] || ['idle', task.status || ''], active = ACTIVE.has(task.status);
  const rows = liveRows(task.events);
  const answer = String(task.answer || '').trim();
  const shown = answer.length > 1400 ? '…' + answer.slice(-1400) : answer;
  return `<section class="cw-live" id="live-box" aria-label="Sessão ao vivo" ${active ? 'aria-live="polite"' : ''}>
    <h3 class="small"><span class="dot d-${dot}"></span> ${active ? 'Ao vivo' : 'Última tarefa'} · <b>${esc(task.agent?.name || '')}</b> <span class="muted">${esc(label)}</span></h3>
    <p class="small muted live-prompt">“${esc(first(task.prompt, 110))}”</p>
    ${rows.length ? `<ol class="live-log" id="live-log">${rows.map(r => `<li class="lv-${r.kind}"><span aria-hidden="true">${r.icon}</span> <span class="lv-text">${esc(r.text)}</span>${r.at ? `<small class="muted"> ${esc(hm(r.at))}</small>` : ''}</li>`).join('')}</ol>` : '<p class="small muted">Ainda sem movimento.</p>'}
    ${shown ? `<details class="live-answer" ${active ? 'open' : ''}><summary class="small">${active ? 'Resposta até agora' : 'Resposta'}</summary><pre class="as-code">${esc(shown)}</pre></details>` : ''}
    ${task.reason && !active ? `<p class="upd-err small" role="alert">${esc(first(task.reason, 200))}</p>` : ''}
    <div class="btn-row"><button type="button" class="btn ghost sm" data-act="task" data-id="${esc(task.id)}">Abrir a tarefa completa</button>${active ? `<button type="button" class="btn ghost sm" data-act="cancel" data-id="${esc(task.id)}">Parar</button>` : ''}</div>
  </section>`;
}
