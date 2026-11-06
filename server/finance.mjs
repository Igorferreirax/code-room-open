import { createHash } from 'node:crypto';

// Ledger financeiro: valores em centavos inteiros, cálculo determinístico, lançamentos com origem e sem duplicidade.
// Nenhuma função aqui move dinheiro. Uma LLM pode apenas SUGERIR categoria, e a sugestão é validada contra a lista fixa.
export const CATEGORIES = ['receita', 'moradia', 'alimentacao', 'transporte', 'saude', 'lazer', 'assinaturas', 'impostos', 'divida', 'outros'];
const normText = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

export function parseAmount(value) {
  if (Number.isInteger(value)) return value;
  if (typeof value !== 'string') throw new Error('Valor inválido.');
  const m = value.trim().match(/^(-)?(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{1,2}))?$/);
  if (!m) throw new Error('Valor inválido. Use centavos inteiros ou texto como "1.234,56".');
  const cents = Number(m[2].replace(/\./g, '')) * 100 + Number((m[3] || '0').padEnd(2, '0'));
  return m[1] ? -cents : cents;
}

export function validateEntry(input) {
  const date = String(input.date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new Error('Data inválida (AAAA-MM-DD).');
  const amountCents = parseAmount(input.amount);
  if (amountCents === 0 || Math.abs(amountCents) > 100_000_000_00) throw new Error('Valor fora do intervalo permitido.');
  const description = typeof input.description === 'string' && input.description.trim() && input.description.length <= 200 ? input.description.trim() : null;
  if (!description) throw new Error('Descrição obrigatória (até 200 caracteres).');
  const account = typeof input.account === 'string' && input.account.trim() && input.account.length <= 60 ? input.account.trim() : null;
  if (!account) throw new Error('Conta obrigatória.');
  const source = input.source;
  if (!source || !['manual', 'import', 'suggestion-accepted'].includes(source.type) || typeof source.ref !== 'string' || !source.ref.trim() || source.ref.length > 200) throw new Error('Origem obrigatória: { type: manual|import|suggestion-accepted, ref }.');
  const category = input.category ?? 'outros';
  if (!CATEGORIES.includes(category)) throw new Error(`Categoria inválida. Use: ${CATEGORIES.join(', ')}.`);
  return { date, amountCents, description, account, source: { type: source.type, ref: source.ref.trim() }, category };
}

export function entryId(projectId, e) {
  return createHash('sha256').update([projectId, normText(e.account), e.date, e.amountCents, normText(e.description), e.source.ref].join('|')).digest('hex').slice(0, 32);
}

export function addEntry(store, project, input) {
  if (project.area !== 'Financeiro') throw new Error('Lançamentos só existem em projetos da área Financeiro.');
  const e = validateEntry(input), id = entryId(project.id, e);
  const existing = store.get('ledger', id);
  if (existing) return { entry: existing, duplicate: true };
  return { entry: store.put('ledger', { id, projectId: project.id, ...e, currency: 'BRL', createdAt: new Date().toISOString() }), duplicate: false };
}

export function balances(store, projectId) {
  const rows = store.list('ledger').filter(e => e.projectId === projectId);
  const byAccount = {}, byCategory = {};
  let total = 0;
  for (const e of rows) { total += e.amountCents; byAccount[e.account] = (byAccount[e.account] || 0) + e.amountCents; byCategory[e.category] = (byCategory[e.category] || 0) + e.amountCents; }
  return { entries: rows.length, totalCents: total, byAccountCents: byAccount, byCategoryCents: byCategory, currency: 'BRL' };
}

// Sugestão determinística por palavras-chave; devolve null quando não há certeza (nunca inventa).
const RULES = [['assinaturas', /netflix|spotify|youtube premium|assinatura|icloud|adobe/], ['alimentacao', /mercado|padaria|restaurante|ifood|lanche/], ['transporte', /uber|99|combustivel|gasolina|onibus/], ['moradia', /aluguel|condominio|luz|agua|internet/], ['saude', /farmacia|consulta|plano de saude/], ['receita', /salario|pagamento recebido|pix recebido/]];
export function suggestCategory(description) {
  const t = normText(description);
  return RULES.find(([, re]) => re.test(t))?.[0] ?? null;
}
// Valida uma sugestão vinda de uma LLM: só entra se estiver na lista fixa.
export function acceptSuggestion(value) { return CATEGORIES.includes(value) ? value : null; }
