// Pixel art em matrizes de texto. Cada letra é uma cor da paleta; "." é transparente.
// pixels() junta pixels vizinhos da mesma cor em um único <rect> para manter o SVG leve.
export function pixels(rows, palette, scale = 1, ox = 0, oy = 0) {
  let out = '';
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const c = row[x];
      if (c === '.' || !palette[c]) { x++; continue; }
      let n = 1; while (row[x + n] === c) n++;
      out += `<rect x="${ox + x * scale}" y="${oy + y * scale}" width="${n * scale}" height="${scale}" fill="${palette[c]}"/>`;
      x += n;
    }
  });
  return out;
}

// Monta uma matriz a partir de retângulos [x, y, largura, altura, letra], desenhados em ordem (os últimos ficam por cima).
function build(w, h, ops) {
  const g = Array.from({ length: h }, () => Array(w).fill('.'));
  for (const [x, y, rw, rh, k] of ops) for (let j = y; j < y + rh; j++) for (let i = x; i < x + rw; i++) if (j >= 0 && j < h && i >= 0 && i < w) g[j][i] = k;
  return g.map(r => r.join(''));
}
const mirror = (w, ops) => ops.flatMap(([x, y, rw, rh, k]) => [[x, y, rw, rh, k], [w - x - rw, y, rw, rh, k]]);

// Pessoa sentada de costas (24 x 28): cadeira de tela, capuz, fone com almofadas, cabelo com brilho e dobras da roupa.
// Letras: H cabelo, h brilho, P/p/q fone (haste, almofada, sombra), S pele, T/t/D/d roupa (base, luz, dobra, borda), K/k/M cadeira.
const W = 24;
const chair = [[1, 11, 22, 17, 'K'], [2, 12, 20, 15, 'M'], ...[13, 16, 19, 22, 25].map(y => [2, y, 20, 1, 'k']), ...[4, 8, 12, 16, 20].map(x => [x, 12, 1, 15, 'k']), [4, 10, 16, 1, 'K'], [0, 24, 2, 4, 'K'], [22, 24, 2, 4, 'K']];
const body = [
  [5, 11, 14, 1, 't'], [3, 12, 18, 10, 'T'], [3, 12, 1, 1, '.'], [20, 12, 1, 1, '.'],
  [6, 10, 12, 2, 't'], [9, 10, 6, 1, 'S'],
  [3, 13, 2, 9, 'd'], [19, 13, 2, 9, 'd'], [11, 13, 2, 10, 'D'], [10, 15, 1, 5, 'D'], [13, 15, 1, 5, 'D'], [4, 20, 16, 1, 'D'], [7, 14, 3, 1, 't'], [14, 14, 3, 1, 't'],
  [1, 15, 3, 10, 'T'], [20, 15, 3, 10, 'T'], [1, 15, 1, 10, 'd'], [22, 15, 1, 10, 'd']
];
const head = (dy = 0, dx = 0) => [
  [7 + dx, 1 + dy, 10, 1, 'H'], [5 + dx, 2 + dy, 14, 7, 'H'], [6 + dx, 9 + dy, 12, 1, 'H'], [8 + dx, 2 + dy, 4, 1, 'h'], [7 + dx, 4 + dy, 2, 1, 'h'], [14 + dx, 3 + dy, 3, 1, 'h'],
  [6 + dx, 0 + dy, 12, 1, 'P'], [5 + dx, 1 + dy, 1, 4, 'P'], [18 + dx, 1 + dy, 1, 4, 'P'],
  [2 + dx, 4 + dy, 3, 6, 'p'], [19 + dx, 4 + dy, 3, 6, 'p'], [2 + dx, 4 + dy, 1, 6, 'q'], [21 + dx, 4 + dy, 1, 6, 'q'], [3 + dx, 5 + dy, 1, 4, 'P'], [20 + dx, 5 + dy, 1, 4, 'P']
];
export const PERSON = build(W, 28, [...chair, ...body, ...head(0, 0)]);
// Cochilando: cabeça inclinada e pendendo para o lado, ombros caídos.
export const PERSON_SLEEP = build(W, 28, [...chair, ...body, [6, 10, 12, 3, 't'], ...head(3, 2).map(([x, y, w, h, k]) => [x, y, w, h, k])]);

