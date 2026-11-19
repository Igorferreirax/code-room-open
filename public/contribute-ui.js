// Configurações › Contribuir: o Code Room é código aberto (MIT). Quem usa pode relatar falhas e ideias e, se quiser,
// corrigir com a própria IA numa cópia (fork) e mandar a proposta. O mantenedor revisa antes de qualquer versão sair.
// Nada vai ao GitHub sem a pessoa clicar: o relato abre a página do GitHub já preenchida, e ela envia de lá.
export const REPO = 'Igorferreirax/code-room-open';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const FIX_STEPS = `gh repo fork ${REPO} --clone
cd code-room-open
git switch -c minha-correcao
# cadastre a pasta como projeto no Code Room e peça a correção ao seu agente
npm test && npm run audit && npm run check
gh pr create --repo ${REPO} --fill`;

// Texto da issue: só o que a pessoa escreveu + versão e sistema. Sem caminhos, chaves ou dados de projetos.
export function issueUrl({ kind = 'bug', title = '', what = '', steps = '', version = '' } = {}) {
  const bug = kind === 'bug', clean = s => String(s || '').trim().slice(0, 4000);
  const body = bug
    ? `**O que aconteceu**\n${clean(what) || '(descreva)'}\n\n**Como repetir**\n${clean(steps) || '(passo a passo)'}\n\n**O que era esperado**\n\n\n---\nVersão: ${version || '?'} · Windows`
    : `**A ideia**\n${clean(what) || '(descreva)'}\n\n**Por que ajudaria**\n${clean(steps) || ''}\n\n---\nVersão: ${version || '?'}`;
  const q = new URLSearchParams({ title: (bug ? '[Falha] ' : '[Ideia] ') + (clean(title).slice(0, 120) || (bug ? 'Algo não funcionou' : 'Sugestão')), body, labels: bug ? 'bug' : 'ideia' });
  return `https://github.com/${REPO}/issues/new?${q}`;
}

export function contributeHtml(ctx) {
  const c = ctx.ui.contrib || {}, kind = c.kind || 'bug';
  return `<h2 style="font-size:1.5rem">Contribuir</h2><p class="muted">O Code Room é código aberto (licença MIT). Qualquer pessoa pode relatar falhas, sugerir ideias e mandar correções; cada proposta é revisada pelo mantenedor antes de entrar numa versão.</p>
  <section class="card" style="margin-top:14px"><h2>Como funciona</h2>
    <ol class="contrib-steps"><li><b>Relatar</b><span>Você descreve a falha ou a ideia aqui e abre a página do GitHub já preenchida.</span></li><li><b>Corrigir (opcional)</b><span>A sua IA corrige numa cópia sua do projeto (fork), sem mexer na instalação que você usa.</span></li><li><b>Propor</b><span>Você envia a proposta (pull request). O mantenedor revisa, testa e decide.</span></li><li><b>Entrar no projeto</b><span>Aprovada, a mudança vai para a próxima versão e você aparece como contribuidor no GitHub.</span></li></ol>
  </section>
  <section class="card" style="margin-top:14px"><h2>Relatar falha ou ideia</h2>
    <div class="seg" role="radiogroup" aria-label="Tipo"><button type="button" role="radio" aria-checked="${kind === 'bug'}" class="${kind === 'bug' ? 'on' : ''}" data-act="contrib-kind" data-id="bug">Falha</button><button type="button" role="radio" aria-checked="${kind === 'idea'}" class="${kind === 'idea' ? 'on' : ''}" data-act="contrib-kind" data-id="idea">Ideia</button></div>
    <label class="f" style="margin-top:10px">Título<input id="contrib-title" maxlength="120" value="${esc(c.title || '')}" placeholder="${kind === 'bug' ? 'Ex.: o terminal fecha ao dividir a tela' : 'Ex.: aprovar pelo Telegram'}"></label>
    <label class="f">${kind === 'bug' ? 'O que aconteceu' : 'A ideia'}<textarea id="contrib-what" rows="3" maxlength="4000">${esc(c.what || '')}</textarea></label>
    <label class="f">${kind === 'bug' ? 'Como repetir (passo a passo)' : 'Por que ajudaria'}<textarea id="contrib-steps" rows="3" maxlength="4000">${esc(c.steps || '')}</textarea></label>
    <p class="muted small">Não inclua chaves, senhas, caminhos pessoais nem dados dos seus projetos. O botão abre o GitHub com este texto; você confere e envia de lá (precisa de conta no GitHub).</p>
    <div class="btn-row"><button type="button" class="btn" data-act="contrib-open">Abrir no GitHub</button><button type="button" class="btn ghost" data-act="contrib-ask-nico">Pedir ajuda ao Nico para escrever</button></div>
  </section>
  <section class="card" style="margin-top:14px"><h2>Corrigir com a sua IA</h2><p class="muted small">Precisa do Git e do GitHub CLI (<code>gh</code>) logado na sua conta. Os comandos abaixo criam a sua cópia, uma branch e mandam a proposta. Rode no terminal do Code Room ou peça ao Nico para ir junto com você.</p>
    <pre class="contrib-cmd">${esc(FIX_STEPS)}</pre>
    <div class="btn-row"><button type="button" class="btn ghost sm" data-act="contrib-copy">Copiar comandos</button><button type="button" class="btn ghost sm" data-act="term-menu">Abrir terminal</button></div>
  </section>`;
}
