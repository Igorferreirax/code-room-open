// Mascote do Assistente (0.4.0): o Nico é uma bolinha de vidro azul e violeta com olhos, a mesma do Nico de mesa
// (scripts/nico-flutuante.ps1). O humor muda os olhos e a cor da borda de luz. Desenho original do Code Room.
export const MOODS = {
  feliz: { label: 'tudo certo', ring: 'var(--accent)' }, pensando: { label: 'pensando…', ring: 'var(--accent-h)' }, dormindo: { label: 'dormindo', ring: 'var(--line)' },
  preocupado: { label: 'algo falhou', ring: '#ef5b5b' }, alerta: { label: 'notei algo', ring: '#f5b73b' }, surpreso: { label: 'tenho novidade', ring: '#2dd4a0' },
};
const RIM = { feliz: '#78f0ff', pensando: '#78f0ff', dormindo: '#8fa3c7', preocupado: '#ff7a7a', alerta: '#ffcd6e', surpreso: '#5fffc8' };
const EYES = {
  feliz: '<rect class="mc-eye" x="24.6" y="25" width="4.4" height="12" rx="2.2"/><rect class="mc-eye" x="35" y="25" width="4.4" height="12" rx="2.2"/>',
  pensando: '<rect class="mc-eye" x="25.6" y="22" width="4.4" height="10" rx="2.2"/><rect class="mc-eye" x="36" y="22" width="4.4" height="10" rx="2.2"/><g class="mc-dots"><circle cx="26" cy="41" r="1.6"/><circle cx="32" cy="41" r="1.6"/><circle cx="38" cy="41" r="1.6"/></g>',
  dormindo: '<path d="M23.5 32 q3 2.6 6 0 M34.5 32 q3 2.6 6 0" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><text class="mc-z" x="44" y="18">z</text>',
  preocupado: '<rect x="24.6" y="26" width="4.4" height="10" rx="2.2" transform="rotate(-14 26.8 31)"/><rect x="35" y="26" width="4.4" height="10" rx="2.2" transform="rotate(14 37.2 31)"/>',
  alerta: '<rect x="24.2" y="23.5" width="5.2" height="14" rx="2.6"/><rect x="34.6" y="23.5" width="5.2" height="14" rx="2.6"/>',
  surpreso: '<rect class="mc-eye" x="24.4" y="23" width="4.8" height="15" rx="2.4"/><rect class="mc-eye" x="34.8" y="23" width="4.8" height="15" rx="2.4"/>',
};
let seq = 0;
export function mascot(mood = 'feliz', size = 40) {
  const m = EYES[mood] ? mood : 'feliz', id = 'nb' + (++seq).toString(36), rim = RIM[m];
  return `<svg class="mascot nico-orb mc-${m}" width="${size}" height="${size}" viewBox="0 0 64 64" role="img" aria-label="Assistente: ${MOODS[m].label}"><defs>
    <radialGradient id="${id}b" cx="35%" cy="28%" r="78%"><stop offset="0" stop-color="#d9d4ff"/><stop offset=".35" stop-color="#8f84ff"/><stop offset=".72" stop-color="#5546f0"/><stop offset="1" stop-color="#2f22b8"/></radialGradient>
    <radialGradient id="${id}r" cx="50%" cy="100%" r="62%"><stop offset="0" stop-color="${rim}" stop-opacity=".95"/><stop offset="1" stop-color="${rim}" stop-opacity="0"/></radialGradient>
    <radialGradient id="${id}h" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff" stop-opacity=".8"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    <radialGradient id="${id}g" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${rim}" stop-opacity=".45"/><stop offset="1" stop-color="${rim}" stop-opacity="0"/></radialGradient></defs>
    <g class="mc-body"><ellipse cx="32" cy="55" rx="24" ry="7" fill="url(#${id}g)"/><circle cx="32" cy="31" r="24" fill="url(#${id}b)"/><circle cx="32" cy="31" r="24" fill="url(#${id}r)"/>
    <ellipse cx="23.5" cy="20" rx="10" ry="7" fill="url(#${id}h)" transform="rotate(-28 23.5 20)"/><g class="mc-eyes" fill="#fff">${EYES[m]}</g></g></svg>`;
}

// Humor atual do Assistente, na ordem de importância: pensando > falha > aviso > novidade > dormindo (ainda não apresentado) > tudo certo.
export function moodOf(a, { unread = false } = {}) {
  if (!a) return 'feliz';
  if (a.pending || a.briefing) return 'pensando';
  const al = (a.alerts || []).filter(x => x.level !== 'info');
  if (al.some(x => x.level === 'bad')) return 'preocupado';
  if (al.length) return 'alerta';
  if (unread) return 'surpreso';
  if (!a.briefed) return 'dormindo';
  return 'feliz';
}
// Frase curta que o mascote "fala" ao lado do balão quando o chat está fechado.
export function sayOf(a, { unread = false } = {}) {
  if (!a) return '';
  if (a.pending) return '';
  const al = (a.alerts || []).filter(x => x.level !== 'info'); if (al.length) return al[0].title;
  if (unread) return 'Respondi! Toque para ver.';
  return '';
}
