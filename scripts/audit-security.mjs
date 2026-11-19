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
const dir = await mkdtemp(join(tmpdir(), 'code-room-audit-'));
// Ask Windows for an ephemeral port instead of guessing in a range that Hyper-V may reserve.
const probe = http.createServer();
await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(0, '127.0.0.1', resolve); });
const port = probe.address().port;
await new Promise((resolve, reject) => probe.close(e => e ? reject(e) : resolve()));
const probe2 = http.createServer(); await new Promise((resolve, reject) => { probe2.once('error', reject); probe2.listen(0, '127.0.0.1', resolve); });
const previewPort = probe2.address().port; await new Promise(r => probe2.close(r));
const child = spawn(process.execPath, ['server/main.mjs'], { cwd: root, env: { ...process.env, CODE_ROOM_DATA: dir, CODE_ROOM_PORT: String(port), CODE_ROOM_PREVIEW_PORT: String(previewPort) }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let fails = 0, total = 0, skipped = 0, bootError = '';
child.stderr.on('data', chunk => { bootError = (bootError + chunk).slice(-1000); });
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

  const noKey = await req('GET', '/api/state'), badKey = await req('GET', '/api/state', { headers: { 'X-Code-Room-Key': 'x'.repeat(64) } }), goodKey = await req('GET', '/api/state', { headers: K });
  check('sem chave: /api/state responde 401', noKey.status === 401, `status ${noKey.status} ${noKey.error || ''}`);
  check('chave errada: 401', badKey.status === 401, `status ${badKey.status} ${badKey.error || ''}`);
  check('chave certa: 200', goodKey.status === 200, `status ${goodKey.status} ${goodKey.error || ''}`);
  const badHost = await req('GET', '/api/state', { headers: { ...K, Host: 'evil.example.com' } });
  check('Host forjado (DNS rebinding): 403', badHost.status === 403, `status ${badHost.status} ${badHost.error || ''}`);
  const badOrigin = await req('POST', '/api/projects', { headers: { ...J, Origin: 'https://evil.example.com' }, body: '{}' });
  check('Origin de outro site: 403', badOrigin.status === 403, `status ${badOrigin.status} ${badOrigin.error || ''}`);
  const noJson = await req('POST', '/api/projects', { headers: { ...K, 'Content-Type': 'text/plain' }, body: 'x' });
  check('POST sem JSON: 415', noJson.status === 415, `status ${noJson.status} ${noJson.error || ''}`);

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
  check('corpo gigante (3 MB) recebe HTTP 413 sem derrubar a conexão', big.status === 413, `status ${big.status}`);
  check('serviço continua de pé depois dos ataques', (await req('GET', '/api/state', { headers: K })).status === 200);

  // Celular pareado (chave de aparelho): vê e opera, mas não mexe no que é só do computador (Assistente, IAs conectadas, pastas, atualização, rede…)
  const code = JSON.parse((await req('POST', '/api/devices/pair-code', { headers: J, body: '{}' })).body).code;
  const pair = await req('POST', '/api/pair', { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, name: 'Teste' }) });
  const token = pair.status === 200 ? JSON.parse(pair.body).token : null; check('pareamento por código funciona e o código é de uso único', !!token && (await req('POST', '/api/pair', { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, name: 'Outro' }) })).status === 400);
  if (token) {
    const D = { 'X-Code-Room-Key': token, 'Content-Type': 'application/json' }, dget = path => req('GET', path, { headers: D }), dpost = (path, b = {}) => req('POST', path, { headers: D, body: JSON.stringify(b) });
    check('celular pareado enxerga o estado (200)', (await dget('/api/state')).status === 200);
    for (const path of ['/api/assistant', '/api/providers', '/api/network', '/api/devices', '/api/preflight']) { const r = await dget(path); check(`celular pareado não lê ${path} (só o computador)`, r.status === 403, `veio ${r.status}`); }
    const writes = [['/api/assistant/ask', { text: 'oi' }], ['/api/assistant/brief', {}], ['/api/assistant/thread/new', {}], ['/api/providers', { name: 'x', exe: 'node', args: ['{prompt}'] }], ['/api/providers/test', { name: 'x', exe: 'node', args: ['{prompt}'] }], ['/api/providers/delete', { id: 'x-a' }], ['/api/connectors/login', { provider: 'codex' }], ['/api/connectors/cli-action', { provider: 'kiro', action: 'update' }], ['/api/connectors/kiro/check', {}], ['/api/skills/library/install', { id: 'planejar-entrega' }],
      ['/api/folderjobs', { name: 'x', projectId: 'p', instruction: '{arquivo}', agentId: 'a' }], ['/api/notices/seen', { all: true }], ['/api/projects', { name: 'x', path: 'C:/' }], ['/api/settings/skill-roots', { path: 'C:/' }], ['/api/updates/install', {}], ['/api/updates/download', {}], ['/api/network', { lan: true }], ['/api/devices/pair-code', {}]];
    for (const [path, b] of writes) { const r = await dpost(path, b); check(`celular pareado não faz POST ${path}`, r.status === 403, `veio ${r.status}`); }
  }
  // Pastas de entrada: não saem do projeto e a instrução é limitada
  const mkProject = JSON.parse((await req('POST', '/api/projects', { headers: J, body: JSON.stringify({ name: 'Auditoria', path: dir, area: 'Geral' }) })).body);
  const mkAgent = JSON.parse((await req('POST', '/api/agents', { headers: J, body: JSON.stringify({ name: 'Ag', role: 'x', room: 'Geral', provider: 'codex', model: '', instructions: '', mode: 'read', skillIds: [], capabilities: [] }) })).body);
  const fj = d => req('POST', '/api/folderjobs', { headers: J, body: JSON.stringify({ name: 'L', projectId: mkProject.id, dir: d, exts: 'txt', agentId: mkAgent.id, instruction: 'Leia {arquivo}' }) });
  for (const bad of ['..', '../fora', 'a/../../b', 'C:/Windows', '/etc', 'a\u0000b']) check(`pasta de entrada recusa "${bad.replace(/\u0000/g, '\\0')}"`, (await fj(bad)).status === 400);
  check('pasta de entrada válida é aceita e criada dentro do projeto', (await fj('ENTRADA/sub')).status === 201);
  // IA própria: não aceita programa com caracteres de shell nem argumentos fora do formato
  const prov = b => req('POST', '/api/providers', { headers: J, body: JSON.stringify(b) });
  for (const exe of ['node; calc', 'node && calc', 'a|b', '$(calc)', '`calc`', 'node calc']) check(`IA própria recusa o programa "${exe}"`, (await prov({ name: 'Teste', exe, promptVia: 'arg', args: ['{prompt}'] })).status === 400);
  check('IA própria recusa {prompt} ausente ou repetido', (await prov({ name: 'T1', exe: 'node', promptVia: 'arg', args: ['-p'] })).status === 400 && (await prov({ name: 'T2', exe: 'node', promptVia: 'arg', args: ['{prompt}', '{prompt}'] })).status === 400);

  // Prévia isolada: o HTML/JS do projeto nunca roda com a origem do painel (sessão e API ficam fora do alcance).
  {
    const { mkdtemp: mk } = await import('node:fs/promises'), { writeFileSync } = await import('node:fs');
    const pdir = await mk(join(tmpdir(), 'code-room-audit-prev-')); writeFileSync(join(pdir, 'index.html'), '<script>fetch("/api/state")</script>oi');
    const pj = JSON.parse((await req('POST', '/api/projects', { headers: J, body: JSON.stringify({ name: 'prev-audit', path: pdir, area: 'Programação' }) })).body || '{}');
    const info = JSON.parse((await req('GET', `/api/projects/${pj.id}/preview-info`, { headers: K })).body || '{}');
    const base = info.baseUrl || '';
    const onPanel = await req('GET', base + '/index.html');
    check('prévia pela origem do painel sai em sandbox (origem opaca, sem sessão nem API)', onPanel.status === 200 && /(^|;)\s*sandbox\b/.test(onPanel.headers['content-security-policy'] || '') && !/allow-same-origin/.test(onPanel.headers['content-security-policy'] || ''), `${onPanel.status} ${onPanel.headers['content-security-policy']}`);
    const st = JSON.parse((await req('GET', '/api/state', { headers: K })).body || '{}');
    check('a tela recebe a origem dedicada da prévia (outra porta)', st.previewOrigin === `http://127.0.0.1:${previewPort}`, String(st.previewOrigin));
    const pq = (path, headers = {}) => new Promise(res => { const r = http.request({ host: '127.0.0.1', port: previewPort, path, headers: { Host: `127.0.0.1:${previewPort}`, ...headers }, agent: false }, x => { let b = ''; x.on('data', c => b += c); x.on('end', () => res({ status: x.statusCode, headers: x.headers, body: b })); }); r.on('error', e => res({ status: 0, error: e.code })); r.end(); });
    const onPrev = await pq(base + '/index.html');
    check('origem da prévia serve o projeto e só aceita ser embutida pelo painel', onPrev.status === 200 && (onPrev.headers['content-security-policy'] || '').includes(`frame-ancestors http://127.0.0.1:${port}`), `${onPrev.status} ${onPrev.headers['content-security-policy']}`);
    check('origem da prévia não serve a API nem o painel', (await pq('/api/state', K)).status === 404 && (await pq('/')).status === 404);
    check('origem da prévia recusa outro Host (DNS rebinding)', (await pq(base + '/index.html', { Host: `evil.example.com:${previewPort}` })).status === 403);
    const fromPrev = await req('GET', '/api/state', { headers: { ...K, Origin: `http://127.0.0.1:${previewPort}` } });
    check('a API recusa pedidos vindos da origem da prévia', fromPrev.status === 403, `status ${fromPrev.status}`);
    check('prévia sem token válido é recusada nas duas origens', (await req('GET', `/live/${pj.id}/xx/index.html`)).status === 403 && (await pq(`/live/${pj.id}/xx/index.html`)).status === 403);
    check('o proxy local não alcança a própria porta da prévia', (await req('GET', `/lp/${previewPort}/x/`)).status === 403);
    await rm(pdir, { recursive: true, force: true });
  }

  // Só escuta em 127.0.0.1 por padrão
  const { networkInterfaces } = await import('node:os');
  let lan = null;
  try { lan = Object.values(networkInterfaces()).flat().find(i => i && i.family === 'IPv4' && !i.internal)?.address || null; }
  catch { skipped++; console.log('PULOU sem permissão do ambiente para enumerar interfaces de rede'); }
  if (lan) {
    const probe = await new Promise(res => { const s = http.request({ host: lan, port, path: '/', agent: false, timeout: 2000 }, () => res('respondeu')); s.on('error', e => res(e.code)); s.on('timeout', () => { s.destroy(); res('timeout'); }); s.end(); });
    check(`o serviço não responde pelo IP de rede (rede local ou Tailscale) (${lan}) sem liberação`, probe !== 'respondeu', `resultado: ${probe}`);
  } else console.log('PULOU sem IP de rede local para testar');
} catch (e) { check('execução da auditoria', false, `${e.message}${bootError ? ` · ${bootError.trim().slice(-400)}` : ''}`); }
finally { const done = once(child, 'close'); child.kill(); await done; await rm(dir, { recursive: true, force: true }); }
console.log(`\n${total - fails} de ${total} verificações ok${fails ? `, ${fails} FALHA(S)` : ''}${skipped ? `, ${skipped} verificação(ões) pulada(s)` : ''}`);
process.exit(fails ? 1 : 0);
