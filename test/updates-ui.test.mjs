import test from 'node:test';
import assert from 'node:assert/strict';
import { updateBarHtml, updateDialogHtml, updatesSettingsHtml } from '../public/updates-ui.js';

const base = { enabled: true, current: '0.2.0', checkedAt: 1762500000000, error: null, hasUpdate: true, dismissed: false, canInstall: true, repo: 'dono/code-room',
  latest: { version: '0.3.0', name: 'Code Room 0.3.0', notes: 'Novidade 1\nNovidade 2', url: 'https://github.com/dono/code-room/releases/tag/v0.3.0', publishedAt: '2026-11-07T10:00:00Z', zip: { name: 'Code-Room-0.3.0-portatil-win-x64.zip', size: 41943040 }, hasSums: true },
  download: { state: 'idle' } };
const ctx = (u = {}, d) => ({ updates: { ...base, ...u, download: d || base.download } });

test('faixa: aparece só com versão nova, ligada e não adiada', () => {
  assert.match(updateBarHtml(ctx()), /Nova versão 0\.3\.0/); assert.match(updateBarHtml(ctx()), /você usa 0\.2\.0/); assert.match(updateBarHtml(ctx()), /data-act="upd-open"/); assert.match(updateBarHtml(ctx()), /data-act="upd-later"/);
  for (const o of [{ hasUpdate: false }, { dismissed: true }, { enabled: false }, { latest: null }]) assert.equal(updateBarHtml(ctx(o)), '', JSON.stringify(o));
  assert.equal(updateBarHtml({}), ''); assert.equal(updateBarHtml({ updates: null }), '');
});

test('janela: cada etapa mostra o botão certo (baixar → progresso → conferido → instalar → instalando)', () => {
  const idle = updateDialogHtml(ctx()); assert.match(idle, /Baixar e conferir \(40,0 MB\)/); assert.doesNotMatch(idle, /upd-install/); assert.match(idle, /Novidade 1/); assert.match(idle, /releases\/tag\/v0\.3\.0/);
  assert.match(updateDialogHtml(ctx({}, { state: 'downloading', received: 10485760, total: 41943040 })), /Baixando… 10,0 MB de 40,0 MB[\s\S]*<progress max="100" value="25">/);
  const ready = updateDialogHtml(ctx({}, { state: 'ready', sha256: 'ab'.repeat(32) })); assert.match(ready, /SHA-256 bate/); assert.match(ready, /abababababababab…/); assert.match(ready, /data-act="upd-install">Instalar e reiniciar/); assert.match(ready, /volta para a atual automaticamente/);
  const src = updateDialogHtml(ctx({ canInstall: false }, { state: 'ready', sha256: 'ab'.repeat(32) })); assert.doesNotMatch(src, /upd-install/); assert.match(src, /git pull/);
  const err = updateDialogHtml(ctx({}, { state: 'error', error: 'O arquivo baixado NÃO confere' })); assert.match(err, /role="alert"[^>]*>O arquivo baixado NÃO confere/); assert.match(err, /Tentar de novo/);
  const inst = updateDialogHtml(ctx({}, { state: 'installing' })); assert.match(inst, /Atualizando…/); assert.doesNotMatch(inst, /upd-close/, 'não dá para fechar durante a instalação'); assert.doesNotMatch(inst, /upd-install|upd-download/);
});

test('janela: Release sem pacote ou sem SHA256SUMS não oferece baixar aqui', () => {
  const l = { ...base.latest, hasSums: false }; const html = updateDialogHtml({ updates: { ...base, latest: l } }); assert.doesNotMatch(html, /upd-download/); assert.match(html, /não dá para conferir o arquivo/);
  assert.doesNotMatch(updateDialogHtml({ updates: { ...base, latest: { ...base.latest, zip: null } } }), /upd-download/);
});

test('segurança: notas, nome e link do Release são escapados (nada de HTML ou script vindo da internet)', () => {
  const evil = { ...base.latest, name: '<img src=x onerror=alert(1)>', notes: '<script>alert(1)</script>', url: 'https://x.test/"><script>alert(2)</script>' };
  const html = updateDialogHtml({ updates: { ...base, latest: evil } });
  assert.doesNotMatch(html, /<script>|<img src=x/); assert.match(html, /&lt;script&gt;alert\(1\)/); assert.doesNotMatch(html, /href="https:\/\/x\.test\/"><script/);
  assert.doesNotMatch(updatesSettingsHtml({ updates: { ...base, error: '<b>x</b>' } }), /<b>x<\/b>/);
});

test('Configurações › Atualizações: versão, última verificação, interruptor e aviso de privacidade', () => {
  const on = updatesSettingsHtml(ctx()); assert.match(on, /Versão instalada<\/dt><dd>0\.2\.0/); assert.match(on, /Verificação automática<\/dt><dd>ligada/); assert.match(on, /Versão 0\.3\.0 disponível/); assert.match(on, /Verificar agora/); assert.match(on, /Desligar a verificação automática/);
  assert.match(on, /nenhum dado seu, projeto ou chave é enviado/); assert.match(on, /dono\/code-room/);
  const off = updatesSettingsHtml(ctx({ enabled: false, hasUpdate: false })); assert.match(off, /desligada/); assert.match(off, /Verificar uma vez/); assert.match(off, /Ligar a verificação automática/); assert.doesNotMatch(off, /Você está na versão mais recente/);
  assert.match(updatesSettingsHtml(ctx({ hasUpdate: false, latest: null })), /Você está na versão mais recente/);
  assert.match(updatesSettingsHtml(ctx({ error: 'Não foi possível consultar as atualizações agora.' })), /role="alert"/);
  assert.match(updatesSettingsHtml(ctx({ checkedAt: null, hasUpdate: false, latest: null })), /Última verificação<\/dt><dd>nunca/);
  assert.match(updatesSettingsHtml({}), /Carregando/);
});
