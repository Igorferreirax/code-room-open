// Pedidos de permissão DURANTE a execução (a IA quer rodar um comando, abrir um programa, usar uma ferramenta).
// Aparecem num cartão fixo no canto da tela, em qualquer aba, e a IA fica esperando a resposta, como no terminal.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const KIND = { comando: 'Vai executar', arquivo: 'Vai alterar', leitura: 'Vai ler', web: 'Vai acessar', mcp: 'Vai usar' };
export function runApprovalsHtml(items = []) {
  if (!items.length) return '';
  return `<div class="run-appr-stack" role="region" aria-label="Pedidos de permissão">${items.slice(0, 4).map((a, i) => `<div class="run-appr" role="alertdialog" aria-label="${esc(a.title)}">
    <div class="run-appr-head"><b>${esc(a.assistant ? 'Nico' : a.agent || 'Agente')}</b> quer ${esc(a.title.charAt(0).toLowerCase() + a.title.slice(1))}${a.project ? ` <span class="muted">· ${esc(a.project)}</span>` : ''}</div>
    ${a.detail ? `<div class="run-appr-what k-${esc(a.kind || 'outro')}"><span class="run-appr-kind">${esc(KIND[a.kind] || 'O que vai acontecer')}</span><pre class="run-appr-detail">${esc(a.detail)}</pre></div>` : ''}
    <div class="btn-row"><button type="button" class="btn sm" data-appr="allow" data-id="${esc(a.id)}">Permitir${i === 0 ? ' <kbd>Enter</kbd>' : ''}</button><button type="button" class="btn outline sm" data-appr="always" data-id="${esc(a.id)}" title="Não pergunta de novo o mesmo programa nesta tarefa">Permitir sempre nesta tarefa</button><button type="button" class="btn ghost sm" data-appr="deny" data-id="${esc(a.id)}">Negar</button></div>
  </div>`).join('')}${items.length > 4 ? `<div class="run-appr more small">+${items.length - 4} pedido(s) esperando</div>` : ''}</div>`;
}

// Liga o cartão: consulta a cada 2 s (é só memória no servidor) e manda a resposta. api(path, body) é a do app.
export function startRunApprovals({ api, enabled = () => true, onError = () => {} }) {
  const host = document.createElement('div'); host.id = 'run-approvals'; document.body.appendChild(host);
  let last = null, busy = false;
  const draw = items => { const html = runApprovalsHtml(items); if (html !== last) { host.innerHTML = html; last = html; } };
  const tick = async () => { if (busy || !enabled()) return; busy = true; try { draw((await api('approvals')).items || []); } catch {} finally { busy = false; } };
  host.addEventListener('click', async e => {
    const b = e.target.closest('[data-appr]'); if (!b) return;
    b.closest('.run-appr')?.querySelectorAll('button').forEach(x => { x.disabled = true; });
    try { await api(`approvals/${b.dataset.id}/${b.dataset.appr}`, {}); } catch (err) { onError(err.message); }
    b.closest('.run-appr')?.remove(); last = null; busy = false; tick();   // some na hora; a próxima consulta redesenha o resto
  });
  // Enter aprova e Esc recusa o primeiro pedido, quando o foco não está num campo de texto (nem num diálogo aberto).
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== 'Escape' || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey || e.isComposing) return;
    const t = e.target, typing = t?.closest?.('input, textarea, select, button, a[href], [contenteditable="true"], dialog[open], .xterm'); if (typing) return;
    const b = host.querySelector(`.run-appr [data-appr="${e.key === 'Enter' ? 'allow' : 'deny'}"]:not(:disabled)`); if (!b) return;
    e.preventDefault(); e.stopPropagation(); b.click();
  }, true);
  setInterval(tick, 2000); tick();
  return { refresh: tick };
}
