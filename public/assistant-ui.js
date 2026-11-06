// Painel do Assistente (lado direito). Funções puras: recebem o estado de /api/assistant e devolvem HTML. Nada aqui executa ações.
import { esc } from './views.js';

const PROV = { claude: 'Claude Code', codex: 'Codex', agy: 'Gemini (Antigravity)' };
const hour = t => t ? new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';

// Markdown simples e seguro: escapa tudo primeiro e só depois aplica negrito, código e listas. Sem links nem HTML vindo da IA.
export function mdLite(src) {
  const parts = String(src ?? '').split(/```[^\n]*\n([\s\S]*?)```/);
  return parts.map((seg, i) => {
    if (i % 2) return `<pre class="as-code">${esc(seg.replace(/\n$/, ''))}</pre>`;
    const inline = s => esc(s).replace(/`([^`\n]+)`/g, '<code>$1</code>').replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');
    const out = []; let list = null;
    for (const line of seg.split('\n')) {
      const li = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
      if (li) { if (!list) { list = []; out.push(list); } list.push(inline(li[1])); continue; }
      list = null; if (line.trim()) out.push(inline(line));
    }
    return out.map(o => Array.isArray(o) ? `<ul>${o.map(x => `<li>${x}</li>`).join('')}</ul>` : `<p>${o}</p>`).join('');
  }).join('');
}

const actionCard = (m, a) => {
  const id = `${m.id}:${a.idx}`;
  const state = a.status === 'applied' ? `<p class="as-done" role="status">✔ ${esc(a.result || 'Feito.')}</p>` : a.status === 'dismissed' ? '<p class="small muted">Descartada.</p>' : '';
  const body = a.status !== 'pending' ? '' : a.valid
    ? `<div class="btn-row"><button type="button" class="btn sm" data-act="asst-apply" data-id="${esc(id)}">${a.type === 'abrir_tela' ? 'Abrir' : 'Criar'}</button><button type="button" class="btn ghost sm" data-act="asst-dismiss" data-id="${esc(id)}">Descartar</button></div>`
    : `<p class="upd-err small" role="alert">Não dá para fazer: ${esc(a.error || 'ação inválida')}</p><div class="btn-row"><button type="button" class="btn ghost sm" data-act="asst-dismiss" data-id="${esc(id)}">Descartar</button></div>`;
  return `<div class="as-card ${a.valid ? '' : 'bad'}"><b>${a.valid ? 'Proposta' : 'Proposta com problema'}</b><p>${esc(a.summary || '')}</p>${a.detail ? `<details class="as-detail"><summary>Ver o texto completo</summary><pre class="as-code">${esc(a.detail)}</pre></details>` : ''}${state}${body}</div>`;
};

const allBar = m => { const p = (m.actions || []).filter(a => a.status === 'pending'); return p.length >= 2 ? `<div class="btn-row as-all"><button type="button" class="btn sm" data-act="asst-apply-all" data-id="${esc(m.id)}">Aprovar tudo, na ordem (${p.length})</button></div>` : ''; };
const message = m => m.role === 'user'
  ? `<div class="as-msg me"><div class="as-bubble">${mdLite(m.text)}</div><small>${esc(hour(m.at))}</small></div>`
  : `<div class="as-msg ai"><div class="as-bubble">${m.error ? `<p class="upd-err" role="alert">${esc(m.error)}</p>` : mdLite(m.text)}${(m.actions || []).map(a => actionCard(m, a)).join('')}${allBar(m)}</div><small>${esc(hour(m.at))}</small></div>`;

export function assistantHtml(a, ui = {}) {
  const head = `<div class="card-h"><h2 id="asst-title">Assistente</h2><button type="button" class="iconbtn" data-act="asst-toggle" aria-label="Fechar o Assistente">×</button></div>`;
  if (!a) return `${head}<p class="muted">Carregando…</p>`;
  const conn = a.connected || [];
  if (!conn.length) return `${head}<p>Nenhuma IA instalada ainda. Instale e conecte uma (Codex, Claude Code ou Gemini) em <button type="button" class="linkbtn" data-nav="connections">Conexões</button> e volte aqui.</p>`;
  if (!a.manual?.available) return `${head}<p class="upd-err" role="alert">O manual do Assistente (docs/ASSISTENTE.md) não foi encontrado nesta instalação.</p>`;
  const provSel = `<label class="f small">Qual IA responde<select id="asst-provider" data-asst-provider>${conn.map(p => `<option value="${esc(p)}" ${p === a.provider ? 'selected' : ''}>${esc(PROV[p] || p)}</option>`).join('')}</select></label>`;
  const err = a.error ? `<p class="upd-err" role="alert">${esc(a.error)}</p>` : '';
  if (a.briefing) return `${head}<p role="status"><b>Sua IA está lendo o manual…</b></p><p class="small muted">Ela vai escrever o que entendeu e isso fica gravado só neste computador. Pode levar alguns instantes.</p><progress></progress>${err}`;
  if (!a.briefed) {
    return `${head}<p>Para ajudar você, a sua IA precisa <b>ler o manual do Code Room</b> uma vez.</p>
    <ul class="small muted"><li>O que ela entender fica gravado <b>neste computador</b>.</li><li>O Assistente <b>não altera nada</b> na ferramenta: ele só conversa e propõe. Você aprova cada coisa com um clique.</li><li>Isso usa um pouco da cota da sua própria IA.</li></ul>
    ${err}${provSel}<div class="btn-row"><button type="button" class="btn" data-act="asst-brief">Apresentar o Code Room à minha IA</button></div>`;
  }
  const busy = !!a.pending, msgs = a.messages || [];
  const staleBar = a.stale ? '<div class="as-stale" role="status"><span><b>O manual mudou.</b> O Assistente já usa a versão nova em cada resposta; reapresentar só atualiza o que fica gravado.</span><button type="button" class="btn ghost sm" data-act="asst-brief">Apresentar de novo</button></div>' : '';
  const intro = msgs.length ? '' : `<div class="as-empty"><p><b>Pergunte o que quiser sobre o Code Room.</b></p><div class="chips">${['Monte uma equipe de desenvolvimento e revisão', 'Quais skills combinam com um editor de vídeo?', 'Por que a minha tarefa não rodou?'].map(q => `<button type="button" class="chip" data-act="asst-suggest" data-id="${esc(q)}">${esc(q)}</button>`).join('')}</div></div>`;
  return `${head}${staleBar}<div class="as-log" id="asst-log" role="log" aria-live="polite">${intro}${msgs.map(message).join('')}${busy ? '<div class="as-msg ai"><div class="as-bubble as-wait" role="status">Pensando…</div></div>' : ''}</div>
  ${err}<form id="asst-form" class="as-form"><label class="sr-only" for="asst-input">Sua pergunta</label><textarea id="asst-input" rows="2" maxlength="4000" placeholder="Pergunte ou peça ajuda… (Enter envia, Shift+Enter quebra a linha)" ${busy ? 'disabled' : ''}>${esc(ui.draft || '')}</textarea>
  <div class="btn-row"><button class="btn sm" ${busy ? 'disabled' : ''}>Enviar</button><button type="button" class="btn ghost sm" data-act="asst-reset">Limpar conversa</button><span class="grow"></span><small class="muted" title="Lido do manual gravado nesta máquina">${esc(PROV[a.provider] || a.provider || '')} · somente leitura</small></div></form>`;
}
