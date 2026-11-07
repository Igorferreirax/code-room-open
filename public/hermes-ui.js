// Cartão "Hermes (servidor remoto)" em Conexões. Funções puras: recebem o estado de /api/hermes e devolvem HTML.
import { esc } from './views.js';

const SRC = { app: 'Configurado aqui no Code Room.', 'hermes.bat': 'Usando o seu arquivo hermes.bat (configuração antiga). Salve abaixo para passar a usar a configuração do app.' };

export function hermesCardHtml(ctx) {
  const h = ctx.hermes; if (!h) return '';
  const t = ctx.hermesTest;
  const test = t === 'busy' ? '<p class="small muted" role="status">Conectando ao servidor…</p>'
    : t ? (t.ok ? `<p class="small" role="status" style="color:var(--ok)">✅ Conectou. ${t.version ? `Hermes: ${esc(t.version)}.` : ''}</p>` : `<p class="upd-err small" role="alert">${esc(t.error || 'Não conectou.')}</p>`) : '';
  const sshWarn = h.sshInstalled ? '' : '<p class="upd-err small" role="alert">O SSH do Windows (Cliente OpenSSH) não está instalado. Ative em Configurações › Aplicativos › Recursos opcionais.</p>';
  return `<section class="card" style="margin-top:14px" id="hermes-card"><div class="card-h"><h2>Hermes Agent (servidor remoto)</h2><span class="pill ${h.configured ? 'ok' : 'mute'}"><span class="dot d-${h.configured ? 'ok' : 'idle'}"></span>${h.configured ? 'Configurado' : 'Não configurado'}</span></div>
    <p class="muted small">Roda o Hermes em um servidor seu (VPS) por SSH. Ele só lê e responde em texto, e não enxerga os arquivos deste computador. A chave privada fica só aqui: o Code Room guarda apenas o <b>caminho</b> dela, nunca o conteúdo. ${h.source ? esc(SRC[h.source] || '') : ''}</p>
    ${sshWarn}
    <form id="hermes-form" class="form-grid" autocomplete="off">
      <label class="f">Servidor<input id="hermes-host" value="${esc(h.host)}" placeholder="ubuntu@meu-servidor.com" maxlength="260" spellcheck="false"></label>
      <label class="f">Porta do SSH<input id="hermes-port" type="number" min="1" max="65535" value="${esc(h.port || 22)}"></label>
      <label class="f" style="grid-column:1/-1">Arquivo da chave privada<input id="hermes-key" value="${esc(h.key)}" placeholder="C:/Users/voce/.ssh/id_ed25519" maxlength="260" spellcheck="false"></label>
      <label class="f">Programa no servidor<input id="hermes-bin" value="${esc(h.bin || 'hermes')}" placeholder="hermes" maxlength="120" spellcheck="false"></label>
      <label class="f check" style="align-self:end"><input id="hermes-trust" type="checkbox" ${h.trustNew ? 'checked' : ''}> Confiar neste servidor na primeira conexão</label>
      <div class="btn-row" style="grid-column:1/-1"><button type="submit" class="btn">Salvar</button><button type="button" class="btn ghost" data-act="hermes-test" ${t === 'busy' ? 'disabled' : ''}>Testar a conexão</button>${h.source === 'app' ? '<button type="button" class="btn ghost" data-act="hermes-delete">Remover</button>' : ''}</div>
    </form>
    ${test}
    <p class="small muted">Dica: crie a chave com <code>ssh-keygen -t ed25519</code> e coloque o conteúdo do arquivo <code>.pub</code> em <code>~/.ssh/authorized_keys</code> no servidor. O teste só pede a versão do Hermes e não gasta cota de IA.</p></section>`;
}
