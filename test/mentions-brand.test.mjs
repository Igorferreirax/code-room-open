import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { fold, extractProject, projectToken } from '../public/mentions.js';

const P = [{ id: 'p1', name: 'Canal YouTube' }, { id: 'p2', name: 'Documentário' }, { id: 'p3', name: 'Canal Cortes' }, { id: 'ix', name: 'Interno', internal: true }];

test('menção de projeto (#): nome com _ ou -, sem acento, em qualquer parte do texto; o # sem projeto fica no texto', () => {
  assert.equal(fold('Documentário Épico'), 'documentario-epico'); assert.equal(projectToken('Canal YouTube'), '#Canal_YouTube');
  let r = extractProject('traga ideias de vídeo #Canal_YouTube para esta semana', P); assert.equal(r.project.id, 'p1'); assert.equal(r.text, 'traga ideias de vídeo para esta semana');
  r = extractProject('#documentario revise o roteiro', P); assert.equal(r.project.id, 'p2'); assert.equal(r.text, 'revise o roteiro', 'sem acento e em minúsculas também vale');
  r = extractProject('use a hashtag #lancamento no post', P); assert.equal(r.project, null); assert.equal(r.text, 'use a hashtag #lancamento no post', 'hashtag comum não some');
  r = extractProject('ideias #Canal', P); assert.equal(r.project, null); assert.equal(r.ambiguous, true, 'prefixo que casa com dois projetos pede o nome inteiro');
  r = extractProject('ideias #Canal_Y', P); assert.equal(r.project.id, 'p1', 'prefixo único serve');
  assert.equal(extractProject('x #Interno', P).project, null, 'projeto interno do Assistente nunca é alvo'); assert.equal(extractProject('', P).text, ''); assert.equal(extractProject('#Documentário', []).project, null);
});

test('marca padronizada (0.3.4): logo pixel nova no app, na landing e no instalador', () => {
  const root = fileURLToPath(new URL('..', import.meta.url)), land = fileURLToPath(new URL('../../Code Room Landing/', import.meta.url)), sha = f => createHash('sha256').update(readFileSync(f)).digest('hex');
  const views = readFileSync(root + 'public/views.js', 'utf8'); assert.equal((views.match(/<span class="brand-name">Code <b>Room<\/b><\/span>/g) || []).length, 1, 'o topo usa o nome em texto ao lado do ícone'); assert.match(views, /class="brand-wordmark" src="\/assets\/logo-wide\.png(\?v=[\w.]+)?" alt="Code Room"/, 'o login usa a logo horizontal com texto alternativo'); assert.ok(!/logo\(|wordmark\(|catLogo/.test(views));
  for (const f of ['favicon.png', 'icon-256.png', 'icon-512.png', 'logo-wide.png', 'home-banner.webp', 'ai-antigravity.png']) assert.ok(existsSync(root + 'public/assets/' + f), `${f} existe`);
  for (const f of ['brand.js']) assert.ok(!existsSync(root + 'public/' + f), `${f} (marca antiga) foi removido`);
  assert.ok(existsSync(root + 'installer/code-room.ico') && existsSync(root + 'installer/code-room.png') && existsSync(root + 'installer/wizard/selo-110.bmp'), 'ícone e selo do instalador existem');
  assert.match(readFileSync(root + 'public/index.html', 'utf8'), /href="\/assets\/favicon\.png(\?v=[\w.]+)?"/);
  if (existsSync(land + 'index.html')) {
    const html = readFileSync(land + 'index.html', 'utf8'); assert.ok(!html.includes('class="mark"'), 'landing sem o quadradinho pixel antigo'); assert.match(html, /rel="icon" type="image\/png" href="assets\/marca\/favicon\.png"/); assert.ok((html.match(/Code <b>Room<\/b>/g) || []).length >= 2, 'topo e rodapé com o nome em texto');
    assert.equal(sha(land + 'assets/marca/favicon.png'), sha(root + 'public/assets/favicon.png'), 'o favicon da landing é o mesmo do app');
  }
});
