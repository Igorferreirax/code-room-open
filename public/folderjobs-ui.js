// Pastas de entrada (lotes): cartão em Rotinas, janela de cadastro e aviso de lote concluído. Funções puras.
import { esc } from './views.js';

const ST = { queued: ['idle', 'na fila'], running: ['run', 'processando'], done: ['ok', 'pronto'], failed: ['bad', 'com problema'] };
export const emptyJobForm = projectId => ({ id: '', name: '', projectId: projectId || '', dir: 'ENTRADA', exts: 'mp4, mov', who: '', instruction: 'Edite o arquivo {arquivo} usando a skill que combinamos. Salve o resultado em SAIDA/ com o mesmo nome.', outputNote: '', parallel: 1 });
export const formFromJob = j => ({ id: j.id, name: j.name, projectId: j.projectId, dir: j.dir, exts: (j.exts || []).join(', '), who: `${j.target.type === 'team' ? 't' : 'a'}:${j.target.id}`, instruction: j.instruction, outputNote: j.outputNote || '', parallel: j.parallel });
export function payloadFromJobForm(f) {
  const [kind, id] = String(f.who || '').split(':');
  return { ...(f.id ? { id: f.id } : {}), name: f.name, projectId: f.projectId, dir: f.dir, exts: f.exts, ...(kind === 't' ? { teamId: id } : { agentId: id }), instruction: f.instruction, outputNote: f.outputNote, parallel: Number(f.parallel) || 1 };
}

const bar = c => { const t = c.total || 1, d = Math.round(100 * c.done / t), f = Math.round(100 * c.failed / t); return `<div class="fj-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${c.total}" aria-valuenow="${c.done}" aria-label="${c.done} de ${c.total} prontos"><i class="ok" style="width:${d}%"></i><i class="bad" style="width:${f}%"></i></div>`; };

export function folderJobsCardHtml(ctx) {
  const jobs = ctx.state.folderJobs || [], name = id => ctx.state.projects.find(p => p.id === id)?.name || '?';
  const who = j => j.target.type === 'team' ? `Equipe ${ctx.state.teams.find(t => t.id === j.target.id)?.name || '?'}` : (ctx.state.agents.find(a => a.id === j.target.id)?.name || '?');
  const rows = jobs.map(j => {
    const c = j.counts, running = c.running + c.queued > 0, open = ctx.ui.fjOpen === j.id;
    const items = open ? `<ul class="fj-items">${(j.items || []).map(i => `<li><span class="dot d-${ST[i.status]?.[0] || 'idle'}"></span><span class="grow">${esc(i.rel)}</span><small class="muted">${esc(ST[i.status]?.[1] || i.status)}${i.reason ? ` · ${esc(i.reason.slice(0, 80))}` : ''}${i.files ? ` · ${i.files} arquivo(s)` : ''}</small>${i.taskId ? `<button type="button" class="linkbtn" data-act="task" data-id="${esc(i.taskId)}">ver</button>` : ''}</li>`).join('') || '<li class="muted">Ainda sem arquivos.</li>'}</ul>` : '';
    return `<div class="fj-row"><div class="fj-head"><div class="grow"><b>${esc(j.name)}</b> <span class="pill ${j.status === 'active' ? 'ok' : 'mute'}">${j.status === 'active' ? 'vigiando' : 'pausada'}</span><br><small class="muted">${esc(name(j.projectId))} › <code>${esc(j.dir)}</code> ${j.exts.length ? `(${esc(j.exts.join(', '))})` : ''} · ${esc(who(j))}</small></div>
      <div class="btn-row"><button type="button" class="btn sm" data-act="fj-run" data-id="${esc(j.id)}">Rodar agora</button><button type="button" class="btn ghost sm" data-act="${j.status === 'active' ? 'fj-pause' : 'fj-resume'}" data-id="${esc(j.id)}">${j.status === 'active' ? 'Pausar' : 'Retomar'}</button>${c.failed ? `<button type="button" class="btn ghost sm" data-act="fj-retry" data-id="${esc(j.id)}">Tentar de novo (${c.failed})</button>` : ''}<button type="button" class="btn ghost sm" data-act="fj-edit" data-id="${esc(j.id)}">Editar</button><button type="button" class="btn ghost sm" data-act="fj-delete" data-id="${esc(j.id)}">Remover</button></div></div>
      ${j.problem ? `<p class="upd-err small" role="alert">${esc(j.problem)}</p>` : ''}
      ${c.total ? `${bar(c)}<p class="small"><b>${c.done}</b> de <b>${c.total}</b> prontos${c.running ? ` · ${c.running} processando` : ''}${c.queued ? ` · ${c.queued} na fila` : ''}${c.failed ? ` · <span style="color:var(--bad)">${c.failed} com problema</span>` : ''} <button type="button" class="linkbtn" data-act="fj-toggle" data-id="${esc(j.id)}">${open ? 'esconder' : 'ver arquivos'}</button></p>` : `<p class="muted small">Ponha arquivos em <code>${esc(j.dir)}</code> e eles entram sozinhos (ou clique em Rodar agora).</p>`}${items}${j.lastResult && !running ? `<p class="small muted">Último lote: ${j.lastResult.done} de ${j.lastResult.total} prontos em ${esc(new Date(j.lastResult.at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }))}.</p>` : ''}</div>`;
  }).join('');
  return `<section class="card fj-card"><div class="card-h"><h2>Pastas de entrada (lotes)</h2><button type="button" class="btn sm" data-act="fj-new">+ Nova pasta de entrada</button></div>
    <p class="muted small">Ponha arquivos numa pasta do projeto (vídeos, fotos, PDFs…) e um agente processa <b>um por um</b> com a instrução que você escreveu. Quando todos terminam, o Code Room avisa.</p>${rows || '<p class="muted small">Nenhuma pasta de entrada ainda. Exemplo: 15 vídeos verticais para editar com uma skill.</p>'}</section>`;
}

