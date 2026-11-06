import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { Store } from '../server/store.mjs';
import { Publisher } from '../server/publish.mjs';
import { tempDir, waitFor } from './helpers.mjs';

// Google de mentira: troca de código, renovação de token, canal e envio resumível.
async function fakeGoogle() {
  const seen = { token: [], uploads: [], uploadBody: 0, meta: null, auth: [] };
  const srv = http.createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c); const body = Buffer.concat(chunks);
    const url = new URL(req.url, 'http://x');
    seen.auth.push(req.headers.authorization || '');
    if (url.pathname === '/token') {
      const p = new URLSearchParams(body.toString()); seen.token.push(Object.fromEntries(p));
      res.setHeader('Content-Type', 'application/json');
      if (p.get('grant_type') === 'authorization_code') return res.end(JSON.stringify({ access_token: 'AT1', refresh_token: 'RT-SECRETO', expires_in: 3600 }));
      return res.end(JSON.stringify({ access_token: 'AT2', expires_in: 3600 }));
    }
    if (url.pathname === '/youtube/v3/videos' && req.method === 'GET') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ items: [{ statistics: { viewCount: '1200', likeCount: '88', commentCount: '5' } }] })); }
    if (url.pathname === '/yt-analytics/v2/reports') { res.setHeader('Content-Type', 'application/json'); seen.analyticsQuery = url.search; return res.end(JSON.stringify(seen.noRetention ? {} : { rows: [[1200, 31, 74.5]] })); }
    if (url.pathname === '/youtube/v3/channels') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ items: [{ id: 'UC123', snippet: { title: 'Causo Sombrio' } }] })); }
    if (url.pathname === '/upload/youtube/v3/videos' && req.method === 'POST') { seen.meta = JSON.parse(body.toString()); seen.uploads.push(url.search); res.writeHead(200, { Location: `http://127.0.0.1:${srv.address().port}/up/1` }); return res.end(); }
    if (url.pathname === '/up/1' && req.method === 'PUT') { seen.uploadBody = body.length; res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ id: 'vid_abc123' })); }
    res.writeHead(404); res.end();
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  return { srv, seen, base: `http://127.0.0.1:${srv.address().port}` };
}

async function boot(status = 'pronto') {
  const g = await fakeGoogle(), dir = await tempDir('pub'), proj = await tempDir('pubproj'), store = new Store(':memory:');
  const saida = join(proj, 'videos', '2026-01-01_cordel-teste', 'saida'); await mkdir(saida, { recursive: true });
  await writeFile(join(saida, 'previa-teste.mp4'), Buffer.alloc(3000, 1)); await writeFile(join(saida, 'final-teste.mp4'), Buffer.alloc(12345, 2));
  store.put('projects', { id: 'p1', name: 'P', path: proj, area: 'Vídeo' });
  store.put('batches', { id: 'b1', projectId: 'p1', episodes: [{ id: 'e1', folder: 'fila-causo/EP04-teste', status }], createdAt: new Date().toISOString() });
  const pub = new Publisher(store, { dataDir: dir, base: g.base });
  return { g, dir, store, pub, project: store.get('projects', 'p1') };
}
const connect = async (pub) => {
  await pub.saveGoogle({ clientId: 'cid.apps.googleusercontent.com', clientSecret: 'SEGREDO-DO-APP' });
  const url = new URL(await pub.connectUrl('http://127.0.0.1:4780/api/publish/google/callback'));
  await pub.callback('CODIGO', url.searchParams.get('state')); return url;
};

test('conectar: PKCE, escopos de upload e canal; segredo e tokens nunca aparecem no status', async () => {
  const { g, pub, dir } = await boot();
  const url = await connect(pub), q = url.searchParams;
  assert.equal(q.get('code_challenge_method'), 'S256'); assert.equal(q.get('access_type'), 'offline'); assert.match(q.get('scope'), /youtube\.upload/);
  const ex = g.seen.token[0]; assert.equal(createHash('sha256').update(ex.code_verifier).digest('base64url'), q.get('code_challenge'), 'o verificador bate com o desafio');
  const st = await pub.status(); assert.equal(st.google.connected, true); assert.equal(st.google.channel.title, 'Causo Sombrio');
  const dump = JSON.stringify(st); assert.ok(!dump.includes('SEGREDO-DO-APP') && !dump.includes('RT-SECRETO') && !dump.includes('AT1'));
  assert.ok((await readFile(join(dir, 'publish-tokens.json'), 'utf8')).includes('RT-SECRETO'), 'o token fica só no arquivo local');
  g.srv.close();
});

