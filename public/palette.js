// Paleta de comandos (Ctrl+K): trocar de projeto, ir para qualquer tela, abrir terminal, navegador, Nico e criar agente,
// tudo pelo teclado. Usa as mesmas ações dos botões (data-act), então não há caminho novo no servidor.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function paletteItems({ projects = [], current = '', pages = [], terminals = [] } = {}) {
  return [
    ...pages.map(([id, label]) => ({ id: 'go:' + id, group: 'Ir para', label, run: { go: id } })),
    ...projects.map(p => ({ id: 'pj:' + p.id, group: 'Projeto', label: p.name + (p.id === current ? ' (em foco)' : ''), hint: p.area || '', run: { project: p.id } })),
    { id: 'pj:', group: 'Projeto', label: 'Todos os projetos (geral)', run: { project: '' } },
    ...terminals.map(([cli, label]) => ({ id: 'tm:' + cli, group: 'Terminal', label: `Abrir terminal: ${label}`, run: { term: cli } })),
    { id: 'act:split', group: 'Terminal', label: 'Dividir terminais lado a lado', run: { split: true } },
    { id: 'act:browser', group: 'Ações', label: 'Navegador interno', hint: 'abrir ou fechar', run: { act: 'browser-toggle' } },
    { id: 'act:nico', group: 'Ações', label: 'Conversar com o Nico', run: { act: 'asst-toggle' } },
    { id: 'act:agent', group: 'Ações', label: 'Criar agente', run: { go: 'agents', then: 'new-agent' } },
  ];
}
export function filterItems(items, q) {
  const words = norm(q).split(/\s+/).filter(Boolean);
  if (!words.length) return items;
  return items.map(it => { const hay = norm(`${it.group} ${it.label} ${it.hint || ''}`), lab = norm(it.label); if (!words.every(w => hay.includes(w))) return null; return { it, score: (lab.startsWith(words[0]) ? 0 : 1) + (norm(it.group).startsWith(words[0]) ? 0 : 1) }; })
    .filter(Boolean).sort((a, b) => a.score - b.score).map(x => x.it);
}

export function createPalette({ getItems, onRun }) {
  const host = document.createElement('div'); host.id = 'palette'; host.hidden = true;
  host.innerHTML = '<div class="pal-scrim" data-pal="close"></div><div class="pal-box" role="dialog" aria-modal="true" aria-label="Paleta de comandos"><input class="pal-q" type="text" placeholder="Ir para, trocar de projeto, abrir terminal…" aria-label="Buscar comando" autocomplete="off" spellcheck="false"><ul class="pal-list" role="listbox"></ul><p class="pal-foot"><kbd>↑</kbd><kbd>↓</kbd> escolher · <kbd>Enter</kbd> abrir · <kbd>Esc</kbd> fechar</p></div>';
  document.body.appendChild(host);
  const q = host.querySelector('.pal-q'), list = host.querySelector('.pal-list');
  let items = [], shown = [], sel = 0, back = null;
  const draw = () => {
    shown = filterItems(items, q.value).slice(0, 40); sel = Math.min(sel, Math.max(0, shown.length - 1));
    let last = ''; list.innerHTML = shown.length ? shown.map((it, i) => { const head = it.group !== last ? `<li class="pal-group" role="presentation">${esc(it.group)}</li>` : ''; last = it.group; return `${head}<li role="option" id="pal-${i}" class="pal-item${i === sel ? ' on' : ''}" aria-selected="${i === sel}" data-i="${i}"><span>${esc(it.label)}</span>${it.hint ? `<small>${esc(it.hint)}</small>` : ''}</li>`; }).join('') : '<li class="pal-empty">Nada encontrado.</li>';
    q.setAttribute('aria-activedescendant', shown.length ? `pal-${sel}` : '');
    list.querySelector('.pal-item.on')?.scrollIntoView({ block: 'nearest' });
  };
  const close = () => { host.hidden = true; try { back?.focus(); } catch {} };
  const run = i => { const it = shown[i]; if (!it) return; close(); onRun(it.run); };
  const open = () => { back = document.activeElement; items = getItems(); q.value = ''; sel = 0; host.hidden = false; draw(); q.focus(); };
  q.addEventListener('input', () => { sel = 0; draw(); });
  q.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(shown.length - 1, sel + 1); draw(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); draw(); }
    else if (e.key === 'Enter') { e.preventDefault(); run(sel); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  });
  host.addEventListener('click', e => { if (e.target.closest('[data-pal=close]')) return close(); const li = e.target.closest('.pal-item'); if (li) run(Number(li.dataset.i)); });
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') { if (e.target?.closest?.('.xterm')) return; e.preventDefault(); host.hidden ? open() : close(); }
  });
  return { open, close, isOpen: () => !host.hidden };
}
