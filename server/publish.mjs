import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFile, writeFile, stat, chmod } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import { findMedia } from './batches.mjs';
import { safeFile } from './deliverables.mjs';

// Publicação (YouTube Shorts). Regras de segurança, nesta ordem de importância:
//  1) nada é publicado sem uma confirmação explícita do dono PARA CADA post (rascunho → confirmar → enviar);
//  2) a visibilidade começa em "privado"; público só se o dono escolher no momento de confirmar;
//  3) segredo do app e tokens ficam só em .data/ (fora do Git) e nunca saem pela API.
const now = () => new Date().toISOString();
const SCOPES = ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly', 'https://www.googleapis.com/auth/yt-analytics.readonly'];
const b64url = b => Buffer.from(b).toString('base64url');
export const PRIVACY = ['private', 'unlisted', 'public'];
export const NETWORKS = ['youtube', 'instagram', 'tiktok'];
// Legenda pronta por rede (limites públicos conhecidos; a rede pode mudá-los): Instagram até 2200 com poucas hashtags; TikTok curta.
function packCaption(network, title, description, tags) {
  const hash = n => tags.slice(0, n).map(t => `#${t}`).join(' ');
  const body = description.replace(/#\S+/g, '').replace(/\n{3,}/g, '\n\n').trim();
  if (network === 'instagram') { const tail = hash(5), room = 2200 - tail.length - 4; return `${[title, body].filter(Boolean).join('\n\n').slice(0, room).trim()}\n\n${tail}`.trim(); }
  const tail = hash(4); return `${title.slice(0, Math.max(20, 150 - tail.length - 1)).trim()} ${tail}`.trim();
}
const text = (v, max, label, req = true) => { const s = String(v ?? '').trim(); if (req && !s) throw new Error(`${label} obrigatório.`); if (s.length > max) throw new Error(`${label}: máximo de ${max} caracteres.`); return s; };

export class Publisher {
  constructor(store, { dataDir, base = process.env.CODE_ROOM_GOOGLE_BASE || '' } = {}) {
    this.store = store; this.dir = dataDir; this.pending = new Map();
    const g = base ? { auth: `${base}/auth`, token: `${base}/token`, api: `${base}/youtube/v3`, upload: `${base}/upload/youtube/v3/videos`, analytics: `${base}/yt-analytics/v2/reports` }
      : { auth: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token', api: 'https://www.googleapis.com/youtube/v3', upload: 'https://www.googleapis.com/upload/youtube/v3/videos', analytics: 'https://youtubeanalytics.googleapis.com/v2/reports' };
    this.g = g;
  }
  async #read(name) { try { return JSON.parse(await readFile(join(this.dir, name), 'utf8')); } catch { return {}; } }
  async #write(name, obj) { const f = join(this.dir, name); await writeFile(f, JSON.stringify(obj, null, 2)); try { await chmod(f, 0o600); } catch {} }

  async status() {
    const cfg = await this.#read('publish.json'), tok = await this.#read('publish-tokens.json');
    return { google: { configured: !!(cfg.google?.clientId && cfg.google?.clientSecret), clientId: cfg.google?.clientId || '', connected: !!tok.google?.refresh_token, channel: tok.google?.channel || null, connectedAt: tok.google?.connectedAt || null }, instagram: { configured: false, connected: false } };
  }
  async saveGoogle({ clientId, clientSecret }) {
    const cfg = await this.#read('publish.json'), prev = cfg.google || {};
    cfg.google = { clientId: text(clientId, 300, 'ID do cliente'), clientSecret: String(clientSecret || '').trim() || prev.clientSecret || '' };
    if (!cfg.google.clientSecret) throw new Error('Segredo do cliente obrigatório.');
    await this.#write('publish.json', cfg); return this.status();
  }
  // Fluxo "aplicativo para computador" com PKCE: o Google devolve o código para o endereço local do Code Room.
  async connectUrl(redirectUri) {
    const cfg = (await this.#read('publish.json')).google; if (!cfg?.clientId) throw new Error('Informe o ID e o segredo do cliente Google primeiro.');
    const state = randomBytes(18).toString('hex'), verifier = randomBytes(48).toString('base64url');
    this.pending.set(state, { verifier, redirectUri, exp: Date.now() + 10 * 60000 });
    const q = new URLSearchParams({ client_id: cfg.clientId, redirect_uri: redirectUri, response_type: 'code', scope: SCOPES.join(' '), access_type: 'offline', prompt: 'consent', state, code_challenge: b64url(createHash('sha256').update(verifier).digest()), code_challenge_method: 'S256' });
    return `${this.g.auth}?${q}`;
  }
  async callback(code, state) {
    const p = this.pending.get(String(state)); this.pending.delete(String(state));
    if (!p || p.exp < Date.now()) throw new Error('Pedido de conexão expirado ou desconhecido. Comece de novo em Conexões.');
    const cfg = (await this.#read('publish.json')).google;
    const r = await this.#token({ grant_type: 'authorization_code', code: String(code), redirect_uri: p.redirectUri, code_verifier: p.verifier, client_id: cfg.clientId, client_secret: cfg.clientSecret });
    if (!r.refresh_token) throw new Error('O Google não devolveu permissão permanente (refresh token). Revogue o acesso em myaccount.google.com/permissions e conecte de novo.');
    const tok = await this.#read('publish-tokens.json');
    tok.google = { refresh_token: r.refresh_token, access_token: r.access_token, expires_at: Date.now() + (r.expires_in - 60) * 1000, connectedAt: now(), channel: null };
    await this.#write('publish-tokens.json', tok);
    try { const ch = await this.#api('/channels?part=snippet&mine=true'); const c = ch.items?.[0]; if (c) { tok.google.channel = { id: c.id, title: c.snippet?.title || c.id }; await this.#write('publish-tokens.json', tok); } } catch {}
    return this.status();
  }
  async disconnect() { const tok = await this.#read('publish-tokens.json'); delete tok.google; await this.#write('publish-tokens.json', tok); return this.status(); }
  async #token(params) {
    const res = await fetch(this.g.token, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params) });
    const j = await res.json().catch(() => ({})); if (!res.ok) throw new Error(`Google recusou o pedido (${j.error_description || j.error || res.status}).`); return j;
  }
  async #access() {
    const tok = await this.#read('publish-tokens.json'), g = tok.google; if (!g?.refresh_token) throw new Error('YouTube não está conectado. Conecte em Conexões.');
    if (g.access_token && g.expires_at > Date.now()) return g.access_token;
    const cfg = (await this.#read('publish.json')).google;
    const r = await this.#token({ grant_type: 'refresh_token', refresh_token: g.refresh_token, client_id: cfg.clientId, client_secret: cfg.clientSecret });
    g.access_token = r.access_token; g.expires_at = Date.now() + (r.expires_in - 60) * 1000; await this.#write('publish-tokens.json', tok); return g.access_token;
  }
  async #api(path) { return this.#get(this.g.api + path); }
  async #get(url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${await this.#access()}` } });
    const j = await res.json().catch(() => ({})); if (!res.ok) throw new Error(`YouTube respondeu ${res.status}: ${j.error?.message || ''}`); return j;
  }

  // ---------- posts ----------
  // Como publicar: YouTube conectado = envio pela API (após a confirmação). Qualquer outro caso (Instagram, TikTok, YouTube sem conexão) = pacote MANUAL:
  // o Code Room prepara título/legenda/hashtags e o arquivo; você posta no app da rede e marca "postado". Assim as 3 redes funcionam já, antes de auditorias de API.
  async draft(b, { project }) {
    const batch = this.store.get('batches', b.batchId), ep = batch?.episodes.find(e => e.id === b.epId);
    if (!batch || !ep) throw new Error('Episódio inexistente.');
    if (ep.status !== 'pronto') throw new Error('Só dá para publicar um episódio com o vídeo final pronto (aprovado por você).');
    const media = await findMedia(project.path, ep.folder); if (!media.final) throw new Error('Vídeo final não encontrado em saida/.');
    const network = NETWORKS.includes(b.network) ? b.network : 'youtube', st = await this.status(), mode = network === 'youtube' && st.google.connected ? 'api' : 'manual';
    const title = text(b.title, 100, 'Título'); let description = text(b.description, 4900, 'Descrição', false);
    const tags = [...new Set(String(b.tags || '').split(/[,\n]/).map(t => t.trim().replace(/^#/, '').replace(/\s+/g, '')).filter(Boolean))].slice(0, 15);
    let caption = null;
    if (network === 'youtube') { if (!/#shorts/i.test(description + title)) description = `${description}\n\n#Shorts`.trim(); }
    else caption = packCaption(network, title, description, tags);
    const post = { id: randomUUID(), network, mode, channelId: b.channelId ? String(b.channelId).slice(0, 100) : null, batchId: batch.id, epId: ep.id, file: media.final, title, description, tags, caption, privacy: 'private', status: 'rascunho', createdAt: now() };
    return this.store.put('posts', post);
  }
  // Limite diário por rede: protege o canal de erro e de excesso (constância > volume). Padrão 2/dia; muda em .data/publish.json ("maxPerDay").
  async #cap(post) {
    const cap = Number((await this.#read('publish.json')).maxPerDay) || 2, hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
    const feitos = this.store.list('posts').filter(p => p.id !== post.id && ['enviando', 'publicado'].includes(p.status) && p.network === post.network && p.confirmedAt && new Date(p.confirmedAt).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }) === hoje).length;
    if (feitos >= cap) throw new Error(`Limite diário de ${cap} publicação(ões) por canal atingido hoje. Deixe para amanhã, ou aumente "maxPerDay" em .data/publish.json se for de propósito.`);
  }
  // Post manual: depois de postar no app da rede, o dono registra aqui (com o link, se tiver).
  async markPosted(id, { url } = {}, { by }) {
    const post = this.store.get('posts', id); if (!post) throw new Error('Post inexistente.');
    if (post.mode !== 'manual') throw new Error('Este post é enviado pela API: use "Confirmar e publicar".');
    if (post.status !== 'rascunho') throw new Error('Este post já foi registrado ou cancelado.');
    const link = String(url || '').trim(); if (link && !/^https?:\/\/\S{3,300}$/.test(link)) throw new Error('O link precisa começar com http:// ou https://.');
    await this.#cap(post);
    Object.assign(post, { status: 'publicado', url: link || null, confirmedAt: now(), publishedAt: now(), confirmedBy: by, postedManually: true }); return this.store.put('posts', post);
  }
  // A ÚNICA porta de saída automática: exige confirmação explícita e visibilidade escolhida.
  async confirm(id, { privacy, confirm }, { project, by }) {
    const post = this.store.get('posts', id); if (!post) throw new Error('Post inexistente.');
    if (post.mode === 'manual') throw new Error('Este post é manual: copie o pacote, poste no app da rede e use "Marcar como postado".');
    if (post.status !== 'rascunho') throw new Error('Este post já foi confirmado ou cancelado.');
    if (confirm !== true) throw new Error('Confirmação explícita obrigatória.');
    if (!PRIVACY.includes(privacy)) throw new Error('Escolha a visibilidade (privado, não listado ou público).');
    const g = await this.status(); if (!g.google.connected) throw new Error('YouTube não está conectado.');
    await this.#cap(post);
    Object.assign(post, { privacy, status: 'enviando', confirmedAt: now(), confirmedBy: by }); this.store.put('posts', post);
    this.#upload(post, project).catch(e => { post.status = 'falhou'; post.error = String(e.message || e).slice(0, 300); this.store.put('posts', post); });
    return post;
  }
  // ---------- números do vídeo publicado (para o canal aprender com o que funcionou) ----------
  // Visualizações/curtidas vêm da Data API. Retenção vem da Analytics API, que demora ~1-2 dias para novos vídeos: sem dado = "indisponível", nunca zero.
  async metrics(id, { project }) {
    const post = this.store.get('posts', id); if (!post || post.status !== 'publicado' || !post.videoId) throw new Error('Só dá para medir um vídeo já publicado pelo YouTube conectado (os posts manuais não têm leitura automática).');
    const v = await this.#api(`/videos?part=statistics&id=${encodeURIComponent(post.videoId)}`), st = v.items?.[0]?.statistics;
    if (!st) throw new Error('O YouTube ainda não devolveu dados deste vídeo (ou ele foi removido).');
    let an = null, note = null;
    try {
      const q = new URLSearchParams({ ids: 'channel==MINE', startDate: post.publishedAt.slice(0, 10), endDate: now().slice(0, 10), metrics: 'views,averageViewDuration,averageViewPercentage', filters: `video==${post.videoId}` });
      const r = await this.#get(`${this.g.analytics}?${q}`), row = r.rows?.[0];
      if (row) an = { avgSec: row[1], avgPct: row[2] }; else note = 'retenção ainda não disponível (o YouTube leva 1 a 2 dias)';
    } catch (e) { note = `retenção indisponível: ${String(e.message).slice(0, 120)}`; }
    const num = x => x == null ? null : Number(x);
    const snap = { at: now(), views: num(st.viewCount), likes: num(st.likeCount), comments: num(st.commentCount), avgViewPercentage: an ? num(an.avgPct) : null, avgViewSeconds: an ? num(an.avgSec) : null, note };
    post.metrics = [...(post.metrics || []).slice(-29), snap]; this.store.put('posts', post);
    await this.writeInsights(project);
    return post;
  }
  // Arquivo que os agentes leem (Roteirista/Revisor): o que funcionou em cada episódio publicado.
  async writeInsights(project) {
    const batchIds = new Set(this.store.list('batches').filter(b => b.projectId === project.id).map(b => b.id));
    const posts = this.store.list('posts').filter(p => batchIds.has(p.batchId) && p.metrics?.length).sort((a, b) => a.publishedAt.localeCompare(b.publishedAt));
    const f = x => x == null ? 'indisponível' : x, rows = posts.map(p => { const m = p.metrics.at(-1); return `| ${p.title.replace(/\|/g, '/')} | ${p.publishedAt.slice(0, 10)} | ${f(m.views)} | ${f(m.likes)} | ${m.avgViewPercentage == null ? 'indisponível' : m.avgViewPercentage.toFixed(1) + '%'} | ${f(m.avgViewSeconds)} | ${m.at.slice(0, 16).replace('T', ' ')} |`; });
    const md = `# Desempenho dos vídeos publicados\n\nGerado pelo Code Room. "indisponível" = o YouTube ainda não informou; nunca é zero. Use isto para ajustar gancho, ritmo e temas dos próximos episódios (o que reteve mais público?).\n\n| Título | Publicado | Views | Curtidas | Retenção média | Tempo médio (s) | Medido em |\n|---|---|---|---|---|---|---|\n${rows.join('\n') || '| (nenhum vídeo medido ainda) | | | | | | |'}\n`;
    await writeFile(join(project.path, 'DESEMPENHO.md'), md);
  }
  cancel(id) { const p = this.store.get('posts', id); if (!p || p.status !== 'rascunho') throw new Error('Só dá para cancelar um rascunho.'); p.status = 'cancelado'; return this.store.put('posts', p); }
  async #upload(post, project) {
    const file = await safeFile(project.path, post.file), size = (await stat(file)).size, token = await this.#access();
    const meta = { snippet: { title: post.title, description: post.description, tags: post.tags, categoryId: '24' }, status: { privacyStatus: post.privacy, selfDeclaredMadeForKids: false } };
    const init = await fetch(`${this.g.upload}?uploadType=resumable&part=snippet,status`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Length': String(size), 'X-Upload-Content-Type': 'video/mp4' }, body: JSON.stringify(meta) });
    if (!init.ok) throw new Error(`YouTube recusou iniciar o envio (${init.status}): ${(await init.text()).slice(0, 200)}`);
    const loc = init.headers.get('location'); if (!loc) throw new Error('YouTube não devolveu o endereço de envio.');
    const put = await fetch(loc, { method: 'PUT', headers: { 'Content-Length': String(size), 'Content-Type': 'video/mp4' }, body: createReadStream(file), duplex: 'half' });
    const j = await put.json().catch(() => ({})); if (!put.ok) throw new Error(`Envio falhou (${put.status}): ${j.error?.message || ''}`);
    Object.assign(post, { status: 'publicado', videoId: j.id, url: `https://youtube.com/shorts/${j.id}`, publishedAt: now() }); this.store.put('posts', post);
  }
}
