// Gerador de QR Code sem dependências (modo byte, correção M, versões 1 a 10). Usado para parear o celular.
// Verificado decodificando com o OpenCV (scripts/verify-qr.py).
const ECC_PER_BLOCK = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
const NUM_BLOCKS = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];

function rawModules(v) {
  let r = (16 * v + 128) * v + 64;
  if (v >= 2) { const n = Math.floor(v / 7) + 2; r -= (25 * n - 10) * n - 55; if (v >= 7) r -= 36; }
  return r;
}
const dataCodewords = v => Math.floor(rawModules(v) / 8) - ECC_PER_BLOCK[v] * NUM_BLOCKS[v];

// GF(256) e Reed-Solomon
const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
{ let x = 1; for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; } for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]; }
const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
function rsGenerator(deg) { let g = [1]; for (let i = 0; i < deg; i++) { const n = new Array(g.length + 1).fill(0); for (let j = 0; j < g.length; j++) { n[j] ^= g[j]; n[j + 1] ^= mul(g[j], EXP[i]); } g = n; } return g; }
function rsRemainder(data, deg) {
  const gen = rsGenerator(deg), rem = new Array(deg).fill(0);
  for (const b of data) { const f = b ^ rem.shift(); rem.push(0); if (f) for (let i = 0; i < deg; i++) rem[i] ^= mul(gen[i + 1], f); }
  return rem;
}

function buildCodewords(bytes, v) {
  const bits = []; const push = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  push(4, 4); push(bytes.length, v < 10 ? 8 : 16); for (const b of bytes) push(b, 8);
  const cap = dataCodewords(v) * 8; push(0, Math.min(4, cap - bits.length)); while (bits.length % 8) bits.push(0);
  const cw = []; for (let i = 0; i < bits.length; i += 8) cw.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  for (let pad = 0xec; cw.length < dataCodewords(v); pad ^= 0xec ^ 0x11) cw.push(pad);
  const nb = NUM_BLOCKS[v], ecc = ECC_PER_BLOCK[v], total = Math.floor(rawModules(v) / 8), shortLen = Math.floor(total / nb) - ecc, longBlocks = total % nb;
  const blocks = []; let k = 0;
  for (let i = 0; i < nb; i++) { const len = shortLen + (i < nb - longBlocks ? 0 : 1); const d = cw.slice(k, k + len); k += len; blocks.push({ d, e: rsRemainder(d, ecc) }); }
  const out = [];
  for (let i = 0; i <= shortLen; i++) for (const b of blocks) if (i < b.d.length) out.push(b.d[i]);
  for (let i = 0; i < ecc; i++) for (const b of blocks) out.push(b.e[i]);
  return out;
}

function alignPositions(v) {
  if (v === 1) return [];
  const n = Math.floor(v / 7) + 2, step = v === 32 ? 26 : Math.ceil((v * 4 + 4) / (n * 2 - 2)) * 2, size = v * 4 + 17, r = [6];
  for (let p = size - 7; r.length < n; p -= step) r.splice(1, 0, p);
  return r;
}

function makeMatrix(v, codewords) {
  const size = v * 4 + 17, m = Array.from({ length: size }, () => new Array(size).fill(false)), fn = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x, y, dark) => { m[y][x] = dark; fn[y][x] = true; };
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  const finder = (cx, cy) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const x = cx + dx, y = cy + dy; if (x < 0 || y < 0 || x >= size || y >= size) continue; const d = Math.max(Math.abs(dx), Math.abs(dy)); set(x, y, d !== 2 && d !== 4); } };
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
  const ap = alignPositions(v);
  for (let i = 0; i < ap.length; i++) for (let j = 0; j < ap.length; j++) {
    if ((i === 0 && j === 0) || (i === 0 && j === ap.length - 1) || (i === ap.length - 1 && j === 0)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(ap[i] + dx, ap[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  // reserva formato e versão
  const reserve = () => { for (let i = 0; i < 9; i++) { fn[8][i] = true; fn[i][8] = true; } for (let i = 0; i < 8; i++) { fn[8][size - 1 - i] = true; fn[size - 1 - i][8] = true; } };
  reserve(); set(8, size - 8, true);
  if (v >= 7) { let rem = v; for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25); const bits = (v << 12) | rem; for (let i = 0; i < 18; i++) { const dark = ((bits >>> i) & 1) !== 0, a = size - 11 + (i % 3), b = Math.floor(i / 3); set(a, b, dark); set(b, a, dark); } }
  // dados em zigue-zague
  const bitsArr = []; for (const c of codewords) for (let i = 7; i >= 0; i--) bitsArr.push((c >>> i) & 1);
  let idx = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert;
      if (!fn[y][x] && idx < bitsArr.length) { m[y][x] = bitsArr[idx++] === 1; }
    }
  }
  return { m, fn, size };
}

