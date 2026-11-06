import { icon } from './icons.js';

// Escritório interativo sobre a arte ORIGINAL da referência (quadro do vídeo de referência, ver scripts/extract-scene.py).
// A imagem é só o fundo. Tudo que muda vem do backend e é sobreposto: brilho no monitor (executando), véu escuro + ZzZ (inativo),
// cinza (desconectado), anel vermelho (falhou), etc. Os textos "Dev/Vídeo/Pesquisa", "nexus" e a data que vêm gravados na imagem
// são cobertos por plaquinhas com os dados reais (nome do agente, "Code Room", data de hoje).
const W = 1432, H = 942;
export const MAX_STATIONS = 3;
const pct = (x, y, w, h) => `left:${(x / W * 100).toFixed(3)}%;top:${(y / H * 100).toFixed(3)}%;width:${(w / W * 100).toFixed(3)}%;height:${(h / H * 100).toFixed(3)}%`;
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Estações no recorte 1432x942: área clicável (inclui a plaquinha do nome), monitor e centro da plaquinha original.
const SLOTS = [
  { box: [239, 440, 262, 420], mon: [248, 501, 237, 134], pill: [352, 469] },
  { box: [539, 440, 268, 420], mon: [552, 496, 243, 143], pill: [672, 469] },
  { box: [852, 440, 262, 420], mon: [861, 496, 238, 143], pill: [992, 469] }
];
const SUP_BOX = [1265, 450, 145, 405], SUP_SWAP = [1150, 420, 282, 500], SUP_PILL = [1288, 376];

const BADGE = {
  running: ['terminal', 'run'], done: ['check', 'ok'], failed: ['x', 'bad'], waiting: ['clock', 'warn'], queued: ['clock', 'warn'], decision: ['info', 'warn'], disconnected: ['plug', 'off'], idle: null, available: null
};
function badge(status) { const b = BADGE[status]; return b ? `<span class="ps-badge b-${b[1]}">${icon(b[0], 18)}</span>` : ''; }
const zzz = status => status === 'idle' ? '<span class="ps-zzz" aria-hidden="true"><i>z</i><i>Z</i><i>Z</i></span>' : '';
function plaque(c, w, h, cls, text) { return `<span class="ps-plaque ${cls}" style="${pct(c[0] - w / 2, c[1] - h / 2, w, h)}">${esc(text)}</span>`; }

function station(s, i) {
  const [bx, by, bw, bh] = SLOTS[i].box, [mx, my, mw, mh] = SLOTS[i].mon;
  const mon = `left:${((mx - bx) / bw * 100).toFixed(2)}%;top:${((my - by) / bh * 100).toFixed(2)}%;width:${(mw / bw * 100).toFixed(2)}%;height:${(mh / bh * 100).toFixed(2)}%`;
  return `<button class="ps-station st-${s.status}" style="${pct(bx, by, bw, bh)}" data-agent="${esc(s.agent.id)}" aria-label="${esc(s.label)}">${s.status === 'idle' ? `<img class="ps-sleep" src="/assets/sleep-${i}.png" alt="" aria-hidden="true">` : ''}<span class="ps-veil"></span><span class="ps-mon" style="${mon}"></span>${badge(s.status)}${zzz(s.status)}</button>`;
}
function supervisor(s) {
  const status = s?.status || 'none', sitting = status !== 'running';
  const swap = `<img class="ps-sup-sit ${sitting ? 'on' : ''}" style="${pct(...SUP_SWAP)}" src="/assets/sup-sit.jpg" alt="" aria-hidden="true">`;
  const btn = s ? `<button class="ps-station ps-sup st-${status}" style="${pct(...SUP_BOX)}" data-agent="${esc(s.agent.id)}" aria-label="${esc(s.label)}"><span class="ps-veil"></span>${badge(status)}${zzz(status)}</button>` : '';
  return `${swap}${btn}${plaque(SUP_PILL, 190, 44, 'ps-pill', s?.agent.name || 'Supervisor')}`;
}
export function renderPhotoOffice(host, { stations, supervisor: sup, onSelect }) {
  const today = new Date().toLocaleDateString('pt-BR', { year: 'numeric', month: '2-digit', day: '2-digit' }).split('/').reverse().join('.');
  const html = `<div class="photo-scene" role="group" aria-label="Escritório do Code Room"><img class="ps-bg" src="/assets/scene.jpg" alt="">
    ${plaque([619, 139], 134, 50, 'ps-sign', 'code room')}${plaque([141, 212], 158, 58, 'ps-date', today)}
    ${SLOTS.map((sl, i) => stations[i] ? station(stations[i], i) + plaque(sl.pill, 142, 38, 'ps-pill', stations[i].agent.name) : plaque(sl.pill, 142, 38, 'ps-pill free', 'livre')).join('')}
    ${supervisor(sup)}</div>`;
  host._onSelect = onSelect;
  if (host.dataset.sig !== html) { host.dataset.sig = html; host.innerHTML = html; }
  if (!host.dataset.bound) {
    host.dataset.bound = '1';
    host.addEventListener('click', e => { const g = e.target.closest('[data-agent]'); if (g) host._onSelect(g.dataset.agent); });
  }
}