test('o retorno do Google só vale com um "state" emitido por nós, uma única vez', async () => {
  const { g, pub } = await boot();
  await pub.saveGoogle({ clientId: 'cid', clientSecret: 's' });
  await assert.rejects(pub.callback('X', 'state-inventado'), /expirado ou desconhecido/);
  const u = new URL(await pub.connectUrl('http://127.0.0.1:4780/cb')); const st = u.searchParams.get('state');
  await pub.callback('X', st); await assert.rejects(pub.callback('X', st), /expirado ou desconhecido/);
  g.srv.close();
});

test('rascunho só de episódio pronto; vem privado, com #Shorts; nada sobe sem confirmação explícita', async () => {
  const { g, pub, project, store } = await boot('previa_aprovada');
  await connect(pub);
  await assert.rejects(pub.draft({ batchId: 'b1', epId: 'e1', title: 'Curupira' }, { project }), /vídeo final pronto/);
  const b = store.get('batches', 'b1'); b.episodes[0].status = 'pronto'; store.put('batches', b);
  const d = await pub.draft({ batchId: 'b1', epId: 'e1', title: 'Curupira | Causo Sombrio', description: 'Lenda do Curupira', tags: '#curupira, folclore,curupira' }, { project });
  assert.equal(d.privacy, 'private'); assert.equal(d.status, 'rascunho'); assert.match(d.description, /#Shorts/); assert.deepEqual(d.tags, ['curupira', 'folclore']); assert.match(d.file, /final-teste\.mp4$/);
  await assert.rejects(pub.confirm(d.id, { privacy: 'public' }, { project, by: 'master' }), /Confirmação explícita/);
  await assert.rejects(pub.confirm(d.id, { privacy: 'qualquer', confirm: true }, { project, by: 'master' }), /visibilidade/);
  await new Promise(r => setTimeout(r, 200));
  assert.equal(g.seen.uploads.length, 0, 'nenhuma chamada de envio ao YouTube foi feita');
  assert.equal(store.get('posts', d.id).status, 'rascunho');
  g.srv.close();
});

test('confirmar envia o vídeo final (não a prévia) com a visibilidade escolhida e guarda o link; não repete', async () => {
  const { g, pub, project, store } = await boot();
  await connect(pub);
  const d = await pub.draft({ batchId: 'b1', epId: 'e1', title: 'Curupira', description: 'x' }, { project });
  await pub.confirm(d.id, { privacy: 'unlisted', confirm: true }, { project, by: 'master' });
  await waitFor(() => store.get('posts', d.id).status === 'publicado', 8000, 'publicação');
  const p = store.get('posts', d.id);
  assert.equal(p.videoId, 'vid_abc123'); assert.equal(p.url, 'https://youtube.com/shorts/vid_abc123'); assert.equal(p.confirmedBy, 'master');
  assert.equal(g.seen.meta.status.privacyStatus, 'unlisted'); assert.equal(g.seen.meta.snippet.title, 'Curupira'); assert.equal(g.seen.uploadBody, 12345, 'subiu o arquivo final inteiro');
  assert.ok(g.seen.auth.some(a => a === 'Bearer AT1'));
  await assert.rejects(pub.confirm(d.id, { privacy: 'public', confirm: true }, { project, by: 'master' }), /já foi confirmado/);
  assert.equal(g.seen.uploads.length, 1);
  g.srv.close();
});

test('cancelar rascunho; desconectar apaga o token; falha do YouTube vira post "falhou" com motivo', async () => {
  const { g, pub, project, store } = await boot();
  await connect(pub);
  const a = await pub.draft({ batchId: 'b1', epId: 'e1', title: 'A' }, { project }); pub.cancel(a.id); assert.equal(store.get('posts', a.id).status, 'cancelado');
  g.srv.close();   // o "YouTube" some: o envio falha
  const b = await pub.draft({ batchId: 'b1', epId: 'e1', title: 'B' }, { project });
  await pub.confirm(b.id, { privacy: 'private', confirm: true }, { project, by: 'device' });
  await waitFor(() => store.get('posts', b.id).status === 'falhou', 8000, 'falha registrada'); assert.ok(store.get('posts', b.id).error);
  assert.equal((await pub.disconnect()).google.connected, false);
  const c = await pub.draft({ batchId: 'b1', epId: 'e1', title: 'C' }, { project });
  assert.equal(c.mode, 'manual', 'sem YouTube conectado o post vira pacote manual');
  await assert.rejects(pub.confirm(c.id, { privacy: 'private', confirm: true }, { project, by: 'master' }), /é manual/);
});

test('números do vídeo publicado: views/curtidas/retenção; sem retenção vira "indisponível" (nunca zero) e vai para DESEMPENHO.md', async () => {
  const { g, pub, project, store } = await boot();
  await connect(pub);
  const d = await pub.draft({ batchId: 'b1', epId: 'e1', title: 'Curupira | Causo', description: 'x' }, { project });
  await assert.rejects(pub.metrics(d.id, { project }), /já publicado/);
  await pub.confirm(d.id, { privacy: 'private', confirm: true }, { project, by: 'master' });
  await waitFor(() => store.get('posts', d.id).status === 'publicado', 8000, 'publicação');
  const p1 = await pub.metrics(d.id, { project }), m1 = p1.metrics.at(-1);
  assert.deepEqual([m1.views, m1.likes, m1.comments, m1.avgViewPercentage, m1.avgViewSeconds], [1200, 88, 5, 74.5, 31]);
  assert.match(g.seen.analyticsQuery, /video%3D%3D/); assert.match(g.seen.analyticsQuery, /ids=channel%3D%3DMINE/);
  g.seen.noRetention = true;
  const m2 = (await pub.metrics(d.id, { project })).metrics.at(-1);
  assert.equal(m2.avgViewPercentage, null); assert.match(m2.note, /ainda não disponível/); assert.equal(m2.views, 1200);
  const md = await readFile(join(project.path, 'DESEMPENHO.md'), 'utf8');
  assert.match(md, /Curupira \/ Causo/); assert.match(md, /indisponível/); assert.ok(!/ 0% /.test(md), 'nunca escreve 0% quando não sabe');
  g.srv.close();
});

test('limite diário por canal: a 3ª publicação do dia é recusada antes de enviar qualquer coisa', async () => {
  const { g, pub, project } = await boot();
  await connect(pub);
  const mk = async t => (await pub.draft({ batchId: 'b1', epId: 'e1', title: t }, { project })).id;
  const [a, b, c] = [await mk('A'), await mk('B'), await mk('C')];
  await pub.confirm(a, { privacy: 'private', confirm: true }, { project, by: 'master' });
  await pub.confirm(b, { privacy: 'private', confirm: true }, { project, by: 'master' });
  await assert.rejects(pub.confirm(c, { privacy: 'private', confirm: true }, { project, by: 'master' }), /Limite diário de 2/);
  await new Promise(r => setTimeout(r, 300)); assert.equal(g.seen.uploads.length, 2, 'só dois envios chegaram ao YouTube');
  g.srv.close();
});

test('Instagram e TikTok: pacote manual com legenda no limite; marcar como postado registra e respeita o limite diário', async () => {
  const { g, pub, project, store } = await boot(); await connect(pub);
  const longo = 'Frase longa sobre a lenda. '.repeat(120);
  const ig = await pub.draft({ network: 'instagram', batchId: 'b1', epId: 'e1', title: 'Curupira | Causo Sombrio', description: longo + ' #um #dois', tags: '#curupira, #lendas, folclore brasil, terror, vhs, extra1, extra2' }, { project });
  assert.equal(ig.mode, 'manual'); assert.ok(ig.caption.length <= 2200, 'legenda do Instagram até 2200'); assert.equal((ig.caption.match(/#/g) || []).length, 5, 'só 5 hashtags'); assert.match(ig.caption, /#folclorebrasil/); assert.ok(ig.caption.startsWith('Curupira'));
  const tk = await pub.draft({ network: 'tiktok', batchId: 'b1', epId: 'e1', title: 'Não responda se ouvir esse assobio na mata, nunca, jamais, em hipótese alguma, de verdade mesmo', description: 'x', tags: 'curupira,lendas,terror,vhs,mais' }, { project });
  assert.ok(tk.caption.length <= 150, `TikTok curto (${tk.caption.length})`); assert.equal((tk.caption.match(/#/g) || []).length, 4);
  await assert.rejects(pub.confirm(ig.id, { privacy: 'public', confirm: true }, { project, by: 'master' }), /é manual/);
  await assert.rejects(pub.markPosted(ig.id, { url: 'javascript:alert(1)' }, { by: 'master' }), /http/);
  const ok = await pub.markPosted(ig.id, { url: 'https://instagram.com/reel/abc' }, { by: 'master' });
  assert.equal(ok.status, 'publicado'); assert.equal(ok.postedManually, true); assert.equal(ok.url, 'https://instagram.com/reel/abc');
  await assert.rejects(pub.markPosted(ig.id, {}, { by: 'master' }), /já foi registrado/);
  const ig2 = await pub.draft({ network: 'instagram', batchId: 'b1', epId: 'e1', title: 'B' }, { project }), ig3 = await pub.draft({ network: 'instagram', batchId: 'b1', epId: 'e1', title: 'C' }, { project });
  await pub.markPosted(ig2.id, {}, { by: 'master' });
  await assert.rejects(pub.markPosted(ig3.id, {}, { by: 'master' }), /Limite diário de 2/);
  await pub.markPosted(tk.id, {}, { by: 'master' });   // o limite é por rede: TikTok continua livre
  assert.equal(store.get('posts', tk.id).status, 'publicado');
  g.srv.close();
});
