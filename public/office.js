import { pixels, PERSON, PERSON_SLEEP, STANDING, CAT, PLANT, MUG, LOOKS, SUPERVISOR_LOOK, DISCONNECTED } from './sprites.js';

// Cenário em camadas independentes dentro de um único SVG (400 x 225 unidades):
//   1. fundo (parede, janela, prateleiras, quadro)   2. estações (cadeira, pessoa, monitor, mãos, sinais)
//   3. mesa e chão (na frente das pessoas)           4. supervisor e gato
// Nada aqui chama IA: o estado de cada pessoa vem do backend e as animações são CSS locais.
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SLOT_X = [18, 98, 178, 258];
export const MAX_STATIONS = SLOT_X.length;

function seeded(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

function background() {
  const rnd = seeded(42);
  let city = '';
  let x = 66;
  while (x < 330) {
    const w = 10 + Math.floor(rnd() * 14), h = 22 + Math.floor(rnd() * 44);
    city += `<rect x="${x}" y="${116 - h}" width="${w}" height="${h}" fill="${rnd() > 0.5 ? '#16294a' : '#1b3157'}"/>`;
    for (let wy = 116 - h + 4; wy < 112; wy += 6) for (let wx = x + 2; wx < x + w - 2; wx += 4) if (rnd() > 0.55) city += `<rect x="${wx}" y="${wy}" width="2" height="3" fill="${rnd() > 0.5 ? '#f3c76b' : '#8fb8ff'}"/>`;
    x += w + 2;
  }
  const books = ['#7a4a8a', '#3f6fb5', '#b5503f', '#3a9a6a', '#d0a040'].map((c, i) => `<rect x="${20 + i * 4}" y="${12}" width="3" height="10" fill="${c}"/>`).join('');
  return `<g class="layer layer-bg">
    <rect width="400" height="225" fill="#0b1426"/>
    <rect x="60" y="28" width="280" height="92" fill="#0d1e3d"/>
    <rect x="60" y="28" width="280" height="30" fill="#112650"/>
    ${city}
    <g fill="#27304a"><rect x="58" y="26" width="284" height="3"/><rect x="58" y="118" width="284" height="3"/><rect x="58" y="26" width="3" height="95"/><rect x="339" y="26" width="3" height="95"/><rect x="198" y="26" width="3" height="95"/></g>
    <rect x="60" y="29" width="280" height="8" fill="#1a2644" opacity=".7"/>
    <rect x="8" y="22" width="130" height="4" fill="#6a4426"/><rect x="262" y="22" width="130" height="4" fill="#6a4426"/>
    ${books}${pixels(PLANT, { G: '#2f8a4a', B: '#8a5a3a' }, 2, 52, 6)}${pixels(PLANT, { G: '#3a9a58', B: '#9a6a46' }, 2, 292, 6)}
    <rect x="96" y="10" width="14" height="12" fill="#1d2b4a"/><rect x="98" y="12" width="10" height="8" fill="#3f6fb5"/>
    <rect x="228" y="6" width="3" height="16" fill="#d0a040"/><rect x="224" y="4" width="11" height="4" fill="#f3c76b"/>
    <rect x="14" y="60" width="38" height="10" fill="#14203a"/><text x="33" y="68" font-size="7" text-anchor="middle" fill="#8fb8ff" font-family="monospace">2026.10.30</text>
    <rect x="12" y="74" width="40" height="3" fill="#6a4426"/><rect x="12" y="98" width="40" height="3" fill="#6a4426"/>
    ${[0, 1, 2, 3, 4, 5].map(i => `<rect x="${14 + i * 6}" y="${88 - (i % 3) * 2}" width="4" height="${10 + (i % 3) * 2}" fill="${['#b5503f', '#3f6fb5', '#3a9a6a'][i % 3]}"/>`).join('')}
    <rect x="340" y="66" width="56" height="76" fill="#4a3220"/><rect x="343" y="69" width="50" height="70" fill="#a8763e"/>
    <rect x="348" y="74" width="12" height="14" fill="#f2efe4"/><rect x="366" y="80" width="12" height="14" fill="#f3d27a"/><rect x="352" y="96" width="14" height="12" fill="#cfe4ff"/><rect x="372" y="104" width="12" height="14" fill="#f2efe4"/>
  </g>`;
}

function foreground() {
  return `<g class="layer layer-fg">
    <rect x="8" y="150" width="324" height="6" fill="#6a4426"/><rect x="8" y="156" width="324" height="30" fill="#3a2616"/>
    ${[0, 1, 2, 3].map(i => `<rect x="${20 + i * 80}" y="160" width="26" height="22" fill="#2b1c10"/><rect x="${30 + i * 80}" y="168" width="6" height="2" fill="#8a6a46"/>`).join('')}
    <rect x="0" y="186" width="400" height="39" fill="#2a1a12"/>
    ${Array.from({ length: 8 }, (_, i) => `<rect x="0" y="${190 + i * 5}" width="400" height="1" fill="#1d120c"/>`).join('')}
    <rect x="36" y="196" width="288" height="24" fill="#26324f"/><rect x="40" y="199" width="280" height="18" fill="none" stroke="#3a4a74" stroke-width="2"/>
  </g>`;
}

const ICONS = {
  done: x => `<g class="icon icon-done"><circle cx="${x}" cy="62" r="7" fill="#2f9e6a"/><path d="M${x - 3} 62l2 3 4-6" stroke="#fff" stroke-width="2" fill="none"/></g>`,
  failed: x => `<g class="icon icon-failed"><path d="M${x} 55l8 14h-16z" fill="#d9534f"/><rect x="${x - 1}" y="59" width="2" height="5" fill="#fff"/><rect x="${x - 1}" y="66" width="2" height="2" fill="#fff"/></g>`,
  decision: x => `<g class="icon icon-decision"><rect x="${x - 7}" y="55" width="14" height="14" rx="3" fill="#e0a82e"/><text x="${x}" y="66" font-size="11" text-anchor="middle" font-weight="bold" fill="#1d1608">?</text></g>`,
  waiting: x => `<g class="icon icon-waiting"><path d="M${x - 5} 56h10l-5 6 5 6h-10l5-6z" fill="none" stroke="#8fb8ff" stroke-width="1.6"/></g>`,
  disconnected: x => `<g class="icon icon-disc"><rect x="${x - 7}" y="58" width="9" height="7" fill="#8a8f99"/><rect x="${x - 3}" y="54" width="2" height="4" fill="#8a8f99"/><rect x="${x - 7}" y="65" width="2" height="4" fill="#8a8f99"/><path d="M${x} 55l8 14M${x + 8} 55l-8 14" stroke="#e5534b" stroke-width="2"/></g>`,
  idle: x => `<g class="icon icon-zzz"><text class="z z1" x="${x - 4}" y="68" font-size="7" fill="#8fb8ff">z</text><text class="z z2" x="${x + 2}" y="62" font-size="9" fill="#8fb8ff">Z</text><text class="z z3" x="${x + 9}" y="55" font-size="11" fill="#8fb8ff">Z</text></g>`
};

function screen(status, x0, i) {
  const sx = x0 + 11, sy = 84, base = `<rect x="${sx}" y="${sy}" width="48" height="30"`;
  if (status === 'running') {
    return base + ' fill="#0f1c33"/>' + [0, 1, 2, 3, 4].map(n => `<rect class="codeline cl${n}" x="${sx + 3}" y="${sy + 3 + n * 5}" width="${18 + ((n * 7 + i * 5) % 22)}" height="2" fill="${['#8fb8ff', '#a78bfa', '#6ee7b7', '#8fb8ff', '#f3c76b'][n]}"/>`).join('');
  }
  if (status === 'failed') return base + ' fill="#2a1216"/><rect x="' + (sx + 20) + '" y="' + (sy + 8) + '" width="8" height="14" fill="#d9534f"/>';
  if (status === 'disconnected') return base + ' fill="#0a0a0c"/><path d="M' + (sx + 18) + ' ' + (sy + 9) + 'l12 12M' + (sx + 30) + ' ' + (sy + 9) + 'l-12 12" stroke="#555" stroke-width="2"/>';
  if (status === 'idle') return base + ' fill="#070d19"/><rect x="' + (sx + 38) + '" y="' + (sy + 4) + '" width="6" height="6" fill="#d6dcec" opacity=".7"/>';
  if (status === 'done') return base + ' fill="#0f2a22"/>' + [0, 1, 2].map(n => `<rect x="${sx + 4}" y="${sy + 5 + n * 7}" width="${30 + n * 4}" height="2" fill="#6ee7b7"/>`).join('');
  return base + ' fill="#13264a"/><rect class="cursor" x="' + (sx + 5) + '" y="' + (sy + 6) + '" width="3" height="5" fill="#8fb8ff"/>';
}

function station(s, i) {
  const x0 = SLOT_X[i], status = s.status;
  const look = status === 'disconnected' ? DISCONNECTED : LOOKS[i % LOOKS.length];
  const body = pixels(PERSON, look, 3, x0 - 1, 98), sprite = status === 'idle' ? `<g transform="translate(1 3) rotate(3 ${x0 + 35} 130)">${body}</g>` : body;
  const mug = status === 'available' ? `<g class="mug">${pixels(MUG, { W: '#e8e1d2' }, 2, x0 + 56, 139)}<rect class="steam" x="${x0 + 60}" y="133" width="1.5" height="4" fill="#cfd6e6"/></g>` : '';
  const icon = (ICONS[status] || (() => ''))(x0 + 58);
  const name = esc(s.agent.name).slice(0, 14);
  const hands = `<g class="station-hands st-${status}" aria-hidden="true"><rect class="hand h1" x="${x0 + 22}" y="147" width="8" height="4" fill="${look.S}"/><rect class="hand h2" x="${x0 + 40}" y="147" width="8" height="4" fill="${look.S}"/></g>`;
  return { hands, main: `<g class="station st-${status}" role="button" tabindex="0" data-agent="${esc(s.agent.id)}" aria-label="${esc(s.label)}">
    <rect class="monitor" x="${x0 + 8}" y="80" width="54" height="38" fill="#1d2234"/>${screen(status, x0, i)}
    <g class="person">${sprite}</g>
    ${mug}${icon}
    <rect class="pill" x="${x0 + 4}" y="68" width="${Math.max(28, name.length * 4.6 + 8)}" height="10" rx="3" fill="#0b1426" stroke="#3a4a74"/><text class="name" x="${x0 + 8}" y="75.5" font-size="6.5" fill="#dbe6ff" font-family="system-ui,sans-serif">${name}</text>
    <rect class="hit" x="${x0 - 2}" y="50" width="76" height="116" fill="transparent"/>
  </g>` };
}

function emptySlot(i) {
  const x0 = SLOT_X[i];
  return `<g class="slot-empty" aria-hidden="true"><rect x="${x0 + 8}" y="80" width="54" height="38" fill="none" stroke="#2c3a5c" stroke-dasharray="3 3"/><text x="${x0 + 35}" y="102" font-size="6" text-anchor="middle" fill="#4a5a82" font-family="system-ui,sans-serif">estação livre</text></g>`;
}

function supervisor(s) {
  const look = !s ? { ...SUPERVISOR_LOOK, T: '#333a4c', D: '#2a3040' } : s.status === 'disconnected' ? { ...SUPERVISOR_LOOK, ...DISCONNECTED, L: '#555', K: '#333' } : SUPERVISOR_LOOK;
  const status = s?.status || 'none';
  const icon = s ? (ICONS[status] || (() => ''))(372) : '';
  const label = s ? esc(s.agent.name).slice(0, 14) : 'Supervisor';
  const sprite = pixels(STANDING, look, 3, 352, 82);
  const body = `<g class="sup-body">${sprite}</g>`;
  return `<g class="station supervisor st-${status}" ${s ? `role="button" tabindex="0" data-agent="${esc(s.agent.id)}" aria-label="${esc(s.label)}"` : 'aria-label="Supervisor não escolhido"'}>
    ${body}${icon}
    <rect class="pill" x="${Math.min(352, 396 - Math.max(36, label.length * 4.6 + 8))}" y="68" width="${Math.max(36, label.length * 4.6 + 8)}" height="10" rx="3" fill="#0b1426" stroke="#3a4a74"/><text class="name" x="${Math.min(352, 396 - Math.max(36, label.length * 4.6 + 8)) + 4}" y="75.5" font-size="6.5" fill="#dbe6ff" font-family="system-ui,sans-serif">${label}</text>
    <rect class="hit" x="346" y="50" width="52" height="136" fill="transparent"/>
  </g>`;
}

export function renderOffice(host, { stations, supervisor: sup, onSelect }) {
  const built = Array.from({ length: MAX_STATIONS }, (_, i) => stations[i] ? station(stations[i], i) : { main: emptySlot(i), hands: '' });
  const slots = built.map(b => b.main).join(''), hands = built.map(b => b.hands).join('');
  const html = `<svg class="office" viewBox="0 0 400 225" role="group" aria-label="Escritório do Code Room" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg">
    ${background()}
    <g class="layer layer-stations">${slots}</g>
    ${foreground()}
    <g class="layer layer-hands">${hands}</g>
    <g class="layer layer-extras">${supervisor(sup)}<g class="cat" aria-hidden="true">${pixels(CAT, { W: '#e9e6df', O: '#d88a3a' }, 2, 300, 202)}<text class="catz" x="326" y="204" font-size="6" fill="#8fb8ff">z</text></g></g>
  </svg>`;
  host._onSelect = onSelect;
  if (host.dataset.sig === html) return;
  host.dataset.sig = html; host.innerHTML = html;
  host._onSelect = onSelect;
  if (!host.dataset.bound) {
    host.dataset.bound = '1';
    const pick = e => { const g = e.target.closest('[data-agent]'); if (g) host._onSelect(g.dataset.agent); };
    host.addEventListener('click', pick);
    host.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(e); } });
  }
}
