// Servidor de Releases DE MENTIRA para testar a atualização de ponta a ponta (installer\test-update.ps1). Nada vai para o GitHub.
// Uso: node installer\fake-releases.mjs <porta> <pasta-com-o-zip> <versao>
import http from 'node:http';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const [port, dir, version] = [Number(process.argv[2]), process.argv[3], process.argv[4]];
const zipName = readdirSync(dir).find(f => /^Code-Room-.+-portatil-win-x64\.zip$/.test(f)), zip = readFileSync(join(dir, zipName));
const sha = createHash('sha256').update(zip).digest('hex'), base = `http://127.0.0.1:${port}`;
http.createServer((req, res) => {
  const send = (code, body, type = 'application/octet-stream') => { res.writeHead(code, { 'Content-Type': type, 'Content-Length': Buffer.byteLength(body) }); res.end(body); };
  if (req.url === '/api/latest') return send(200, JSON.stringify({ tag_name: 'v' + version, name: 'Code Room ' + version, body: 'Versão de teste.', html_url: base + '/release', published_at: '2026-11-07T10:00:00Z', draft: false, prerelease: false,
    assets: [{ name: zipName, browser_download_url: `${base}/dl/${zipName}`, size: zip.length }, { name: 'SHA256SUMS.txt', browser_download_url: `${base}/dl/SHA256SUMS.txt`, size: 100 }] }), 'application/json');
  if (req.url === '/dl/SHA256SUMS.txt') return send(200, `${sha}  ${zipName}\n`, 'text/plain');
  if (req.url === `/dl/${zipName}`) return send(200, zip);
  send(404, 'nao');
}).listen(port, '127.0.0.1', () => console.log('pronto'));
