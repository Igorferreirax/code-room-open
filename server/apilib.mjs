// Biblioteca de APIs: onde a pessoa guarda as chaves/tokens dos serviços que usa, testa se funcionam e,
// quando o serviço informa, vê o consumo restante. A chave fica só neste computador (arquivo 600) e NUNCA volta para a tela.
// Login por OAuth (sem colar chave) exige um aplicativo registrado pela própria pessoa em cada serviço; por isso a primeira versão usa tokens.
import { readFileSync } from 'node:fs';
import { writeFile, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const T = 12000;
const json = async (r, who) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(`${who} recusou (${r.status})${j.error?.message ? ': ' + String(j.error.message).slice(0, 160) : j.message ? ': ' + String(j.message).slice(0, 160) : ''}`); return j; };
const get = (f, url, headers) => f(url, { headers, signal: AbortSignal.timeout(T) });
const n = v => Number.isFinite(Number(v)) ? Number(v) : null;

// Cada serviço: onde pegar a chave, como testar e (se existir) como ler o consumo.
export const SERVICES = {
  github: { name: 'GitHub', where: 'github.com/settings/tokens (token pessoal)', usageNote: 'Mostra o limite de chamadas da API por hora.',
    async check(key, f) { const h = { Authorization: `Bearer ${key}`, 'User-Agent': 'code-room', Accept: 'application/vnd.github+json' }; const u = await json(await get(f, 'https://api.github.com/user', h), 'GitHub'); let usage = null;
      try { const r = (await json(await get(f, 'https://api.github.com/rate_limit', h), 'GitHub')).resources?.core; if (r) usage = { label: 'Chamadas da API nesta hora', used: n(r.used), limit: n(r.limit), remaining: n(r.remaining), resetAt: r.reset ? new Date(r.reset * 1000).toISOString() : null }; } catch {}
      return { detail: `Conectado como ${u.login}.`, usage }; } },
  openai: { name: 'OpenAI', where: 'platform.openai.com/api-keys', usageNote: 'A chave comum não informa saldo; veja em platform.openai.com/usage.',
    async check(key, f) { const j = await json(await get(f, 'https://api.openai.com/v1/models', { Authorization: `Bearer ${key}` }), 'OpenAI'); return { detail: `Chave válida (${(j.data || []).length} modelos liberados).`, usage: null }; } },
  anthropic: { name: 'Anthropic (Claude API)', where: 'console.anthropic.com/settings/keys', usageNote: 'A chave comum não informa saldo; veja em console.anthropic.com.',
    async check(key, f) { const j = await json(await get(f, 'https://api.anthropic.com/v1/models', { 'x-api-key': key, 'anthropic-version': '2023-06-01' }), 'Anthropic'); return { detail: `Chave válida (${(j.data || []).length} modelos).`, usage: null }; } },
  gemini: { name: 'Google Gemini (AI Studio)', where: 'aistudio.google.com/apikey', usageNote: 'O consumo fica no painel do Google AI Studio.',
    async check(key, f) { const j = await json(await get(f, 'https://generativelanguage.googleapis.com/v1beta/models', { 'x-goog-api-key': key }), 'Google'); return { detail: `Chave válida (${(j.models || []).length} modelos).`, usage: null }; } },
  groq: { name: 'Groq', where: 'console.groq.com/keys', usageNote: 'O consumo fica no painel da Groq.',
    async check(key, f) { const j = await json(await get(f, 'https://api.groq.com/openai/v1/models', { Authorization: `Bearer ${key}` }), 'Groq'); return { detail: `Chave válida (${(j.data || []).length} modelos).`, usage: null }; } },
  openrouter: { name: 'OpenRouter', where: 'openrouter.ai/keys', usageNote: 'Mostra gasto e limite da chave.',
    async check(key, f) { const d = (await json(await get(f, 'https://openrouter.ai/api/v1/key', { Authorization: `Bearer ${key}` }), 'OpenRouter')).data || {}; const usage = { label: 'Gasto da chave (US$)', used: n(d.usage), limit: n(d.limit), remaining: n(d.limit_remaining) };
      return { detail: d.label ? `Chave “${String(d.label).slice(0, 40)}” válida.` : 'Chave válida.', usage: usage.used == null ? null : usage }; } },
  elevenlabs: { name: 'ElevenLabs', where: 'elevenlabs.io (perfil › chave de API)', usageNote: 'Mostra os caracteres usados e restantes do mês.',
    async check(key, f) { const j = await json(await get(f, 'https://api.elevenlabs.io/v1/user/subscription', { 'xi-api-key': key }), 'ElevenLabs'); const used = n(j.character_count), limit = n(j.character_limit);
      return { detail: `Plano ${j.tier || 'desconhecido'}.`, usage: used == null || limit == null ? null : { label: 'Caracteres no período', used, limit, remaining: Math.max(0, limit - used), resetAt: j.next_character_count_reset_unix ? new Date(j.next_character_count_reset_unix * 1000).toISOString() : null } }; } },
  outro: { name: 'Outra API (só guardar)', where: 'o painel do serviço', usageNote: 'Sem teste automático: o Code Room só guarda a chave com segurança.', async check() { return { detail: 'Guardada. Este serviço não tem teste automático.', usage: null }; } },
};

