// Conversa do Assistente (corpo da janela de chat). Funções puras: recebem o estado de /api/assistant e devolvem HTML. Nada aqui executa ações.
import { esc } from './views.js';
import { mascot } from './mascot.js';

export const PROV = { claude: 'Claude Code', codex: 'Codex', agy: 'Gemini (Antigravity)' };
const provName = (a, p) => a?.providerNames?.[p] || PROV[p] || p;
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

const actVerb = type => type === 'abrir_tela' ? 'Abrir'
  : type === 'vincular_agente' ? 'Trazer agente'
  : type === 'contratar_biblioteca' ? 'Contratar'
  : type === 'cancelar_tarefa' ? 'Cancelar tarefa'
  : ['ajustar_agente', 'repetir_tarefa', 'contexto_projeto', 'gerenciar_rotina'].includes(type) ? 'Aplicar'
  : type === 'guardar_nota' ? 'Guardar' : 'Criar';

const actionCard = (m, a) => {
  const id = `${m.id}:${a.idx}`;
  const state = a.status === 'applied' ? `<p class="as-done" role="status">✔ ${a.auto ? 'Aplicado no Modo Piloto: ' : ''}${esc(a.result || 'Feito.')}</p>${a.type === 'criar_equipe' ? `<div class="as-team-next"><p class="small">Quer ajuda para conectar a equipe?</p><button type="button" class="btn outline sm" data-act="asst-team-help">Sim, preparar um fluxo</button></div>` : ''}` : a.status === 'dismissed' ? '<p class="small muted">Descartada.</p>' : '';
  const body = a.status !== 'pending' ? '' : a.valid
    ? `<div class="btn-row"><button type="button" class="btn sm" data-act="asst-apply" data-id="${esc(id)}">${actVerb(a.type)}</button><button type="button" class="btn ghost sm" data-act="asst-dismiss" data-id="${esc(id)}">Descartar</button></div>`
    : `<p class="upd-err small" role="alert">Não dá para fazer: ${esc(a.error || 'ação inválida')}</p><div class="btn-row"><button type="button" class="btn ghost sm" data-act="asst-dismiss" data-id="${esc(id)}">Descartar</button></div>`;
  return `<div class="as-card ${a.valid ? '' : 'bad'}"><b>${a.valid ? 'Proposta' : 'Proposta com problema'}</b><p>${esc(a.summary || '')}</p>${a.detail ? `<details class="as-detail"><summary>Ver o texto completo</summary><pre class="as-code">${esc(a.detail)}</pre></details>` : ''}${state}${body}</div>`;
};

