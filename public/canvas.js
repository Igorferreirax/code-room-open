import { icon } from './icons.js';
import { avatar, agentAv } from './art.js';
import { esc, idx, PROVIDER } from './views.js';
import { agentTip } from './activity.js';

// Canvas: os agentes como cartões numa tela, com ligações reais entre eles.
// Uma ligação A → B faz o trabalho concluído de A virar tarefa de B (resumo e arquivos), e B → A faz os dois se responderem
// até o limite de repasses ou até alguém escrever "SEM PENDÊNCIAS". HTML e SVG puros: sem biblioteca, sem laço de animação.
const PAD = 36, GAPX = 70, GAPY = 52, COLS = 3;
// Tamanho do cartão: compacto, ou grande quando o Canvas mostra o terminal de cada agente (posições guardadas à parte).
let NW = 232, NH = 88, termMode = false;
const setMode = on => { termMode = !!on; NW = termMode ? 330 : 232; NH = termMode ? 232 : 88; };
const STATE_ICON = { running: ['terminal', 'run'], done: ['check', 'ok'], failed: ['x', 'bad'], waiting: ['clock', 'warn'], queued: ['clock', 'warn'], decision: ['info', 'warn'], disconnected: ['plug', 'off'] };
const ACTIVE = ['running', 'queued', 'waiting_dependency'];
let dragging = false;
// Ocupado = arrastando, ou digitando uma mensagem num terminal do Canvas (redesenhar ali apagaria o que está sendo escrito).
export const canvasBusy = () => dragging || !!document.activeElement?.closest?.('.cv .term-form');

// Câmera do Canvas: zoom (rodinha do mouse ou botões + e −) e deslocamento (arrastar o fundo com a “mãozinha”). Guardada por projeto.
export const ZMIN = 0.3, ZMAX = 2;
const camKey = project => 'cr.cv.cam.' + (termMode ? 't.' : '') + (project || 'x');
const loadCam = project => { try { const c = JSON.parse(localStorage.getItem(camKey(project)) || 'null'); if (c && [c.z, c.x, c.y].every(Number.isFinite)) return { z: Math.min(ZMAX, Math.max(ZMIN, c.z)), x: c.x, y: c.y }; } catch {} return { z: 1, x: 0, y: 0 }; };
const saveCam = (project, c) => { try { localStorage.setItem(camKey(project), JSON.stringify(c)); } catch {} };
// Zoom mantendo parado o ponto que está sob o cursor (px, py: posição dentro da área do Canvas). Função pura, testável.
export function zoomAt(cam, factor, px, py) {
  const z = Math.min(ZMAX, Math.max(ZMIN, Math.round(cam.z * factor * 1000) / 1000)), k = z / cam.z;
  return { z, x: Math.round(px - (px - cam.x) * k), y: Math.round(py - (py - cam.y) * k) };
}
// Enquadra o mundo inteiro (W x H) na área visível (vw x vh), sem passar de 100%.
export function fitCam(W, H, vw, vh, pad = 16) {
  const z = Math.min(1, Math.max(ZMIN, Math.min((vw - pad * 2) / W, (vh - pad * 2) / H)));
  return { z: Math.round(z * 1000) / 1000, x: Math.round((vw - W * z) / 2), y: Math.round(Math.max(pad, (vh - H * z) / 2)) };
}
const posKey = project => 'cr.canvas.' + (termMode ? 't.' : '') + (project || 'x');
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
  if (termMode) {   // nó com terminal: cabeçalho + as últimas linhas da tarefa do agente neste projeto (pintadas pelo app.js, como no modo Terminais)
    const t = ctx.termTask?.(a) || null, c = t && ctx.term?.[t.id];
    return `<div class="cv-node cv-t st-${st}" role="button" tabindex="0" data-agent="${esc(a.id)}" title="${esc(agentTip(ctx, a))}" style="left:${p.x}px;top:${p.y}px;width:${NW}px;height:${NH}px" aria-label="${esc(a.name)}, ${esc(a.role)}. ${esc(s.label)}">
    <span class="cv-head"><span class="cv-av">${agentAv(a, idx(ctx, a), 28)}</span><span class="cv-meta"><b>${esc(a.name)}</b><small class="cv-prov">${esc(PROVIDER[a.provider] || a.provider)}${a.model ? ' · ' + esc(a.model) : ''} · ${esc(s.label)}</small></span>${badge}</span>
    <pre class="term-out cv-term" ${t ? `data-task="${esc(t.id)}"` : ''}>${!t ? '<span class="tl-activity">Nenhuma tarefa deste agente neste projeto ainda.</span>' : c ? c.html : '<span class="tl-activity">Carregando a saída…</span>'}</pre>
    <form class="am-form term-form cv-msg" data-id="${esc(a.id)}"><label class="sr-only" for="cv-t-${esc(a.id)}">Mensagem para ${esc(a.name)}</label><textarea id="cv-t-${esc(a.id)}" rows="1" maxlength="8000" title="Enter envia; Shift+Enter quebra a linha" placeholder="${ctx.project ? `Mensagem para ${esc(a.name)}…` : 'Escolha um projeto para enviar'}" ${ctx.project ? '' : 'disabled'}></textarea></form>
    <i class="cv-port in" aria-hidden="true"></i><i class="cv-port out" data-out="${esc(a.id)}" title="Arraste até outro agente para ligar" aria-hidden="true"></i></div>`;
  }
  return `<div class="cv-node st-${st}" role="button" tabindex="0" data-agent="${esc(a.id)}" title="${esc(agentTip(ctx, a))}" style="left:${p.x}px;top:${p.y}px;width:${NW}px;height:${NH}px" aria-label="${esc(a.name)}, ${esc(a.role)}. ${esc(s.label)}">
    <span class="cv-av">${agentAv(a, idx(ctx, a), 36)}</span>
    <span class="cv-meta"><b>${esc(a.name)}</b><small>${esc(a.role)}</small><small class="cv-prov">${esc(PROVIDER[a.provider] || a.provider)}${a.model ? ' · ' + esc(a.model) : ''}</small></span>${badge}
    <i class="cv-port in" aria-hidden="true"></i><i class="cv-port out" data-out="${esc(a.id)}" title="Arraste até outro agente para ligar" aria-hidden="true"></i></div>`;
}

