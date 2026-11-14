import { createWriteStream, mkdirSync, existsSync, readdirSync, rmSync, renameSync, statSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, basename } from 'node:path';
import { spawn } from 'node:child_process';
import { copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { Readable } from 'node:stream';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

// Atualização: o SERVIÇO (não o navegador) consulta o último Release público no GitHub, de forma opcional.
// Só vai um pedido simples (seu IP e o nome do app); nenhum dado seu. Falha silenciosa sem internet.
// Nunca oferece versão igual ou menor; só baixa arquivos do próprio repositório e só aceita se o SHA-256 bater.
export const DEFAULT_REPO = 'Igorferreirax/code-room-open';
const MAX_ZIP = 400 * 1024 * 1024, ZIP_RE = /^Code-Room-.+-portatil-win-x64\.zip$/, SUMS = 'SHA256SUMS.txt';
const HOSTS = ['github.com', 'api.github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com'];

// Lê a versão do package.json. Tolera o BOM (marca invisível que o Bloco de Notas e o Windows PowerShell 5 gravam no começo do arquivo).
export function readPackageVersion(file) { return JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/, '')).version; }

// ---------- versões (semver) ----------
export function parseVersion(v) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(String(v ?? '').trim());
  return m ? { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] ? m[4].split('.') : [] } : null;
}
// -1 se a < b, 0 se iguais, 1 se a > b; null se alguma não for uma versão válida. Pré-lançamento (1.0.0-rc.1) é menor que a versão final.
export function compareVersions(a, b) {
  const x = parseVersion(a), y = parseVersion(b); if (!x || !y) return null;
  for (const k of ['major', 'minor', 'patch']) if (x[k] !== y[k]) return x[k] < y[k] ? -1 : 1;
  if (!x.pre.length && !y.pre.length) return 0; if (!x.pre.length) return 1; if (!y.pre.length) return -1;
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    const p = x.pre[i], q = y.pre[i]; if (p === undefined) return -1; if (q === undefined) return 1; if (p === q) continue;
    const pn = /^\d+$/.test(p), qn = /^\d+$/.test(q);
    if (pn && qn) return +p < +q ? -1 : 1; if (pn) return -1; if (qn) return 1; return p < q ? -1 : 1;
  }
  return 0;
}

// "<hash>  <arquivo>" por linha (formato do sha256sum e do nosso SHA256SUMS.txt)
export function parseSums(text) {
  const out = {}; for (const line of String(text || '').split(/\r?\n/)) { const m = /^([0-9a-fA-F]{64})\s+\*?(.+?)\s*$/.exec(line); if (m) out[basename(m[2])] = m[1].toLowerCase(); } return out;
}

export class Updates {
  constructor({ store, version, dataDir, appDir = null, port = 4780, repo = DEFAULT_REPO, releasesUrl = '', fetchImpl = globalThis.fetch, intervalMs = 12 * 3600e3, timeoutMs = 5000, downloadTimeoutMs = 10 * 60e3, spawnImpl = spawn, now = Date.now } = {}) {
    Object.assign(this, { store, version, dataDir, appDir, port, repo, releasesUrl, fetchImpl, intervalMs, timeoutMs, downloadTimeoutMs, spawnImpl, now });
    this.latest = null; this.checkedAt = null; this.error = null; this.dl = { state: 'idle' }; this.timer = null;
    const saved = store?.get('settings', 'updates'); if (saved?.latest) { this.latest = saved.latest; this.checkedAt = saved.checkedAt || null; }
  }
  get cfg() { return this.store.get('settings', 'updates') || { id: 'updates', enabled: true, dismissed: '' }; }
  #save(patch) { this.store.put('settings', { ...this.cfg, id: 'updates', ...patch }); }
  get url() { return this.releasesUrl || `https://api.github.com/repos/${this.repo}/releases/latest`; }
  get packaged() { return !!this.appDir && existsSync(join(this.appDir, 'runtime', 'node.exe')); }
  // Um endereço de arquivo só é confiável se for do próprio repositório (ou do servidor de teste informado).
  trusted(url) {
    try {
      const u = new URL(url);
      if (this.releasesUrl) return u.origin === new URL(this.releasesUrl).origin;
      return u.protocol === 'https:' && u.hostname === 'github.com' && u.pathname.startsWith(`/${this.repo}/releases/download/`);
    } catch { return false; }
  }
  #hostOk(url) { try { const u = new URL(url); return this.releasesUrl ? u.origin === new URL(this.releasesUrl).origin : u.protocol === 'https:' && HOSTS.includes(u.hostname); } catch { return false; } }

