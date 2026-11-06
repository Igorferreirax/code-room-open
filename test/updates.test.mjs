import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { Store } from '../server/store.mjs';
import { Updates, compareVersions, parseVersion, parseSums, DEFAULT_REPO } from '../server/updates.mjs';

const REPO = DEFAULT_REPO, base = `https://github.com/${REPO}/releases/download/v0.3.0`;
const ZIP = 'Code-Room-0.3.0-portatil-win-x64.zip', ZIPDATA = Buffer.from('conteudo-do-zip-de-teste'), SHA = createHash('sha256').update(ZIPDATA).digest('hex');
const release = (over = {}) => ({ tag_name: 'v0.3.0', name: 'Code Room 0.3.0', body: 'Novidades', html_url: `https://github.com/${REPO}/releases/tag/v0.3.0`, published_at: '2026-11-07T10:00:00Z', draft: false, prerelease: false,
  assets: [{ name: ZIP, browser_download_url: `${base}/${ZIP}`, size: ZIPDATA.length }, { name: 'SHA256SUMS.txt', browser_download_url: `${base}/SHA256SUMS.txt`, size: 100 }], ...over });
// Servidor de Releases "de mentira": mapa url -> Response (ou função)
const fakeFetch = (map, calls = []) => async (url, opts) => { calls.push(String(url)); const v = map[url]; if (!v) return new Response('nao achei', { status: 404 }); return typeof v === 'function' ? v(opts) : new Response(v.body ?? v, { status: v.status ?? 200 }); };
const setup = (over = {}) => {
  const dir = mkdtempSync(join(tmpdir(), 'cr-upd-')), app = join(dir, 'app'); mkdirSync(join(app, 'runtime'), { recursive: true }); mkdirSync(join(app, 'scripts'), { recursive: true });
  writeFileSync(join(app, 'runtime', 'node.exe'), 'x'); writeFileSync(join(app, 'scripts', 'atualizar.ps1'), '# teste');
  const store = new Store(':memory:'), calls = [];
  const u = new Updates({ store, version: '0.2.0', dataDir: join(dir, 'data'), appDir: app, ...over, fetchImpl: over.fetchImpl || fakeFetch({ [`https://api.github.com/repos/${REPO}/releases/latest`]: JSON.stringify(release()), [`${base}/SHA256SUMS.txt`]: `${SHA}  ${ZIP}\n`, [`${base}/${ZIP}`]: ZIPDATA }, calls) });
  return { u, store, dir, app, calls };
};

test('versões: ordem correta (0.2.0 < 0.2.1 < 0.10.0), pré-lançamento e entradas inválidas', () => {
  assert.equal(compareVersions('0.2.0', '0.2.1'), -1); assert.equal(compareVersions('0.10.0', '0.9.9'), 1); assert.equal(compareVersions('v1.0.0', '1.0.0'), 0);
  assert.equal(compareVersions('1.0.0-rc.1', '1.0.0'), -1, 'pré-lançamento é menor que a final'); assert.equal(compareVersions('1.0.0-rc.2', '1.0.0-rc.10'), -1); assert.equal(compareVersions('1.0.0-alpha', '1.0.0-1'), 1);
  assert.equal(compareVersions('abc', '1.0.0'), null); assert.equal(compareVersions('1.0', '1.0.0'), null); assert.equal(parseVersion(undefined), null);
});

test('SHA256SUMS: lê "hash  arquivo", ignora lixo e aceita asterisco do modo binário', () => {
  const sums = parseSums(`${SHA}  ${ZIP}\nlixo sem hash\n${'a'.repeat(64)} *outro.exe\nabc  curto.zip\n`);
  assert.equal(sums[ZIP], SHA); assert.equal(sums['outro.exe'], 'a'.repeat(64)); assert.equal(sums['curto.zip'], undefined);
});

test('consulta: versão nova aparece; igual e menor não; nunca devolve endereços de arquivo para a tela', async () => {
  const { u } = setup(); const s = await u.check({ force: true });
  assert.equal(s.hasUpdate, true); assert.equal(s.latest.version, '0.3.0'); assert.equal(s.latest.zip.name, ZIP); assert.equal(s.latest.hasSums, true); assert.equal(s.error, null);
  assert.ok(!JSON.stringify(s).includes('browser_download_url') && !JSON.stringify(s).includes(base), 'a tela não recebe URLs de arquivo');
  for (const v of ['0.3.0', '0.9.0']) { const same = setup({ version: v }); assert.equal((await same.u.check({ force: true })).hasUpdate, false, `versão ${v} não oferece 0.3.0`); }
});

