// Pré-visualização ao vivo de projetos (sites, landing pages, HyperFrames) e detecção/proxy seguro de portas locais abertas.
// 100% local: nunca faz conexões externas; só inspeciona 127.0.0.1 e arquivos dentro da pasta do projeto autorizado.
import http from 'node:http';
import net from 'node:net';
import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative, sep } from 'node:path';

export const COMMON_DEV_PORTS = [3000, 3001, 3210, 4000, 4173, 4321, 5000, 5173, 5174, 5500, 8000, 8080, 8888];

const PORT_HINT = {
  3000: 'App / Next / Remotion / HyperFrames',
  3001: 'Dev Server secundário',
  3210: 'Vincere Studio',
  4000: 'Servidor local',
  4173: 'Vite Preview',
  4321: 'Astro',
  5000: 'Servidor local / Python',
  5173: 'Vite Dev Server',
  5174: 'Vite (porta 2)',
  5500: 'Live Server',
  8000: 'Servidor HTTP / Python',
  8080: 'Servidor Web',
  8888: 'Notebook / App local',
};

export const LIVE_MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.vtt': 'text/vtt; charset=utf-8',
  '.srt': 'text/plain; charset=utf-8',
};

export const liveContentType = file => LIVE_MIME[extname(file).toLowerCase()] || 'application/octet-stream';

function probeTcp(port, timeoutMs = 140) {
  return new Promise(resolve => {
    const sock = net.connect({ host: '127.0.0.1', port });
    let done = false;
    const finish = ok => { if (done) return; done = true; sock.destroy(); resolve(ok); };
    sock.setTimeout(timeoutMs);
    sock.on('connect', () => finish(true));
    sock.on('timeout', () => finish(false));
    sock.on('error', () => finish(false));
  });
}

export async function scanLocalPorts({ excludePort = 4780, ports = COMMON_DEV_PORTS, timeoutMs = 140 } = {}) {
  const list = ports.filter(p => Number.isInteger(p) && p > 0 && p !== Number(excludePort));
  const results = await Promise.all(list.map(async p => (await probeTcp(p, timeoutMs)) ? { port: p, label: PORT_HINT[p] || 'Servidor local', localUrl: `http://127.0.0.1:${p}/` } : null));
  return results.filter(Boolean);
}

const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'dist-ssr', '__pycache__', '.venv', 'venv', '.lixeira-coderoom', 'LIXEIRA']);

export async function scanProjectPages(projectPath, { maxFiles = 24, maxDepth = 3 } = {}) {
  const pages = [];
  async function walk(dir, depth) {
    if (pages.length >= maxFiles || depth > maxDepth) return;
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
    entries.sort((a, b) => (a.name === 'index.html' ? -1 : b.name === 'index.html' ? 1 : a.name.localeCompare(b.name)));
    for (const e of entries) {
      if (pages.length >= maxFiles) break;
      if (e.isSymbolicLink()) continue;
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) await walk(full, depth + 1);
      } else if (e.isFile() && /\.html?$/i.test(e.name)) {
        const rel = relative(projectPath, full).split(sep).join('/');
        let kind = 'html';
        try {
          const head = (await readFile(full, 'utf8')).slice(0, 4000);
          if (/hyperframes|data-composition|data-track|gsap/i.test(head)) kind = 'hyperframes';
        } catch {}
        pages.push({ path: rel, name: rel === 'index.html' ? 'Página principal (index.html)' : rel, kind });
      }
    }
  }
  if (projectPath) await walk(projectPath, 0);
  return pages;
}

