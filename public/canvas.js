import { icon } from './icons.js';
import { avatar, agentAv } from './art.js';
import { esc, idx, PROVIDER } from './views.js';
import { agentTip } from './activity.js';

// Canvas: os agentes como cartões numa tela, com ligações reais entre eles.
// Uma ligação A → B faz o trabalho concluído de A virar tarefa de B (resumo e arquivos), e B → A faz os dois se responderem
// até o limite de repasses ou até alguém escrever "SEM PENDÊNCIAS". HTML e SVG puros: sem biblioteca, sem laço de animação.
const NW = 232, NH = 88, PAD = 36, GAPX = 70, GAPY = 52, COLS = 3;
const STATE_ICON = { running: ['terminal', 'run'], done: ['check', 'ok'], failed: ['x', 'bad'], waiting: ['clock', 'warn'], queued: ['clock', 'warn'], decision: ['info', 'warn'], disconnected: ['plug', 'off'] };
const ACTIVE = ['running', 'queued', 'waiting_dependency'];
let dragging = false;
export const canvasBusy = () => dragging;

const posKey = project => 'cr.canvas.' + (project || 'x');
const loadPos = project => { try { return JSON.parse(localStorage.getItem(posKey(project)) || '{}'); } catch { return {}; } };
const savePos = (project, pos) => { try { localStorage.setItem(posKey(project), JSON.stringify(pos)); } catch {} };

function layout(agents, saved) {
  const out = {};
  agents.forEach((a, i) => { out[a.id] = saved[a.id] && Number.isFinite(saved[a.id].x) ? saved[a.id] : { x: PAD + (i % COLS) * (NW + GAPX), y: PAD + Math.floor(i / COLS) * (NH + GAPY) }; });
  return out;
}
const port = (p, side) => side === 'out' ? { x: p.x + NW, y: p.y + NH / 2 } : { x: p.x, y: p.y + NH / 2 };
function curve(a, b) { const dx = Math.max(50, Math.abs(b.x - a.x) / 2); return `M${a.x},${a.y} C${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}`; }

function nodeHtml(ctx, a, p) {
  const s = ctx.agentStatus(a), st = s.status === 'queued' ? 'waiting' : s.status, ic = STATE_ICON[st];
  const badge = st === 'idle' ? '<span class="cv-zzz" aria-hidden="true">z<b>Z</b></span>' : st === 'running' ? '<span class="cv-typing" aria-hidden="true"><i></i><i></i><i></i></span>' : ic ? `<span class="cv-st b-${ic[1]}" aria-hidden="true">${icon(ic[0], 18)}</span>` : '';
  return `<div class="cv-node st-${st}" role="button" tabindex="0" data-agent="${esc(a.id)}" title="${esc(agentTip(ctx, a))}" style="left:${p.x}px;top:${p.y}px;width:${NW}px;height:${NH}px" aria-label="${esc(a.name)}, ${esc(a.role)}. ${esc(s.label)}">
    <span class="cv-av">${agentAv(a, idx(ctx, a), 36)}</span>
    <span class="cv-meta"><b>${esc(a.name)}</b><small>${esc(a.role)}</small><small class="cv-prov">${esc(PROVIDER[a.provider] || a.provider)}${a.model ? ' · ' + esc(a.model) : ''}</small></span>${badge}
    <i class="cv-port in" aria-hidden="true"></i><i class="cv-port out" data-out="${esc(a.id)}" title="Arraste até outro agente para ligar" aria-hidden="true"></i></div>`;
}

