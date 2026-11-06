// Conectar outras IAs (Gemini CLI, OpenCode, Aider…) ou uma própria. Funções puras: recebem o estado de /api/providers e devolvem HTML.
import { esc } from './views.js';

export const emptyForm = () => ({ id: '', name: '', exe: '', promptVia: 'arg', argsText: '', modelFlag: '' });
// "-p {prompt}" -> ['-p', '{prompt}'] (respeita aspas simples e duplas)
export function splitArgs(text) {
  const out = []; const re = /"([^"]*)"|'([^']*)'|(\S+)/g; let m; while ((m = re.exec(String(text || '')))) out.push(m[1] ?? m[2] ?? m[3]); return out;
}
export const joinArgs = args => (args || []).map(a => /\s/.test(a) ? `"${a}"` : a).join(' ');
export const formFromCatalog = c => ({ id: '', name: c.name, exe: c.exe, promptVia: c.promptVia, argsText: joinArgs(c.args), modelFlag: c.modelFlag || '' });
export const formFromSpec = s => ({ id: s.id, name: s.name, exe: s.exe, promptVia: s.promptVia, argsText: joinArgs(s.args), modelFlag: s.modelFlag || '' });
export const payloadFromForm = f => ({ ...(f.id ? { id: f.id } : {}), name: f.name.trim(), exe: f.exe.trim(), promptVia: f.promptVia, args: splitArgs(f.argsText), modelFlag: f.modelFlag.trim() });

// Cartão em Conexões: as IAs próprias e o botão para conectar outra.
export function providersCardHtml(ctx) {
  const p = ctx.providers, list = p?.custom || [];
  const rows = list.map(s => `<div class="prov-row"><span class="dot d-${s.installed ? 'ok' : s.unsupported ? 'warn' : 'bad'}"></span><div class="grow"><b>${esc(s.name)}</b> <small class="muted">${esc(s.exe)}</small><br><small class="muted">${s.installed ? 'Programa encontrado.' : s.unsupported ? esc(s.unsupported) : 'Programa não encontrado neste computador.'}${s.usedBy ? ` · ${s.usedBy} agente(s) usam` : ''}</small></div>
    <button type="button" class="btn ghost sm" data-act="prov-test" data-id="${esc(s.id)}">Testar</button><button type="button" class="btn ghost sm" data-act="prov-edit" data-id="${esc(s.id)}">Editar</button><button type="button" class="btn ghost sm" data-act="prov-delete" data-id="${esc(s.id)}">Remover</button></div>${ctx.ui.provTest?.[s.id] ? testResultHtml(ctx.ui.provTest[s.id]) : ''}`).join('');
  return `<section class="card prov-card"><div class="card-h"><h2>Outras IAs</h2><button type="button" class="btn sm" data-act="prov-open">+ Conectar outra IA</button></div>
    <p class="muted small">Além de Codex, Claude Code e Antigravity, conecte qualquer IA de terminal que você já usa (Gemini CLI, OpenCode, Aider…). Você escolhe da lista ou descreve a sua; o Code Room não guarda senhas: o login continua no próprio programa.</p>
    ${rows || '<p class="muted small">Nenhuma IA extra conectada ainda.</p>'}</section>`;
}

export function testResultHtml(r) {
  if (r.running) return '<p class="small muted prov-test" role="status">Testando… (a IA pode levar até um minuto)</p>';
  return r.ok ? `<p class="small prov-test upd-ok" role="status">✔ Respondeu em ${Math.round((r.ms || 0) / 100) / 10} s: “${esc(String(r.output || '').slice(0, 160))}”</p>` : `<p class="small prov-test upd-err" role="alert">Não funcionou: ${esc(r.error || 'sem resposta')}${r.output ? ` <br><span class="muted">${esc(String(r.output).slice(0, 200))}</span>` : ''}</p>`;
}

// Janela: catálogo + formulário.
export function providerDialogHtml(ctx) {
  const p = ctx.providers, f = ctx.ui.provForm || emptyForm();
  const cat = (p?.catalog || []).map(c => `<button type="button" class="prov-pick ${f.exe === c.exe && !f.id ? 'on' : ''}" data-act="prov-pick" data-id="${esc(c.key)}"><b>${esc(c.name)}</b><small class="${c.installed ? 'ok-t' : 'muted'}">${c.installed ? (c.supported ? 'Instalada neste computador' : 'Instalada, mas é um atalho .cmd não suportado') : 'Não instalada'}${c.added ? ' · já conectada' : ''}</small></button>`).join('');
  const picked = (p?.catalog || []).find(c => c.exe === f.exe);
  const help = picked ? `<div class="prov-help"><p class="small"><b>Instalar:</b> <code>${esc(picked.install)}</code> <button type="button" class="linkbtn" data-act="copy" data-id="${esc(picked.install)}">copiar</button></p><p class="small"><b>Entrar:</b> ${esc(picked.login)}</p></div>` : '';
  const t = ctx.ui.provTest?.['form'];
  return `<div class="card-h"><h2 id="prov-title">${f.id ? 'Editar IA' : 'Conectar outra IA'}</h2><button type="button" class="iconbtn" data-act="prov-close" aria-label="Fechar">×</button></div>
  <p class="small muted">Escolha uma da lista para preencher sozinho, ou descreva a sua. As opções mudam entre versões dos programas: use <b>Testar</b> antes de salvar.</p>
  <div class="prov-grid">${cat}</div>${help}
  <form id="prov-form" class="prov-form" autocomplete="off">
    <label class="f">Nome que vai aparecer<input name="name" maxlength="60" required value="${esc(f.name)}" placeholder="ex.: Gemini CLI"></label>
    <label class="f">Programa (nome do comando ou caminho do .exe)<input name="exe" maxlength="500" required value="${esc(f.exe)}" placeholder="ex.: gemini"></label>
    <label class="f">Como enviar o pedido<select name="promptVia"><option value="arg" ${f.promptVia === 'arg' ? 'selected' : ''}>Por argumento (use {prompt} abaixo)</option><option value="stdin" ${f.promptVia === 'stdin' ? 'selected' : ''}>Pela entrada padrão (stdin)</option></select></label>
    <label class="f">Argumentos<input name="argsText" maxlength="600" value="${esc(f.argsText)}" placeholder="ex.: -p {prompt}"><small class="muted">{prompt} vira o pedido, exatamente como foi escrito (sem shell, sem risco de injeção).</small></label>
    <label class="f">Opção de modelo (opcional)<input name="modelFlag" maxlength="32" value="${esc(f.modelFlag)}" placeholder="ex.: --model"></label>
    <p class="small muted">Atenção: nessas IAs o Code Room <b>não consegue impedir</b> que mexam em arquivos mesmo em “somente leitura”. Ele confere os arquivos depois e avisa.</p>
    ${t ? testResultHtml(t) : ''}
    <div class="btn-row"><button type="button" class="btn ghost" data-act="prov-test-form">Testar</button><button class="btn" type="submit">${f.id ? 'Salvar alterações' : 'Conectar'}</button></div>
  </form>`;
}