const allBar = m => { const p = (m.actions || []).filter(a => a.status === 'pending'); return p.length >= 2 ? `<div class="btn-row as-all"><button type="button" class="btn sm" data-act="asst-apply-all" data-id="${esc(m.id)}">Aprovar tudo, na ordem (${p.length})</button></div>` : ''; };
const thumbsHtml = m => {
  const list = (m.thumbs || []).filter(t => /^\/de?\//.test(String(t?.url || '')));
  if (!list.length) return '';
  return `<div class="as-thumbs">${list.map(t => `<a class="as-thumb" href="${esc(t.url)}" target="_blank" rel="noopener" title="${esc(t.path || t.name || '')}"><img src="${esc(t.url)}" alt="${esc(t.name || 'imagem')}" loading="lazy"><span>${esc(t.name || '')}</span></a>`).join('')}</div>`;
};
const folderUndoHtml = m => m.canUndoFolder
  ? `<div class="btn-row" style="margin-top:6px"><button type="button" class="btn outline sm" data-act="asst-undo-folder" data-id="${esc(m.id)}">Desfazer organização</button></div>`
  : m.folderUndone ? `<p class="as-done small" role="status">✔ ${esc(m.folderUndone)}</p>` : '';

const failureHint = kind => ({ auth: 'Faça login nessa IA e use “Testar resposta” em Conexões antes de repetir.', executable_missing: 'A CLI não foi encontrada. Instale-a ou reinicie o Code Room após atualizar o PATH.', no_output: 'A CLI encerrou sem resposta. Use “Testar resposta” em Conexões; se falhar, abra o diagnóstico para ver a saída da CLI.', tool_denied: 'A IA pediu uma ferramenta que não estava liberada para execução sem tela. Abra o diagnóstico e libere apenas a ferramenta necessária.', timeout: 'A tarefa excedeu o tempo permitido. Confira o diagnóstico e reduza o pedido ou aumente o limite do agente.', external_snapshot_unavailable: 'Escolha uma pasta extra menor ou mais específica e envie uma nova tarefa.', prompt_too_long: 'Divida o pedido ou coloque o material extenso em um arquivo do projeto.', rate_limit: 'Essa IA atingiu o limite de uso da sua conta. Espere o limite renovar ou troque a IA no seletor do topo do chat e pergunte de novo.', model: 'Essa IA não aceitou o modelo escolhido. Em Conexões, use “Testar resposta” para ver os modelos aceitos e escolha um da lista; depois pergunte de novo.' })[kind] || 'Abra o diagnóstico da execução para ver o motivo e o próximo passo.';
const connectionHelp = kind => ['auth', 'executable_missing', 'no_output', 'model'].includes(kind) ? '<button type="button" class="btn ghost sm" data-nav="connections">Abrir Conexões</button>' : kind === 'rate_limit' ? '<button type="button" class="btn ghost sm" data-act="asst-ai">Trocar a IA que responde</button>' : '';
const face = () => `<span class="as-face" aria-hidden="true">${mascot('feliz', 30)}</span>`;
const contextLine = m => {
  const c = m.context || {}, parts = [];
  if (c.project) parts.push(`Projeto: ${c.project}`);
  if (c.extraDir) parts.push(`pasta extra autorizada: ${c.extraDir}`);
  if (c.screen) parts.push('tela aberta');
  if (Number(c.obsidianNotes) > 0) parts.push(`${c.obsidianNotes} referência${c.obsidianNotes === 1 ? '' : 's'} do Obsidian`);
  return parts.length ? `<small class="as-context" title="Fontes de contexto incluídas no pedido enviado à IA">Contexto enviado: ${esc(parts.join(' · '))}</small>` : '';
};
const message = m => m.role === 'user'
  ? `<div class="as-msg me"><div class="as-bubble">${mdLite(m.text)}${m.hasImage ? '<p class="small">🖼️ Print anexado</p>' : ''}</div><small>${esc(hour(m.at))}</small>${contextLine(m)}</div>`
  : `<div class="as-msg ai">${face()}<div class="as-col"><div class="as-bubble">${m.error ? `<p class="upd-err" role="alert">${esc(m.error)}</p><p class="small muted">${esc(failureHint(m.failureKind))}</p>${connectionHelp(m.failureKind)}` : mdLite(m.text)}${thumbsHtml(m)}${(m.actions || []).map(a => actionCard(m, a)).join('')}${allBar(m)}${folderUndoHtml(m)}${m.pilot && m.fileCount === 0 && !m.error ? `<p class="muted small" role="status">${m.externalApproved && !m.externalTracked ? 'Não foi possível confirmar as alterações na pasta extra. Confira-a manualmente.' : 'Nenhum arquivo foi alterado nas pastas acompanhadas nesta execução.'}</p>` : ''}${m.externalShallow ? '<p class="muted small" role="note">A pasta extra é grande: conferi só o primeiro nível dela (arquivos e pastas soltos). O que mudou dentro das subpastas não aparece na lista; confira lá se precisar.</p>' : ''}${m.taskId ? `<button type="button" class="btn ghost sm" data-act="asst-task" data-id="${esc(m.taskId)}" data-tab="${m.error ? 'resumo' : 'arquivos'}">${m.error ? 'Ver diagnóstico da execução' : m.pilot && m.fileCount === 0 ? 'Ver registro da execução' : 'Ver arquivos e diff da execução'}</button>` : ''}</div><small>${esc(hour(m.at))}</small></div></div>`;

// O que merece atenção agora (falhas, fila parada, lote com problema, IA indisponível). "Me ajude" manda a pergunta pronta ao Assistente.
const alertsHtml = a => (a.alerts || []).length ? `<div class="as-alerts" role="region" aria-label="O que merece atenção">${a.alerts.map(x => `<div class="as-alert ${esc(x.level)}"><div><b>${esc(x.title)}</b><p>${esc(x.text)}</p></div><div class="btn-row"><button type="button" class="btn sm" data-act="asst-help" data-id="${esc(x.id)}">Me ajude com isso</button><button type="button" class="btn ghost sm" data-act="asst-alert-dismiss" data-id="${esc(x.id)}">Dispensar</button></div></div>`).join('')}</div>` : '';
// Pasta fora do projeto: o Nico pergunta no próprio chat (antes eram janelas do navegador). "Só ver" não liga o Piloto.
export function folderAskHtml(a) {
  const f = a.folderAsk; if (!f) return '';
  return `<div class="as-msg ai as-folder-ask">${face()}<div class="as-col"><div class="as-bubble" role="group" aria-label="Autorizar pasta fora do projeto"><p><b>Posso acessar esta pasta?</b></p><label class="f small">Pasta (confira ou corrija)<input id="folder-ask-path" value="${esc(f.path)}" spellcheck="false" autocomplete="off"></label><ul class="small muted"><li><b>Só ver:</b> leio a pasta e não altero nada.</li><li><b>Ver e editar:</b> posso criar, mover e editar arquivos nela${a.autonomy === 'pilot' ? '' : ' (o Modo Piloto liga)'}. O Code Room registra o que mudar.</li><li>Vale só para este pedido.</li></ul>${a.provider === 'agy' ? `<p class="small" role="note">${(a.connected || []).some(x => x === 'claude' || x === 'codex') ? 'O Antigravity não mexe em pastas fora do projeto: neste pedido respondo com o Claude ou o Codex.' : '⚠️ O Antigravity não move arquivos fora do projeto. Para organizar pastas, conecte o Claude ou o Codex.'}</p>` : ''}<div class="btn-row"><button type="button" class="btn sm" data-act="folder-ask" data-id="read">Só ver</button><button type="button" class="btn outline sm" data-act="folder-ask" data-id="edit">Ver e editar</button><button type="button" class="btn ghost sm" data-act="folder-ask" data-id="cancel">Cancelar</button></div></div></div></div>`;
}
export function sendErrorHtml(a) {
  if (!a.sendError) return '';
  return `<div class="as-msg ai as-send-error">${face()}<div class="as-col"><div class="as-bubble"><p class="upd-err" role="alert">Não consegui enviar: ${esc(a.sendError)}</p><p class="small muted">Seu texto continua na barra. Corrija o que for preciso e envie de novo.</p><button type="button" class="btn ghost sm" data-act="asst-senderr-x">Entendi</button></div></div></div>`;
}
export function assistantHtml(a) {
  if (!a) return '<p class="muted">Carregando…</p>';
  const conn = a.connected || [];
  if (!conn.length) return `${(a.messages || []).length ? `<div class="as-log" id="asst-log" role="log" aria-live="polite">${a.messages.map(message).join('')}</div>` : ''}<p>Nenhuma IA instalada ainda. Instale e conecte uma (Codex, Claude Code ou Gemini) em <button type="button" class="linkbtn" data-nav="connections">Conexões</button> e volte aqui.</p>`;
  if (!a.manual?.available) return '<p class="upd-err" role="alert">O manual do Assistente (docs/ASSISTENTE.md) não foi encontrado nesta instalação.</p>';
  const provSel = `<label class="f small">Qual IA responde<select id="asst-provider" data-asst-provider>${conn.map(p => `<option value="${esc(p)}" ${p === a.provider ? 'selected' : ''}>${esc(provName(a, p))}</option>`).join('')}</select></label>`;
  const err = a.error ? `<p class="upd-err" role="alert">${esc(a.error)}</p>` : '';
  if (a.briefing) return `<p role="status"><b>Sua IA está lendo o manual…</b></p><p class="small muted">Ela vai escrever o que entendeu e isso fica gravado só neste computador. Pode levar alguns instantes.</p><progress></progress><div class="btn-row" style="margin-top:8px"><button type="button" class="btn ghost sm" data-act="asst-cancel">Cancelar</button></div>${err}`;
  if (!a.briefed) {
    const early = (a.messages || []).length ? `<div class="as-log" id="asst-log" role="log" aria-live="polite">${a.messages.map(message).join('')}</div>` : '';   // respostas dos comandos locais (/celular, /status) aparecem mesmo antes da apresentação
    return `${early}<p>Para ajudar você, a sua IA precisa <b>ler o manual do Code Room</b> uma vez.</p>
    <ul class="small muted"><li>O que ela entender fica gravado <b>neste computador</b>.</li><li>No modo conversa, o Assistente propõe ações no Code Room para você aprovar. No Modo Piloto, ele também pode trabalhar nos arquivos do projeto.</li><li>Isso usa um pouco da cota da sua própria IA.</li></ul>
    ${err}${provSel}<div class="btn-row"><button type="button" class="btn" data-act="asst-brief">Apresentar o Code Room à minha IA</button></div>`;
  }
  const busy = !!a.pending, msgs = a.messages || [];
  const staleBar = a.stale ? '<div class="as-stale" role="status"><span><b>O manual mudou.</b> O Assistente já usa a versão nova em cada resposta; reapresentar só atualiza o que fica gravado.</span><button type="button" class="btn ghost sm" data-act="asst-brief">Apresentar de novo</button></div>' : '';
  const errCount = msgs.filter(m => m.error).length, errBar = errCount ? `<div class="as-stale" role="status"><span>${errCount} mensagem${errCount > 1 ? 'ns' : ''} de erro nesta conversa.</span><button type="button" class="btn ghost sm" data-act="asst-clear-errors">Limpar erros</button></div>` : '';
  const intro = msgs.length ? '' : `<div class="as-empty as-hero"><span class="as-hero-face" aria-hidden="true">${mascot('feliz', 92)}</span><p class="as-hero-t"><b>Oi! Eu sou ${esc(a.name || 'o Nico')}.</b></p><p class="small muted">Conte o que quer fazer (um vídeo, um projeto, uma equipe). Ações no Code Room pedem seu clique; no Modo Piloto, posso trabalhar nos arquivos do projeto.</p><div class="as-sugs">${['/status', '/pendencias', 'Monte uma equipe de vídeo', 'Crie uma rotina semanal'].map(q => `<button type="button" class="chip" data-act="asst-suggest" data-id="${esc(q)}">${esc(q)}</button>`).join('')}</div></div>`;
  const modeBar = a.autonomy === 'pilot' && !a.pilotNoticeDismissed ? '<div class="as-pilot-note" role="status"><span><b>Piloto ligado.</b> Eu mexo nos arquivos do projeto em foco e uso as suas ferramentas. Nada é postado, enviado nem pago sem o seu “sim”.' + (a.provider && a.provider !== 'claude' ? ' Com esta IA o piloto não usa MCP nem o Chrome (só o Claude faz isso): para o piloto completo, escolha o Claude Code no seletor do topo do chat.' : '') + '</span><button type="button" class="as-note-close" data-act="asst-pilot-note-dismiss" aria-label="Ocultar aviso do Modo Piloto" title="Ocultar aviso">×</button></div>' : '';
  const grantBar = a.folderGrant ? `<div class="as-stale as-grant" role="status"><span>📁 <b>${esc(a.folderGrant.path)}</b> · ${a.folderGrant.access === 'read' ? 'só ver' : 'ver e editar'} nesta conversa</span><button type="button" class="btn ghost sm" data-act="folder-grant-x">Tirar</button></div>` : '';
  return `${modeBar}${alertsHtml(a)}${staleBar}${errBar}${grantBar}<div class="as-log" id="asst-log" role="log" aria-live="polite">${intro}${msgs.map(message).join('')}${folderAskHtml(a)}${sendErrorHtml(a)}${busy ? `<div class="as-msg ai">${face()}<div class="as-col"><div class="as-bubble as-wait" role="status"><span class="as-dots" aria-hidden="true"><i></i><i></i><i></i></span> Pensando…${a.pending?.activity ? ` <small class="as-act">⚙ ${esc(a.pending.activity)}</small>` : ''} <button type="button" class="btn ghost sm as-wait-cancel" data-act="asst-cancel">Cancelar</button></div></div></div>` : ''}</div>${err}`;
}