export function canvasHtml(ctx) {
  const agents = ctx.state.agents.filter(a => !ctx.room || a.room === ctx.room);
  if (!agents.length) return `<div class="cv-empty">Crie agentes em “Agentes e ferramentas” para vê-los aqui.</div>`;
  const pos = layout(agents, loadPos(ctx.project)), ids = new Set(agents.map(a => a.id));
  const links = (ctx.state.links || []).filter(l => l.projectId === ctx.project && ids.has(l.from) && ids.has(l.to));
  const W = Math.max(...Object.values(pos).map(p => p.x)) + NW + PAD, H = Math.max(...Object.values(pos).map(p => p.y)) + NH + PAD;
  const runs = ctx.state.runs || [], byId = Object.fromEntries(runs.map(r => [r.id, r]));
  // A linha "corre" quando o destino está de fato recebendo trabalho do remetente: tarefa ativa do destino que veio de uma tarefa do remetente (ligação ou fluxo de equipe).
  const live = l => runs.some(r => r.agent.id === l.to && ['running', 'queued'].includes(r.status) && ((r.linkFrom && byId[r.linkFrom]?.agent.id === l.from) || (r.dependsOn || []).some(id => byId[id]?.agent.id === l.from)));
  const teamEdges = [];
  for (const t of ctx.state.teams || []) {
    const dev = t.members.find(m => m.role === 'desenvolvedor'), rev = t.members.find(m => m.role === 'revisor');
    if (dev && rev && ids.has(dev.agentId) && ids.has(rev.agentId) && !links.some(l => l.from === dev.agentId && l.to === rev.agentId)) teamEdges.push({ from: dev.agentId, to: rev.agentId, name: t.name });
  }
  const edge = (e, cls, extra = '') => { const a = port(pos[e.from], 'out'), b = port(pos[e.to], 'in'), d = curve(a, b), mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; return `<g class="cv-edge ${cls}" data-from="${esc(e.from)}" data-to="${esc(e.to)}" ${extra}><path class="line" d="${d}" marker-end="url(#cv-arrow)"/><path class="hit" d="${d}"/>${cls.includes('live') ? `<circle class="cv-pulse" r="4.5"><animateMotion dur="1.4s" repeatCount="indefinite" path="${d}"/></circle><circle class="cv-pulse" r="4.5"><animateMotion dur="1.4s" begin="0.7s" repeatCount="indefinite" path="${d}"/></circle>` : ''}${e.id ? `<g class="cv-x" data-unlink="${esc(e.id)}" transform="translate(${mid.x},${mid.y})" role="button" aria-label="Remover ligação"><circle r="10"/><path d="M-4,-4 L4,4 M4,-4 L-4,4"/><title>Remover ligação (repasses: até ${e.maxHops})</title></g>` : `<title>Fluxo da equipe ${esc(e.name || '')}</title>`}</g>`; };
  const opts = agents.map(a => `<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('');
  const chips = links.map(l => { const f = agents.find(a => a.id === l.from), t = agents.find(a => a.id === l.to); return `<span class="chip">${esc(f.name)} → ${esc(t.name)} <small>(até ${l.maxHops})</small><button type="button" class="chip-x" data-unlink="${esc(l.id)}" aria-label="Remover ligação ${esc(f.name)} para ${esc(t.name)}">${icon('x', 14)}</button></span>`; }).join('');
  return `<div class="cv-wrap"><div class="cv" id="cv" style="--w:${W}px;--h:${H}px"><div class="cv-world" style="width:${W}px;height:${H}px">
    <svg class="cv-edges" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="false"><defs><marker id="cv-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
      ${teamEdges.map(e => edge(e, 'team' + (live(e) ? ' live' : ''))).join('')}${links.map(l => edge(l, 'link' + (l.enabled === false ? ' off' : '') + (live(l) ? ' live' : ''))).join('')}<path id="cv-temp" class="cv-temp" d="" hidden/></svg>
    ${agents.map(a => nodeHtml(ctx, a, pos[a.id])).join('')}</div></div>
    <form id="link-form" class="cv-form"><span>Ligar</span><label class="sr-only" for="lf-from">De</label><select id="lf-from" name="from">${opts}</select><span aria-hidden="true">→</span><label class="sr-only" for="lf-to">Para</label><select id="lf-to" name="to">${opts}</select><label class="sr-only" for="lf-hops">Repasses máximos</label><span class="small muted">até</span><input id="lf-hops" name="maxHops" type="number" min="1" max="6" value="3" style="width:64px"><span class="small muted">repasses</span><button class="btn sm">${icon('plus', 16)} Criar ligação</button></form>
    <p class="cv-legend small" aria-label="Legenda"><span><i class="lg run"></i> trabalhando</span><span><i class="lg wait"></i> esperando a vez</span><span><i class="lg idle"></i> parado (zZ)</span><span><i class="lg bad"></i> falhou</span><span><i class="lg flow"></i> linha verde = trabalho passando de um para outro</span></p>
    ${chips ? `<div class="chips cv-chips">${chips}</div>` : ''}
    <p class="muted small cv-help">Arraste o ponto da direita de um agente até outro para ligá-los (ou use o formulário acima). Quando o primeiro termina, o segundo recebe o resumo e os arquivos e continua. Com ligações nos dois sentidos, eles se respondem até o limite de repasses ou até alguém escrever “SEM PENDÊNCIAS”. Vale para missões avulsas de um agente (não para equipes nem supervisor). Linhas tracejadas cinzas são o fluxo das equipes.</p></div>`;
}

export function bindCanvas(root, ctx, { onOpen, onLink, onUnlink, onEnd }) {
  const cv = root.querySelector('#cv'); if (!cv) return;
  const agents = ctx.state.agents.filter(a => !ctx.room || a.room === ctx.room), pos = layout(agents, loadPos(ctx.project));
  const svg = cv.querySelector('.cv-edges'), temp = cv.querySelector('#cv-temp');
  const redraw = () => svg.querySelectorAll('.cv-edge').forEach(g => {
    const a = port(pos[g.dataset.from], 'out'), b = port(pos[g.dataset.to], 'in'), d = curve(a, b);
    g.querySelectorAll('path.line,path.hit').forEach(p => p.setAttribute('d', d)); const x = g.querySelector('.cv-x'); if (x) x.setAttribute('transform', `translate(${(a.x + b.x) / 2},${(a.y + b.y) / 2})`);
  });
  const toWorld = e => { const r = cv.querySelector('.cv-world').getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  cv.addEventListener('pointerdown', e => {
    const unlink = e.target.closest('[data-unlink]'); if (unlink) return;
    const out = e.target.closest('.cv-port.out');
    if (out) {   // desenha a ligação
      e.preventDefault(); dragging = true; const from = out.dataset.out, start = port(pos[from], 'out'); temp.hidden = false; cv.setPointerCapture?.(e.pointerId);
      const move = ev => { const w = toWorld(ev); temp.setAttribute('d', curve(start, w)); cv.querySelectorAll('.cv-node').forEach(n => n.classList.toggle('target', n.dataset.agent !== from && n.contains(document.elementFromPoint(ev.clientX, ev.clientY)))); };
      const up = ev => { cv.removeEventListener('pointermove', move); cv.removeEventListener('pointerup', up); cv.removeEventListener('pointercancel', up); temp.hidden = true; dragging = false; cv.querySelectorAll('.cv-node.target').forEach(n => n.classList.remove('target')); const to = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.cv-node')?.dataset.agent; if (to && to !== from) onLink(from, to); onEnd?.(); };
      cv.addEventListener('pointermove', move); cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up); return;
    }
    const node = e.target.closest('.cv-node'); if (!node) return;
    const id = node.dataset.agent, start = { x: e.clientX, y: e.clientY }, orig = { ...pos[id] }; let moved = false;
    const move = ev => {
      const dx = ev.clientX - start.x, dy = ev.clientY - start.y;
      if (!moved && Math.hypot(dx, dy) < 5) return; moved = true; dragging = true; node.classList.add('drag');
      pos[id] = { x: Math.max(8, Math.round(orig.x + dx)), y: Math.max(8, Math.round(orig.y + dy)) };
      node.style.left = pos[id].x + 'px'; node.style.top = pos[id].y + 'px'; redraw();
    };
    const up = () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', up); node.classList.remove('drag'); dragging = false; if (moved) savePos(ctx.project, pos); else onOpen(id); onEnd?.(); };
    document.addEventListener('pointermove', move); document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
  });
  cv.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('.cv-node')) { e.preventDefault(); onOpen(e.target.dataset.agent); } });
  root.addEventListener('click', e => { const u = e.target.closest('[data-unlink]'); if (u) onUnlink(u.dataset.unlink); });
}
