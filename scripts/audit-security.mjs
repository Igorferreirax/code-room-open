// Auditoria de segurança com ataques reais contra um serviço isolado (porta e dados temporários).
// Uso: node scripts/audit-security.mjs   → imprime OK/FALHA por verificação e sai com código 1 se algo falhar.
// Não toca no seu serviço (porta 4780) nem nos seus dados.
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import { once } from 'node:events';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = await mkdtemp(join(tmpdir(), 'code-room-audit-')), port = 21000 + Math.floor(Math.random() * 8000);
const child = spawn(process.execPath, ['server/main.mjs'], { cwd: root, env: { ...process.env, CODE_ROOM_DATA: dir, CODE_ROOM_PORT: String(port) }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let fails = 0, total = 0;
const check = (name, ok, extra = '') => { total++; if (!ok) fails++; console.log(`${ok ? 'OK   ' : 'FALHA'} ${name}${ok ? '' : ' ' + extra}`); };
// Cliente HTTP cru: permite mandar Host, Origin e caminhos "estranhos" exatamente como estão.
const req = (method, path, { headers = {}, body } = {}) => new Promise(res => {
  const r = http.request({ host: '127.0.0.1', port, method, path, headers, agent: false }, x => { let b = ''; x.on('data', c => b += c); x.on('end', () => res({ status: x.statusCode, headers: x.headers, body: b })); });
  r.on('error', e => res({ status: 0, body: '', error: e.code })); if (body) r.write(body); r.end();
});
try {
  await Promise.race([once(child.stdout, 'data'), new Promise((_, rej) => setTimeout(() => rej(new Error('serviço não iniciou')), 20000))]);
  await new Promise(r => setTimeout(r, 800));
  const key = (await readFile(join(dir, 'access.key'), 'utf8')).trim(), K = { 'X-Code-Room-Key': key }, J = { ...K, 'Content-Type': 'application/json' };

  check('sem chave: /api/state responde 401', (await req('GET', '/api/state')).status === 401);
  check('chave errada: 401', (await req('GET', '/api/state', { headers: { 'X-Code-Room-Key': 'x'.repeat(64) } })).status === 401);
  check('chave certa: 200', (await req('GET', '/api/state', { headers: K })).status === 200);
  check('Host forjado (DNS rebinding): 403', (await req('GET', '/api/state', { headers: { ...K, Host: 'evil.example.com' } })).status === 403);
  check('Origin de outro site: 403', (await req('POST', '/api/projects', { headers: { ...J, Origin: 'https://evil.example.com' }, body: '{}' })).status === 403);
  check('POST sem JSON: 415', (await req('POST', '/api/projects', { headers: { ...K, 'Content-Type': 'text/plain' }, body: 'x' })).status === 415);

  // Travessia de pasta: nada fora de public/ pode sair, nem codificado de formas diferentes.
  for (const p of ['/../server/main.mjs', '/%2e%2e/server/main.mjs', '/..%2fserver/main.mjs', '/%2e%2e%2fserver%2fmain.mjs', '/..\\server\\main.mjs', '/assets/../../server/main.mjs', '/%252e%252e/server/main.mjs']) {
    const r = await req('GET', p, { headers: K }); check(`travessia ${p} não vaza o código`, !/createServer|node:http|import .* from/.test(r.body), `status ${r.status}`);
  }
  for (const p of ['/d/x/y/..%2f..%2fserver%2fmain.mjs', '/d/abc/zzz/../../x', '/m/abc/def/zzz/previa']) check(`rota de arquivos ${p} recusa (403/404)`, [400, 403, 404].includes((await req('GET', p, { headers: K })).status));

  // Cabeçalhos de proteção
  const home = await req('GET', '/', { headers: K }), csp = home.headers['content-security-policy'] || '';
  check('CSP presente, sem script inline nem eval', /script-src 'self'/.test(csp) && !/unsafe-eval|script-src[^;]*unsafe-inline/.test(csp));
  check('não pode ser colocado em iframe (frame-ancestors none)', /frame-ancestors 'none'/.test(csp));
  check('nosniff e sem referrer', home.headers['x-content-type-options'] === 'nosniff' && home.headers['referrer-policy'] === 'no-referrer');

  // A chave nunca aparece em respostas
  const st = await req('GET', '/api/state', { headers: K });
  check('a chave de acesso nunca aparece em /api/state', !st.body.includes(key));
  const home2 = await req('GET', '/'); check('a chave de acesso nunca aparece na página inicial', !home2.body.includes(key));

  // Injeção em campos: ids com caracteres perigosos não viram rota nem erro de servidor
  for (const p of ['/api/tasks/%27%20OR%201=1--', '/api/projects/..%2f..%2fx', '/api/batches/%00']) { const r = await req('GET', p, { headers: K }); check(`id malicioso ${p} não derruba (sem 500)`, r.status < 500 && r.status !== 0, `status ${r.status}`); }
  const big = await req('POST', '/api/projects', { headers: J, body: '{"name":"' + 'A'.repeat(3_000_000) + '"}' });
  check('corpo gigante (3 MB) é recusado ou tratado, sem derrubar', big.status !== 0 && big.status < 500 || big.status === 413, `status ${big.status}`);
  check('serviço continua de pé depois dos ataques', (await req('GET', '/api/state', { headers: K })).status === 200);

  // Só escuta em 127.0.0.1 por padrão
  const { networkInterfaces } = await import('node:os');
  const lan = Object.values(networkInterfaces()).flat().find(i => i && i.family === 'IPv4' && !i.internal)?.address;
  if (lan) {
    const probe = await new Promise(res => { const s = http.request({ host: lan, port, path: '/', agent: false, timeout: 2000 }, () => res('respondeu')); s.on('error', e => res(e.code)); s.on('timeout', () => { s.destroy(); res('timeout'); }); s.end(); });
    check(`o serviço não responde pelo IP de rede (rede local ou Tailscale) (${lan}) sem liberação`, probe !== 'respondeu', `resultado: ${probe}`);
  } else console.log('PULOU sem IP de rede local para testar');
} catch (e) { check('execução da auditoria', false, e.message); }
finally { const done = once(child, 'close'); child.kill(); await done; await rm(dir, { recursive: true, force: true }); }
console.log(`\n${total - fails} de ${total} verificações ok${fails ? `, ${fails} FALHA(S)` : ''}`);
process.exit(fails ? 1 : 0);
