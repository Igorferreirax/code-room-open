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
// Nome do modelo: só caracteres de identificador (vai para a linha de comando da IA, sem shell, mas mantemos curto e limpo).
export function cleanModel(value) {
  const v = String(value ?? '').trim(); if (!v) return '';
  if (v.length > 80 || !/^[A-Za-z0-9][A-Za-z0-9._:/@+-]*$/.test(v)) throw new Error('Modelo inválido: use só letras, números e . _ : / - (até 80 caracteres).');
  return v;
}
