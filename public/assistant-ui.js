// Conversa do Assistente (corpo da janela de chat). Funções puras: recebem o estado de /api/assistant e devolvem HTML. Nada aqui executa ações.
import { esc } from './views.js';
import { mascot } from './mascot.js';

export const PROV = { claude: 'Claude Code', codex: 'Codex', agy: 'Gemini (Antigravity)' };
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
  const state = a.status === 'applied' ? `<p class="as-done" role="status">✔ ${esc(a.result || 'Feito.')}</p>${a.type === 'criar_equipe' ? `<div class="as-team-next"><p class="small">Quer ajuda para conectar a equipe?</p><button type="button" class="btn outline sm" data-act="asst-team-help">Sim, preparar um fluxo</button></div>` : ''}` : a.status === 'dismissed' ? '<p class="small muted">Descartada.</p>' : '';
  const body = a.status !== 'pending' ? '' : a.valid
    ? `<div class="btn-row"><button type="button" class="btn sm" data-act="asst-apply" data-id="${esc(id)}">${a.type === 'abrir_tela' ? 'Abrir' : ['ajustar_agente', 'repetir_tarefa'].includes(a.type) ? 'Aplicar' : a.type === 'guardar_nota' ? 'Guardar' : 'Criar'}</button><button type="button" class="btn ghost sm" data-act="asst-dismiss" data-id="${esc(id)}">Descartar</button></div>`
    : `<p class="upd-err small" role="alert">Não dá para fazer: ${esc(a.error || 'ação inválida')}</p><div class="btn-row"><button type="button" class="btn ghost sm" data-act="asst-dismiss" data-id="${esc(id)}">Descartar</button></div>`;
  return `<div class="as-card ${a.valid ? '' : 'bad'}"><b>${a.valid ? 'Proposta' : 'Proposta com problema'}</b><p>${esc(a.summary || '')}</p>${a.detail ? `<details class="as-detail"><summary>Ver o texto completo</summary><pre class="as-code">${esc(a.detail)}</pre></details>` : ''}${state}${body}</div>`;
};

const allBar = m => { const p = (m.actions || []).filter(a => a.status === 'pending'); return p.length >= 2 ? `<div class="btn-row as-all"><button type="button" class="btn sm" data-act="asst-apply-all" data-id="${esc(m.id)}">Aprovar tudo, na ordem (${p.length})</button></div>` : ''; };
const face = () => `<span class="as-face" aria-hidden="true">${mascot('feliz', 30)}</span>`;
const contextLine = m => {
  const c = m.context || {}, parts = [];
  if (c.project) parts.push(`Projeto: ${c.project}`);
  if (c.screen) parts.push('tela aberta');
  if (Number(c.obsidianNotes) > 0) parts.push(`${c.obsidianNotes} referência${c.obsidianNotes === 1 ? '' : 's'} do Obsidian`);
  return parts.length ? `<small class="as-context" title="Fontes de contexto incluídas no pedido enviado à IA">Contexto enviado: ${esc(parts.join(' · '))}</small>` : '';
};
const message = m => m.role === 'user'
  ? `<div class="as-msg me"><div class="as-bubble">${mdLite(m.text)}</div><small>${esc(hour(m.at))}</small>${contextLine(m)}</div>`
  : `<div class="as-msg ai">${face()}<div class="as-col"><div class="as-bubble">${m.error ? `<p class="upd-err" role="alert">${esc(m.error)}</p>` : mdLite(m.text)}${(m.actions || []).map(a => actionCard(m, a)).join('')}${allBar(m)}${m.taskId && !m.error ? `<button type="button" class="btn ghost sm" data-act="asst-task" data-id="${esc(m.taskId)}" data-tab="arquivos">Ver arquivos e diff da execução</button>` : ''}</div><small>${esc(hour(m.at))}</small></div></div>`;

