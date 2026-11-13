import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const pub = f => new URL(`../public/${f}`, import.meta.url);
const pngSize = f => { const b = readFileSync(pub(f)); assert.equal(b.subarray(1, 4).toString(), 'PNG', `${f} não é PNG`); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

test('janela de app: o manifesto é válido e os ícones existem com o tamanho declarado', () => {
  const m = JSON.parse(readFileSync(pub('manifest.webmanifest'), 'utf8'));
  assert.equal(m.name, 'Code Room'); assert.equal(m.display, 'standalone'); assert.equal(m.start_url, '/');
  assert.match(m.theme_color, /^#[0-9a-f]{6}$/i); assert.match(m.background_color, /^#[0-9a-f]{6}$/i);
  assert.ok(m.icons.length >= 2);
  for (const i of m.icons) { const [w, h] = pngSize(i.src.slice(1)); assert.equal(`${w}x${h}`, i.sizes, `${i.src} declara ${i.sizes} mas tem ${w}x${h}`); }
  assert.ok(m.icons.some(i => i.sizes === '256x256') && m.icons.some(i => i.sizes === '512x512'));
});

test('janela de app: o index liga o manifesto e o ícone grande; o servidor entrega o manifesto com o tipo certo', () => {
  const html = readFileSync(pub('index.html'), 'utf8');
  assert.match(html, /rel="manifest" href="\/manifest\.webmanifest(\?v=[\w.]+)?"/); assert.match(html, /sizes="256x256" href="\/assets\/icon-256\.png(\?v=[\w.]+)?"/); assert.match(html, /name="theme-color"/);
  const srv = readFileSync(new URL('../server/main.mjs', import.meta.url), 'utf8');
  assert.match(srv, /url\.pathname === '\/manifest\.webmanifest'[\s\S]{0,160}application\/manifest\+json/);
});

test('rádio: animações WebP do player existem e são servidas com MIME correto', () => {
  for (const name of ['radio-tocando.webp', 'radio-volume.webp', 'radio-next.webp']) {
    const b = readFileSync(pub(`assets/${name}`)); assert.equal(b.toString('ascii', 0, 4), 'RIFF'); assert.equal(b.toString('ascii', 8, 12), 'WEBP');
  }
  const html = readFileSync(pub('index.html'), 'utf8'), srv = readFileSync(new URL('../server/main.mjs', import.meta.url), 'utf8');
  assert.match(html, /data-playing-src="\/assets\/radio-tocando\.webp"/); assert.match(html, /data-volume-src="\/assets\/radio-volume\.webp"/); assert.match(html, /data-next-src="\/assets\/radio-next\.webp"/);
  assert.match(srv, /png\|jpg\|webp/); assert.match(srv, /webp: 'image\/webp'/);
});

test('rádio: cada faixa tem andamento e harmonia diferentes para a próxima ser audível', async () => {
  const { TRACKS } = await import('../public/radio.js');
  assert.equal(TRACKS.length, 5);
  assert.equal(new Set(TRACKS.map(t => t.bpm)).size, TRACKS.length);
  assert.equal(new Set(TRACKS.map(t => t.form.join(','))).size, TRACKS.length);
  assert.ok(TRACKS.every(t => t.form.length === 8 && t.form.every(i => Number.isInteger(i) && i >= 0 && i < 8)));
});
