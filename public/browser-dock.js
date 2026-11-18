// Navegadores Internos Multi-Abas do Code Room:
// Visualize HyperFrames, sites, landing pages e servidores locais (Vite, Next, Remotion) em abas vivas sem sair do Code Room,
// lado a lado com o Nico/agentes (Split-View) ou dentro da Sala, com recarregamento automático ao salvar entregas.
import { icon } from './icons.js';

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MAX_TABS = 6;

// Quando o Code Room está aberto pelo celular (ex.: IP do Tailscale 100.x.x.x), converte links 127.0.0.1/localhost para o IP atual.
export function adaptPreviewUrl(rawUrl, currentHost = location.hostname) {
  const s = String(rawUrl ?? '').trim();
  if (!s) return '';
  if (s.startsWith('/')) return s;
  const withProto = /^[a-z]+:\/\//i.test(s) ? s : (/^(localhost|127\.0\.0\.1|\d+\.\d+\.\d+\.\d+)(:\d+)?(\/|$)/i.test(s) ? 'http://' + s : 'https://' + s);
  try {
    const u = new URL(withProto);
    if (!['http:', 'https:'].includes(u.protocol)) return '';
    if ((u.hostname === '127.0.0.1' || u.hostname === 'localhost') && currentHost && currentHost !== '127.0.0.1' && currentHost !== 'localhost') {
      u.hostname = currentHost;
    }
    return u.toString();
  } catch {
    return '';
  }
}