test('Release inválido ou perigoso: rascunho, pré-lançamento, tag estranha e arquivo de outro repositório são ignorados', async () => {
  const url = `https://api.github.com/repos/${REPO}/releases/latest`;
  for (const [nome, rel] of [['rascunho', release({ draft: true })], ['pré-lançamento', release({ prerelease: true })], ['tag estranha', release({ tag_name: 'nightly' })]]) {
    const { u } = setup({ fetchImpl: fakeFetch({ [url]: JSON.stringify(rel) }) }); assert.equal((await u.check({ force: true })).hasUpdate, false, nome);
  }
  const evil = release({ assets: [{ name: ZIP, browser_download_url: `https://evil.example.com/${ZIP}`, size: 1 }, { name: 'SHA256SUMS.txt', browser_download_url: `https://github.com/outro/repo/releases/download/v1/SHA256SUMS.txt`, size: 1 }], html_url: 'javascript:alert(1)' });
  const { u } = setup({ fetchImpl: fakeFetch({ [url]: JSON.stringify(evil) }) }); const s = await u.check({ force: true });
  assert.equal(s.latest.zip, null, 'arquivo de fora do repositório é descartado'); assert.equal(s.latest.hasSums, false); assert.equal(s.latest.url, '', 'link que não é https é descartado');
  const { u: big } = setup({ fetchImpl: fakeFetch({ [url]: JSON.stringify(release({ body: 'x'.repeat(10000) })) }) }); assert.equal((await big.check({ force: true })).latest.notes.length, 4000);
});

test('sem internet, resposta ruim e lentidão: falha silenciosa, sem derrubar nada', async () => {
  const url = `https://api.github.com/repos/${REPO}/releases/latest`;
  const off = setup({ fetchImpl: async () => { throw new TypeError('fetch failed'); } }); const a = await off.u.check({ force: true }); assert.equal(a.hasUpdate, false); assert.match(a.error, /consultar as atualizações/);
  const bad = setup({ fetchImpl: fakeFetch({ [url]: '<html>não é json</html>' }) }); assert.match((await bad.u.check({ force: true })).error, /consultar/);
  const e404 = setup({ fetchImpl: fakeFetch({}) }); assert.match((await e404.u.check({ force: true })).error, /consultar/);
  const slow = setup({ timeoutMs: 50, fetchImpl: (u2, o) => new Promise((_, rej) => o.signal.addEventListener('abort', () => rej(Object.assign(new Error('abortado'), { name: 'AbortError' })))) });
  assert.match((await slow.u.check({ force: true })).error, /Tempo esgotado/);
  const odd = setup({ fetchImpl: async () => ({ ok: true, url: 'https://evil.example.com/x', text: async () => JSON.stringify(release()) }) }); assert.match((await odd.u.check({ force: true })).error, /consultar/, 'redirecionamento para fora do GitHub é recusado');
});

test('interruptor, cache e adiar: desligado não consulta; consulta repetida usa o cache; adiar vale só para aquela versão e persiste', async () => {
  const { u, store, calls } = setup(); u.setEnabled(false); await u.check(); assert.equal(calls.length, 0, 'desligado: nenhuma chamada de rede'); assert.equal(u.status().enabled, false);
  u.setEnabled(true); await u.check(); await u.check(); assert.equal(calls.length, 1, 'segunda consulta dentro do intervalo usa o cache'); await u.check({ force: true }); assert.equal(calls.length, 2, 'forçar ignora o cache');
  assert.equal(u.status().dismissed, false); u.dismiss('0.3.0'); assert.equal(u.status().dismissed, true);
  const again = new Updates({ store, version: '0.2.0', dataDir: u.dataDir, appDir: u.appDir, fetchImpl: async () => { throw new Error('sem rede'); } });
  assert.equal(again.status().dismissed, true, 'a escolha sobrevive ao reinício'); assert.equal(again.status().latest.version, '0.3.0', 'a última consulta também');
  u.dismiss('0.2.5'); assert.equal(u.status().dismissed, false, 'adiar outra versão não adia a 0.3.0');
});

