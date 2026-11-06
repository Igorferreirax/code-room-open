// Atualização do Code Room: faixa de aviso, janela "Atualizar" e cartão em Configurações. Funções puras (testáveis sem navegador).
import { esc } from './views.js';

const mb = n => n == null ? '' : (n / 1048576).toFixed(1).replace('.', ',') + ' MB';
const when = t => t ? new Date(t).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'nunca';

// Faixa no topo: só aparece com versão nova que o dono ainda não adiou.
export function updateBarHtml(ctx) {
  const u = ctx.updates; if (!u?.enabled || !u.hasUpdate || u.dismissed || !u.latest) return '';
  return `<div class="update-bar" role="status"><span><b>Nova versão ${esc(u.latest.version)}</b> disponível (você usa ${esc(u.current)}).</span>
    <span class="grow"></span><button type="button" class="btn sm" data-act="upd-open">Ver novidades e atualizar</button><button type="button" class="btn ghost sm" data-act="upd-later">Depois</button></div>`;
}

// Janela com as novidades e os passos: baixar e conferir (SHA-256) -> instalar.
export function updateDialogHtml(ctx) {
  const u = ctx.updates; if (!u?.latest) return '';
  const l = u.latest, d = u.download || { state: 'idle' }, link = l.url ? `<a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">Abrir a página do Release</a>` : '';
  let action = '', status = '';
  if (d.state === 'installing') { status = '<p class="upd-busy" role="status"><b>Atualizando…</b> O Code Room vai fechar e abrir sozinho em cerca de 30 segundos. Não feche esta janela. Seus projetos e agentes não são tocados.</p>'; }
  else if (d.state === 'downloading') { const pct = d.total ? Math.min(100, Math.round(100 * d.received / d.total)) : null; status = `<p role="status">Baixando… ${mb(d.received)}${d.total ? ' de ' + mb(d.total) : ''}</p><progress max="100" ${pct != null ? `value="${pct}"` : ''}></progress>`; }
  else if (d.state === 'ready') {
    status = `<p class="upd-ok" role="status">✔ Arquivo conferido: o SHA-256 bate com o publicado no Release (<code>${esc(String(d.sha256 || '').slice(0, 16))}…</code>).</p>`;
    action = u.canInstall
      ? `<button type="button" class="btn" data-act="upd-install">Instalar e reiniciar</button><p class="small muted">O Code Room fecha, troca a versão e abre sozinho. Seus dados ficam como estão. Se a versão nova não abrir, ele volta para a atual automaticamente.</p>`
      : '<p class="small muted">Esta cópia roda pelo código-fonte: atualize com <code>git pull</code>. A instalação em um clique vale para o pacote do Windows.</p>';
  } else {
    if (d.state === 'error') status = `<p class="upd-err" role="alert">${esc(d.error || 'Não foi possível baixar.')}</p>`;
    action = l.zip && l.hasSums
      ? `<button type="button" class="btn" data-act="upd-download">${d.state === 'error' ? 'Tentar de novo' : `Baixar e conferir${l.zip.size ? ' (' + mb(l.zip.size) + ')' : ''}`}</button>`
      : '<p class="small muted">Este Release não traz o pacote portátil com o SHA256SUMS.txt, então não dá para conferir o arquivo aqui. Baixe pela página do Release.</p>';
  }
  const busy = d.state === 'installing';
  return `<div class="card-h"><h2 id="upd-title">${esc(l.name)}</h2>${busy ? '' : '<button type="button" class="iconbtn" data-act="upd-close" aria-label="Fechar">×</button>'}</div>
    <p class="small muted">Você usa a versão ${esc(u.current)}. A nova é a ${esc(l.version)}${l.publishedAt ? ', publicada em ' + esc(when(l.publishedAt)) : ''}.</p>
    ${l.notes ? `<h3 style="margin:12px 0 6px">Novidades</h3><pre class="upd-notes">${esc(l.notes)}</pre>` : ''}
    ${status}<div class="btn-row">${action}${busy ? '' : '<span class="grow"></span>' + link}</div>`;
}

// Cartão em Configurações › Atualizações.
export function updatesSettingsHtml(ctx) {
  const u = ctx.updates;
  if (!u) return '<h2 style="font-size:1.5rem">Atualizações</h2><p class="muted">Carregando…</p>';
  const has = u.hasUpdate && u.latest;
  return `<h2 style="font-size:1.5rem">Atualizações</h2><p class="muted">Versão e novidades do Code Room.</p>
  <section class="card" style="margin-top:14px"><dl class="kv"><dt>Versão instalada</dt><dd>${esc(u.current)}</dd><dt>Última verificação</dt><dd>${esc(when(u.checkedAt))}</dd><dt>Verificação automática</dt><dd>${u.enabled ? 'ligada' : 'desligada'}</dd></dl>
    ${has ? `<p class="upd-ok" style="margin:12px 0"><b>Versão ${esc(u.latest.version)} disponível.</b> <button type="button" class="btn sm" data-act="upd-open">Ver novidades e atualizar</button></p>` : u.enabled && u.checkedAt && !u.error ? '<p class="small muted" style="margin:12px 0">Você está na versão mais recente.</p>' : ''}
    ${u.error ? `<p class="upd-err" role="alert" style="margin:12px 0">${esc(u.error)}</p>` : ''}
    <div class="btn-row"><button type="button" class="btn ghost" data-act="upd-check">${u.enabled ? 'Verificar agora' : 'Verificar uma vez'}</button><button type="button" class="btn ghost" data-act="upd-toggle">${u.enabled ? 'Desligar a verificação automática' : 'Ligar a verificação automática'}</button></div>
    <p class="small muted" style="margin-top:12px">A verificação consulta o GitHub (${esc(u.repo)}), ao abrir e a cada 12 horas. Vai só um pedido simples (seu endereço de rede e o nome do app); nenhum dado seu, projeto ou chave é enviado. Nada é instalado sem você clicar em Atualizar, e o arquivo só é aceito se o SHA-256 bater com o publicado.</p></section>`;
}
