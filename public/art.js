import { pixels, PERSON, CAT, PLANT, MUG, LOOKS } from './sprites.js';

// Ilustrações em pixel art geradas por código: faixas de cabeçalho, cena da entrada, miniaturas e rostos.
// São camadas de SVG sem interação; nada aqui indica trabalho real em andamento (isso é papel do cenário da Sala).
const svg = (vb, body, cls = '') => `<svg class="art ${cls}" ${cls === 'hero-art' ? 'preserveAspectRatio="xMidYMax meet"' : cls === 'thumb-art' ? 'preserveAspectRatio="xMidYMid slice"' : cls === 'banner-art' ? 'preserveAspectRatio="xMaxYMax meet"' : ''} viewBox="${vb}" shape-rendering="crispEdges" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
const seeded = seed => { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; };

function skyline(x, y, w, h, seed, { moon = false } = {}) {
  const rnd = seeded(seed); let out = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#0d1e3d"/><rect x="${x}" y="${y}" width="${w}" height="${h * 0.3}" fill="#122a55"/>`;
  if (moon) out += `<rect x="${x + w * 0.7}" y="${y + 6}" width="7" height="7" fill="#f3e6b0"/>`;
  let bx = x + 2;
  while (bx < x + w - 6) {
    const bw = 8 + Math.floor(rnd() * 10), bh = Math.floor(h * (0.25 + rnd() * 0.45)), top = y + h - bh;
    out += `<rect x="${bx}" y="${top}" width="${Math.min(bw, x + w - bx - 2)}" height="${bh}" fill="${rnd() > 0.5 ? '#16294a' : '#1b3157'}"/>`;
    for (let wy = top + 3; wy < y + h - 3; wy += 5) for (let wx = bx + 2; wx < bx + bw - 2 && wx < x + w - 3; wx += 4) if (rnd() > 0.55) out += `<rect x="${wx}" y="${wy}" width="2" height="2" fill="${rnd() > 0.5 ? '#f3c76b' : '#8fb8ff'}"/>`;
    bx += bw + 1;
  }
  return out;
}
const win = (x, y, w, h, seed, o) => `${skyline(x, y, w, h, seed, o)}<g fill="#27304a"><rect x="${x - 2}" y="${y - 2}" width="${w + 4}" height="3"/><rect x="${x - 2}" y="${y + h - 1}" width="${w + 4}" height="3"/><rect x="${x - 2}" y="${y - 2}" width="3" height="${h + 4}"/><rect x="${x + w - 1}" y="${y - 2}" width="3" height="${h + 4}"/><rect x="${x + w / 2 - 1}" y="${y}" width="2" height="${h}"/></g>`;
const shelf = (x, y, w) => `<rect x="${x}" y="${y}" width="${w}" height="4" fill="#6a4426"/><rect x="${x}" y="${y + 4}" width="${w}" height="1" fill="#3a2616"/>`;
const plant = (x, y, s = 2) => pixels(PLANT, { G: '#2f8a4a', B: '#8a5a3a' }, s, x, y);
const cat = (x, y, s = 2) => pixels(CAT, { W: '#e9e6df', O: '#d88a3a' }, s, x, y);
const mug = (x, y) => pixels(MUG, { W: '#e8e1d2' }, 2, x, y);
const lamp = (x, y) => `<rect x="${x + 5}" y="${y + 6}" width="3" height="22" fill="#d0a040"/><rect x="${x}" y="${y}" width="14" height="7" fill="#f3c76b"/><rect x="${x - 4}" y="${y + 7}" width="22" height="9" fill="#f3c76b" opacity=".12"/>`;
const books = (x, y, n = 5) => Array.from({ length: n }, (_, i) => `<rect x="${x + i * 4}" y="${y - (i % 3) * 2}" width="3" height="${10 + (i % 3) * 2}" fill="${['#7a4a8a', '#3f6fb5', '#b5503f', '#3a9a6a', '#d0a040'][i % 5]}"/>`).join('');
const frame = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#1d2b4a"/><rect x="${x + 2}" y="${y + 2}" width="${w - 4}" height="${h - 4}" fill="#3f6fb5"/><rect x="${x + 2}" y="${y + h - 6}" width="${w - 4}" height="4" fill="#2a4a80"/>`;
const clockArt = (x, y) => `<rect x="${x}" y="${y}" width="34" height="14" fill="#0b1426" stroke="#27304a"/><text x="${x + 17}" y="${y + 11}" font-size="10" text-anchor="middle" fill="#6fd0ff" font-family="monospace" font-weight="bold">22:41</text>`;
const laptopPerson = (x, y) => `${pixels(PERSON, LOOKS[1], 2, x, y)}<rect x="${x - 6}" y="${y + 44}" width="60" height="4" fill="#6a4426"/><rect x="${x + 8}" y="${y + 22}" width="32" height="22" fill="#1d2234"/><rect x="${x + 10}" y="${y + 24}" width="28" height="18" fill="#13264a"/><rect x="${x + 12}" y="${y + 28}" width="14" height="2" fill="#8fb8ff"/><rect x="${x + 12}" y="${y + 32}" width="18" height="2" fill="#6ee7b7"/>`;