export function canvasHtml(ctx) {
  setMode(ctx.prefs?.cvTerm);
  const agents = ctx.state.agents.filter(a => ctx.inRoom ? ctx.inRoom(a) : (!ctx.room || a.room === ctx.room));
  if (!agents.length) return ctx.project
    ? `<div class="cv-empty">Este projeto ainda não tem agentes ligados. Traga uma equipe ou um agente pelo menu “Trazer”, ou <button type="button" class="link" data-act="project-team-suggest" data-id="${esc(ctx.project)}">peça ao Assistente para sugerir uma equipe</button> a partir da leitura da pasta.</div>`
    : `<div class="cv-empty">Crie agentes em “Agentes e ferramentas” para vê-los aqui.</div>`;
  const pos = layout(agents, loadPos(ctx.project)), ids = new Set(agents.map(a => a.id)), cam = loadCam(ctx.project);
  const links = (ctx.state.links || []).filter(l => l.projectId === ctx.project && ids.has(l.from) && ids.has(l.to));
  const W = Math.max(...Object.values(pos).map(p => p.x)) + NW + PAD, H = Math.max(...Object.values(pos).map(p => p.y)) + NH + PAD;
  const runs = ctx.state.runs || [], byId = Object.fromEntries(runs.map(r => [r.id, r]));
  // A linha "corre" quando o destino está de fato recebendo trabalho do remetente: tarefa ativa do destino que veio de uma tarefa do remetente (ligação ou fluxo de equipe).
  const live = l => runs.some(r => r.agent.id === l.to && ['running', 'queued'].includes(r.status) && ((r.linkFrom && byId[r.linkFrom]?.agent.id === l.from) || (r.dependsOn || []).some(id => byId[id]?.agent.id === l.from)));
  const teamEdges = [];
  const teams = ctx.project && ctx.projectTeamIds ? (ctx.state.teams || []).filter(t => ctx.projectTeamIds().has(t.id)) : (ctx.state.teams || []);
  for (const t of teams) {
    const dev = t.members.find(m => m.role === 'desenvolvedor'), rev = t.members.find(m => m.role === 'revisor');
    if (dev && rev && ids.has(dev.agentId) && ids.has(rev.agentId) && !links.some(l => l.from === dev.agentId && l.to === rev.agentId)) teamEdges.push({ from: dev.agentId, to: rev.agentId, name: t.name });
  }
  const edge = (e, cls, extra = '') => { const a = port(pos[e.from], 'out'), b = port(pos[e.to], 'in'), d = curve(a, b), mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; return `<g class="cv-edge ${cls}" data-from="${esc(e.from)}" data-to="${esc(e.to)}" ${extra}><path class="line" d="${d}" marker-end="url(#cv-arrow)"/><path class="hit" d="${d}"/>${cls.includes('live') ? `<circle class="cv-pulse" r="4.5"><animateMotion dur="1.4s" repeatCount="indefinite" path="${d}"/></circle><circle class="cv-pulse" r="4.5"><animateMotion dur="1.4s" begin="0.7s" repeatCount="indefinite" path="${d}"/></circle>` : ''}${e.id ? `<g class="cv-x" data-unlink="${esc(e.id)}" transform="translate(${mid.x},${mid.y})" role="button" aria-label="Remover ligação"><circle r="10"/><path d="M-4,-4 L4,4 M4,-4 L-4,4"/><title>Remover ligação (repasses: até ${e.maxHops})</title></g>` : `<title>Fluxo da equipe ${esc(e.name || '')}</title>`}</g>`; };
  const opts = agents.map(a => `<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('');
  const chips = links.map(l => { const f = agents.find(a => a.id === l.from), t = agents.find(a => a.id === l.to); return `<span class="chip">${esc(f.name)} → ${esc(t.name)} <small>(até ${l.maxHops}${l.when === 'approved' ? ', só se aprovado' : l.when === 'rejected' ? ', só se reprovado' : ''})</small><button type="button" class="chip-x" data-unlink="${esc(l.id)}" aria-label="Remover ligação ${esc(f.name)} para ${esc(t.name)}">${icon('x', 14)}</button></span>`; }).join('');
  return `<div class="cv-wrap${ctx.ui?.cvBig ? ' cv-big' : ''}"><button type="button" class="btn ghost sm cv-expand" data-act="cv-expand" aria-pressed="${ctx.ui?.cvBig ? 'true' : 'false'}" title="${ctx.ui?.cvBig ? 'Voltar ao tamanho normal (Esc)' : 'Expandir o canvas para ver todos os agentes'}">${ctx.ui?.cvBig ? 'Recolher' : 'Expandir'}</button><button type="button" class="btn ghost sm cv-expand cv-termbtn" data-act="cv-term" aria-pressed="${termMode}" title="Mostra em cada agente a saída ao vivo da tarefa dele">${termMode ? 'Esconder terminais' : 'Mostrar terminais'}</button><div class="cv" id="cv" style="--w:${W}px;--h:${H}px"><div class="cv-zoom" role="group" aria-label="Zoom do Canvas"><button type="button" class="iconbtn" data-cv-zoom="in" aria-label="Aproximar" title="Aproximar (rodinha do mouse para cima)">${icon('plus', 16)}</button><span class="cv-zoom-v" aria-live="polite">${Math.round(cam.z * 100)}%</span><button type="button" class="iconbtn" data-cv-zoom="out" aria-label="Afastar" title="Afastar (rodinha do mouse para baixo)"><svg class="ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/></svg></button><button type="button" class="btn ghost sm" data-cv-zoom="fit" title="Enquadrar todos os agentes">Ver tudo</button></div><div class="cv-world" style="width:${W}px;height:${H}px;transform:translate(${cam.x}px,${cam.y}px) scale(${cam.z})">
    <svg class="cv-edges" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="false"><defs><marker id="cv-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
      ${teamEdges.map(e => edge(e, 'team' + (live(e) ? ' live' : ''))).join('')}${links.map(l => edge(l, 'link' + (l.enabled === false ? ' off' : '') + (live(l) ? ' live' : ''))).join('')}<path id="cv-temp" class="cv-temp" d="" hidden/></svg>
    ${agents.map(a => nodeHtml(ctx, a, pos[a.id])).join('')}</div></div>
    <form id="link-form" class="cv-form"><span>Ligar</span><label class="sr-only" for="lf-from">De</label><select id="lf-from" name="from">${opts}</select><span aria-hidden="true">→</span><label class="sr-only" for="lf-to">Para</label><select id="lf-to" name="to">${opts}</select><label class="sr-only" for="lf-hops">Repasses máximos</label><span class="small muted">até</span><input id="lf-hops" name="maxHops" type="number" min="1" max="6" value="3" style="width:64px"><span class="small muted">repasses</span><label class="sr-only" for="lf-when">Quando seguir</label><select id="lf-when" name="when" title="Quando o primeiro termina, o segundo segue: sempre, só se o resultado for APROVADO ou só se for REPROVADO"><option value="always">sempre</option><option value="approved">só se aprovado</option><option value="rejected">só se reprovado</option></select><label class="check small" title="Cria também a ligação de volta: o segundo responde ao primeiro, até o limite de repasses ou até alguém escrever SEM PENDÊNCIAS"><input type="checkbox" name="both" value="1"> ida e volta</label><button class="btn sm">${icon('plus', 16)} Criar ligação</button></form>
    <p class="cv-legend small" aria-label="Legenda"><span><i class="lg run"></i> trabalhando</span><span><i class="lg wait"></i> esperando a vez</span><span><i class="lg idle"></i> parado (zZ)</span><span><i class="lg bad"></i> falhou</span><span><i class="lg flow"></i> linha verde = trabalho passando de um para outro</span></p>
    ${chips ? `<div class="chips cv-chips">${chips}</div>` : ''}
    <p class="muted small cv-help">Use a rodinha do mouse (ou + e −) para aproximar e afastar, arraste o fundo para passear pelo fluxo e “Ver tudo” para enquadrar todos os agentes. Arraste o ponto da direita de um agente até outro para ligá-los (ou use o formulário acima). Quando o primeiro termina, o segundo recebe o resumo e os arquivos e continua. Com ligações nos dois sentidos, eles se respondem até o limite de repasses ou até alguém escrever “SEM PENDÊNCIAS”. Vale para missões avulsas de um agente (não para equipes nem supervisor). Linhas tracejadas cinzas são o fluxo das equipes.</p></div>`;
}

export function bindCanvas(root, ctx, { onOpen, onLink, onUnlink, onEnd }) {
  setMode(ctx.prefs?.cvTerm);
  const cv = root.querySelector('#cv'); if (!cv) return;
  const agents = ctx.state.agents.filter(a => ctx.inRoom ? ctx.inRoom(a) : (!ctx.room || a.room === ctx.room)), pos = layout(agents, loadPos(ctx.project));
  const svg = cv.querySelector('.cv-edges'), temp = cv.querySelector('#cv-temp');
  const redraw = () => svg.querySelectorAll('.cv-edge').forEach(g => {
    const a = port(pos[g.dataset.from], 'out'), b = port(pos[g.dataset.to], 'in'), d = curve(a, b);
    g.querySelectorAll('path.line,path.hit').forEach(p => p.setAttribute('d', d)); const x = g.querySelector('.cv-x'); if (x) x.setAttribute('transform', `translate(${(a.x + b.x) / 2},${(a.y + b.y) / 2})`);
  });
  const world = cv.querySelector('.cv-world'), zv = cv.querySelector('.cv-zoom-v');
  let cam = loadCam(ctx.project);
  const apply = (save = true) => { world.style.transform = `translate(${cam.x}px,${cam.y}px) scale(${cam.z})`; if (zv) zv.textContent = `${Math.round(cam.z * 100)}%`; if (save) saveCam(ctx.project, cam); };
  const toWorld = e => { const r = world.getBoundingClientRect(); return { x: (e.clientX - r.left) / cam.z, y: (e.clientY - r.top) / cam.z }; };
  const center = () => { const r = cv.getBoundingClientRect(); return [r.width / 2, r.height / 2]; };
  const fit = () => {   // enquadra os cartões onde quer que estejam (inclusive arrastados para a esquerda ou para cima)
    const r = cv.getBoundingClientRect(), ps = Object.values(pos); if (!ps.length) return;
    const x0 = Math.min(...ps.map(p => p.x)) - PAD, y0 = Math.min(...ps.map(p => p.y)) - PAD, x1 = Math.max(...ps.map(p => p.x)) + NW + PAD, y1 = Math.max(...ps.map(p => p.y)) + NH + PAD;
    const f = fitCam(x1 - x0, y1 - y0, r.width, r.height); cam = { z: f.z, x: Math.round(f.x - x0 * f.z), y: Math.round(f.y - y0 * f.z) }; apply();
  };
  // Rodinha do mouse: zoom no ponto do cursor (dentro do Canvas a página não rola).
  cv.addEventListener('wheel', e => {
    const t = e.target.closest?.('.cv-term'); if (t && t.scrollHeight > t.clientHeight && !e.ctrlKey) return;   // sobre um terminal com texto para rolar, a rodinha rola o terminal (Ctrl + rodinha ainda dá zoom)
    e.preventDefault(); const r = cv.getBoundingClientRect(); cam = zoomAt(cam, Math.exp(-Math.max(-60, Math.min(60, e.deltaY)) * 0.0035), e.clientX - r.left, e.clientY - r.top); apply(); }, { passive: false });
  cv.querySelector('.cv-zoom')?.addEventListener('click', e => { const b = e.target.closest('[data-cv-zoom]'); if (!b) return; const k = b.dataset.cvZoom; if (k === 'fit') return fit(); cam = zoomAt(cam, k === 'in' ? 1.2 : 1 / 1.2, ...center()); apply(); });
  cv.addEventListener('keydown', e => { if (e.target.closest('input,select,textarea')) return; if (e.key === '+' || e.key === '=') { cam = zoomAt(cam, 1.2, ...center()); apply(); } else if (e.key === '-') { cam = zoomAt(cam, 1 / 1.2, ...center()); apply(); } else if (e.key === '0') fit(); });

  cv.addEventListener('pointerdown', e => {
    const unlink = e.target.closest('[data-unlink]'); if (unlink) return;
    if (e.target.closest('.cv-zoom, .cv-msg, .cv-term')) return;   // controles de zoom, o campo de mensagem e o terminal (rolagem e seleção de texto) não arrastam nada
    if (!e.target.closest('.cv-node') && !e.target.closest('.cv-edge') && (e.button === 0 || e.button === 1)) {   // fundo: arrasta a câmera (mãozinha)
      e.preventDefault(); const start = { x: e.clientX, y: e.clientY }, orig = { ...cam }; cv.classList.add('panning'); dragging = true;
      const move = ev => { cam = { ...orig, x: Math.round(orig.x + ev.clientX - start.x), y: Math.round(orig.y + ev.clientY - start.y) }; apply(false); };
      const up = () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', up); cv.classList.remove('panning'); dragging = false; saveCam(ctx.project, cam); onEnd?.(); };
      document.addEventListener('pointermove', move); document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up); return;
    }
    const out = e.target.closest('.cv-port.out');
    if (out) {   // desenha a ligação
      e.preventDefault(); dragging = true; const from = out.dataset.out, start = port(pos[from], 'out'); temp.hidden = false;
      const move = ev => { const w = toWorld(ev); temp.setAttribute('d', curve(start, w)); cv.querySelectorAll('.cv-node').forEach(n => n.classList.toggle('target', n.dataset.agent !== from && n.contains(document.elementFromPoint(ev.clientX, ev.clientY)))); };
      const up = ev => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', up); temp.hidden = true; dragging = false; cv.querySelectorAll('.cv-node.target').forEach(n => n.classList.remove('target')); const to = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.cv-node')?.dataset.agent; if (to && to !== from) onLink(from, to); onEnd?.(); };
      document.addEventListener('pointermove', move); document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up); return;
    }
    const node = e.target.closest('.cv-node'); if (!node) return;
    const id = node.dataset.agent, start = { x: e.clientX, y: e.clientY }, orig = { ...pos[id] }; let moved = false;
    dragging = true;   // desde o toque: uma atualização da tela não troca o cartão no meio do gesto (era a falha intermitente no celular)
    const move = ev => {
      const dx = (ev.clientX - start.x) / cam.z, dy = (ev.clientY - start.y) / cam.z;
      if (!moved && Math.hypot(dx, dy) < 5) return; moved = true; dragging = true; node.classList.add('drag');
      pos[id] = { x: Math.max(-4000, Math.min(8000, Math.round(orig.x + dx))), y: Math.max(-4000, Math.min(8000, Math.round(orig.y + dy))) };   // espaço livre em todas as direções (a câmera acompanha)
      node.style.left = pos[id].x + 'px'; node.style.top = pos[id].y + 'px'; redraw();
    };
    const up = () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', up); node.classList.remove('drag'); dragging = false; if (moved) savePos(ctx.project, pos); else onOpen(id); onEnd?.(); };
    document.addEventListener('pointermove', move); document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
  });
  cv.addEventListener('focusout', e => { if (e.target.closest?.('.cv-msg')) setTimeout(() => { if (!canvasBusy()) onEnd?.(); }, 0); });   // saiu do campo: aplica a atualização que ficou esperando
  cv.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('.cv-node')) { e.preventDefault(); onOpen(e.target.dataset.agent); } });
  root.addEventListener('click', e => { const u = e.target.closest('[data-unlink]'); if (u) onUnlink(u.dataset.unlink); });
}
