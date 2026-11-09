// Cartões de aprovação no chat do Assistente: vídeo, imagens e prévias de lote aparecem ali mesmo, com Aprovar / Pedir ajustes.
// Só usa o que o app já tem (arquivos das entregas e a mídia dos lotes); aprovar uma entrega NUNCA publica nada.
import { icon } from './icons.js';
import { esc, inProject } from './views.js';
import { deliveryTitle } from './views2.js';

const EXT = p => (String(p).split('.').pop() || '').toLowerCase();
export const mediaKind = p => ['mp4', 'webm', 'mov'].includes(EXT(p)) ? 'video' : ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(EXT(p)) ? 'image' : '';
const DAY = 86400000;

// Até `max` itens que esperam a pessoa: prévias de lote primeiro, depois entregas concluídas (últimos 14 dias) com vídeo ou imagem e ainda sem revisão.
export function approvalItems(ctx, max = 8) {
  const st = ctx.state || {}, out = [];
  for (const b of st.batches || []) {
    if (ctx.project && b.projectId && b.projectId !== ctx.project) continue;
    for (const ep of b.episodes || []) if (ep.status === 'aguardando_previa') out.push({ type: 'preview', key: `p:${b.id}:${ep.id}`, batchId: b.id, epId: ep.id, title: ep.title || b.name || 'Prévia do lote' });
  }
  const recent = r => { const at = Date.parse(r.createdAt || r.updatedAt); return !at || Date.now() - at < 14 * DAY; };
  const tasks = (st.runs || []).filter(r => r.status === 'completed' && !r.review && r.kind !== 'plan' && r.step !== 'review' && inProject(ctx, r) && recent(r) && (r.deliverables || []).some(f => mediaKind(f.path)))
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
    .map(r => ({ type: 'task', key: `t:${r.id}`, id: r.id, title: deliveryTitle(r), agent: r.agent?.name || '', file: (r.deliverables.find(f => mediaKind(f.path)) || r.deliverables[0]).path }));
  return [...out, ...tasks].slice(0, max);
}

const mediaHtml = (it, files) => {
  if (files === undefined || files === null) return '<div class="ap-media ap-wait" role="status">Carregando a prévia…</div>';
  const vids = files.filter(f => mediaKind(f.name || f.path) === 'video').slice(0, 1), imgs = files.filter(f => mediaKind(f.name || f.path) === 'image').slice(0, 4);
  if (!vids.length && !imgs.length) return '<div class="ap-media ap-wait">Sem prévia visual. Use “Abrir”.</div>';
  return `<div class="ap-media">${vids.map(f => `<video controls preload="metadata" src="${esc(f.url)}" aria-label="Vídeo: ${esc(f.name || '')}"></video>`).join('')}${imgs.length ? `<div class="ap-imgs ${vids.length ? 'sm' : ''}">${imgs.map(f => `<a href="${esc(f.url)}" target="_blank" rel="noopener" title="${esc(f.name || '')}"><img loading="lazy" src="${esc(f.url)}" alt="${esc(f.name || 'Imagem da entrega')}"></a>`).join('')}</div>` : ''}</div>`;
};

export function approvalHtml(ctx) {
  const items = approvalItems(ctx); if (!items.length) return '';
  const i = Math.min(Math.max(Number(ctx.ui?.apIdx) || 0, 0), items.length - 1), it = items[i], collapsed = !!ctx.ui?.apCollapsed;
  const head = `<div class="ap-top"><b>Aguardando você</b><span class="pill warn">${items.length}</span><span class="grow"></span>${items.length > 1 ? `<button type="button" class="iconbtn" data-act="ap-nav" data-id="-1" aria-label="Anterior" ${i === 0 ? 'disabled' : ''}>‹</button><small>${i + 1}/${items.length}</small><button type="button" class="iconbtn" data-act="ap-nav" data-id="1" aria-label="Próxima" ${i === items.length - 1 ? 'disabled' : ''}>›</button>` : ''}<button type="button" class="iconbtn" data-act="ap-toggle" aria-expanded="${!collapsed}" aria-label="${collapsed ? 'Mostrar' : 'Recolher'} a aprovação" title="${collapsed ? 'Mostrar' : 'Recolher'}">${collapsed ? '▾' : '▴'}</button></div>`;
  if (collapsed) return `<section class="ap ap-min" aria-label="Aguardando a sua aprovação">${head}<p class="ap-title"><b>${esc(it.title)}</b></p></section>`;
  const asking = ctx.ui?.apChanges === it.key;
  const actions = it.type === 'preview'
    ? `<div class="btn-row"><button type="button" class="btn sm" data-act="batch-preview-ok" data-id="${esc(it.batchId)}" data-ep="${esc(it.epId)}">${icon('check', 14)} Aprovar prévia</button><button type="button" class="btn ghost sm" data-nav="routines">Abrir lote</button></div><p class="muted small">Aprovar a prévia continua o episódio para a montagem final.</p>`
    : asking
      ? `<label class="sr-only" for="ap-note">Descreva o ajuste</label><textarea id="ap-note" rows="2" maxlength="500" placeholder="O que precisa mudar?">${esc(ctx.ui?.apNote || '')}</textarea><div class="btn-row"><button type="button" class="btn sm" data-act="ap-changes-send" data-id="${esc(it.id)}">${icon('send', 14)} Enviar ajustes</button><button type="button" class="btn ghost sm" data-act="ap-changes-cancel">Cancelar</button></div>`
      : `<div class="btn-row"><button type="button" class="btn sm" data-act="ap-approve" data-id="${esc(it.id)}">${icon('check', 14)} Aprovar</button><button type="button" class="btn ghost sm" data-act="ap-changes-open" data-id="${esc(it.key)}">Pedir ajustes</button><button type="button" class="btn ghost sm" data-act="ap-open" data-id="${esc(it.id)}" data-file="${esc(it.file || '')}">Abrir</button></div><p class="muted small">Aprovar não publica nada.</p>`;
  return `<section class="ap" aria-label="Aguardando a sua aprovação">${head}${mediaHtml(it, ctx.cardMedia?.[it.key])}<p class="ap-title"><b>${esc(it.title)}</b><small>${it.type === 'preview' ? 'Prévia do lote' : esc(it.agent)}</small></p>${actions}</section>`;
}
