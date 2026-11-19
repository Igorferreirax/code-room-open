import test from 'node:test';
import assert from 'node:assert/strict';
import { issueUrl, contributeHtml, REPO, FIX_STEPS } from '../public/contribute-ui.js';

test('contribuir: o relato abre a página de nova issue do repositório público só com o texto da pessoa e a versão', () => {
  const u = new URL(issueUrl({ kind: 'bug', title: 'Terminal fecha', what: 'Ao dividir, fecha', steps: '1. abrir 2. dividir', version: '0.4.0' }));
  assert.equal(u.origin + u.pathname, `https://github.com/${REPO}/issues/new`);
  assert.equal(u.searchParams.get('title'), '[Falha] Terminal fecha'); assert.equal(u.searchParams.get('labels'), 'bug');
  assert.match(u.searchParams.get('body'), /Ao dividir, fecha[\s\S]*1\. abrir[\s\S]*Versão: 0\.4\.0/);
  assert.equal(new URL(issueUrl({ kind: 'idea', what: 'x' })).searchParams.get('labels'), 'ideia');
});

test('contribuir: a tela explica o caminho (relatar, corrigir no fork, propor, revisão do mantenedor) e escapa o rascunho', () => {
  const h = contributeHtml({ ui: { contrib: { title: '<b>x</b>' } } });
  assert.ok(!h.includes('<b>x</b>')); assert.match(h, /fork/); assert.match(h, /revisa/); assert.match(h, /data-act="contrib-open"/);
  assert.match(FIX_STEPS, /gh repo fork/); assert.match(FIX_STEPS, /gh pr create --repo/);
});
