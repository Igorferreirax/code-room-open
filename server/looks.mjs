// Visual do boneco 3D de cada agente. Só dados simples e validados: o desenho é feito no navegador.
export const LOOK_OPTIONS = {
  hair: ['none', 'curto', 'topete', 'moicano', 'longo'],
  hat: ['none', 'bone', 'cartola', 'gorro', 'chapeu'],
  accessory: ['none', 'oculos', 'fone', 'capa', 'gravata', 'cachecol'],
  face: ['feliz', 'serio', 'sono', 'assustado']
};
const color = (v, d) => (/^#[0-9a-f]{6}$/i.test(String(v)) ? String(v).toLowerCase() : d);
const pick = (v, list) => (list.includes(v) ? v : list[0]);
// Miniatura (PNG) tirada do próprio boneco, para aparecer nos cards sem abrir o 3D. Limite pequeno de propósito.
const THUMB = /^data:image\/png;base64,[A-Za-z0-9+/=]{20,60000}$/;

export function cleanLook(v) {
  if (v == null) return null;
  if (typeof v !== 'object' || Array.isArray(v)) throw new Error('Visual do boneco inválido.');
  const size = Number(v.size);
  return {
    skin: color(v.skin, '#f1c27d'), shirt: color(v.shirt, '#3b82f6'), pants: color(v.pants, '#1f2937'), hairColor: color(v.hairColor, '#2b1b12'), accent: color(v.accent, '#ef4444'),
    hair: pick(v.hair, LOOK_OPTIONS.hair), hat: pick(v.hat, LOOK_OPTIONS.hat), accessory: pick(v.accessory, LOOK_OPTIONS.accessory), face: pick(v.face, LOOK_OPTIONS.face),
    size: Number.isFinite(size) ? Math.min(1.2, Math.max(0.8, size)) : 1,
    thumb: THUMB.test(String(v.thumb || '')) ? v.thumb : null
  };
}
