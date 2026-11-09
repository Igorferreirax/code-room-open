// Levar skills e servidores MCP que você já tem no Claude Code para as outras IAs conectadas (Codex, Antigravity/Gemini).
// Regras: nunca sobrescreve nada que já existe; faz backup antes de mexer em arquivo de configuração; só copia o que você marcar;
// chaves e tokens do MCP nunca aparecem na tela (vão direto de um arquivo de configuração para o outro).
import { readdir, readFile, writeFile, copyFile, cp, stat, lstat, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';

const NAME_RE = /^[\w.-]{1,64}$/;
const MAX_FILES = 400, MAX_BYTES = 10 * 1024 * 1024, SKIP = new Set(['.git', 'node_modules', '__pycache__', '.venv']);

export class SyncIas {
  // home e codexPath podem ser trocados nos testes
  constructor({ home = homedir(), codexPath = null, run = (f, a) => new Promise(res => execFile(f, a, { timeout: 30000, windowsHide: true }, (e, out, err) => res({ ok: !e, out: String(out || ''), err: String(err || e?.message || '') }))) } = {}) { this.home = home; this.codexPath = codexPath; this.run = run; }
  get targets() {
    const h = this.home;
    return [
      { id: 'codex', name: 'Codex', available: !!this.codexPath || existsSync(join(h, '.codex')), skillsDir: join(h, '.codex', 'skills'), mcp: 'comando “codex mcp add”' },
      { id: 'agy', name: 'Antigravity (Gemini)', available: existsSync(join(h, '.gemini')), skillsDir: join(h, '.gemini', 'config', 'skills'), mcpFile: join(h, '.gemini', 'config', 'mcp_config.json'), mcp: 'arquivo ~/.gemini/config/mcp_config.json' },
    ];
  }
  #claudeMcp() { try { const j = JSON.parse(readFileSync(join(this.home, '.claude.json'), 'utf8')); return j.mcpServers && typeof j.mcpServers === 'object' ? j.mcpServers : {}; } catch { return {}; } }
  async #desc(dir) { try { const t = await readFile(join(dir, 'SKILL.md'), 'utf8'); const m = t.match(/^description:\s*(.+)$/m); return (m ? m[1] : '').replace(/^["']|["']$/g, '').slice(0, 140); } catch { return ''; } }
  async #agyMcp(t) { try { return JSON.parse(await readFile(t.mcpFile, 'utf8')).mcpServers || {}; } catch { return {}; } }
  // Leitura barata para a tela (sem abrir o Codex): procura a seção no config.toml.
  #codexListed(name) { try { const t = readFileSync(join(this.home, '.codex', 'config.toml'), 'utf8'); return t.includes(`[mcp_servers.${name}]`) || t.includes(`[mcp_servers."${name}"]`) || t.includes(`[mcp_servers.${name}.`); } catch { return false; } }
  async #codexHas(name) { if (!this.codexPath) return false; return (await this.run(this.codexPath, ['mcp', 'get', name])).ok; }

  // O que existe no Claude e em que IA já está. Nunca devolve env, args nem cabeçalhos.
  async overview() {
    const targets = this.targets, skillsRoot = join(this.home, '.claude', 'skills'), skills = [];
    let names = []; try { names = (await readdir(skillsRoot, { withFileTypes: true })).filter(d => d.isDirectory() && NAME_RE.test(d.name) && existsSync(join(skillsRoot, d.name, 'SKILL.md'))).map(d => d.name).sort(); } catch {}
    for (const n of names) skills.push({ name: n, description: await this.#desc(join(skillsRoot, n)), in: Object.fromEntries(targets.map(t => [t.id, existsSync(join(t.skillsDir, n))])) });
    const mcps = [], src = this.#claudeMcp(), agy = await this.#agyMcp(targets[1]);
    for (const [n, v] of Object.entries(src)) { if (!NAME_RE.test(n)) continue; const kind = v.url ? 'http' : 'stdio';
      mcps.push({ name: n, kind, headers: !!v.headers, in: { codex: this.#codexListed(n), agy: !!agy[n] } }); }
    return { targets: targets.map(({ id, name, available, mcp }) => ({ id, name, available, mcp })), skills, mcps };
  }

  async #copySkill(name, t) {
    const from = join(this.home, '.claude', 'skills', name), to = join(t.skillsDir, name);
    if (existsSync(to)) return { ok: true, skipped: true, note: 'já existe (não sobrescrevi)' };
    let files = 0, bytes = 0; const walk = async d => { for (const e of await readdir(d, { withFileTypes: true })) { if (SKIP.has(e.name)) continue; const p = join(d, e.name); const s = await lstat(p);
      if (s.isSymbolicLink()) throw new Error('A skill tem atalho (link simbólico); não copio por segurança.'); if (s.isDirectory()) await walk(p); else { files++; bytes += s.size; if (files > MAX_FILES || bytes > MAX_BYTES) throw new Error('Skill grande demais para copiar (limite de 400 arquivos ou 10 MB).'); } } };
    await walk(from); await mkdir(t.skillsDir, { recursive: true });
    await cp(from, to, { recursive: true, errorOnExist: true, force: false, filter: s => !SKIP.has(s.split(/[\\/]/).pop()) });
    return { ok: true, note: `copiada (${files} arquivo(s))` };
  }
  async #addMcp(name, t) {
    const v = this.#claudeMcp()[name]; if (!v) throw new Error('Servidor não encontrado no Claude.');
    if (t.id === 'codex') {
      if (!this.codexPath) throw new Error('Codex não encontrado.'); if (await this.#codexHas(name)) return { ok: true, skipped: true, note: 'já existe (não alterei)' };
      let args;
      if (v.url) { if (v.headers) throw new Error('Este servidor usa cabeçalho com token; o Codex pede o token em variável de ambiente. Cadastre manualmente.'); args = ['mcp', 'add', name, '--url', String(v.url)]; }
      else { if (!v.command) throw new Error('Servidor sem comando.'); args = ['mcp', 'add', name, ...Object.entries(v.env || {}).flatMap(([k, x]) => ['--env', `${k}=${x}`]), '--', String(v.command), ...(v.args || []).map(String)]; }
      const r = await this.run(this.codexPath, args); if (!r.ok) throw new Error('O Codex recusou: ' + r.err.split('\n')[0].slice(0, 160)); return { ok: true, note: 'cadastrado pelo comando do Codex' };
    }
    if (v.url) throw new Error('Servidor remoto (HTTP): o Antigravity usa outro formato; cadastre pelo app dele.');
    const cur = await this.#agyMcp(t); if (cur[name]) return { ok: true, skipped: true, note: 'já existe (não alterei)' };
    let whole = {}; try { whole = JSON.parse(await readFile(t.mcpFile, 'utf8')); } catch (e) { if (existsSync(t.mcpFile)) throw new Error('O arquivo de configuração do Antigravity não é um JSON válido; não mexi nele.'); }
    if (existsSync(t.mcpFile)) await copyFile(t.mcpFile, `${t.mcpFile}.code-room-backup-${new Date().toISOString().replace(/[:.]/g, '-')}`);
    else await mkdir(join(t.mcpFile, '..'), { recursive: true });
    whole.mcpServers = { ...(whole.mcpServers || {}), [name]: { command: String(v.command), args: (v.args || []).map(String), ...(v.env && Object.keys(v.env).length ? { env: v.env } : {}) } };
    await writeFile(t.mcpFile, JSON.stringify(whole, null, 2)); return { ok: true, note: 'adicionado ao arquivo (com backup)' };
  }

  // items: { targets: ['codex'], skills: ['nome'], mcps: ['nome'] } -> uma linha por item e IA
  async apply({ targets: ids = [], skills = [], mcps = [] } = {}) {
    const all = this.targets, chosen = all.filter(t => ids.includes(t.id)); if (!chosen.length) throw new Error('Marque pelo menos uma IA.');
    if (!skills.length && !mcps.length) throw new Error('Marque pelo menos uma skill ou servidor MCP.');
    if (skills.length + mcps.length > 40) throw new Error('Muitos itens de uma vez (máximo 40).');
    const out = [];
    for (const t of chosen) {
      if (!t.available) { out.push({ ai: t.name, kind: 'ia', item: t.name, ok: false, note: 'IA não encontrada neste computador' }); continue; }
      for (const n of skills) { if (!NAME_RE.test(String(n))) { out.push({ ai: t.name, kind: 'skill', item: String(n).slice(0, 40), ok: false, note: 'nome inválido' }); continue; }
        try { out.push({ ai: t.name, kind: 'skill', item: n, ...(await this.#copySkill(n, t)) }); } catch (e) { out.push({ ai: t.name, kind: 'skill', item: n, ok: false, note: String(e.message).slice(0, 200) }); } }
      for (const n of mcps) { if (!NAME_RE.test(String(n))) { out.push({ ai: t.name, kind: 'mcp', item: String(n).slice(0, 40), ok: false, note: 'nome inválido' }); continue; }
        try { out.push({ ai: t.name, kind: 'mcp', item: n, ...(await this.#addMcp(n, t)) }); } catch (e) { out.push({ ai: t.name, kind: 'mcp', item: n, ok: false, note: String(e.message).slice(0, 200) }); } }
    }
    return { results: out };
  }
}