// Proxy reverso estritamente local (127.0.0.1:PORTA) para o Navegador Interno:
// 1) Evita bloqueio de iframe por X-Frame-Options: deny em servidores dev locais (Next.js, Vincere, Vite, etc.);
// 2) Permite ver pelo celular (Tailscale/Wi-Fi) servidores que só escutam em 127.0.0.1 no computador.
export function proxyLocalPort(req, res, { port, subPath = '/', search = '', proxyPrefix, excludePort = 4780 }) {
  const p = Number(port);
  if (!Number.isInteger(p) || p < 1024 || p > 65535 || p === Number(excludePort)) {
    res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ error: 'Porta local não permitida para pré-visualização.' }));
  }
  if (!['GET', 'HEAD'].includes(req.method || 'GET')) {
    res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ error: 'A pré-visualização local aceita apenas leitura (GET/HEAD).' }));
  }
  const targetPath = (subPath.startsWith('/') ? subPath : '/' + subPath) + (search || '');
  const fwdHeaders = {
    host: `127.0.0.1:${p}`,
    accept: req.headers.accept || '*/*',
    'accept-language': req.headers['accept-language'] || 'pt-BR,pt;q=0.9',
    'user-agent': req.headers['user-agent'] || 'CodeRoomPreview/1.0',
  };
  if (req.headers.range) fwdHeaders.range = req.headers.range;

  const up = http.request({ host: '127.0.0.1', port: p, path: targetPath, method: req.method, headers: fwdHeaders, timeout: 8000 }, upRes => {
    const headers = {};
    for (const [k, v] of Object.entries(upRes.headers)) {
      const lk = k.toLowerCase();
      if (['x-frame-options', 'content-security-policy', 'content-security-policy-report-only', 'content-encoding', 'transfer-encoding', 'content-length'].includes(lk)) continue;
      if (lk === 'location' && typeof v === 'string' && v.startsWith('/')) {
        headers.location = `${proxyPrefix}${v}`;
      } else if (v !== undefined) {
        headers[k] = v;
      }
    }
    headers['Cache-Control'] = 'no-store';
    headers['Content-Security-Policy'] = "frame-ancestors 'self'";
    const ct = String(upRes.headers['content-type'] || '').toLowerCase();
    if (ct.includes('text/html') && req.method === 'GET') {
      const chunks = [];
      let total = 0;
      upRes.on('data', c => { if (total < 4_000_000) { chunks.push(c); total += c.length; } });
      upRes.on('end', () => {
        let html = Buffer.concat(chunks).toString('utf8');
        if (!/<base\s/i.test(html)) {
          html = html.replace(/<head(\s[^>]*)?>/i, m => `${m}<base href="${proxyPrefix}/">`);
        }
        html = html.replace(/(?<=\b(?:src|href|action)=["'])\/(?!\/|lp\/)/gi, `${proxyPrefix}/`);
        const buf = Buffer.from(html, 'utf8');
        headers['Content-Length'] = buf.length;
        res.writeHead(upRes.statusCode || 200, headers);
        res.end(buf);
      });
      return;
    }
    if (upRes.headers['content-length']) headers['Content-Length'] = upRes.headers['content-length'];
    res.writeHead(upRes.statusCode || 200, headers);
    upRes.pipe(res);
  });

  const failCard = reason => {
    if (res.headersSent) { try { res.end(); } catch {} return; }
    const html = `<!doctype html><meta charset="utf-8"><title>Porta :${p}</title><body style="margin:0;height:100vh;display:grid;place-items:center;background:#0b1527;color:#e8eefc;font-family:system-ui;padding:24px;text-align:center"><div><h2 style="margin:0 0 8px">Servidor local :${p} indisponível agora</h2><p style="color:#8fa3c7;margin:0 0 14px;font-size:14px">${reason}</p><button onclick="location.reload()" style="padding:8px 16px;border-radius:8px;border:1px solid #2b7bff;background:#2b7bff;color:#fff;cursor:pointer;font-weight:600">Tentar novamente</button></div></body>`;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': "frame-ancestors 'self'" });
    res.end(html);
  };
  up.on('timeout', () => { up.destroy(); failCard('Tempo esgotado ao aguardar resposta em 127.0.0.1:' + p + '.'); });
  up.on('error', () => failCard('Nenhum servidor respondeu em 127.0.0.1:' + p + '. Inicie o servidor dev e recarregue.'));
  up.end();
}