export class ApiLibrary {
  constructor(store, { dataDir, fetchFn = fetch } = {}) { this.store = store; this.dir = dataDir; this.fetch = fetchFn; }
  #secrets() { try { return JSON.parse(readFileSync(join(this.dir, 'api-secrets.json'), 'utf8')); } catch { return {}; } }
  async #save(o) { const f = join(this.dir, 'api-secrets.json'); await writeFile(f, JSON.stringify(o, null, 2)); try { await chmod(f, 0o600); } catch {} }
  catalog() { return Object.fromEntries(Object.entries(SERVICES).map(([k, v]) => [k, { name: v.name, where: v.where, usageNote: v.usageNote }])); }
  #view(e, s) { return { id: e.id, service: e.service, name: e.name, note: e.note || '', hasKey: !!s[e.id]?.key, tail: s[e.id]?.key ? '…' + String(s[e.id].key).slice(-4) : '', createdAt: e.createdAt, last: e.last || null }; }
  list() { const s = this.#secrets(); return this.store.list('apiKeys').sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(e => this.#view(e, s)); }
  async save(b) {
    const svc = SERVICES[b.service]; if (!svc) throw new Error('Escolha o serviço da lista.');
    const old = b.id ? this.store.get('apiKeys', b.id) : null; if (b.id && !old) throw new Error('Entrada não encontrada.');
    const name = String(b.name || svc.name).trim().slice(0, 80) || svc.name, key = String(b.key ?? '').trim();
    if (!old && !key) throw new Error('Cole a chave ou o token.'); if (key && (key.length < 8 || key.length > 500 || /\s/.test(key))) throw new Error('Chave inválida (sem espaços, de 8 a 500 caracteres).');
    const e = { id: old?.id || randomUUID(), service: old?.service || b.service, name, note: String(b.note ?? old?.note ?? '').slice(0, 200), createdAt: old?.createdAt || new Date().toISOString(), last: old?.last || null };
    this.store.put('apiKeys', e); const s = this.#secrets(); if (key) { s[e.id] = { key }; await this.#save(s); }
    return this.#view(e, s);
  }
  async remove(id) { if (!this.store.get('apiKeys', id)) throw new Error('Entrada não encontrada.'); this.store.remove('apiKeys', id); const s = this.#secrets(); delete s[id]; await this.#save(s); return { ok: true }; }
  // Testa a chave e guarda o último resultado (sem a chave). O consumo só aparece quando o serviço informa.
  async check(id) {
    const e = this.store.get('apiKeys', id); if (!e) throw new Error('Entrada não encontrada.'); const key = this.#secrets()[id]?.key; if (!key) throw new Error('Sem chave guardada.');
    let last; try { const r = await SERVICES[e.service].check(key, this.fetch); last = { ok: true, detail: r.detail, usage: r.usage, at: new Date().toISOString() }; }
    catch (err) { last = { ok: false, detail: String(err.message || err).replace(key, '***').slice(0, 300), usage: null, at: new Date().toISOString() }; }
    this.store.put('apiKeys', { ...e, last }); return last;
  }
}
