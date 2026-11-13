import { CHARACTERS } from './art.js';

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const STATES = { running: 'Executando', available: 'Disponível', idle: 'Ocioso', waiting: 'Aguardando', queued: 'Na fila', decision: 'Aguardando decisão', failed: 'Falhou', disconnected: 'Desconectado', done: 'Concluído' };

// Vista opcional: as poses acompanham o estado real. Só Nilo e o gato têm quadros animados.
export function livingOfficeHtml(ctx, agents) {
  const active = agents.some(a => ctx.agentStatus(a).status === 'running');
  const slots = Array.from({ length: 3 }, (_, i) => {
    const a = agents[i];
    if (!a) return '<div class="living-station living-empty" aria-hidden="true"><span>Estação livre</span></div>';
    const name = CHARACTERS[ctx.state.agents.findIndex(x => x.id === a.id) % CHARACTERS.length] || CHARACTERS[i];
    const status = ctx.agentStatus(a).status;
    const typing = name === 'nilo' && status === 'running';
    return `<button type="button" class="living-station st-${esc(status)}" data-act="agent" data-id="${esc(a.id)}" aria-label="${esc(a.name)}: ${esc(STATES[status] || status)}">
      <span class="living-monitor" aria-hidden="true"></span><span class="living-actor${typing ? ' typing' : ''}" style="background-image:url('/assets/char-${name}-${typing ? 'typing' : 'work'}.png')" aria-hidden="true"></span>
      <span class="living-desk" aria-hidden="true"></span><span class="living-label"><img src="/assets/char-${name}-face.png" width="28" height="28" alt="" aria-hidden="true"><span><b>${esc(a.name)}</b><small>${esc(STATES[status] || status)}</small></span></span>
    </button>`;
  }).join('');
  return `<div class="living-office" role="group" aria-label="Cenário vivo dos agentes deste ambiente"><div class="living-window" aria-hidden="true"></div><div class="living-floor" aria-hidden="true"></div><div class="living-grid">${slots}</div><span class="living-cat${active ? '' : ' walking'}" aria-hidden="true"></span></div>`;
}
