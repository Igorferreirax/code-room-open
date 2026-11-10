import test from 'node:test';
import assert from 'node:assert/strict';
import { setupHtml } from '../public/onboarding.js';
import { updatesSettingsHtml } from '../public/updates-ui.js';

const setupCtx = name => ({ ui: { onb: { mode: 'setup' } }, prefs: { displayName: name }, checks: [], state: { agents: [], teams: [] } });

test('primeiro acesso pede um nome opcional e protege o texto no HTML', () => {
  const html = setupHtml(setupCtx('<Igor>'));
  assert.match(html, /Olá, &lt;Igor&gt;! Este é o seu Workspace/);
  assert.match(html, /id="workspace-name" maxlength="40"/);
  assert.match(html, /data-act="onb-name-save"/);
  assert.match(html, /não é enviado aos agentes/);
});

test('Configurações deixam claro quando há atualização e oferecem a ação', () => {
  const html = updatesSettingsHtml({ updates: { current: '0.3.2', checkedAt: '2026-11-09T10:00:00.000Z', enabled: true, hasUpdate: true, latest: { version: '0.3.3' } } });
  assert.match(html, /Uma atualização está pronta/);
  assert.match(html, /0\.3\.3/);
  assert.match(html, /data-act="upd-open"/);
  assert.match(html, /Verificar agora/);
});