export function folderJobDialogHtml(ctx) {
  const f = ctx.ui.fjForm || emptyJobForm(ctx.project), st = ctx.state, agents = st.agents, teams = st.teams;
  return `<div class="card-h"><h2 id="fj-title">${f.id ? 'Editar pasta de entrada' : 'Nova pasta de entrada'}</h2><button type="button" class="iconbtn" data-act="fj-close" aria-label="Fechar">×</button></div>
  <form id="fj-form" class="fj-form" autocomplete="off">
    <label class="f">Nome<input name="name" required maxlength="100" value="${esc(f.name)}" placeholder="ex.: Cortes verticais"></label>
    <label class="f">Projeto<select name="projectId" required>${st.projects.map(p => `<option value="${esc(p.id)}" ${p.id === f.projectId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
    <div class="form-grid"><label class="f">Pasta de entrada (dentro do projeto)<input name="dir" required maxlength="200" value="${esc(f.dir)}"><small class="muted">Se não existir, o Code Room cria.</small></label>
    <label class="f">Tipos de arquivo<input name="exts" maxlength="120" value="${esc(f.exts)}" placeholder="mp4, mov (vazio = todos)"></label></div>
    <label class="f">Quem processa cada arquivo<select name="who" required><option value="">Escolha…</option>${agents.map(a => `<option value="a:${esc(a.id)}" ${f.who === 'a:' + a.id ? 'selected' : ''}>${esc(a.name)} · ${esc(a.role)}</option>`).join('')}${teams.map(t => `<option value="t:${esc(t.id)}" ${f.who === 't:' + t.id ? 'selected' : ''}>Equipe ${esc(t.name)} (desenvolvedor → revisor)</option>`).join('')}</select></label>
    <label class="f">Instrução para cada arquivo<textarea name="instruction" rows="4" maxlength="3000" required>${esc(f.instruction)}</textarea><small class="muted"><code>{arquivo}</code> vira o caminho de cada arquivo. Cite a skill e onde salvar o resultado.</small></label>
    <div class="form-grid"><label class="f">Onde salvar (opcional, vai junto da instrução)<input name="outputNote" maxlength="300" value="${esc(f.outputNote)}" placeholder="ex.: pasta SAIDA/"></label>
    <label class="f">Quantos ao mesmo tempo<select name="parallel">${[1, 2, 3].map(n => `<option ${Number(f.parallel) === n ? 'selected' : ''}>${n}</option>`).join('')}</select><small class="muted">Cada um gasta a cota da IA. O limite geral de execuções também vale.</small></label></div>
    <div class="btn-row"><button class="btn" type="submit">${f.id ? 'Salvar' : 'Criar e começar a vigiar'}</button></div>
  </form>`;
}

// Faixa de aviso: lotes concluídos que você ainda não viu.
export function noticesBarHtml(ctx) {
  const n = (ctx.state.notices || []).slice(0, 3); if (!n.length) return '';
  return n.map(x => `<div class="update-bar notice-bar" role="status"><span><b>${esc(x.title)}.</b> ${esc(x.text)}</span><span class="grow"></span>${x.jobId ? `<button type="button" class="btn sm" data-act="notice-open" data-id="${esc(x.id)}" data-job="${esc(x.jobId)}">Ver</button>` : ''}<button type="button" class="btn ghost sm" data-act="notice-seen" data-id="${esc(x.id)}">Ok</button></div>`).join('');
}
