// Modelo e esforço (nível de raciocínio) de cada IA. Os níveis aceitos vêm da própria IA: Codex usa model_reasoning_effort;
// Claude Code e Antigravity usam --effort. Hermes e as IAs conectadas pela pessoa não têm esse ajuste.
export const EFFORTS = { codex: ['low', 'medium', 'high', 'xhigh'], claude: ['low', 'medium', 'high', 'xhigh', 'max'], agy: ['low', 'medium', 'high', 'xhigh', 'max'] };
export const EFFORT_LABEL = { low: 'baixo', medium: 'médio', high: 'alto', xhigh: 'muito alto', max: 'máximo' };
export const effortsFor = provider => EFFORTS[provider] || [];

// Aceita '' (usar o padrão da IA) ou um nível válido para aquele provedor. Qualquer outra coisa é recusada com explicação.
export function cleanEffort(provider, value) {
  const v = String(value ?? '').trim().toLowerCase(); if (!v) return '';
  const ok = effortsFor(provider); if (!ok.length) throw new Error('Esta IA não tem ajuste de esforço.');
  if (!ok.includes(v)) throw new Error(`Esforço inválido para esta IA. Use: ${ok.join(', ')}.`);
  return v;
}
// Acha o modelo aceito pela IA mais parecido com o que a pessoa (ou o Assistente) escreveu: "Gemini Flash 3.8" vira
// "gemini-3.8-flash-medium". Compara palavras, sem depender da ordem; no empate prefere o nível médio. Sem semelhança suficiente: null.
const words = s => String(s ?? '').toLowerCase().replace(/\(([^)]*)\)/g, ' $1 ').split(/[^a-z0-9.]+/).map(w => w.replace(/^\.+|\.+$/g, '')).filter(Boolean);
export function matchModel(input, models = []) {
  const want = String(input ?? '').trim(); if (!want || !models.length) return null;
  const exact = models.find(m => m.id.toLowerCase() === want.toLowerCase() || String(m.label || '').toLowerCase() === want.toLowerCase()); if (exact) return exact.id;
  const w = [...new Set(words(want))]; if (!w.length) return null;
  let best = null;
  for (const m of models) {
    const have = new Set([...words(m.id), ...words(m.label)]), hit = w.filter(x => have.has(x)).length;
    const score = hit * 10 + (have.has('medium') ? 2 : 0) - m.id.length / 100;
    if (hit && (!best || score > best.score)) best = { id: m.id, hit, score };
  }
  return best && best.hit >= Math.max(1, Math.ceil(w.length * 0.6)) ? best.id : null;
}
// Nome do modelo: só caracteres de identificador (vai para a linha de comando da IA, sem shell, mas mantemos curto e limpo).
export function cleanModel(value) {
  const v = String(value ?? '').trim(); if (!v) return '';
  if (v.length > 80 || !/^[A-Za-z0-9][A-Za-z0-9._:/@+-]*$/.test(v)) throw new Error('Modelo inválido: use só letras, números e . _ : / - (até 80 caracteres).');
  return v;
}