test('download: confere o SHA-256, grava o arquivo e descarta o que não bate', async () => {
  const { u, dir } = setup(); await u.check({ force: true }); await u.download(); await new Promise(r => setTimeout(r, 150));
  const d = u.status().download; assert.equal(d.state, 'ready', JSON.stringify(d)); assert.equal(d.sha256, SHA); assert.ok(existsSync(join(dir, 'data', 'updates', ZIP))); assert.deepEqual(readFileSync(join(dir, 'data', 'updates', ZIP)), ZIPDATA);
  const url = `https://api.github.com/repos/${REPO}/releases/latest`;
  const bad = setup({ fetchImpl: fakeFetch({ [url]: JSON.stringify(release()), [`${base}/SHA256SUMS.txt`]: `${'0'.repeat(64)}  ${ZIP}\n`, [`${base}/${ZIP}`]: ZIPDATA }) });
  await bad.u.check({ force: true }); await bad.u.download(); await new Promise(r => setTimeout(r, 150));
  assert.equal(bad.u.status().download.state, 'error'); assert.match(bad.u.status().download.error, /NÃO confere/); assert.ok(!existsSync(join(bad.dir, 'data', 'updates', ZIP)) && !existsSync(join(bad.dir, 'data', 'updates', ZIP + '.part')), 'arquivo ruim é apagado');
  const nolist = setup({ fetchImpl: fakeFetch({ [url]: JSON.stringify(release()), [`${base}/SHA256SUMS.txt`]: `${SHA}  outro-arquivo.zip\n`, [`${base}/${ZIP}`]: ZIPDATA }) });
  await nolist.u.check({ force: true }); await nolist.u.download(); await new Promise(r => setTimeout(r, 100)); assert.match(nolist.u.status().download.error, /não lista este arquivo/);
  const nosums = setup({ fetchImpl: fakeFetch({ [url]: JSON.stringify(release({ assets: [{ name: ZIP, browser_download_url: `${base}/${ZIP}`, size: 1 }] })) }) });
  await nosums.u.check({ force: true }); await assert.rejects(() => nosums.u.download(), /não publica o SHA256SUMS/);
  const none = setup(); await assert.rejects(() => none.u.download(), /Não há versão nova/);
});

test('instalar: só com pacote do Windows, só arquivo conferido e inalterado; roda o script de fora da pasta', async () => {
  const { u, dir } = setup(); await u.check({ force: true }); assert.throws(() => u.install(), /Baixe e confira/);
  await u.download(); await new Promise(r => setTimeout(r, 150));
  const spawned = []; u.spawnImpl = (cmd, args, o) => { spawned.push({ cmd, args, o }); return { unref() {} }; };
  const st = u.install(); assert.equal(st.download.state, 'installing'); const s = spawned[0], wrapper = s.args[s.args.indexOf('-Command') + 1];
  assert.equal(s.cmd, 'powershell.exe'); assert.match(wrapper, /Win32_Process/, 'criado pelo WMI, fora do grupo de processos do serviço');
  assert.ok(wrapper.includes('-Zip') && wrapper.includes(join(dir, 'data', 'updates', ZIP)) && wrapper.includes('-Version 0.3.0') && wrapper.includes('-AppDir') && wrapper.includes('-Data'), wrapper);
  const scriptArg = /-File "([^"]+)"/.exec(wrapper)[1]; assert.ok(!scriptArg.startsWith(u.appDir), 'o script roda de uma cópia fora da pasta que será trocada'); assert.ok(!s.o.detached && s.o.stdio === 'ignore');
  const t = setup(); await t.u.check({ force: true }); await t.u.download(); await new Promise(r => setTimeout(r, 150)); t.u.spawnImpl = () => ({ unref() {} });
  writeFileSync(join(t.dir, 'data', 'updates', ZIP), 'adulterado'); assert.throws(() => t.u.install(), /mudou depois da conferência/);
  const src = setup({ appDir: join(tmpdir(), 'nao-existe-' + Date.now()) }); await src.u.check({ force: true }); assert.equal(src.u.status().canInstall, false); assert.throws(() => src.u.install(), /código-fonte/);
});

test('servidor de Releases de teste: CODE_ROOM_RELEASES_URL só confia em arquivos do mesmo servidor', async () => {
  const api = 'http://127.0.0.1:9/api/latest', file = 'http://127.0.0.1:9/dl/' + ZIP;
  const { u } = setup({ releasesUrl: api, fetchImpl: fakeFetch({ [api]: JSON.stringify(release({ assets: [{ name: ZIP, browser_download_url: file, size: 1 }, { name: 'SHA256SUMS.txt', browser_download_url: 'http://evil.test/SHA256SUMS.txt', size: 1 }] })) }) });
  const s = await u.check({ force: true }); assert.ok(s.latest.zip, 'arquivo do servidor de teste é aceito'); assert.equal(s.latest.hasSums, false, 'arquivo de outro servidor não');
});

test('versão do package.json: lê normalmente e tolera BOM (Bloco de Notas / PowerShell 5 gravam esse byte invisível)', async () => {
  const { readPackageVersion } = await import('../server/updates.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'cr-pj-')), f = join(dir, 'package.json');
  writeFileSync(f, '{ "name": "x", "version": "1.2.3" }'); assert.equal(readPackageVersion(f), '1.2.3');
  writeFileSync(f, '\uFEFF{ "name": "x", "version": "4.5.6" }'); assert.equal(readPackageVersion(f), '4.5.6');
  writeFileSync(f, '{ quebrado'); assert.throws(() => readPackageVersion(f));
});
