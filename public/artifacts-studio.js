// Estúdio de Artefatos & Portões de Qualidade (Entregas e Execução):
// Transforma entregas brutas em artefatos objetivos e acionáveis para Vídeo (Cue Sheet, Gancho, Motions, Prompts),
// Programação/Automação (Blocos copiáveis em 1 clique, Mapa de arquivos, Sintaxe) e Sites/Design (Preview Desktop/Mobile/9:16 + Qualidade).
import { icon } from './icons.js';

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Extrai artefatos estruturados de qualquer texto de resposta/roteiro + arquivos da tarefa.
export function extractArtifacts(rawText = '', files = []) {
  const text = String(rawText ?? '').replace(/\r\n/g, '\n');
  const codeBlocks = [];
  const fenceRe = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
  let m;
  while ((m = fenceRe.exec(text)) && codeBlocks.length < 12) {
    const lang = (m[1] || 'texto').trim().toLowerCase();
    const code = m[2].trim();
    if (code && lang !== 'code-room-action') {
      codeBlocks.push({ id: `cb-${codeBlocks.length}`, lang, code, lines: code.split('\n').length });
    }
  }

  // Cue sheet de vídeo: timestamps (00:00), Cenas (Cena 1: ...) e tags [motion: ...]
  const cues = [];
  const lines = text.split('\n');
  for (const ln of lines) {
    const clean = ln.trim();
    if (!clean || clean.length > 260) continue;
    const ts = clean.match(/^(?:[-*]\s*)?\[?(\d{1,2}:\d{2}(?:\s*[-–]\s*\d{1,2}:\d{2})?)\]?\s*[-—:]?\s*(.+)$/);
    const sc = !ts && clean.match(/^(?:#+\s*|[-*]\s*)?(Cena\s*\d+|Hook|Gancho|CTA|Chamada\s+final)\s*[:—-]\s*(.+)$/i);
    const mo = clean.match(/\[motion:\s*([^\]]+)\]/i);
    if (ts) cues.push({ tag: ts[1], text: ts[2], motion: mo?.[1] || '' });
    else if (sc) cues.push({ tag: sc[1], text: sc[2], motion: mo?.[1] || '' });
    else if (mo) cues.push({ tag: 'Motion', text: clean.replace(/\[motion:[^\]]+\]/gi, '').trim() || mo[1], motion: mo[1] });
    if (cues.length >= 20) break;
  }

  // Checklist (itens [ ] ou [x])
  const checklist = [];
  for (const ln of lines) {
    const cm = ln.match(/^\s*[-*]\s*\[([ xX])\]\s+(.+)$/);
    if (cm && checklist.length < 20) checklist.push({ done: cm[1].toLowerCase() === 'x', text: cm[2].trim() });
  }

  const cleanProse = text.replace(/```[\s\S]*?```/g, '').trim();
  const htmlFiles = (files || []).filter(f => /\.html?$/i.test(f.path) && f.change !== 'deleted');
  const mediaFiles = (files || []).filter(f => /\.(mp4|webm|mov|png|jpe?g|webp|gif|svg)$/i.test(f.path) && f.change !== 'deleted');

  return { codeBlocks, cues, checklist, cleanProse, htmlFiles, mediaFiles };
}

