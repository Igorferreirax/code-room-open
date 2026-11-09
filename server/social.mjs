import { readFile, writeFile, chmod, stat } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { join, extname, basename } from 'node:path';
import { safeFile } from './deliverables.mjs';

// Redes sociais: várias contas, em várias redes, e um agente responsável por propor as postagens.
// Regras que não mudam:
//  1) NADA é publicado sem a sua aprovação PARA CADA postagem (texto, conta e horário); depois de aprovada e agendada, o Code Room publica no horário;
//  2) senhas e tokens ficam só neste computador (.data/social-secrets.json, fora do Git) e nunca saem pela API nem pelo histórico;
//  3) rede sem publicação automática (ou conta sem credencial) vira PACOTE PRONTO: você copia o texto, posta no app da rede e marca "postado".
const now = () => new Date().toISOString();
export const MEDIA_EXT = { image: ['.png', '.jpg', '.jpeg', '.gif', '.webp'], video: ['.mp4', '.mov', '.webm'] };
const kindOf = p => MEDIA_EXT.image.includes(extname(p).toLowerCase()) ? 'image' : MEDIA_EXT.video.includes(extname(p).toLowerCase()) ? 'video' : null;
const MAX_MEDIA = 4, MAX_BYTES = 200 * 1024 * 1024, MAX_PER_DAY = 10;