// O que merece atenção agora (falhas, fila parada, lote com problema, IA indisponível). "Me ajude" manda a pergunta pronta ao Assistente.
const alertsHtml = a => (a.alerts || []).length ? `<div class="as-alerts" role="region" aria-label="O que merece atenção">${a.alerts.map(x => `<div class="as-alert ${esc(x.level)}"><div><b>${esc(x.title)}</b><p>${esc(x.text)}</p></div><div class="btn-row"><button type="button" class="btn sm" data-act="asst-help" data-id="${esc(x.id)}">Me ajude com isso</button><button type="button" class="btn ghost sm" data-act="asst-alert-dismiss" data-id="${esc(x.id)}">Dispensar</button></div></div>`).join('')}</div>` : '';
export function assistantHtml(a) {
  if (!a) return '<p class="muted">Carregando…</p>';
  const conn = a.connected || [];
  if (!conn.length) return '<p>Nenhuma IA instalada ainda. Instale e conecte uma (Codex, Claude Code ou Gemini) em <button type="button" class="linkbtn" data-nav="connections">Conexões</button> e volte aqui.</p>';
  if (!a.manual?.available) return '<p class="upd-err" role="alert">O manual do Assistente (docs/ASSISTENTE.md) não foi encontrado nesta instalação.</p>';
  const provSel = `<label class="f small">Qual IA responde<select id="asst-provider" data-asst-provider>${conn.map(p => `<option value="${esc(p)}" ${p === a.provider ? 'selected' : ''}>${esc(PROV[p] || p)}</option>`).join('')}</select></label>`;
  const err = a.error ? `<p class="upd-err" role="alert">${esc(a.error)}</p>` : '';
  if (a.briefing) return `<p role="status"><b>Sua IA está lendo o manual…</b></p><p class="small muted">Ela vai escrever o que entendeu e isso fica gravado só neste computador. Pode levar alguns instantes.</p><progress></progress>${err}`;
  if (!a.briefed) {
    const early = (a.messages || []).length ? `<div class="as-log" id="asst-log" role="log" aria-live="polite">${a.messages.map(message).join('')}</div>` : '';   // respostas dos comandos locais (/celular, /status) aparecem mesmo antes da apresentação
    return `${early}<p>Para ajudar você, a sua IA precisa <b>ler o manual do Code Room</b> uma vez.</p>
    <ul class="small muted"><li>O que ela entender fica gravado <b>neste computador</b>.</li><li>O Assistente <b>não altera nada</b> na ferramenta: ele só conversa e propõe. Você aprova cada coisa com um clique.</li><li>Isso usa um pouco da cota da sua própria IA.</li></ul>
    ${err}${provSel}<div class="btn-row"><button type="button" class="btn" data-act="asst-brief">Apresentar o Code Room à minha IA</button></div>`;
  }
  const busy = !!a.pending, msgs = a.messages || [];
  const staleBar = a.stale ? '<div class="as-stale" role="status"><span><b>O manual mudou.</b> O Assistente já usa a versão nova em cada resposta; reapresentar só atualiza o que fica gravado.</span><button type="button" class="btn ghost sm" data-act="asst-brief">Apresentar de novo</button></div>' : '';
  const errCount = msgs.filter(m => m.error).length, errBar = errCount ? `<div class="as-stale" role="status"><span>${errCount} mensagem${errCount > 1 ? 'ns' : ''} de erro nesta conversa.</span><button type="button" class="btn ghost sm" data-act="asst-clear-errors">Limpar erros</button></div>` : '';
  const intro = msgs.length ? '' : `<div class="as-empty as-hero"><span class="as-hero-face" aria-hidden="true">${mascot('feliz', 92)}</span><p class="as-hero-t"><b>Oi! Eu sou ${esc(a.name || 'o Nico')}.</b></p><p class="small muted">Conte o que quer fazer (um vídeo, um projeto, uma equipe) e eu proponho os passos. Nada acontece sem o seu clique.</p><div class="as-sugs">${['/status', '/pendencias', 'Monte uma equipe de vídeo', 'Crie uma rotina semanal'].map(q => `<button type="button" class="chip" data-act="asst-suggest" data-id="${esc(q)}">${esc(q)}</button>`).join('')}</div></div>`;
  const modeBar = a.autonomy === 'pilot' && !a.pilotNoticeDismissed ? '<div class="as-pilot-note" role="status"><span><b>Piloto ligado.</b> Eu mexo nos arquivos do projeto em foco e uso as suas ferramentas. Nada é postado, enviado nem pago sem o seu “sim”.' + (a.provider && a.provider !== 'claude' ? ' Com esta IA o piloto não usa MCP nem o Chrome (só o Claude faz isso): para o piloto completo, escolha o Claude Code em “Qual IA responde”.' : '') + '</span><button type="button" class="as-note-close" data-act="asst-pilot-note-dismiss" aria-label="Ocultar aviso do Modo Piloto" title="Ocultar aviso">×</button></div>' : '';
  return `${modeBar}${alertsHtml(a)}${staleBar}${errBar}<div class="as-log" id="asst-log" role="log" aria-live="polite">${intro}${msgs.map(message).join('')}${busy ? `<div class="as-msg ai">${face()}<div class="as-col"><div class="as-bubble as-wait" role="status"><span class="as-dots" aria-hidden="true"><i></i><i></i><i></i></span> Pensando…${a.pending?.activity ? ` <small class="as-act">⚙ ${esc(a.pending.activity)}</small>` : ''}</div></div></div>` : ''}</div>${err}`;
}