export function createBrowserManager({ api, getCtx, notify, onStateChange = () => {}, onTweak = null }) {
  let open = false, expanded = false, tweakOpen = false;
  let tabs = [{ id: 'b1', title: 'Nova guia', url: '', viewport: 'desktop', autoReload: true, reloadTick: 0 }];
  let activeId = 'b1', seq = 2;
  let projectPreview = null, localPorts = [], loadingInfo = false, lastProjectLoaded = null;

  const activeTab = () => tabs.find(t => t.id === activeId) || tabs[0];

  async function refreshSources(force = false) {
    const ctx = getCtx?.() || {}, pid = ctx.project || '';
    if (loadingInfo && !force) return;
    loadingInfo = true;
    try {
      const [portsRes, projRes] = await Promise.all([
        api('browser/ports').catch(() => ({ ports: [] })),
        pid ? api(`projects/${encodeURIComponent(pid)}/preview-info`).catch(() => null) : Promise.resolve(null),
      ]);
      localPorts = portsRes?.ports || [];
      projectPreview = projRes;
      lastProjectLoaded = pid;
    } finally {
      loadingInfo = false;
      mountAll();
    }
  }

  async function openUrl(rawUrl, { title = '', newTab = false, viewport = null, openDock = true } = {}) {
    let url = adaptPreviewUrl(rawUrl);
    if (!url) { notify('Endereço inválido. Use http://localhost:PORTA, https://… ou uma página do projeto.', true); return; }
    // Se for porta local (localhost/127.0.0.1/IP local), usa o proxy local seguro /lp/:porta/:token/ para evitar X-Frame-Options: deny e funcionar no celular!
    if (!url.startsWith('/')) {
      try {
        const u = new URL(url);
        const portNum = Number(u.port);
        if (portNum >= 1024 && portNum !== Number(location.port || 4780) && (u.hostname === '127.0.0.1' || u.hostname === 'localhost' || u.hostname === location.hostname)) {
          const hit = localPorts.find(x => x.port === portNum && x.proxyUrl);
          const base = hit ? hit.proxyUrl.replace(/\/$/, '') : (await api(`browser/proxy-token?port=${portNum}`).catch(() => null))?.proxyUrl?.replace(/\/$/, '');
          if (base) url = `${base}${u.pathname || '/'}${u.search || ''}${u.hash || ''}`;
        }
      } catch {}
    }
    if (openDock) open = true;
    let t = activeTab();
    if (newTab && tabs.length < MAX_TABS && t?.url) {
      t = { id: 'b' + (seq++), title: title || labelFromUrl(url), url, viewport: viewport || 'desktop', autoReload: true, reloadTick: 0 };
      tabs.push(t);
      activeId = t.id;
    } else {
      t.url = url;
      t.title = title || labelFromUrl(url);
      if (viewport) t.viewport = viewport;
    }
    onStateChange();
    mountAll();
  }

  function labelFromUrl(url) {
    if (url.startsWith('/live/')) {
      const name = decodeURIComponent(url.split('/').slice(4).join('/')) || 'index.html';
      return name.length > 24 ? '…' + name.slice(-22) : name;
    }
    if (url.startsWith('/lp/')) {
      const parts = url.split('/');
      const rest = parts.slice(4).join('/');
      return `:${parts[2]}${rest ? '/' + rest : ''}`.slice(0, 26);
    }
    try { const u = new URL(url); return (u.host + (u.pathname !== '/' ? u.pathname : '')).slice(0, 26); } catch { return 'Navegador'; }
  }

  function addTab() {
    if (tabs.length >= MAX_TABS) { notify(`Limite de ${MAX_TABS} abas abertas no navegador interno.`); return; }
    const id = 'b' + (seq++);
    tabs.push({ id, title: 'Nova guia', url: '', viewport: 'desktop', autoReload: true, reloadTick: 0 });
    activeId = id;
    void refreshSources(true);
    mountAll();
  }

  function closeTab(id) {
    if (tabs.length <= 1) {
      tabs[0] = { ...tabs[0], title: 'Nova guia', url: '' };
      mountAll();
      return;
    }
    const idx = tabs.findIndex(t => t.id === id);
    tabs = tabs.filter(t => t.id !== id);
    if (activeId === id) activeId = tabs[Math.max(0, idx - 1)].id;
    mountAll();
  }

  function reloadTab(id = activeId) {
    const t = tabs.find(x => x.id === id); if (!t || !t.url) return;
    t.reloadTick = (t.reloadTick || 0) + 1;
    document.querySelectorAll(`iframe[data-btab="${t.id}"]`).forEach(ifr => {
      const sep = t.url.includes('?') ? '&' : '?';
      ifr.src = `${t.url}${sep}_cr=${Date.now()}`;
    });
  }

  function notifyProjectUpdated(projectId) {
    for (const t of tabs) {
      if (!t.autoReload || !t.url) continue;
      if ((projectId && t.url.startsWith(`/live/${projectId}/`)) || t.url.startsWith('/lp/') || /^https?:\/\/(127\.0\.0\.1|localhost|100\.|192\.168\.)/i.test(t.url)) {
        reloadTab(t.id);
      }
    }
  }

  function toggleDock(forceVal) {
    open = typeof forceVal === 'boolean' ? forceVal : !open;
    if (open) void refreshSources(true);
    onStateChange();
    mountAll();
  }

  function emptyTabHtml() {
    const pages = projectPreview?.pages || [], tokenUrl = p => projectPreview?.baseUrl ? `${projectPreview.baseUrl}/${p.path.split('/').map(encodeURIComponent).join('/')}` : '';
    const ctx = getCtx?.() || {}, pj = (ctx.state?.projects || []).find(p => p.id === ctx.project);
    return `<div class="bd-start">
      <div class="bd-start-h">
        <b>Navegador interno · Preview ao vivo</b>
        <p class="small muted">Visualize composições HyperFrames, landing pages, apps locais (Vite, Next, Remotion) ou páginas externas lado a lado enquanto os agentes editam.</p>
      </div>
      ${pj ? `<div class="bd-sec">
        <div class="bd-sec-h"><b class="small">Projeto em foco: ${esc(pj.name)}</b><button type="button" class="btn ghost sm" data-bd="refresh-sources">${icon('refresh', 14)} Atualizar lista</button></div>
        ${projectPreview?.financeiro ? '<p class="small muted">Projetos da área Financeiro não abrem no navegador por segurança.</p>'
          : pages.length ? `<div class="bd-cards">${pages.map(p => `<button type="button" class="bd-card" data-bd="open-page" data-url="${esc(tokenUrl(p))}" data-vp="${p.kind === 'hyperframes' ? 'vertical' : 'desktop'}" data-title="${esc(p.path)}"><span class="bd-kind ${p.kind}">${p.kind === 'hyperframes' ? '🎬 HyperFrames' : '🌐 HTML'}</span><b>${esc(p.name)}</b><small>${esc(p.path)}</small></button>`).join('')}</div>`
          : '<p class="small muted">Nenhum arquivo .html encontrado ainda na pasta deste projeto. Peça ao agente para criar ou escolha uma porta local abaixo.</p>'}
      </div>` : ''}
      <div class="bd-sec">
        <div class="bd-sec-h"><b class="small">Portas locais ativas neste computador</b></div>
        ${localPorts.length ? `<div class="bd-cards">${localPorts.map(p => `<button type="button" class="bd-card" data-bd="open-page" data-url="${esc(p.proxyUrl || adaptPreviewUrl(p.localUrl))}" data-title=":${p.port} · ${esc(p.label)}"><span class="bd-kind port">⚡ :${p.port}</span><b>${esc(p.label)}</b><small>127.0.0.1:${p.port} (ao vivo)</small></button>`).join('')}</div>`
        : '<p class="small muted">Nenhum servidor dev detectado nas portas comuns (3000, 3210, 5173, 8080…). Você pode digitar qualquer porta ou endereço na barra acima.</p>'}
      </div>
    </div>`;
  }

  function renderHost(host, isDock) {
    if (!host) return;
    const ctx = getCtx?.() || {};
    if (ctx.project !== lastProjectLoaded && (open || !isDock)) void refreshSources();
    const cur = activeTab();
    if (!host.dataset.bdInit) {
      host.dataset.bdInit = '1';
      host.innerHTML = `<div class="bd-shell">
        <div class="bd-tabs-bar">
          <div class="bd-tabs" role="tablist"></div>
          <button type="button" class="iconbtn sm" data-bd="new-tab" title="Nova aba de navegador" aria-label="Nova aba">+</button>
          <span class="grow"></span>
          ${isDock ? `<button type="button" class="btn ghost sm" data-bd="expand" title="Alternar largura tela cheia / dividido">Expandir</button><button type="button" class="iconbtn sm" data-bd="close-dock" title="Fechar navegador lateral" aria-label="Fechar navegador">×</button>` : ''}
        </div>
        <form class="bd-bar">
          <button type="button" class="iconbtn sm" data-bd="reload" title="Recarregar aba atual" aria-label="Recarregar">${icon('refresh', 16)}</button>
          <input class="bd-url" name="url" type="text" spellcheck="false" autocomplete="off" placeholder="Digite http://localhost:3000, /live/… ou escolha abaixo…">
          <button type="submit" class="btn sm">Ir</button>
          <div class="seg bd-vp" role="group" aria-label="Tamanho da tela">
            <button type="button" data-bd="vp" data-vp="desktop" title="Desktop (largura total)">🖥</button>
            <button type="button" data-bd="vp" data-vp="mobile" title="Celular (390×844)">📱</button>
            <button type="button" data-bd="vp" data-vp="vertical" title="Vídeo vertical 9:16 (HyperFrames / Reels)">🎬 9:16</button>
          </div>
          <button type="button" class="chip bd-auto" data-bd="auto" title="Recarregar automaticamente quando uma tarefa salvar arquivos">↻ Auto</button>
          <button type="button" class="btn outline sm bd-tweak-btn" data-bd="tweak" title="Pedir ajuste visual direto sobre a tela aberta agora">🎯 Ajustar</button>
          <a class="iconbtn sm bd-ext" target="_blank" rel="noopener noreferrer" title="Abrir em guia externa do navegador" aria-label="Abrir em guia externa">${icon('external', 16)}</a>
        </form>
        <form class="bd-tweak" hidden>
          <input class="bd-tweak-in" name="note" type="text" maxlength="600" autocomplete="off" placeholder="O que ajustar nesta tela? Ex.: aumentar fonte do preço, acelerar entrada da Cena 1…">
          <button type="submit" class="btn sm">Enviar ao agente</button>
        </form>
        <div class="bd-stage">
          <div class="bd-empty-slot"></div>
          <div class="bd-frames"></div>
        </div>
      </div>`;
    }

    const tabsEl = host.querySelector('.bd-tabs');
    const tabsHtml = tabs.map(t => `<div class="bd-tab${t.id === activeId ? ' on' : ''}"><button type="button" role="tab" aria-selected="${t.id === activeId}" data-bd="sel-tab" data-id="${esc(t.id)}">${esc(t.title || 'Nova guia')}</button><button type="button" class="bd-tab-x" data-bd="close-tab" data-id="${esc(t.id)}" aria-label="Fechar aba ${esc(t.title)}">×</button></div>`).join('');
    if (tabsEl._sig !== tabsHtml) { tabsEl._sig = tabsHtml; tabsEl.innerHTML = tabsHtml; }

    const expBtn = host.querySelector('[data-bd="expand"]');
    if (expBtn) expBtn.textContent = expanded ? 'Dividir tela' : 'Expandir';

    const urlInp = host.querySelector('.bd-url');
    if (urlInp && document.activeElement !== urlInp) urlInp.value = cur?.url || '';

    host.querySelectorAll('[data-bd="vp"]').forEach(b => {
      const on = (cur?.viewport || 'desktop') === b.dataset.vp;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });

    const autoBtn = host.querySelector('.bd-auto');
    if (autoBtn) { autoBtn.classList.toggle('on', !!cur?.autoReload); autoBtn.setAttribute('aria-pressed', String(!!cur?.autoReload)); }

    const tweakBtn = host.querySelector('.bd-tweak-btn');
    if (tweakBtn) { tweakBtn.disabled = !cur?.url; tweakBtn.classList.toggle('on', !!(tweakOpen && cur?.url)); }
    const tweakBox = host.querySelector('.bd-tweak');
    if (tweakBox) tweakBox.hidden = !(tweakOpen && cur?.url);

    const extLink = host.querySelector('.bd-ext');
    if (extLink) {
      if (cur?.url) { extLink.href = cur.url; extLink.hidden = false; }
      else extLink.hidden = true;
    }

    const emptySlot = host.querySelector('.bd-empty-slot');
    const framesBox = host.querySelector('.bd-frames');
    framesBox.dataset.vp = cur?.viewport || 'desktop';

    if (!cur?.url) {
      emptySlot.hidden = false;
      const eh = emptyTabHtml();
      if (emptySlot._sig !== eh) { emptySlot._sig = eh; emptySlot.innerHTML = eh; }
    } else {
      emptySlot.hidden = true;
    }

    // Reconcilia os iframes sem destruir os que já estão carregados!
    const validIds = new Set(tabs.filter(t => t.url).map(t => t.id));
    for (const ifr of [...framesBox.querySelectorAll('iframe[data-btab]')]) {
      if (!validIds.has(ifr.dataset.btab)) ifr.remove();
    }
    for (const t of tabs) {
      if (!t.url) continue;
      let ifr = framesBox.querySelector(`iframe[data-btab="${t.id}"]`);
      if (!ifr) {
        ifr = document.createElement('iframe');
        ifr.dataset.btab = t.id;
        ifr.className = 'bd-iframe';
        ifr.setAttribute('allow', 'autoplay; clipboard-write; fullscreen');
        ifr.title = `Navegador interno: ${t.title}`;
        ifr.src = t.url;
        ifr.dataset.loadedUrl = t.url;
        framesBox.appendChild(ifr);
      } else if (ifr.dataset.loadedUrl !== t.url) {
        ifr.src = t.url;
        ifr.dataset.loadedUrl = t.url;
      }
      ifr.hidden = !(t.id === activeId && cur?.url);
    }
  }

  function mountAll() {
    const ctx = getCtx?.() || {}, authed = !!ctx.authed;
    let dock = document.getElementById('browser-dock');
    if (!dock) {
      dock = document.createElement('aside');
      dock.id = 'browser-dock';
      dock.className = 'browser-dock';
      dock.setAttribute('aria-label', 'Navegador interno');
      document.getElementById('shell')?.appendChild(dock);
    }
    const showDock = authed && open && !(ctx.view === 'room' && ctx.viewMode?.() === 'browser');
    dock.hidden = !showDock;
    dock.classList.toggle('expanded', expanded);
    document.getElementById('shell')?.classList.toggle('browser-open', showDock);
    if (showDock) renderHost(dock, true);

    const roomSlot = document.getElementById('browser-room-slot');
    if (roomSlot && authed) renderHost(roomSlot, false);
  }

  document.addEventListener('click', e => {
    const b = e.target.closest?.('[data-bd]'); if (!b) return;
    const act = b.dataset.bd;
    if (act === 'new-tab') addTab();
    else if (act === 'sel-tab') { activeId = b.dataset.id; mountAll(); }
    else if (act === 'close-tab') closeTab(b.dataset.id);
    else if (act === 'reload') reloadTab();
    else if (act === 'close-dock') toggleDock(false);
    else if (act === 'expand') { expanded = !expanded; mountAll(); }
    else if (act === 'vp') { const cur = activeTab(); if (cur) { cur.viewport = b.dataset.vp; mountAll(); } }
    else if (act === 'auto') { const cur = activeTab(); if (cur) { cur.autoReload = !cur.autoReload; mountAll(); } }
    else if (act === 'tweak') { tweakOpen = !tweakOpen; mountAll(); if (tweakOpen) b.closest('.bd-shell')?.querySelector('.bd-tweak-in')?.focus(); }
    else if (act === 'refresh-sources') void refreshSources(true);
    else if (act === 'open-page') openUrl(b.dataset.url, { title: b.dataset.title || '', viewport: b.dataset.vp || null, openDock: !b.closest('#browser-room-slot') });
  });

  document.addEventListener('submit', e => {
    const tw = e.target.closest?.('.bd-tweak');
    if (tw) {
      e.preventDefault(); e.stopImmediatePropagation();
      const inp = tw.querySelector('.bd-tweak-in'), note = inp?.value.trim() || '';
      const cur = activeTab();
      if (!note || !cur?.url) return;
      tweakOpen = false; if (inp) inp.value = ''; mountAll();
      void onTweak?.({ url: cur.url, title: cur.title, viewport: cur.viewport || 'desktop', note });
      return;
    }
    const form = e.target.closest?.('.bd-bar'); if (!form) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const raw = form.querySelector('.bd-url')?.value || '';
    openUrl(raw, { openDock: !form.closest('#browser-room-slot') });
  }, true);

  return {
    isOpen: () => open,
    toggleDock,
    openUrl,
    refreshSources,
    notifyProjectUpdated,
    render: mountAll,
  };
}