// Catálogo: o que cada rede aceita HOJE (varredura de 09/11/2026; as redes mudam regras e preços: confira a documentação oficial antes de depender de algo).
// api: 'pronto' = o Code Room publica sozinho (depois da sua aprovação); 'manual' = pacote pronto, você posta; os motivos estão em `nota`.
export const CATALOG = {
  youtube: { name: 'YouTube', api: 'pronto', kinds: ['video'], text: 5000, fields: [], nota: 'Usa a conexão do Google feita logo abaixo, em “YouTube e Google” (um canal por conexão). Sem o app do Google verificado, os vídeos entram como privados.' },
  bluesky: { name: 'Bluesky', api: 'pronto', kinds: ['text', 'image'], text: 300, fields: [{ key: 'handle', label: 'Usuário (ex.: voce.bsky.social)' }, { key: 'appPassword', label: 'Senha de aplicativo (Configurações › Senhas de aplicativo)', secret: true }], nota: 'Rede aberta e simples: usa uma senha de aplicativo (nunca a senha da conta). Texto e até 4 imagens; vídeo ainda vira pacote.' },
  mastodon: { name: 'Mastodon', api: 'pronto', kinds: ['text', 'image'], text: 500, fields: [{ key: 'instance', label: 'Endereço da instância (https://mastodon.social)' }, { key: 'token', label: 'Token de acesso (Preferências › Desenvolvimento › Novo aplicativo, permissão write:statuses e write:media)', secret: true }], nota: 'Texto e até 4 imagens. O limite de caracteres varia por instância (500 é o padrão).' },
  telegram: { name: 'Telegram (canal ou grupo)', api: 'pronto', kinds: ['text', 'image', 'video'], text: 4096, fields: [{ key: 'chatId', label: 'Canal ou grupo (@meucanal ou número)' }, { key: 'botToken', label: 'Token do bot (@BotFather); o bot precisa ser administrador do canal', secret: true }], nota: 'Texto, imagem e vídeo (até 50 MB pelo bot).' },
  discord: { name: 'Discord (canal)', api: 'pronto', kinds: ['text', 'image', 'video'], text: 2000, fields: [{ key: 'webhook', label: 'Endereço do webhook (Editar canal › Integrações › Webhooks)', secret: true }], nota: 'Texto e arquivos de até 25 MB.' },
  x: { name: 'X (Twitter)', api: 'manual', kinds: ['text', 'image', 'video'], text: 280, fields: [{ key: 'handle', label: 'Usuário (@voce)' }], nota: 'A API de postagem do X passou a ser paga por uso em 2026 (cerca de US$ 0,015 por post, mais caro com link). Por enquanto: pacote pronto. A publicação automática entra quando você quiser assumir esse custo.' },
  instagram: { name: 'Instagram', api: 'manual', kinds: ['image', 'video'], text: 2200, fields: [{ key: 'handle', label: 'Usuário (@voce)' }], nota: 'A API oficial só publica em conta profissional ligada a uma página do Facebook e exige um app Meta; o vídeo precisa de upload especial. Por enquanto: pacote pronto (vídeo, legenda e hashtags).' },
  threads: { name: 'Threads', api: 'manual', kinds: ['text', 'image', 'video'], text: 500, fields: [{ key: 'handle', label: 'Usuário (@voce)' }], nota: 'Tem API oficial (OAuth, até 250 posts por dia), mas exige um app Meta aprovado. Por enquanto: pacote pronto.' },
  facebook: { name: 'Facebook (página)', api: 'manual', kinds: ['text', 'image', 'video'], text: 63206, fields: [{ key: 'handle', label: 'Nome da página' }], nota: 'Postagem em página via Graph API exige app Meta. Por enquanto: pacote pronto.' },
  linkedin: { name: 'LinkedIn', api: 'manual', kinds: ['text', 'image', 'video'], text: 3000, fields: [{ key: 'handle', label: 'Perfil ou página' }], nota: 'Perfil pessoal tem API (Share on LinkedIn, sem revisão); página da empresa exige aprovação. Por enquanto: pacote pronto.' },
  tiktok: { name: 'TikTok', api: 'manual', kinds: ['video'], text: 2200, fields: [{ key: 'handle', label: 'Usuário (@voce)' }], nota: 'A API só publica em modo privado até o app passar por uma auditoria do TikTok. Por enquanto: pacote pronto.' },
};
export const NETWORK_IDS = Object.keys(CATALOG);
const slug = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
const clip = (s, n) => String(s ?? '').slice(0, n);
export const MENTION_RE = /(^|[\s(])\+([a-z0-9][a-z0-9-]{1,39})(?![\w-])/g;

// Endereços que o Code Room aceita chamar (nada de rede interna): https, sem IP privado nem localhost.
const publicHttps = (raw, { hostRe } = {}) => { let u; try { u = new URL(String(raw ?? '').trim()); } catch { throw new Error('Endereço inválido.'); }
  if (u.protocol !== 'https:') throw new Error('O endereço precisa começar com https://.');
  const h = u.hostname.toLowerCase(); if (h === 'localhost' || /^(127|10|0)\./.test(h) || /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || /^169\.254\./.test(h) || h === '::1' || h.endsWith('.local') || h.endsWith('.internal')) throw new Error('Endereço de rede interna não é permitido.');
  if (hostRe && !hostRe.test(h)) throw new Error('Endereço não reconhecido para esta rede.'); return u; };

export class Social {
  constructor(store, { dataDir, fetchFn = (...a) => fetch(...a), publisher = null, projectPath = id => store.get('projects', id)?.path } = {}) {
    Object.assign(this, { store, dir: dataDir, fetch: fetchFn, publisher, projectPath });
  }
  #secrets() { try { return JSON.parse(readFileSync(join(this.dir, 'social-secrets.json'), 'utf8')); } catch { return {}; } }   // síncrono: a leitura é pequena e as menções são resolvidas em rotinas síncronas
  async #saveSecrets(o) { const f = join(this.dir, 'social-secrets.json'); await writeFile(f, JSON.stringify(o, null, 2)); try { await chmod(f, 0o600); } catch {} }

  // ---------- contas ----------
  #view(a, secrets) { const net = CATALOG[a.network], have = (secrets[a.id] && Object.keys(secrets[a.id]).length) || 0, needSecret = net.fields.filter(f => f.secret).length;
    const ready = net.api === 'pronto' && (a.network === 'youtube' ? true : have >= needSecret && needSecret > 0);
    return { id: a.id, network: a.network, label: a.label, name: a.name, niche: a.niche || '', settings: a.settings || {}, enabled: a.enabled !== false, mode: ready ? 'api' : 'manual', hasSecret: have > 0, maxPerDay: a.maxPerDay || MAX_PER_DAY, createdAt: a.createdAt, lastPostAt: a.lastPostAt || null }; }
  accounts() { const s = this.#secrets(); return this.store.list('socialAccounts').sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(a => this.#view(a, s)); }
  async saveAccount(b) {
    const net = CATALOG[b.network]; if (!net) throw new Error('Escolha uma rede da lista.');
    const old = b.id ? this.store.get('socialAccounts', b.id) : null; if (b.id && !old) throw new Error('Conta não encontrada.');
    const name = clip(b.name, 80).trim(); if (!name) throw new Error('Dê um nome à conta (ex.: Canal Terror).');
    let label = slug(b.label || name); if (label.length < 2) throw new Error('O apelido da conta precisa ter pelo menos 2 letras ou números.');
    if (this.store.list('socialAccounts').some(a => a.label === label && a.id !== old?.id)) throw new Error(`Já existe uma conta com o apelido “${label}”.`);
    const settings = { ...(old?.settings || {}) }, secrets = this.#secrets(), mine = { ...(secrets[old?.id] || {}) };
    for (const f of net.fields) { const v = b.fields?.[f.key]; if (v == null || String(v).trim() === '') continue; const val = String(v).trim().slice(0, 600); this.#check(b.network, f.key, val); if (f.secret) mine[f.key] = val; else settings[f.key] = val; }
    if (b.network === 'youtube' || net.api !== 'pronto') { /* sem credencial própria */ }
    const acc = { id: old?.id || randomUUID(), network: b.network, label, name, niche: clip(b.niche, 120).trim(), settings, enabled: b.enabled !== false, maxPerDay: Math.min(50, Math.max(1, Math.trunc(Number(b.maxPerDay)) || old?.maxPerDay || MAX_PER_DAY)), createdAt: old?.createdAt || now(), lastPostAt: old?.lastPostAt || null };
    this.store.put('socialAccounts', acc); if (Object.keys(mine).length) { secrets[acc.id] = mine; await this.#saveSecrets(secrets); }
    return this.#view(acc, secrets);
  }
  #check(network, key, v) {
    if (network === 'mastodon' && key === 'instance') publicHttps(v);
    if (network === 'discord' && key === 'webhook') publicHttps(v, { hostRe: /^(discord|discordapp)\.com$/ }), (() => { if (!/^https:\/\/(discord|discordapp)\.com\/api\/webhooks\/\d+\/[\w-]+$/.test(v)) throw new Error('Endereço de webhook do Discord inválido.'); })();
    if (network === 'telegram' && key === 'chatId' && !/^(@[A-Za-z][\w]{3,}|-?\d{5,20})$/.test(v)) throw new Error('O canal precisa ser @nomedocanal ou um número.');
    if (network === 'telegram' && key === 'botToken' && !/^\d{5,12}:[\w-]{30,}$/.test(v)) throw new Error('Token de bot inválido (formato 123456:ABC…).');
    if (network === 'bluesky' && key === 'handle' && !/^@?[\w.-]+\.[\w.-]+$/.test(v)) throw new Error('Usuário do Bluesky inválido (ex.: voce.bsky.social).');
  }
  async removeAccount(id) { if (!this.store.get('socialAccounts', id)) throw new Error('Conta não encontrada.'); this.store.remove('socialAccounts', id); const s = this.#secrets(); delete s[id]; await this.#saveSecrets(s); return { ok: true }; }

  // ---------- menções (+apelido) e propostas do agente ----------
  // Troca as menções de contas reais por um bloco com o que o agente precisa saber (e como PROPOR a postagem). Menções que não são contas ficam como estão.
  expandMentions(objective) {
    const text = String(objective ?? ''), accs = this.accounts().filter(a => a.enabled), found = new Map();
    for (const m of text.matchAll(MENTION_RE)) { const a = accs.find(x => x.label === m[2]); if (a) found.set(a.label, a); }
    if (!found.size) return { text, accounts: [] };
    const fence = '`'.repeat(3), lines = [...found.values()].map(a => { const n = CATALOG[a.network]; return `- +${a.label}: ${n.name} “${a.name}”${a.settings.handle ? ` (${a.settings.handle})` : ''}${a.niche ? `, nicho: ${a.niche}` : ''}. ${a.mode === 'api' ? 'O Code Room publica depois da aprovação da pessoa' : 'Pacote pronto: a pessoa posta no app da rede'}. Aceita: ${n.kinds.map(k => ({ text: 'texto', image: 'imagem', video: 'vídeo' }[k])).join(', ')}; texto até ${n.text} caracteres.`; });
    return { accounts: [...found.keys()], text: `${text}\n\n[CONTAS PARA POSTAR, mencionadas pela pessoa]\n${lines.join('\n')}\nPara PROPOR a postagem, termine a resposta com um bloco de código cercado por três crases (${fence}) e marcado como code-room-post, com JSON: {"conta": "apelido", "texto": "o texto pronto", "midia": ["pasta/arquivo.mp4"], "quando": "2026-11-10T18:00:00-03:00"}. "midia" e "quando" são opcionais; um bloco por conta (até 4 contas). NUNCA publique por conta própria: a pessoa aprova cada postagem e o horário no Code Room.` };
  }
  async proposePosts(task, answer) {
    const made = [];
    try {
      if (!task || task.status !== 'completed' || task.kind !== 'work' || task.project?.id === 'assistant-internal' || task.project?.area === 'Financeiro') return made;
      const accs = this.accounts().filter(a => a.enabled);
      for (const m of String(answer || '').matchAll(/```code-room-post[^\n]*\n([\s\S]*?)```/g)) {
        if (made.length >= 4) break; let j; try { j = JSON.parse(m[1].replace(/^\ufeff/, '')); } catch { continue; }
        const a = accs.find(x => x.label === slug(j?.conta)); const txt = String(j?.texto ?? '').trim(); if (!a || !txt) continue;
        const id = 'sp' + createHash('sha1').update(`${task.id}|${a.id}|${txt}`).digest('hex').slice(0, 14); if (this.store.get('socialPosts', id)) continue;
        const media = []; for (const rel of (Array.isArray(j.midia) ? j.midia : []).slice(0, MAX_MEDIA)) { try { const f = await safeFile(this.projectPath(task.project.id), String(rel)); if ((await stat(f)).isFile() && kindOf(f)) media.push(String(rel).split('\\').join('/')); } catch {} }
        const when = j.quando ? Date.parse(j.quando) : NaN;
        made.push(this.store.put('socialPosts', { id, accountId: a.id, label: a.label, network: a.network, accountName: a.name, text: clip(txt, 6000), media, projectId: task.project.id, projectName: task.project.name, taskId: task.id, agent: task.agent?.name || '', suggestedAt: Number.isFinite(when) ? new Date(when).toISOString() : null, scheduledAt: null, status: 'proposta', createdAt: now() }));
      }
    } catch {}
    return made;
  }
  // Postagem escrita pela própria pessoa (sem agente), ex.: o post do dia.
  async createPost(b) {
    const acc = this.store.get('socialAccounts', b.accountId); if (!acc) throw new Error('Escolha a conta.');
    const txt = String(b.text ?? '').trim(); if (!txt) throw new Error('Escreva o texto da postagem.'); if (txt.length > 6000) throw new Error('Texto longo demais.');
    const id = 'sp' + randomUUID().replace(/-/g, '').slice(0, 14), when = b.when ? Date.parse(b.when) : NaN;
    return this.store.put('socialPosts', { id, accountId: acc.id, label: acc.label, network: acc.network, accountName: acc.name, text: txt, media: [], projectId: null, projectName: null, taskId: null, agent: 'Você', suggestedAt: Number.isFinite(when) ? new Date(when).toISOString() : null, scheduledAt: null, status: 'proposta', createdAt: now() });
  }
  posts() { return this.store.list('socialPosts').sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 60); }

  // ---------- aprovação (a única porta de saída) ----------
  async approve(id, b = {}, { by = 'computador' } = {}) {
    const { when = 'now', privacy = 'private', confirm } = b; let p = this.store.get('socialPosts', id); if (!p) throw new Error('Postagem não encontrada.'); if (p.status !== 'proposta') throw new Error('Esta postagem já foi tratada.');
    if (confirm !== true) throw new Error('Confirmação explícita obrigatória.');
    const acc = this.store.get('socialAccounts', p.accountId); if (!acc || acc.enabled === false) throw new Error('A conta desta postagem não existe mais ou está desligada.');
    const proj = p.projectId ? this.store.get('projects', p.projectId) : null; if (proj?.area === 'Financeiro') throw new Error('Projetos financeiros não publicam em redes sociais.');
    if (typeof b.text === 'string' && b.text.trim() && b.text.trim() !== p.text) p = { ...p, text: b.text.trim().slice(0, 6000) };   // a pessoa pode editar o texto antes de aprovar
    const net = CATALOG[acc.network], view = this.accounts().find(a => a.id === acc.id), size = p.text.length;
    if (size > net.text) throw new Error(`O texto tem ${size} caracteres e ${net.name} aceita até ${net.text}. Edite o texto antes de aprovar.`);
    const kinds = new Set(p.media.map(m => kindOf(m))); const unsupported = [...kinds].some(k => !net.kinds.includes(k)) || (kinds.has('video') && acc.network === 'bluesky');
    let at = null; if (when !== 'now') { at = Date.parse(when); if (!Number.isFinite(at) || at < Date.now() - 60000) throw new Error('Escolha um horário futuro válido.'); }
    const base = { ...p, approvedAt: now(), approvedBy: by, privacy: ['private', 'unlisted', 'public'].includes(privacy) ? privacy : 'private' };
    if (view.mode !== 'api' || unsupported) return this.store.put('socialPosts', { ...base, status: 'manual', note: unsupported ? 'Esta rede/conta ainda não publica esse tipo de mídia por aqui: o pacote está pronto para você postar.' : 'Pacote pronto: copie o texto e poste no app da rede.', scheduledAt: at ? new Date(at).toISOString() : null });
    await this.#cap(acc);
    if (at) return this.store.put('socialPosts', { ...base, status: 'agendado', scheduledAt: new Date(at).toISOString() });
    return this.#send(this.store.put('socialPosts', { ...base, status: 'enviando', scheduledAt: null }));
  }
  async #cap(acc) {
    const cap = acc.maxPerDay || MAX_PER_DAY, hoje = d => new Date(d).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }), today = hoje(Date.now());
    const n = this.store.list('socialPosts').filter(x => x.accountId === acc.id && ['enviando', 'publicado', 'agendado'].includes(x.status) && hoje(x.scheduledAt || x.approvedAt || x.createdAt) === today).length;
    if (n >= cap) throw new Error(`Limite de ${cap} postagem(ns) por dia nesta conta atingido. Deixe para amanhã ou aumente o limite da conta.`);
  }
  dismiss(id) { const p = this.store.get('socialPosts', id); if (!p) throw new Error('Postagem não encontrada.'); if (!['proposta', 'agendado', 'manual'].includes(p.status)) throw new Error('Esta postagem já foi enviada ou descartada.'); return this.store.put('socialPosts', { ...p, status: 'descartada', decidedAt: now() }); }
  markPosted(id, { url } = {}) {
    const p = this.store.get('socialPosts', id); if (!p) throw new Error('Postagem não encontrada.'); if (p.status !== 'manual') throw new Error('Só pacotes manuais podem ser marcados como postados.');
    const link = String(url || '').trim(); if (link && !/^https?:\/\/\S{3,300}$/.test(link)) throw new Error('O link precisa começar com http:// ou https://.');
    return this.store.put('socialPosts', { ...p, status: 'publicado', url: link || null, publishedAt: now(), postedManually: true });
  }
  // Publica o que está agendado e venceu. Chamado a cada 30 s pelo serviço.
  async tick() { const due = this.store.list('socialPosts').filter(p => p.status === 'agendado' && Date.parse(p.scheduledAt) <= Date.now()); for (const p of due) { try { await this.#send(this.store.put('socialPosts', { ...p, status: 'enviando' })); } catch {} } return due.length; }

  async #send(p) {
    const acc = this.store.get('socialAccounts', p.accountId), secrets = this.#secrets()[acc?.id] || {};
    try {
      if (!acc) throw new Error('Conta removida.');
      const root = p.projectId ? this.projectPath(p.projectId) : null, files = []; for (const rel of p.media || []) { if (!root) break; const f = await safeFile(root, rel); const st = await stat(f); if (st.size > MAX_BYTES) throw new Error(`Arquivo grande demais: ${basename(f)}.`); files.push({ path: f, rel, kind: kindOf(f), size: st.size }); }
      const r = await ADAPTERS[acc.network]({ acc, secrets, post: p, files, fetch: this.fetch, social: this });
      this.store.put('socialAccounts', { ...acc, lastPostAt: now() }); return this.store.put('socialPosts', { ...this.store.get('socialPosts', p.id), status: 'publicado', url: r.url || null, publishedAt: now(), error: null });
    } catch (e) { return this.store.put('socialPosts', { ...this.store.get('socialPosts', p.id), status: 'falhou', error: String(e.message || e).slice(0, 300) }); }
  }
  async test(id) {
    const acc = this.store.get('socialAccounts', id); if (!acc) throw new Error('Conta não encontrada.'); const secrets = this.#secrets()[id] || {}, net = CATALOG[acc.network];
    if (net.api !== 'pronto') return { ok: true, detail: 'Esta rede funciona por pacote pronto: não há conexão para testar.' };
    try { return { ok: true, detail: await CHECKS[acc.network]({ acc, secrets, fetch: this.fetch, social: this }) }; } catch (e) { return { ok: false, detail: String(e.message || e).slice(0, 300) }; }
  }
}

// ---------- adaptadores (um por rede com publicação automática) ----------
const json = async (res, what) => { const t = await res.text(); let j = {}; try { j = JSON.parse(t); } catch {} if (!res.ok) throw new Error(`${what} recusou (${res.status}): ${String(j.error_description || j.message || j.error?.message || j.description || j.error || t).slice(0, 180)}`); return j; };
const blobOf = async (f, type) => { const { readFile: rf } = await import('node:fs/promises'); return new Blob([await rf(f.path)], { type }); };
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm' };

const ADAPTERS = {
  async bluesky({ acc, secrets, post, files, fetch }) {
    const svc = 'https://bsky.social', handle = String(acc.settings.handle || '').replace(/^@/, '');
    const ses = await json(await fetch(`${svc}/xrpc/com.atproto.server.createSession`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: handle, password: secrets.appPassword }) }), 'Bluesky (login)');
    const auth = { Authorization: `Bearer ${ses.accessJwt}` }, images = [];
    for (const f of files.filter(x => x.kind === 'image').slice(0, 4)) { const up = await json(await fetch(`${svc}/xrpc/com.atproto.repo.uploadBlob`, { method: 'POST', headers: { ...auth, 'Content-Type': MIME[extname(f.path).toLowerCase()] }, body: await blobOf(f, MIME[extname(f.path).toLowerCase()]) }), 'Bluesky (imagem)'); images.push({ alt: '', image: up.blob }); }
    const record = { $type: 'app.bsky.feed.post', text: post.text, createdAt: now(), langs: ['pt'], ...(images.length ? { embed: { $type: 'app.bsky.embed.images', images } } : {}) };
    const r = await json(await fetch(`${svc}/xrpc/com.atproto.repo.createRecord`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ repo: ses.did, collection: 'app.bsky.feed.post', record }) }), 'Bluesky (postar)');
    return { url: `https://bsky.app/profile/${handle}/post/${String(r.uri || '').split('/').pop()}` };
  },
  async mastodon({ acc, secrets, post, files, fetch }) {
    const base = publicHttps(acc.settings.instance).origin, auth = { Authorization: `Bearer ${secrets.token}` }, ids = [];
    for (const f of files.filter(x => x.kind === 'image').slice(0, 4)) { const fd = new FormData(); fd.append('file', await blobOf(f, MIME[extname(f.path).toLowerCase()]), basename(f.path)); ids.push((await json(await fetch(`${base}/api/v1/media`, { method: 'POST', headers: auth, body: fd }), 'Mastodon (imagem)')).id); }
    const r = await json(await fetch(`${base}/api/v1/statuses`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json', 'Idempotency-Key': post.id }, body: JSON.stringify({ status: post.text, media_ids: ids, visibility: 'public', language: 'pt' }) }), 'Mastodon (postar)');
    return { url: r.url || null };
  },
  async telegram({ acc, secrets, post, files, fetch }) {
    const api = m => `https://api.telegram.org/bot${secrets.botToken}/${m}`, chat = acc.settings.chatId, f = files[0];
    const send = async (method, field, file) => { const fd = new FormData(); fd.append('chat_id', chat); if (file) { fd.append(field, await blobOf(file, MIME[extname(file.path).toLowerCase()]), basename(file.path)); fd.append('caption', post.text.slice(0, 1024)); } else fd.append('text', post.text); return json(await fetch(api(method), { method: 'POST', body: fd }), 'Telegram'); };
    const r = f ? await send(f.kind === 'video' ? 'sendVideo' : 'sendPhoto', f.kind === 'video' ? 'video' : 'photo', f) : await send('sendMessage');
    const m = r.result; return { url: /^@/.test(chat) && m?.message_id ? `https://t.me/${chat.slice(1)}/${m.message_id}` : null };
  },
  async discord({ secrets, post, files, fetch }) {
    const url = new URL(secrets.webhook); url.searchParams.set('wait', 'true'); const f = files[0];
    const init = f ? (() => { const fd = new FormData(); fd.append('payload_json', JSON.stringify({ content: post.text.slice(0, 2000) })); return { method: 'POST', body: fd, f }; })() : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: post.text.slice(0, 2000) }) };
    if (f) { init.body.append('files[0]', await blobOf(f, MIME[extname(f.path).toLowerCase()]), basename(f.path)); delete init.f; }
    await json(await fetch(url, init), 'Discord'); return { url: null };
  },
  async youtube({ post, files, social }) {
    const v = files.find(x => x.kind === 'video'); if (!v) throw new Error('O YouTube precisa de um vídeo (midia).'); if (!social.publisher) throw new Error('YouTube não está disponível.');
    const lines = post.text.split(/\r?\n/), title = clip(lines[0], 100), desc = clip(lines.slice(1).join('\n').trim() || post.text, 4900);
    const r = await social.publisher.uploadVideo(v.path, { title, description: /#shorts/i.test(desc + title) ? desc : `${desc}\n\n#Shorts`, tags: [], privacy: post.privacy || 'private' }); return { url: r.url };
  },
};
const CHECKS = {
  async bluesky({ acc, secrets, fetch }) { const handle = String(acc.settings.handle || '').replace(/^@/, ''); const ses = await json(await fetch('https://bsky.social/xrpc/com.atproto.server.createSession', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: handle, password: secrets.appPassword }) }), 'Bluesky (login)'); return `Conectado como ${ses.handle || handle}.`; },
  async mastodon({ acc, secrets, fetch }) { const base = publicHttps(acc.settings.instance).origin, r = await json(await fetch(`${base}/api/v1/accounts/verify_credentials`, { headers: { Authorization: `Bearer ${secrets.token}` } }), 'Mastodon'); return `Conectado como @${r.acct}.`; },
  async telegram({ secrets, fetch }) { const r = await json(await fetch(`https://api.telegram.org/bot${secrets.botToken}/getMe`), 'Telegram'); return `Bot @${r.result?.username} encontrado (confira se ele é administrador do canal).`; },
  async discord({ secrets, fetch }) { const r = await json(await fetch(secrets.webhook), 'Discord'); return `Webhook válido${r.name ? ` (${r.name})` : ''}.`; },
  async youtube({ social }) { const st = await social.publisher?.status?.(); if (!st?.google?.connected) throw new Error('O YouTube não está conectado (Conexões › YouTube).'); return `Conectado${st.google.channel ? ` ao canal ${st.google.channel}` : ''}.`; },
};
