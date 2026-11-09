// Aviso "o agente foi bloqueado": mostra o que o Claude negou e deixa liberar com um clique (nada é liberado sozinho).
import { esc } from './views.js';
export function unblockHtml(task) {
  const list = Array.isArray(task?.unblock) ? task.unblock : []; if (!list.length) return '';
  const can = list.filter(u => u.kind !== 'never'), never = list.filter(u => u.kind === 'never');
  return `<section class="card unblock-box" data-task="${esc(task.id)}" style="margin:0 0 12px;border-color:var(--warn,#d9a441)" role="alert"><div class="card-h"><h2>O agente foi bloqueado</h2></div>
    <p class="small">Esta IA roda sem ninguém para aprovar no meio do trabalho, então ela <b>nega tudo que não foi liberado antes</b>. Para este pedido ela precisou de:</p>
    ${can.length ? `<ul class="plain">${can.map(u => `<li><label class="check"><input type="checkbox" class="unb" data-kind="${esc(u.kind)}" data-value="${esc(u.value)}" checked> ${esc(u.label)}</label></li>`).join('')}</ul>
    <div class="btn-row"><button type="button" class="btn sm" data-act="unblock" data-id="${esc(task.id)}">Liberar</button><button type="button" class="btn ghost sm" data-act="unblock" data-id="${esc(task.id)}" data-again="1">Liberar e pedir de novo</button></div>` : ''}
    ${never.map(u => `<p class="small muted">${esc(u.label)}</p>`).join('')}</section>`;
}
