// "Ver o que foi enviado": guarda um resumo das últimas chamadas que o Code Room fez para fora (redes sociais e testes da Biblioteca de APIs),
// para a pessoa conferir exatamente o que saiu. Chaves, tokens e senhas são mascarados ANTES de guardar. A resposta do serviço não é guardada (só o código).

const MAX_ITEMS = 40, BODY_MAX = 1500;

export const mask = s => String(s ?? '')
  .replace(/(Bearer\s+)[A-Za-z0-9._~+\/=-]{8,}/gi, '$1***')
  .replace(/\b(sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{8,}|github_pat_\w{8,}|glif_v1_\w{8,}|xox[bap]-[\w-]{8,}|AKIA[0-9A-Z]{12,}|AIza[\w-]{20,})/g, '***')
  .replace(/eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{5,}/g, '***')
  .replace(/(bot)\d{5,12}:[\w-]{20,}/gi, '$1***')
  .replace(/(\/webhooks\/\d+\/)[\w-]+/g, '$1***')
  .replace(/("?(?:password|senha|token|secret|accessJwt|refreshJwt|appPassword|client_secret|api[_-]?key|key)"?\s*[:=]\s*"?)[^"&,}\s]+/gi, '$1***');

const SECRET_HEADER = /^(authorization|cookie|x-api-key|xi-api-key|x-goog-api-key|proxy-authorization|idempotency-key)$/i;
export function headersView(h) {
  const out = {}; const put = (k, v) => { out[k] = SECRET_HEADER.test(k) ? '***' : mask(String(v)).slice(0, 120); };
  if (!h) return out; if (typeof h.entries === 'function' && !Array.isArray(h)) for (const [k, v] of h.entries()) put(k, v); else if (Array.isArray(h)) for (const [k, v] of h) put(k, v); else for (const [k, v] of Object.entries(h)) put(k, v);
  return out;
}
export function bodyView(b) {
  if (b == null) return '';
  if (typeof b === 'string') return mask(b.length > BODY_MAX ? b.slice(0, BODY_MAX) + `… (+${b.length - BODY_MAX} caracteres)` : b);
  if (typeof FormData !== 'undefined' && b instanceof FormData) return [...b.entries()].map(([k, v]) => v && typeof v === 'object' && 'size' in v ? `${k}: [arquivo${v.name ? ' ' + v.name : ''}, ${v.size} bytes]` : `${k}: ${mask(String(v)).slice(0, 300)}`).join('\n');
  if (b instanceof Uint8Array) return `[dados binários, ${b.byteLength} bytes]`;
  if (typeof b.pipe === 'function' || typeof b.getReader === 'function') return '[arquivo enviado em partes]';
  return '[conteúdo não textual]';
}

export class Outbox {
  constructor(store) { this.store = store; }
  list() { return this.store.get('settings', 'outbound')?.items || []; }
  record(e) { const items = [e, ...this.list()].slice(0, MAX_ITEMS); this.store.put('settings', { id: 'outbound', items }); return e; }
  clear() { this.store.put('settings', { id: 'outbound', items: [] }); }
}

// Envolve um fetch: registra o que saiu e o código da resposta; devolve a resposta intacta.
export function loggedFetch(store, fetchFn, label) {
  const box = new Outbox(store);
  return async (url, opts = {}) => {
    const u = String(url), at = new Date().toISOString(); let status = null, error = null;
    try { const r = await fetchFn(url, opts); status = r.status; return r; }
    catch (e) { error = String(e.message || e).slice(0, 200); throw e; }
    finally {
      try { const p = new URL(u); box.record({ at, label, method: String(opts.method || 'GET').toUpperCase(), host: p.host, path: mask(p.pathname + (p.search ? '?***' : '')).slice(0, 200), headers: headersView(opts.headers), body: bodyView(opts.body), status, error }); } catch {}
    }
  };
}
