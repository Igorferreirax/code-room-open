// Marca do Code Room: o gato no monitor (mascote do escritório) e o nome em letras de pixel (grade 5x7 desenhada à mão).
// Tudo em SVG gerado por código: sem arquivo de imagem nem fonte externa, nítido em qualquer tamanho. O "CODE" segue a cor do texto do tema.
const CAT_ROWS = ["...KKKKKKKKKKKKKKKKKK...", ".KKEEEEEEEEEEEEEEEEEEKK.", ".KEEEEEBEEEEBEEEEEEEEEK.", "KEEEEEESBBBBSEEEEEEEEEEK", "KEEEEEEBEBBEBEEEEEEEEEEK", "KEEEEEEBBBBBBEEEEEEEEEEK", "KEEEEEEBBBBBBBBBEEEEEEEK", "KEEEEEEEBBBBBBBEBEEEEEEK", "KEEEEEEEBBBBBBBEBEEEEEEK", "KEEEEEEEBBBBBBBBEEEEEEEK", "KEEEEEEEBSSBSSBEEEEEEEEK", "KEENNNNNNNNNNNNNNNNNNEEK", "KEENGGGGGGGGGGGGGGGGNEEK", "KEENGGOGGGGGGGGGGGGGNEEK", "KEENGGGOGGGGGGGGGGGGNEEK", "KEENGGOGGOOOGGGGGGGGNEEK", "KEENGGGGGGGGGGGGGGGGNEEK", "KEENGGGGGGGGGGGGGGGGNEEK", "KEENGGGGGGGGGGGGGGGGNEEK", "KEENNNNNNNNNNNNNNNNNNEEK", "KEEEEEEEEEENNEEEEEEEEEEK", ".KEEEEEEEEENNEEEEEEEEEK.", ".KKEEEEENNNNNNNNEEEEEKK.", "...KKKKKKKKKKKKKKKKKK..."];
const CAT_PALETTE = {"K": "#1d3055", "E": "#0b1527", "B": "#f5a04c", "S": "#be6e32", "N": "#5b6e96", "G": "#0e1a31", "O": "#2dd4a0"};
const LETTERS = {
  C: ['.####', '#....', '#....', '#....', '#....', '#....', '.####'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#', '#...#', '#...#'],
};

// Agrupa células vizinhas da mesma cor numa linha em um só retângulo (SVG menor).
const runs = (rows, colorOf) => {
  let out = '';
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length;) {
      const c = colorOf(row[x]); if (!c) { x++; continue; }
      let w = 1; while (x + w < row.length && colorOf(row[x + w]) === c) w++;
      out += `<rect x="${x}" y="${y}" width="${w}" height="1" fill="${c}"/>`; x += w;
    }
  });
  return out;
};

export const catLogo = (size = 28) => `<svg class="logo-mark" width="${size}" height="${size}" viewBox="0 0 24 24" shape-rendering="crispEdges" aria-hidden="true">${runs(CAT_ROWS, ch => CAT_PALETTE[ch] || '')}</svg>`;

// Nome "CODE ROOM": "CODE" na cor do texto, "ROOM" na cor de destaque. height em pixels da tela.
export function wordmark(height = 18) {
  const rows = Array.from({ length: 7 }, () => ''), kind = [];
  const words = [['CODE', 'c'], ['ROOM', 'a']];
  words.forEach(([w, k], wi) => {
    [...w].forEach((ch, i) => { for (let r = 0; r < 7; r++) rows[r] += LETTERS[ch][r].replace(/#/g, k) + (i < w.length - 1 ? '.' : ''); });
    if (wi === 0) for (let r = 0; r < 7; r++) rows[r] += '...';
  });
  const color = ch => ch === 'c' ? 'currentColor' : ch === 'a' ? 'var(--accent-h)' : '';
  const w = rows[0].length;
  return `<svg class="wordmark" height="${height}" width="${Math.round(height * w / 7)}" viewBox="0 0 ${w} 7" shape-rendering="crispEdges" role="img" aria-label="Code Room">${runs(rows, color)}</svg>`;
}
