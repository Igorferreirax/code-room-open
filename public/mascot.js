// Mascote do Assistente: uma cabecinha de robô com olhos de LED que muda de humor conforme o que acontece na ferramenta.
// Desenho original (visor escuro, olhos ciano, fones), inspirado na ideia de "um rosto que mostra o estado", sem copiar nenhum personagem existente.
export const MOODS = {
  feliz: { label: 'tudo certo', ring: 'var(--accent)' }, pensando: { label: 'pensando…', ring: 'var(--accent-h)' }, dormindo: { label: 'dormindo', ring: 'var(--line)' },
  preocupado: { label: 'algo falhou', ring: '#ef5b5b' }, alerta: { label: 'notei algo', ring: '#f5b73b' }, surpreso: { label: 'tenho novidade', ring: '#2dd4a0' },
};
const EYE = '#59e0ff';
const eyes = {
  feliz: `<path class="mc-eye" d="M17 34 Q23 25 29 34" /><path class="mc-eye" d="M35 34 Q41 25 47 34" /><path class="mc-mouth" d="M28 41 Q32 44 36 41" />`,
  pensando: `<circle class="mc-eye" cx="23" cy="31" r="4.6" fill="${EYE}" stroke="none" /><circle class="mc-eye" cx="41" cy="31" r="4.6" fill="${EYE}" stroke="none" /><g class="mc-dots"><circle cx="27" cy="41" r="1.7" /><circle cx="32" cy="41" r="1.7" /><circle cx="37" cy="41" r="1.7" /></g>`,
  dormindo: `<path class="mc-eye" d="M17 30 Q23 37 29 30" /><path class="mc-eye" d="M35 30 Q41 37 47 30" /><text class="mc-z" x="46" y="22">z</text>`,
  preocupado: `<ellipse cx="23" cy="31" rx="4.4" ry="6" fill="${EYE}" stroke="none" transform="rotate(-18 23 31)" /><ellipse cx="41" cy="31" rx="4.4" ry="6" fill="${EYE}" stroke="none" transform="rotate(18 41 31)" /><path class="mc-mouth" d="M28 43 Q32 40 36 43" />`,
  alerta: `<rect x="16.5" y="28" width="13" height="6.2" rx="3" fill="${EYE}" stroke="none" transform="rotate(16 23 31)" /><rect x="34.5" y="28" width="13" height="6.2" rx="3" fill="${EYE}" stroke="none" transform="rotate(-16 41 31)" />`,
  surpreso: `<ellipse class="mc-eye" cx="23" cy="30" rx="4.8" ry="7" fill="${EYE}" stroke="none" /><ellipse class="mc-eye" cx="41" cy="30" rx="4.8" ry="7" fill="${EYE}" stroke="none" /><ellipse cx="32" cy="43" rx="2.4" ry="3" fill="${EYE}" stroke="none" />`,
};
export function mascot(mood = 'feliz', size = 40) {
  const m = eyes[mood] ? mood : 'feliz';
  return `<svg class="mascot mc-${m}" width="${size}" height="${size}" viewBox="0 0 64 64" role="img" aria-label="Assistente: ${MOODS[m].label}"><g class="mc-body">
    <rect x="3" y="26" width="6" height="14" rx="3" fill="#26314d" /><rect x="55" y="26" width="6" height="14" rx="3" fill="#26314d" /><rect x="3.8" y="30" width="1.6" height="6" rx=".8" fill="${EYE}" /><rect x="58.6" y="30" width="1.6" height="6" rx=".8" fill="${EYE}" />
    <rect x="7" y="10" width="50" height="44" rx="19" fill="#f1f4fc" /><rect x="12" y="15" width="40" height="34" rx="14" fill="#0b1a33" /><rect x="27" y="7" width="10" height="4" rx="2" fill="#2dd4a0" />
    <g class="mc-eyes" fill="none" stroke="${EYE}" stroke-width="4" stroke-linecap="round">${eyes[m]}</g></g></svg>`;
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
