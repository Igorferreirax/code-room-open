// Workspace: como a pessoa quer trabalhar em cada projeto. O projeto guarda pasta, agentes e tarefas; o Workspace guarda
// quais painéis ficam abertos, qual ocupa o centro e quanto espaço cada um recebe (salvo por projeto, neste navegador).
// Uma camada só distribui a largura entre a página, o Navegador e o Nico (antes eram três camadas fixas que se cobriam).
// Redimensionar muda só o layout: não recria a sessão do terminal nem recarrega a prévia.
export const PRESETS = {
  padrao: { label: 'Padrão', nico: 'auto', focus: false, center: 'page', browser: null, terminal: null },
  video: { label: 'Vídeo', nico: 'dock', focus: true, center: 'browser', browser: true, terminal: false },
  codigo: { label: 'Código', nico: 'dock', focus: true, center: 'page', browser: null, terminal: true },
};
export const DEFAULTS = { preset: 'padrao', nico: 'auto', focus: false, center: 'page', nicoW: 380, bdW: 640 };
export const LIMITS = { nicoMin: 320, nicoMax: 640, bdMin: 360, mainMin: 480, mainMinFocus: 400, wide: 1100 };

// Larguras efetivas para a tela atual: respeita o mínimo da página e, se não couber, a prévia vai para o centro.
export function fit(st, { width, rail = 68, browserOpen = false, chatOpen = false }) {
  // nico: 'dock' (sempre encaixado), 'float' (sempre flutuante) ou 'auto' (encaixa quando o Navegador está aberto, para não cobri-lo).
  const avail = Math.max(0, width - rail), dock = (st.nico === 'dock' || (st.nico === 'auto' && browserOpen)) && chatOpen && width >= LIMITS.wide;
  const nico = dock ? Math.round(Math.min(Math.max(st.nicoW || DEFAULTS.nicoW, LIMITS.nicoMin), Math.min(LIMITS.nicoMax, avail * 0.45))) : 0;
  let center = browserOpen && st.center === 'browser', bd = 0;
  if (browserOpen && !center && width >= LIMITS.wide) {
    const room = avail - nico - (st.focus ? LIMITS.mainMinFocus : LIMITS.mainMin);
    if (room < LIMITS.bdMin) center = true;   // não cabe ao lado: a prévia ocupa o centro (a página volta com “Mostrar a página”)
    else bd = Math.round(Math.min(Math.max(st.bdW || DEFAULTS.bdW, LIMITS.bdMin), room));
  }
  if (center) bd = Math.max(0, avail - nico);
  const main = center ? 0 : avail - nico - bd;
  return { dock, nico, bd, center, main, narrow: main > 0 && main < 900, tight: main > 0 && main < 640 };
}

