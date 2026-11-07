// Janelas de chat extras: até 3 agentes ao mesmo tempo, lado a lado, cada uma com a sessão ao vivo dele e uma caixa de missão própria.
// O chat principal (Assistente, equipes, supervisor) continua como está. Funções puras: devolvem HTML; quem ouve os cliques é o app.js.
import { esc, idx } from './views.js';
import { agentAv } from './art.js';
import { liveHtml } from './live-ui.js';

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