function formatSimpleMarkdown(text) {
  if (!text) return '';
  return String(text).split('\n').slice(0, 120).map(line => {
    const t = line.trim();
    if (!t) return '';
    if (/^###\s+/.test(t)) return `<h4>${esc(t.replace(/^###\s+/, ''))}</h4>`;
    if (/^##?\s+/.test(t)) return `<h3>${esc(t.replace(/^##?\s+/, ''))}</h3>`;
    if (/^[-*]\s+/.test(t)) return `<li>${esc(t.replace(/^[-*]\s+/, '')).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')}</li>`;
    return `<p>${esc(t).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>')}</p>`;
  }).filter(Boolean).join('').replace(/(<li>[\s\S]*?<\/li>)+/g, m => `<ul>${m}</ul>`);
}

export function qualityBarHtml(ctx, taskId, qa) {
  const busy = ctx.ui?.qaBusy === taskId;
  if (!qa) {
    return `<div class="qa-gate">
      <div class="qa-gate-head">
        <span><b>Controle de qualidade</b> <span class="muted small">— valide sintaxe, segredos, responsividade mobile e mídia antes de aprovar</span></span>
        <button type="button" class="btn outline sm" data-act="task-validate" data-id="${esc(taskId)}" ${busy ? 'disabled' : ''}>${icon('check-square', 15)} ${busy ? 'Validando…' : 'Validar qualidade'}</button>
      </div>
    </div>`;
  }
  const badgeCls = qa.status === 'ok' ? 'ok' : qa.status === 'aviso' ? 'warn' : 'bad';
  const badgeLbl = qa.status === 'ok' ? `✔ Aprovado nos testes (${qa.score}%)` : qa.status === 'aviso' ? `⚠ Atenção (${qa.score}%)` : `✖ Ajustes necessários (${qa.score}%)`;
  const mark = { ok: '✔', aviso: '⚠', bad: '✖' };
  return `<div class="qa-gate qa-${esc(qa.status)}">
    <div class="qa-gate-head">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <span class="pill ${badgeCls}">${esc(badgeLbl)}</span>
        <small class="muted">Verificado às ${new Date(qa.checkedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</small>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${qa.fixPrompt ? `<button type="button" class="btn sm" data-act="task-fix-qa" data-id="${esc(taskId)}">${icon('sparkle', 14)} Corrigir pontos com o agente</button>` : ''}
        <button type="button" class="btn ghost sm" data-act="task-validate" data-id="${esc(taskId)}" ${busy ? 'disabled' : ''}>${icon('refresh', 14)} Revalidar</button>
      </div>
    </div>
    <ul class="qa-gate-list">
      ${(qa.checks || []).map(c => `<li class="qa-i-${esc(c.status)}"><b>${mark[c.status] || '•'}</b> <span><strong>${esc(c.label)}:</strong> ${esc(c.detail)}</span></li>`).join('')}
    </ul>
  </div>`;
}

export function artifactsViewHtml(ctx, taskDetail) {
  if (!taskDetail) return '<div class="empty">Selecione uma entrega à esquerda para abrir os artefatos.</div>';
  const files = taskDetail.deliverables?.files || [];
  const mainAns = taskDetail.answer || taskDetail.result?.summary || '';
  const sourceText = [ctx.ui?.delText && ctx.ui.delText.trim() !== mainAns.trim() ? ctx.ui.delText : '', mainAns].filter(Boolean).join('\n\n');
  const art = extractArtifacts(sourceText, files);
  const pid = taskDetail.project?.id || ctx.project || '';

  return `<div class="art-studio">
    ${art.htmlFiles.length ? `<section class="art-sec">
      <div class="art-sec-h"><b>🌐 Páginas & Composições Interativas (${art.htmlFiles.length})</b><small class="muted">Abra ao vivo em Desktop, Celular ou 9:16</small></div>
      <div class="art-actions-grid">
        ${art.htmlFiles.map(f => `<div class="art-file-card">
          <div><b>${esc(f.path.split('/').pop())}</b><small class="muted" style="display:block">${esc(f.path)}</small></div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button type="button" class="btn outline sm" data-act="open-in-browser" data-id="${esc(pid)}" data-path="${esc(f.path)}" data-vp="desktop">🖥 Desktop</button>
            <button type="button" class="btn outline sm" data-act="open-in-browser" data-id="${esc(pid)}" data-path="${esc(f.path)}" data-vp="mobile">📱 Celular</button>
            <button type="button" class="btn outline sm" data-act="open-in-browser" data-id="${esc(pid)}" data-path="${esc(f.path)}" data-vp="vertical">🎬 9:16</button>
          </div>
        </div>`).join('')}
      </div>
    </section>` : ''}

    ${art.cues.length ? `<section class="art-sec">
      <div class="art-sec-h"><b>🎬 Cue Sheet de Vídeo (Gancho, Cenas & Motions)</b><button type="button" class="btn ghost sm" data-act="art-copy-all-cues">Copiar roteiro/cues</button></div>
      <div class="art-cues">
        ${art.cues.map(c => `<div class="art-cue"><span class="pill info">${esc(c.tag)}</span><span class="art-cue-txt">${esc(c.text)}</span>${c.motion ? `<code class="art-motion">⚡ ${esc(c.motion)}</code>` : ''}</div>`).join('')}
      </div>
    </section>` : ''}

    ${art.checklist.length ? `<section class="art-sec">
      <div class="art-sec-h"><b>☑ Checklist da Entrega (${art.checklist.filter(x => x.done).length}/${art.checklist.length})</b></div>
      <ul class="art-checks">${art.checklist.map(c => `<li><span>${c.done ? '✔' : '☐'}</span> <span>${esc(c.text)}</span></li>`).join('')}</ul>
    </section>` : ''}

    ${art.codeBlocks.length ? `<section class="art-sec">
      <div class="art-sec-h"><b>⌨ Snippets, Comandos & Prompts Copiáveis (${art.codeBlocks.length})</b></div>
      <div class="art-snippets">
        ${art.codeBlocks.map((b, idx) => `<div class="art-snip">
          <div class="art-snip-h"><span class="chip">${esc(b.lang)} · ${b.lines} linha(s)</span><button type="button" class="btn ghost sm" data-act="art-copy-code" data-idx="${idx}">Copiar</button></div>
          <pre data-art-code="${idx}">${esc(b.code)}</pre>
        </div>`).join('')}
      </div>
    </section>` : ''}

    ${art.cleanProse ? `<section class="art-sec">
      <div class="art-sec-h"><b>📄 Resumo Estruturado do Agente</b><button type="button" class="btn ghost sm" data-act="art-copy-prose">Copiar resumo</button></div>
      <div class="art-prose" id="art-prose-box">${formatSimpleMarkdown(art.cleanProse)}</div>
    </section>` : ''}

    ${files.length ? `<section class="art-sec">
      <div class="art-sec-h"><b>📦 Mapa de Arquivos da Entrega (${files.length})</b><button type="button" class="btn ghost sm" data-act="changes" data-id="${esc(taskDetail.id)}">Ver Diff completo</button></div>
      <div class="art-files-compact">
        ${files.map(f => `<button type="button" class="chip" data-act="del-sel" data-id="${esc(taskDetail.id + '|' + f.path)}">${esc(f.path)} <small class="muted">(${esc({ created: 'novo', modified: 'editado', deleted: 'removido' }[f.change] || f.change)})</small></button>`).join('')}
      </div>
    </section>` : ''}
  </div>`;
}