const MASKS = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x, y) => x % 3 === 0, (x, y) => (x + y) % 3 === 0, (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0, (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0];

function applyMask(base, mask) {
  const { m, fn, size } = base, out = m.map(r => r.slice());
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && MASKS[mask](x, y)) out[y][x] = !out[y][x];
  // formato (nível M = 00)
  const data = (0 << 3) | mask; let rem = data; for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const bits = ((data << 10) | rem) ^ 0x5412, bit = i => ((bits >>> i) & 1) !== 0;
  for (let i = 0; i <= 5; i++) out[i][8] = bit(i); out[7][8] = bit(6); out[8][8] = bit(7); out[8][7] = bit(8);
  for (let i = 9; i < 15; i++) out[8][14 - i] = bit(i);
  for (let i = 0; i < 8; i++) out[8][size - 1 - i] = bit(i);
  for (let i = 8; i < 15; i++) out[size - 15 + i][8] = bit(i);
  out[size - 8][8] = true;
  return out;
}

function penalty(g) {
  const n = g.length; let p = 0;
  for (let pass = 0; pass < 2; pass++) for (let a = 0; a < n; a++) {
    let run = 1; for (let b = 1; b < n; b++) { const cur = pass ? g[b][a] : g[a][b], prev = pass ? g[b - 1][a] : g[a][b - 1]; if (cur === prev) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1; }
  }
  for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) if (g[y][x] === g[y][x + 1] && g[y][x] === g[y + 1][x] && g[y][x] === g[y + 1][x + 1]) p += 3;
  const pat = [true, false, true, true, true, false, true, false, false, false, false];
  for (let pass = 0; pass < 2; pass++) for (let a = 0; a < n; a++) for (let b = 0; b + 11 <= n; b++) {
    for (const rev of [false, true]) { let ok = true; for (let k = 0; k < 11 && ok; k++) { const val = pass ? g[b + k][a] : g[a][b + k]; if (val !== pat[rev ? 10 - k : k]) ok = false; } if (ok) p += 40; }
  }
  let dark = 0; for (const r of g) for (const c of r) if (c) dark++;
  p += Math.floor(Math.abs(dark * 20 - n * n * 10) / (n * n)) * 10;
  return p;
}

export function qrMatrix(text) {
  const bytes = new TextEncoder().encode(text);
  let v = 1; for (; v <= 10; v++) if (4 + (v < 10 ? 8 : 16) + bytes.length * 8 <= dataCodewords(v) * 8) break;
  if (v > 10) throw new Error('Texto longo demais para o QR.');
  const base = makeMatrix(v, buildCodewords(bytes, v));
  let best = null, bestP = Infinity;
  for (let mask = 0; mask < 8; mask++) { const g = applyMask(base, mask), p = penalty(g); if (p < bestP) { bestP = p; best = g; } }
  return best;
}

export function qrSvg(text, { scale = 6, margin = 4, dark = '#000', light = '#fff' } = {}) {
  const g = qrMatrix(text), n = g.length, s = (n + margin * 2) * scale; let path = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (g[y][x]) path += `M${(x + margin) * scale},${(y + margin) * scale}h${scale}v${scale}h-${scale}z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}" width="${s}" height="${s}" shape-rendering="crispEdges" role="img" aria-label="QR Code de pareamento"><rect width="${s}" height="${s}" fill="${light}"/><path d="${path}" fill="${dark}"/></svg>`;
}