const BANNERS = {
  shelf: () => `<rect width="440" height="110" fill="#0a1224"/>${win(250, 4, 150, 62, 7)}${shelf(120, 92, 320)}${books(150, 78, 5)}${plant(180, 62)}${frame(250, 70, 18, 18)}${cat(296, 84)}${plant(340, 62)}${lamp(410, 62)}${plant(124, 62)}`,
  desk: () => `<rect width="440" height="110" fill="#0a1224"/>${win(230, 6, 170, 70, 11)}${shelf(120, 98, 320)}${laptopPerson(262, 56)}${lamp(190, 52)}${plant(130, 74)}${mug(330, 84)}${cat(366, 90)}${plant(404, 70)}`,
  window: () => `<rect width="440" height="110" fill="#0a1224"/>${win(150, 6, 180, 72, 5)}${shelf(60, 92, 380)}${plant(70, 70)}${books(110, 78, 4)}${cat(256, 84)}${plant(380, 70)}${lamp(344, 56)}${frame(98, 56, 14, 14)}`,
  clock: () => `<rect width="440" height="110" fill="#0a1224"/>${win(180, 4, 110, 70, 3, { moon: true })}${shelf(100, 90, 340)}${plant(112, 62)}${cat(226, 82)}${clockArt(290, 76)}${lamp(380, 56)}${books(330, 78, 3)}`
};
const BAN = { shelf: 'ban-skills', skills: 'ban-skills', desk: 'ban-execucao', execucao: 'ban-execucao', window: 'ban-equipes', equipes: 'ban-equipes', clock: 'ban-rotinas', rotinas: 'ban-rotinas', conexoes: 'ban-conexoes', agentes: 'ban-agentes', projetos: 'ban-projetos', entregas: 'ban-entregas', consumo: 'ban-consumo' };
// Ilustrações: recortes das telas de referência aprovadas (scripts/extract-art.py), usados só como arte decorativa.
export const banner = kind => `<img class="art-img" src="/assets/${BAN[kind] || 'ban-skills'}.png" alt="" aria-hidden="true">`;

// Cena grande da tela de entrada: pessoa de costas no computador, janela com a cidade, quadro de itens e gato.
export const heroScene = () => `<img class="art-img hero-img" src="/assets/login-scene.png" alt="" aria-hidden="true">`;

// Miniaturas por área para os cartões de projeto.
export function thumb(area) {
  const a = String(area || '').toLowerCase();
  const k = a.startsWith('v') ? 'video' : a.startsWith('fin') ? 'finance' : a.startsWith('pesq') ? 'research' : 'dev';
  return `<img class="art-img" src="/assets/thumb-${k}.png" alt="" aria-hidden="true">`;
}
export const themeImg = id => `<img class="art-img" src="/assets/theme-${id}.png" alt="" aria-hidden="true">`;

// Rosto frontal para avatares (agentes, usuário).
const FACE = ['..HHHHHH..', '.HHHHHHHH.', 'HHSSSSSSHH', 'PHSESSESHP', 'PHSSSSSSHP', '.HSSMMSSH.', '..SSSSSS..', '.TTTTTTTT.'];
// Oito aparências da sala. A função do agente continua livre e independente do retrato.
export const CHARACTERS = ['nilo', 'bento', 'lia', 'icaro', 'davi', 'malu', 'ravi', 'cora'];
export function avatar(index = 0, size = 32) {
  const name = CHARACTERS[((index % CHARACTERS.length) + CHARACTERS.length) % CHARACTERS.length];
  return `<img class="avatar" src="/assets/char-${name}-face.png" width="${size}" height="${size}" alt="" aria-hidden="true">`;
}

// Avatar do agente: usa a miniatura do boneco 3D quando existir; senão, o retrato padrão do papel.
export function agentAv(a, index = 0, size = 32) {
  const t = a?.look?.thumb;
  return /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(t || '') ? `<img class="avatar" src="${t}" width="${size}" height="${size}" alt="" aria-hidden="true">` : avatar(index, size);
}