  // Resposta crua do GitHub -> o que a tela precisa (ou null se não serve).
  parseRelease(j) {
    if (!j || typeof j !== 'object' || j.draft) return null;
    const cur = parseVersion(this.version); if (j.prerelease && !(cur && cur.pre.length)) return null;   // só oferece pré-lançamento a quem já usa um
    const version = String(j.tag_name || '').replace(/^v/, ''); if (!parseVersion(version)) return null;
    const assets = (Array.isArray(j.assets) ? j.assets : []).filter(a => a && typeof a.name === 'string' && this.trusted(a.browser_download_url));
    const zip = assets.find(a => ZIP_RE.test(a.name)), sums = assets.find(a => a.name === SUMS);
    return { version, name: String(j.name || ('Versão ' + version)).slice(0, 120), notes: String(j.body || '').slice(0, 4000), url: typeof j.html_url === 'string' && /^https:\/\//.test(j.html_url) ? j.html_url : '', publishedAt: j.published_at || null,
      zip: zip ? { name: zip.name, url: zip.browser_download_url, size: Number(zip.size) || null } : null, sums: sums ? { url: sums.browser_download_url } : null };
  }

  async #get(url, { as = 'json', timeoutMs = this.timeoutMs, max = 1 << 20 } = {}) {
    const ac = new AbortController(), t = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const r = await this.fetchImpl(url, { signal: ac.signal, redirect: 'follow', headers: { Accept: 'application/vnd.github+json', 'User-Agent': `Code-Room/${this.version}` } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      if (r.url && !this.#hostOk(r.url)) throw new Error('Endereço inesperado');
      if (as === 'json') { const txt = await r.text(); if (txt.length > max) throw new Error('Resposta grande demais'); return JSON.parse(txt); }
      if (as === 'text') { const txt = await r.text(); if (txt.length > max) throw new Error('Resposta grande demais'); return txt; }
      return r;
    } finally { clearTimeout(t); }
  }

  async check({ force = false } = {}) {
    if (!this.cfg.enabled && !force) return this.status();
    if (!force && this.checkedAt && this.now() - this.checkedAt < this.intervalMs / 2) return this.status();
    try { const rel = this.parseRelease(await this.#get(this.url)); this.latest = rel; this.error = null; }
    catch (e) { this.error = e.name === 'AbortError' ? 'Tempo esgotado ao consultar as atualizações.' : 'Não foi possível consultar as atualizações agora.'; }
    this.checkedAt = this.now(); this.#save({ latest: this.latest, checkedAt: this.checkedAt });
    return this.status();
  }
  start() { if (this.timer) return; const run = () => this.check().catch(() => {}); this.first = setTimeout(run, 20000); this.first.unref?.(); this.timer = setInterval(run, this.intervalMs); this.timer.unref?.(); }
  stop() { clearTimeout(this.first); clearInterval(this.timer); this.timer = null; }

  setEnabled(on) { this.#save({ enabled: !!on }); return this.status(); }
  dismiss(version) { this.#save({ dismissed: String(version || '') }); return this.status(); }

  status() {
    const c = this.cfg, l = this.latest, cmp = l ? compareVersions(l.version, this.version) : null, has = cmp === 1;
    return { enabled: c.enabled !== false, current: this.version, checkedAt: this.checkedAt, error: this.error, hasUpdate: has, dismissed: has && c.dismissed === l.version,
      latest: l ? { version: l.version, name: l.name, notes: l.notes, url: l.url, publishedAt: l.publishedAt, zip: l.zip ? { name: l.zip.name, size: l.zip.size } : null, hasSums: !!l.sums } : null,
      canInstall: this.packaged, download: { ...this.dl }, repo: this.repo };
  }

  // ---------- download com conferência do SHA-256 ----------
  get dir() { return join(this.dataDir, 'updates'); }
  async download() {
    const l = this.latest; if (!l || compareVersions(l.version, this.version) !== 1) throw new Error('Não há versão nova para baixar.');
    if (this.dl.state === 'downloading') return this.status();
    if (!l.zip) throw new Error('Este Release não traz o pacote portátil para Windows. Use a página do Release.');
    if (!l.sums) throw new Error('O Release não publica o SHA256SUMS.txt: sem ele não dá para conferir o arquivo. Baixe pela página do Release.');
    this.dl = { state: 'downloading', version: l.version, received: 0, total: l.zip.size };
    this.#run(l).catch(() => {}); return this.status();
  }
  async #run(l) {
    const part = join(this.dir, l.zip.name + '.part'), final = join(this.dir, l.zip.name);
    try {
      mkdirSync(this.dir, { recursive: true }); for (const f of readdirSync(this.dir)) rmSync(join(this.dir, f), { force: true });
      const want = parseSums(await this.#get(l.sums.url, { as: 'text', max: 64 * 1024 }))[l.zip.name];
      if (!want) throw new Error('O SHA256SUMS.txt do Release não lista este arquivo.');
      const ac = new AbortController(), timer = setTimeout(() => ac.abort(), this.downloadTimeoutMs);   // o limite cobre o download inteiro
      let have, got = 0;
      try {
        const r = await this.fetchImpl(l.zip.url, { signal: ac.signal, redirect: 'follow', headers: { Accept: 'application/octet-stream', 'User-Agent': `Code-Room/${this.version}` } });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        if (r.url && !this.#hostOk(r.url)) throw new Error('Endereço inesperado');
        const h = createHash('sha256'), out = createWriteStream(part);
        const meter = new Transform({ transform: (c, _, done) => {
          got += c.length;
          if (got > MAX_ZIP) return done(new Error('Arquivo grande demais.'));
          h.update(c); this.dl.received = got; done(null, c);
        } });
        await pipeline(Readable.fromWeb(r.body), meter, out);
        have = h.digest('hex');
      } finally { clearTimeout(timer); }
      if (have !== want) { rmSync(part, { force: true }); throw new Error('O arquivo baixado NÃO confere com o SHA-256 publicado. Foi descartado por segurança.'); }
      renameSync(part, final);
      this.dl = { state: 'ready', version: l.version, file: final, sha256: have, received: got, total: got };
    } catch (e) { rmSync(part, { force: true }); this.dl = { state: 'error', version: l.version, error: e.name === 'AbortError' ? 'Tempo esgotado no download.' : e.message }; }
  }

  // ---------- instalar (só pacote portátil/instalado; quem roda pelo código-fonte usa git pull) ----------
  install({ scriptPath, expectedPort = this.port } = {}) {
    if (!this.packaged) throw new Error('Esta cópia roda pelo código-fonte: atualize com “git pull”. A instalação em um clique vale para o pacote do Windows.');
    const d = this.dl; if (d.state !== 'ready' || !d.file || !existsSync(d.file)) throw new Error('Baixe e confira a atualização antes de instalar.');
    const hash = createHash('sha256').update(readFileSync(d.file)).digest('hex'); if (hash !== d.sha256) throw new Error('O arquivo baixado mudou depois da conferência. Baixe de novo.');
    const script = scriptPath || join(this.appDir, 'scripts', 'atualizar.ps1'); if (!existsSync(script)) throw new Error('O script de atualização não foi encontrado.');
    const copy = join(tmpdir(), `cr-atualizar-${Date.now()}.ps1`); copyFileSync(script, copy);   // roda de fora da pasta que vai ser trocada
    // O atualizador precisa SOBREVIVER ao fim deste serviço (ele mesmo vai fechá-lo). No Windows, processos filhos do Node morrem junto com o pai
    // (grupo de processos), e `detached` + PowerShell escondido nem chega a executar (testado). Criar o processo pelo WMI (Win32_Process.Create)
    // o coloca fora desse grupo. O processo criado não herda as variáveis de ambiente deste serviço: o script recebe tudo por parâmetro.
    const cmd = `powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "${copy}" -Zip "${d.file}" -AppDir "${this.appDir}" -Data "${this.dataDir}" -Port ${Number(expectedPort)} -Version ${d.version}`;
    const wrapper = `Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = '${cmd.replace(/'/g, "''")}' } | Out-Null`;
    const child = this.spawnImpl('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', wrapper], { cwd: tmpdir(), stdio: 'ignore', windowsHide: true });
    child.unref?.(); this.dl = { ...d, state: 'installing' }; return this.status();
  }
}
