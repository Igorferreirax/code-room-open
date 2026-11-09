// Versionamento (Git/GitHub) no painel do projeto. Funções puras: recebem o estado de /api/projects/:id/git e /github e devolvem HTML.
// Só mostra e, quando a pessoa pede, faz commits locais dos arquivos de uma entrega. Nunca faz push.
import { esc } from './views.js';

const ago = at => { const s = (Date.now() - Date.parse(at)) / 1000; if (!(s >= 0)) return ''; if (s < 90) return 'agora'; if (s < 3600) return `há ${Math.round(s / 60)} min`; if (s < 86400) return `há ${Math.round(s / 3600)} h`; return `há ${Math.round(s / 86400)} d`; };
const STATE = { '??': 'novo', M: 'alterado', A: 'novo', D: 'apagado', R: 'renomeado' };

export function gitSectionHtml(ctx) {
  const g = ctx.gitInfo, gh = ctx.githubInfo; if (!g) return '<h3 style="margin-top:18px">Versionamento (Git)</h3><p class="muted small">Carregando…</p>';
  const head = '<h3 style="margin-top:18px">Versionamento (Git)</h3>';
  if (g.available === false) return `${head}<p class="muted small">O Git não está instalado neste computador. Instale em git-scm.com para acompanhar os commits do projeto aqui.</p>`;
  if (!g.repo) return `${head}<p class="muted small">${g.parent ? 'Esta pasta está dentro de um repositório Git maior; o Code Room só acompanha repositórios que começam na pasta do projeto.' : 'Esta pasta ainda não é um repositório Git.'}</p>${g.parent ? '' : '<div class="btn-row"><button type="button" class="btn ghost sm" data-act="git-init">Iniciar o Git neste projeto</button></div><p class="muted small">Cria só a pasta oculta .git, sem enviar nada para lugar nenhum.</p>'}`;
  const sync = g.ahead == null ? '' : `${g.ahead ? ` · ${g.ahead} a enviar` : ''}${g.behind ? ` · ${g.behind} a receber` : ''}`;
  const remote = g.remote ? (g.remote.web ? `<a href="${esc(g.remote.web)}" target="_blank" rel="noopener">${esc(g.remote.web.replace('https://', ''))}</a>` : `<code>${esc(g.remote.url)}</code>`) : '<span class="muted">sem remoto (só local)</span>';
  const commits = g.commits.length ? `<ul class="plain git-log">${g.commits.slice(0, 10).map(c => `<li><code>${esc(c.hash)}</code> ${esc(c.subject)} <small class="muted">${esc(c.author)} · ${esc(ago(c.at))}</small></li>`).join('')}</ul>` : '<p class="muted small">Ainda sem commits.</p>';
  const files = g.dirty ? `<details class="batch-new"><summary>${g.dirty} alteraç${g.dirty === 1 ? 'ão' : 'ões'} ainda sem commit</summary><ul class="plain">${g.files.map(f => `<li><small class="muted">${esc(STATE[f.state] || f.state)}</small> <code>${esc(f.path)}</code></li>`).join('')}${g.dirty > g.files.length ? `<li class="muted small">e mais ${g.dirty - g.files.length}…</li>` : ''}</ul></details>` : '<p class="muted small">Tudo commitado.</p>';
  const hub = !gh ? '' : gh.available === false ? `<p class="muted small">GitHub: ${esc(gh.reason || 'indisponível')}</p>`
    : `${gh.prs.length ? `<h4 class="small" style="margin:10px 0 2px">Pull requests abertos</h4><ul class="plain">${gh.prs.map(p => `<li><a href="${esc(p.url)}" target="_blank" rel="noopener">#${esc(p.number)} ${esc(p.title)}</a> <small class="muted">${esc(p.branch)}</small></li>`).join('')}</ul>` : '<p class="muted small">Nenhum pull request aberto.</p>'}${gh.runs.length ? `<h4 class="small" style="margin:10px 0 2px">Últimas verificações</h4><ul class="plain">${gh.runs.map(r => `<li><span class="dot d-${r.conclusion === 'success' ? 'ok' : r.conclusion === 'failure' ? 'bad' : 'warn'}"></span> <a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.name)}</a> <small class="muted">${esc(r.branch)} · ${esc(r.conclusion || r.status)}</small></li>`).join('')}</ul>` : ''}`;
  return `${head}<p class="small"><b>${esc(g.branch || '(sem branch)')}</b>${esc(sync)} · ${remote}</p>${files}${commits}${hub}
    <label class="f check" style="margin-top:8px"><input id="git-auto" type="checkbox" ${g.config?.autoCommit ? 'checked' : ''}> Commitar automaticamente quando eu aprovar uma entrega</label>
    <p class="muted small">O commit é local e só leva os arquivos da entrega. O Code Room nunca envia (push) nada sozinho.</p>
    <div class="btn-row"><button type="button" class="btn ghost sm" data-act="git-refresh">Atualizar</button></div>`;
}
