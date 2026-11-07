// Janelas de chat extras: até 3 agentes ao mesmo tempo, lado a lado, cada uma com a sessão ao vivo dele e uma caixa de missão própria.
// O chat principal (Assistente, equipes, supervisor) continua como está. Funções puras: devolvem HTML; quem ouve os cliques é o app.js.
import { esc, idx } from './views.js';
import { agentAv } from './art.js';
import { liveHtml, liveRows, stateLabel, ACTIVE } from './live-ui.js';

export const MAX_MINI = 3;

// Lista de janelas: só agentes que ainda existem, sem repetir, no máximo MAX_MINI.
export function cleanMini(ids, agents) {
  const have = new Set((agents || []).map(a => a.id));
  return [...new Set(Array.isArray(ids) ? ids : [])].filter(id => typeof id === 'string' && have.has(id)).slice(-MAX_MINI);
}

// Abrir uma janela: se já existe, não duplica; se passou do limite, sai a mais antiga.
export function addMini(ids, id) { const l = (ids || []).filter(x => x !== id); l.push(id); return l.slice(-MAX_MINI); }

// Casca da janela (criada uma vez; o corpo e o estado mudam sem recriar, para não perder o que a pessoa está digitando).
export function miniShellHtml(ctx, agent) {
  return `<header class="mini-head"><span class="mini-face" aria-hidden="true">${agentAv(agent, idx(ctx, agent), 30)}</span><div class="mini-who"><b>${esc(agent.name)}</b><small data-mini-status></small></div><button type="button" class="iconbtn" data-act="mini-close" data-id="${esc(agent.id)}" aria-label="Fechar a janela de ${esc(agent.name)}" title="Fechar">×</button></header>
    <div class="mini-body" data-mini-body></div>
    <form class="mini-form" data-id="${esc(agent.id)}"><label class="sr-only" for="mini-t-${esc(agent.id)}">Missão para ${esc(agent.name)}</label><textarea id="mini-t-${esc(agent.id)}" rows="2" maxlength="8000" placeholder="Missão para ${esc(agent.name)}… (Enter envia)"></textarea><button type="submit" class="btn sm">Enviar</button></form>`;
}

export function miniBodyHtml(task) {
  return task ? liveHtml(task) : '<p class="small muted">Sem atividade ainda. Escreva uma missão abaixo.</p>';
}

// Balão do agente (clicou no agente, a conversa abre ali do lado): estado, as últimas ações e, ao terminar, o começo da resposta. Compacto de propósito.
export function bubbleLiveHtml(task) {
  if (!task) return '<p class="small muted am-empty">Sem atividade ainda. Escreva uma missão abaixo.</p>';
  const [dot, label] = stateLabel(task.status), active = ACTIVE.has(task.status), rows = liveRows(task.events, 3);
  const ans = String(task.answer || '').trim().replace(/\s+/g, ' ');
  return `<div class="am-state"><span class="dot d-${dot}"></span> <b>${active ? 'Ao vivo' : 'Última tarefa'}</b> <span class="muted">${esc(label)}</span></div>
    ${rows.length ? `<ul class="am-rows">${rows.map(r => `<li class="lv-${r.kind}"><span aria-hidden="true">${r.icon}</span> ${esc(r.text.length > 90 ? r.text.slice(0, 89) + '…' : r.text)}</li>`).join('')}</ul>` : ''}
    ${!active && ans ? `<p class="small am-answer">${esc(ans.length > 200 ? ans.slice(0, 199) + '…' : ans)}</p>` : ''}
    ${!active && task.reason ? `<p class="upd-err small" role="alert">${esc(String(task.reason).slice(0, 140))}</p>` : ''}
    <div class="am-links"><button type="button" class="linkbtn" data-act="task" data-id="${esc(task.id)}">Ver tudo</button>${active ? `<button type="button" class="linkbtn" data-act="cancel" data-id="${esc(task.id)}">Parar</button>` : ''}</div>`;
}