export function createWorkspace({ getProject, browser, terminal, onChange = () => {}, onFit = () => {} }) {
  const KEY = 'cr.ws';
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } };
  const write = all => { try { localStorage.setItem(KEY, JSON.stringify(all)); } catch {} };
  const pid = () => getProject() || 'geral';
  let st = { ...DEFAULTS, ...(read()[pid()] || {}) }, cur = null, peek = 'browser';   // peek: com a prévia no centro, qual aba está à vista (Página ou Prévia)
  const shell = () => document.getElementById('shell');
  const save = (patch, { custom = true } = {}) => { st = { ...st, ...patch, ...(custom && st.preset !== 'personalizado' && Object.keys(patch).some(k => k !== 'preset') ? { preset: 'personalizado' } : {}) }; const all = read(); all[pid()] = st; write(all); apply(); onChange(st); };

  function apply() {
    const sh = shell(); if (!sh) return;
    const chat = document.getElementById('chat'), dockEl = document.getElementById('browser-dock');
    const browserOpen = !!(dockEl && !dockEl.hidden), chatOpen = !!(chat && !chat.hidden);
    cur = fit(st, { width: window.innerWidth, rail: sh.querySelector('.rail')?.offsetWidth || 68, browserOpen, chatOpen });
    sh.classList.add('ws');
    sh.classList.toggle('ws-nico-dock', cur.dock);
    sh.classList.toggle('ws-focus', !!st.focus);
    sh.classList.toggle('ws-bd-center', browserOpen && cur.center);
    sh.classList.toggle('ws-peek-page', browserOpen && cur.center && peek === 'page');
    centerTabs(browserOpen && cur.center);
    sh.classList.toggle('main-narrow', cur.narrow);
    sh.classList.toggle('main-tight', cur.tight);
    sh.style.setProperty('--nico-r', cur.nico + 'px');
    sh.style.setProperty('--bd-w', (cur.center ? cur.bd : cur.bd || Math.min(st.bdW, 700)) + 'px');
    sh.style.setProperty('--side-r', (cur.nico + (browserOpen ? cur.bd : 0)) + 'px');
    document.documentElement.style.setProperty('--side-r', (cur.nico + (browserOpen && !cur.center ? cur.bd : 0)) + 'px');   // o terminal fica fora do #shell
    grips(); onFit(cur);
  }

  // Prévia no centro: abas Página | Prévia (a prévia fica escondida, não fechada: não recarrega).
  function centerTabs(on) {
    const sh = shell(); let el = document.getElementById('ws-tabs');
    if (!on) { el?.remove(); return; }
    if (!el) { el = document.createElement('div'); el.id = 'ws-tabs'; el.className = 'ws-tabs'; el.setAttribute('role', 'tablist'); el.setAttribute('aria-label', 'O que fica no centro'); sh.appendChild(el);
      el.addEventListener('click', e => { const b = e.target.closest('[data-peek]'); if (!b) return; peek = b.dataset.peek; apply(); el.querySelector(`[data-peek="${peek}"]`)?.focus(); }); }
    const html = ['page', 'browser'].map(k => `<button type="button" role="tab" data-peek="${k}" aria-selected="${peek === k}">${k === 'page' ? 'Página' : 'Prévia'}</button>`).join('');
    if (el.innerHTML !== html) el.innerHTML = html;
  }
  // Divisórias: arrastar (mouse ou toque) ou setas do teclado. Ao soltar, avisa o terminal e a prévia para se ajustarem.
  function grips() {
    const chat = document.getElementById('chat'), bd = document.getElementById('browser-dock');
    const add = (host, kind, label) => {
      if (!host) return; let g = host.querySelector(':scope > .ws-grip');
      if (!g) { g = document.createElement('div'); g.className = 'ws-grip'; g.tabIndex = 0; g.setAttribute('role', 'separator'); g.setAttribute('aria-orientation', 'vertical'); g.dataset.kind = kind; g.setAttribute('aria-label', label); g.title = label + ' (arraste ou use as setas)'; host.prepend(g); }
      g.setAttribute('aria-valuenow', String(kind === 'nico' ? cur.nico : cur.bd));
    };
    if (cur.dock) add(chat, 'nico', 'Largura do Nico'); else chat?.querySelector(':scope > .ws-grip')?.remove();
    if (bd && !bd.hidden && !cur.center) add(bd, 'bd', 'Largura do Navegador'); else bd?.querySelector(':scope > .ws-grip')?.remove();
  }
  const resizeTo = (kind, px) => kind === 'nico' ? save({ nicoW: Math.round(px) }) : save({ bdW: Math.round(px) });
  document.addEventListener('pointerdown', e => {
    const g = e.target.closest?.('.ws-grip'); if (!g) return;
    e.preventDefault(); g.setPointerCapture?.(e.pointerId); document.body.classList.add('ws-dragging');
    const kind = g.dataset.kind, x0 = e.clientX, w0 = kind === 'nico' ? cur.nico : cur.bd;
    const move = ev => { const w = w0 + (x0 - ev.clientX); shell()?.style.setProperty(kind === 'nico' ? '--nico-r' : '--bd-w', Math.max(kind === 'nico' ? LIMITS.nicoMin : LIMITS.bdMin, w) + 'px'); if (kind === 'nico') shell()?.style.setProperty('--side-r', (Math.max(LIMITS.nicoMin, w) + (cur.bd || 0)) + 'px'); };
    const up = ev => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); document.body.classList.remove('ws-dragging'); resizeTo(kind, w0 + (x0 - ev.clientX)); window.dispatchEvent(new Event('resize')); };
    document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
  });
  document.addEventListener('keydown', e => {
    const g = e.target.closest?.('.ws-grip'); if (!g || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    e.preventDefault(); const kind = g.dataset.kind, step = e.shiftKey ? 80 : 24, w = (kind === 'nico' ? cur.nico : cur.bd) + (e.key === 'ArrowLeft' ? step : -step);
    resizeTo(kind, w); window.dispatchEvent(new Event('resize')); requestAnimationFrame(() => document.querySelector(`.ws-grip[data-kind="${kind}"]`)?.focus());
  });
  window.addEventListener('resize', () => { if (!document.body.classList.contains('ws-dragging')) apply(); });
  // Abrir/fechar o chat ou o navegador muda a distribuição: observa os dois.
  const mo = new MutationObserver(() => apply());
  const watch = () => { for (const id of ['chat', 'browser-dock']) { const el = document.getElementById(id); if (el && !el.dataset.wsWatch) { el.dataset.wsWatch = '1'; mo.observe(el, { attributes: true, attributeFilter: ['hidden'] }); } } };
  setInterval(watch, 1500); watch();

  return {
    get state() { return { ...st }; }, get fit() { return cur; },
    apply,
    projectChanged() { st = { ...DEFAULTS, ...(read()[pid()] || {}) }; apply(); onChange(st); },
    async preset(name) {
      const p = PRESETS[name]; if (!p) return;
      peek = 'browser'; save({ preset: name, nico: p.nico, focus: p.focus, center: p.center }, { custom: false });
      if (p.browser != null) await browser?.(p.browser);
      if (p.terminal != null) await terminal?.(p.terminal);
      if (p.nico === 'dock') document.dispatchEvent(new CustomEvent('ws:open-nico'));
      apply();
    },
    toggleNicoDock() { save({ nico: cur?.dock ? 'float' : 'dock' }); },
    toggleFocus() { save({ focus: !st.focus }); },
    showPage() { peek = 'page'; apply(); },
    showPreview() { peek = 'browser'; apply(); },
    centerBrowser() { save({ center: 'browser' }); },
    reset() { const all = read(); delete all[pid()]; write(all); st = { ...DEFAULTS }; apply(); onChange(st); },
  };
}
