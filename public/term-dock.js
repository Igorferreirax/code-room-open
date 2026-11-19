// Painel de terminais DENTRO do Code Room (como na Alethe e no VS Code): abas com PowerShell puro ou Claude, Codex e
// Gemini rodando de verdade (pseudo-console do Windows no servidor + xterm.js aqui). Fica embaixo, dá para
// redimensionar arrastando a borda, e as abas continuam vivas ao esconder o painel.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CLIS = [['shell', 'PowerShell'], ['claude', 'Claude Code'], ['codex', 'Codex'], ['agy', 'Gemini']];

let loading = null;
function loadXterm() {
  if (window.Terminal && window.FitAddon) return Promise.resolve();
  if (loading) return loading;
  const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '/vendor/xterm/xterm.css'; document.head.appendChild(css);
  const js = src => new Promise((ok, fail) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => fail(new Error('Não consegui carregar o terminal.')); document.head.appendChild(s); });
  loading = js('/vendor/xterm/xterm.js').then(() => js('/vendor/xterm/addon-fit.js'));
  return loading;
}

export function createTermDock({ api, getKey, getCtx, notify = () => {} }) {
  const tabs = new Map();   // id -> { id, title, term, fit, el, alive, ro }
  let active = null, open = false, height = 320, menu = false, split = false, second = null, pane = 0;   // split: dois terminais lado a lado (active à esquerda, second à direita)
  try { height = Math.max(160, Math.min(900, Number(localStorage.getItem('cr.term.h')) || 320)); } catch {}
  const host = document.createElement('section'); host.id = 'term-dock'; host.className = 'term-dock'; host.hidden = true; host.setAttribute('aria-label', 'Terminais');
  host.innerHTML = '<div class="td-grip" title="Arraste para mudar a altura"></div><div class="td-bar"><div class="td-tabs" role="tablist"></div><div class="td-actions"></div></div><div class="td-body"></div>';
  document.body.appendChild(host);
  const bar = host.querySelector('.td-tabs'), actionsEl = host.querySelector('.td-actions'), body = host.querySelector('.td-body');

  const apply = () => { host.hidden = !open; host.style.height = `${height}px`; document.body.classList.toggle('term-open', open); document.documentElement.style.setProperty('--term-h', open ? `${height}px` : '0px'); };
  const drawBar = () => {
    const ctx = getCtx(), have = new Set((ctx.state?.connectors || []).filter(c => c.available).map(c => c.id)), pr = (ctx.state?.projects || []).find(p => p.id === ctx.project), fin = pr?.area === 'Financeiro';
    bar.innerHTML = [...tabs.values()].map(t => `<div class="td-tab${t.id === active || (split && t.id === second) ? ' on' : ''}${t.alive ? '' : ' off'}" role="tab" aria-selected="${t.id === active}"><button type="button" data-td="pick" data-id="${t.id}">${esc(t.title)}</button><button type="button" class="td-x" data-td="close" data-id="${t.id}" aria-label="Fechar ${esc(t.title)}">×</button></div>`).join('');
    actionsEl.innerHTML = `<button type="button" class="btn ghost sm td-split" data-td="split" aria-pressed="${split}" title="${split ? 'Voltar a um terminal só' : 'Dividir: dois terminais lado a lado (ex.: servidor à esquerda, IA à direita)'}">◫ ${split ? 'Juntar' : 'Dividir'}</button><div class="td-new"><button type="button" class="btn ghost sm" data-td="menu" aria-expanded="${menu}">+ Novo terminal</button>${menu ? `<div class="td-menu" role="menu"><p class="small muted">Na pasta de ${esc(pr ? pr.name : 'sua pasta pessoal')}</p>${CLIS.filter(([id]) => id === 'shell' || (have.has(id) && !fin)).map(([id, l]) => `<button type="button" class="term-item" data-td="new" data-id="${id}">${esc(l)}</button>`).join('')}${fin ? '<p class="small muted">Projeto Financeiro: só o shell puro.</p>' : '<label class="term-free small"><input type="checkbox" id="td-free"> Irrestrito: a IA executa tudo sem pedir confirmação</label>'}<button type="button" class="term-item muted" data-td="external">Abrir fora, no Windows Terminal</button></div>` : ''}</div><button type="button" class="iconbtn sm" data-td="hide" aria-label="Esconder terminais" title="Esconder (as abas continuam rodando)">⌄</button>`;
  };
  const fitActive = () => { if (!open) return; for (const id of [active, split ? second : null]) { const t = tabs.get(id); if (t?.fit) try { t.fit.fit(); } catch {} } };
  const layout = () => { body.classList.toggle('split', split); for (const t of tabs.values()) { const l = t.id === active, r = split && t.id === second; t.el.hidden = !(l || r); t.el.classList.toggle('td-left', l && split); t.el.classList.toggle('td-right', r); t.el.classList.toggle('td-focus', split && ((pane === 0 && l) || (pane === 1 && r))); } };
  const show = id => {
    if (!tabs.has(active)) active = null;
    if (split && pane === 1 && active && id !== active) second = id; else { if (split && id === second) second = active; active = id; }
    if (split && (!second || second === active)) second = [...tabs.keys()].find(k => k !== active) || null;
    if (split && !second) split = false;
    layout(); drawBar(); setTimeout(() => { fitActive(); tabs.get(id)?.term?.focus(); }, 30);
  };
  async function toggleSplit() {
    if (split) { split = false; second = null; pane = 0; layout(); drawBar(); setTimeout(fitActive, 30); return; }
    split = true; pane = 1;
    const other = [...tabs.keys()].find(k => k !== active);
    if (other) { second = other; layout(); drawBar(); setTimeout(fitActive, 30); } else await create('shell');
  }

  async function attach(v) {
    await loadXterm();
    const el = document.createElement('div'); el.className = 'td-term'; body.appendChild(el);
    const term = new window.Terminal({ fontFamily: '"Cascadia Mono", "Cascadia Code", Consolas, monospace', fontSize: 13, cursorBlink: true, scrollback: 5000, allowProposedApi: false, theme: { background: '#0a1222', foreground: '#e8eefc', cursor: '#59e0ff', selectionBackground: '#2b5bb566' } });
    const fit = new window.FitAddon.FitAddon(); term.loadAddon(fit); term.open(el);
    const t = { id: v.id, title: v.title, term, fit, el, alive: v.alive !== false };
    tabs.set(v.id, t);
    // Teclas: junta o que foi digitado em lotes curtos (cada POST leva vários caracteres).
    let pending = '', timer = 0;
    term.onData(d => { pending += d; clearTimeout(timer); timer = setTimeout(() => { const data = pending; pending = ''; api(`term/${v.id}/input`, { data }).catch(e => notify(e.message, true)); }, 8); });
    let lastSize = '';
    term.onResize(({ cols, rows }) => { const k = `${cols}x${rows}`; if (k !== lastSize) { lastSize = k; api(`term/${v.id}/resize`, { cols, rows }).catch(() => {}); } });
    t.ro = new ResizeObserver(() => { if (t.id === active) fitActive(); }); t.ro.observe(el);
    // Saída: bytes brutos numa resposta contínua.
    (async () => {
      try {
        const r = await fetch(`/api/term/${v.id}/out`, { headers: { 'X-Code-Room-Key': getKey() } });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Terminal indisponível.');
        const reader = r.body.getReader();
        for (;;) { const { value, done } = await reader.read(); if (done) break; term.write(value); }
      } catch (e) { term.write(`\r\n\x1b[31m${e.message}\x1b[0m\r\n`); }
      t.alive = false; drawBar();
    })();
    show(v.id);
  }

  async function create(cli, { irrestrito = false } = {}) {
    open = true; menu = false; apply(); drawBar();
    try {
      await loadXterm();
      const ctx = getCtx(), cols = Math.max(40, Math.floor((body.clientWidth || 900) / 8)), rows = Math.max(8, Math.floor((height - 40) / 17));
      const v = await api('term', { projectId: ctx.project || null, cli, irrestrito, cols, rows });
      await attach(v);
    } catch (e) { notify(e.message, true); }
  }
  async function close(id) {
    const t = tabs.get(id); if (!t) return;
    try { await api(`term/${id}/close`, {}); } catch {}
    try { t.ro?.disconnect(); t.term.dispose(); } catch {} t.el.remove(); tabs.delete(id);
    if (second === id) { second = null; split = false; }
    if (active === id) { active = split && second ? second : [...tabs.keys()].at(-1) || null; if (active === second) { second = null; split = false; } }
    if (active) show(active); else { drawBar(); if (!tabs.size) { open = false; apply(); } }
  }
  // Terminais abertos fora desta tela (pelo Nico, por exemplo): aparecem aqui sozinhos.
  async function sync({ reveal = false } = {}) {
    try {
      const { items } = await api('term');
      let added = null;
      for (const v of items) if (!tabs.has(v.id) && v.alive) { await attach(v); added = v.id; }
      if (added && reveal) { open = true; apply(); show(added); }
    } catch {}
  }

  host.addEventListener('click', async e => {
    const b = e.target.closest('[data-td]'); if (!b) return;
    const act = b.dataset.td;
    if (act === 'pick') show(b.dataset.id);
    else if (act === 'close') close(b.dataset.id);
    else if (act === 'hide') { open = false; menu = false; apply(); }
    else if (act === 'split') toggleSplit();
    else if (act === 'menu') { menu = !menu; drawBar(); }
    else if (act === 'new') {
      const free = !!host.querySelector('#td-free')?.checked;
      if (free && b.dataset.id !== 'shell' && !confirm('Modo irrestrito: a IA vai rodar comandos, apagar e alterar arquivos SEM pedir confirmação neste terminal. Use só em projetos de confiança. Abrir assim?')) return;
      create(b.dataset.id, { irrestrito: free });
    } else if (act === 'external') {
      menu = false; drawBar();
      try { const r = await api('terminal', { projectId: getCtx().project || null, cli: 'shell', irrestrito: false }); notify(r.result); } catch (err) { notify(err.message, true); }
    }
  });
  body.addEventListener('pointerdown', e => { if (!split) return; const el = e.target.closest('.td-term'); if (!el) return; pane = el.classList.contains('td-right') ? 1 : 0; layout(); }, true);
  // Arrastar a borda de cima muda a altura.
  host.querySelector('.td-grip').addEventListener('pointerdown', e => {
    e.preventDefault(); const y0 = e.clientY, h0 = height;
    const move = ev => { height = Math.max(160, Math.min(window.innerHeight - 120, h0 + (y0 - ev.clientY))); apply(); fitActive(); };
    const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); try { localStorage.setItem('cr.term.h', String(height)); } catch {} };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  });
  addEventListener('resize', () => fitActive());

  return {
    toggle() { open = !open; apply(); drawBar(); if (open && !tabs.size) create('shell'); else if (open) setTimeout(fitActive, 30); },
    openNew: create, sync, isOpen: () => open, count: () => tabs.size, split: toggleSplit, isSplit: () => split,
  };
}
