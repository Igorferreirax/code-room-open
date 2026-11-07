import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mascot, MOODS } from '../public/mascot.js';

const css = readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');

test('mascote: a cor dos olhos vem do humor (currentColor), sem cor fixa no desenho, e a antena é estilizável', () => {
  for (const mood of Object.keys(MOODS)) {
    const svg = mascot(mood, 40);
    assert.ok(svg.includes(`mc-${mood}`), `${mood}: classe do humor`); assert.ok(svg.includes('currentColor'), `${mood}: olhos usam currentColor`);
    assert.ok(!svg.includes('#59e0ff'), `${mood}: sem ciano fixo no desenho`); assert.ok(svg.includes('class="mc-ant"'), `${mood}: antena com classe`);
    assert.match(svg, /aria-label="Assistente: /, `${mood}: continua acessível`);
  }
});

test('mascote: alerta fica amarelo, falha vermelha, novidade verde e dormindo apagado; o ícone do chat não tem mais círculo', () => {
  assert.match(css, /\.mc-alerta\{color:#f5b73b/); assert.match(css, /\.mc-preocupado\{color:#ef5b5b/); assert.match(css, /\.mc-surpreso\{color:#2dd4a0/); assert.match(css, /\.mc-dormindo\{color:#6b7fa6/);
  assert.match(css, /\.chat-bubble\{background:none;border:0;box-shadow:none;border-radius:0/, 'sem círculo em volta do mascote');
  assert.match(css, /\.cb-face,\.cb-face\[data-mood\]\{box-shadow:none/, 'sem anel colorido: a cor é do próprio mascote');
  assert.match(css, /\.main \.foot\{padding-right:96px\}/, 'o rodapé deixa espaço: o "Desenvolvido por" nunca fica coberto');
});