// Supervisor em pé, de costas (14 x 34): cabelo, camisa escura, mão levantada com caneca, calça e tênis.
export const STANDING = build(14, 34, [
  [4, 0, 6, 1, 'H'], [3, 1, 8, 5, 'H'], [4, 1, 3, 1, 'h'], [4, 6, 6, 1, 'S'],
  [3, 7, 8, 1, 'T'], [2, 8, 10, 10, 'T'], [2, 8, 1, 10, 'd'], [11, 8, 1, 10, 'd'], [6, 9, 2, 9, 'D'],
  [10, 6, 3, 3, 'T'], [11, 4, 3, 3, 'T'], [12, 3, 2, 2, 'S'], [13, 1, 1, 3, 'W'], [12, 1, 2, 1, 'W'],
  [3, 18, 8, 3, 'T'], [3, 21, 8, 9, 'L'], [3, 21, 8, 1, 'D'], [6, 22, 2, 8, 'l'],
  [3, 30, 3, 3, 'L'], [8, 30, 3, 3, 'L'], [2, 33, 4, 1, 'K'], [8, 33, 5, 1, 'K']
]);
// Gato dormindo enrolado (16 x 8): manchas brancas, laranja e pretas.
export const CAT = build(16, 8, [
  [1, 3, 14, 5, 'W'], [3, 2, 10, 1, 'W'], [0, 5, 2, 3, 'W'], [2, 1, 3, 2, 'W'], [2, 0, 1, 2, 'W'], [4, 0, 1, 2, 'W'],
  [6, 3, 3, 2, 'O'], [9, 5, 2, 2, 'O'], [4, 3, 2, 2, 'B'], [11, 3, 3, 3, 'B'], [5, 2, 1, 1, 'K']
]);
export const PLANT = [
  '..G.G.G..', '.GGgGGGG.', 'GGGGGgGGG', '.GgGGGGG.', '..GGGGG..', '...BBB...', '..BBBBB..', '..BBBBB..'
];
export const MUG = ['.WWW.', 'WWWWW', 'WWWWW', '.WWW.'];

// Cores por personagem (cabelo, fone, roupa). As letras comuns (pele, cadeira) são compartilhadas.
const common = { S: '#e0a980', K: '#141a2b', k: '#26304a', M: '#1b2238', W: '#efece4', O: '#d98a3a', B: '#2b2b34' };
const look = (hair, hi, band, cup, shade, tee, light, dark, edge) => ({ ...common, H: hair, h: hi, P: band, p: cup, q: shade, T: tee, t: light, D: dark, d: edge });
export const LOOKS = [
  look('#2a1d1a', '#4a362e', '#7d62cf', '#8b6fd6', '#5d47a8', '#8f86d8', '#a89fe6', '#6e65b8', '#5c539d'),
  look('#151c2b', '#2a3550', '#3f86d6', '#4e9be8', '#2b66a8', '#3f6fb5', '#5a8bd0', '#2f548d', '#27487a'),
  look('#3a2619', '#5a3d2a', '#2fa97a', '#3cb98a', '#1f7c58', '#3a9a6a', '#52b583', '#2c7a52', '#236544'),
  look('#5a3a1a', '#7b5428', '#d19a36', '#e0a840', '#9c7020', '#b87a3a', '#cf9650', '#946028', '#7a4f20')
];
export const SUPERVISOR_LOOK = { ...common, H: '#17151f', h: '#2d2a3a', S: '#e0a980', T: '#27324a', D: '#1c2438', d: '#1a2236', L: '#6b5d45', l: '#54482f', K: '#1c1c22' };
export const DISCONNECTED = { ...common, S: '#8a8f99', H: '#555b66', h: '#6b7280', P: '#6b7280', p: '#6b7280', q: '#59606c', T: '#59606c', t: '#6b7280', D: '#4b515c', d: '#4b515c', K: '#2b2f3a', k: '#3a3f4c', M: '#2f3340', L: '#4b515c', l: '#3f444e' };
