// Modo Storyboard em Projetos de Vídeo (tela de Entregas):
// Agrupa automaticamente imagens, clipes, áudios e trechos de roteiro por cena (cena-01, scene_2, 01-*, etc.),
// permitindo revisar visualmente a sequência e pedir ajuste cirúrgico em uma única cena sem refazer o vídeo inteiro.
import { icon } from './icons.js';

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const extOf = p => (String(p || '').split('.').pop() || '').toLowerCase();
const mediaType = p => {
  const e = extOf(p);
  if (['mp4', 'webm', 'mov'].includes(e)) return 'video';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(e)) return 'image';
  if (['mp3', 'wav', 'ogg', 'm4a'].includes(e)) return 'audio';
  if (['md', 'txt', 'srt', 'vtt', 'json'].includes(e)) return 'script';
  if (['html', 'htm'].includes(e)) return 'html';
  return 'other';
};

// Extrai o número da cena a partir do nome do arquivo (ex.: cena-01.png, scene_2.mp4, clip03.mp4, 04_hook.png).
export function extractSceneNumber(filePath) {
  const base = String(filePath || '').split('/').pop() || '';
  if (/^(final|previa|preview|output|master|render|capa|thumb|poster)\b/i.test(base)) return null;
  const m = base.match(/(?:cena|scene|shot|clip|take|slide|quadro|parte|bloco)[-_.\s]*0*(\d{1,3})\b/i)
    || base.match(/^0*(\d{1,3})[-_.\s]+[a-z]/i);
  return m ? Number(m[1]) : null;
}

export function groupStoryboardScenes(files = [], scriptText = '') {
  const scenes = new Map();
  const finals = [], scripts = [], extras = [];

  for (const f of files) {
    if (!f?.path || f.change === 'deleted') continue;
    const mt = mediaType(f.path), n = extractSceneNumber(f.path);
    if (n != null && ['video', 'image', 'audio', 'html'].includes(mt)) {
      if (!scenes.has(n)) scenes.set(n, { num: n, items: [], note: '' });
      scenes.get(n).items.push({ ...f, mediaType: mt });
    } else if (mt === 'video' || /^(capa|thumb|poster)/i.test(f.path.split('/').pop() || '')) {
      finals.push({ ...f, mediaType: mt });
    } else if (mt === 'script') {
      scripts.push({ ...f, mediaType: mt });
    } else if (['image', 'audio', 'html'].includes(mt)) {
      extras.push({ ...f, mediaType: mt });
    }
  }

  // Se houver imagens/clipes soltos sem número explícito e nenhuma cena numerada, numera na ordem em que vieram.
  if (!scenes.size && extras.length >= 2) {
    extras.splice(0).forEach((f, idx) => scenes.set(idx + 1, { num: idx + 1, items: [f], note: '' }));
  }

  // Associa trechos do roteiro (ex.: "Cena 1: ..." ou "[00:00]") às cenas quando o texto do roteiro estiver disponível.
  if (scriptText) {
    for (const [num, sc] of scenes) {
      const re = new RegExp(`(?:^|\\n)\\s*(?:#+\\s*)?(?:cena|scene|bloco|parte)\\s*0*${num}\\b[^\\n]*\\n?([\\s\\S]{0,280}?)(?=\\n\\s*(?:#+\\s*)?(?:cena|scene|bloco|parte)\\s*\\d|$)`, 'i');
      const m = String(scriptText).match(re);
      if (m) sc.note = m[0].replace(/\s+/g, ' ').trim().slice(0, 220);
    }
  }

  return {
    scenes: [...scenes.values()].sort((a, b) => a.num - b.num),
    finals,
    scripts,
    extras,
  };
}

export function storyboardHtml(ctx, taskDetail) {
  if (!taskDetail) return '<div class="empty">Selecione uma entrega de vídeo à esquerda para abrir o Storyboard.</div>';
  const files = taskDetail.deliverables?.files || [];
  const { scenes, finals, scripts, extras } = groupStoryboardScenes(files, ctx.ui?.delText || taskDetail.answer || '');
  if (!scenes.length && !finals.length && !extras.length) {
    return '<div class="empty">Esta entrega ainda não tem cenas visuais (imagens, clipes ou HTML) para montar o Storyboard.</div>';
  }
  const renderMedia = item => {
    if (!item.url) return '';
    if (item.mediaType === 'video') return `<video controls preload="metadata" src="${esc(item.url)}" class="sb-vid"></video>`;
    if (item.mediaType === 'image') return `<a href="${esc(item.url)}" target="_blank" rel="noopener"><img loading="lazy" src="${esc(item.url)}" alt="${esc(item.path)}" class="sb-img"></a>`;
    if (item.mediaType === 'audio') return `<audio controls preload="metadata" src="${esc(item.url)}" class="sb-aud"></audio>`;
    if (item.mediaType === 'html') return `<button type="button" class="btn outline sm" data-act="open-in-browser" data-url="${esc(item.url)}" data-vp="vertical">${icon('film', 14)} Abrir composição (${esc(item.path.split('/').pop())})</button>`;
    return '';
  };

  return `<div class="sb-wrap">
    ${finals.length ? `<div class="sb-finals"><b class="small">Resultado / Prévia principal</b><div class="sb-grid">${finals.map(f => `<div class="sb-card sb-final">${renderMedia(f)}<small class="muted">${esc(f.path)}</small></div>`).join('')}</div></div>` : ''}
    ${scenes.length ? `<div class="sb-scenes"><b class="small">Sequência de cenas (${scenes.length})</b><div class="sb-grid">${scenes.map(sc => {
      const mainFile = sc.items[0]?.path || `Cena ${sc.num}`;
      return `<article class="sb-card">
        <div class="sb-head"><span class="pill info">Cena ${sc.num}</span><small class="muted">${esc(sc.items.map(i => i.path.split('/').pop()).join(' + '))}</small></div>
        <div class="sb-media">${sc.items.map(renderMedia).join('')}</div>
        ${sc.note ? `<p class="sb-note small">${esc(sc.note)}</p>` : ''}
        <button type="button" class="btn outline sm" data-act="scene-tweak" data-id="${esc(taskDetail.id)}" data-scene="${sc.num}" data-file="${esc(mainFile)}">Pedir ajuste só na Cena ${sc.num}</button>
      </article>`;
    }).join('')}</div></div>` : ''}
    ${extras.length ? `<div class="sb-extras"><b class="small">Outros ativos visuais / áudio</b><div class="sb-grid">${extras.map(f => `<div class="sb-card">${renderMedia(f)}<small class="muted">${esc(f.path)}</small></div>`).join('')}</div></div>` : ''}
    ${scripts.length ? `<p class="small muted">Roteiro/legendas na entrega: ${scripts.map(s => `<code>${esc(s.path)}</code>`).join(', ')}</p>` : ''}
  </div>`;
}
