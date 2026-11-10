import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Store } from '../server/store.mjs';
import { Social, CATALOG, NETWORK_IDS } from '../server/social.mjs';
import { tempDir } from './helpers.mjs';

const R = (body, status = 200) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
// Rede falsa: registra cada chamada e responde pelo endereço.
function fakeNet(routes) { const calls = []; const f = async (url, init = {}) => { const u = String(url); calls.push({ url: u, init }); for (const [re, h] of routes) if (re.test(u)) { const v = typeof h === 'function' ? await h(u, init) : h; return v instanceof Response ? v : R(v); } return R({ error: 'sem rota' }, 404); }; f.calls = calls; return f; }
async function setup(fetchFn = fakeNet([]), extra = {}) {
  const dir = await tempDir('social'), store = new Store(':memory:'), proj = await tempDir('social-proj');
  store.put('projects', { id: 'p1', name: 'Terror', path: proj, area: 'Vídeo' }); store.put('projects', { id: 'pf', name: 'Contas', path: proj, area: 'Financeiro' });
  const social = new Social(store, { dataDir: dir, fetchFn, ...extra }); return { social, store, dir, proj };
}
const BSKY = { network: 'bluesky', name: 'Terror BR', label: 'terror-bsky', fields: { handle: 'terror.bsky.social', appPassword: 'abcd-efgh-ijkl-mnop' } };

test('catálogo: todas as redes pedidas, com o que aceitam; só as simples/abertas publicam sozinhas por enquanto', () => {
  for (const n of ['youtube', 'instagram', 'x', 'tiktok', 'threads', 'linkedin', 'facebook', 'bluesky', 'mastodon', 'telegram', 'discord']) assert.ok(CATALOG[n], n);
  assert.deepEqual(NETWORK_IDS.filter(n => CATALOG[n].api === 'pronto').sort(), ['bluesky', 'discord', 'mastodon', 'telegram', 'youtube']);
  assert.match(CATALOG.x.nota, /paga|pago/i); assert.match(CATALOG.tiktok.nota, /privado/i); assert.equal(CATALOG.x.text, 280); assert.deepEqual(CATALOG.tiktok.kinds, ['video']);
});

test('contas: validação, apelido único, segredo guardado só em arquivo (nunca devolvido), edição mantém o segredo, remover apaga tudo', async () => {
  const { social, dir } = await setup();
  await assert.rejects(() => social.saveAccount({ network: 'orkut', name: 'x' }), /Escolha uma rede/); await assert.rejects(() => social.saveAccount({ network: 'bluesky', name: '  ' }), /Dê um nome/);
  const a = await social.saveAccount(BSKY); assert.equal(a.label, 'terror-bsky'); assert.equal(a.mode, 'api'); assert.equal(a.hasSecret, true); assert.equal(a.settings.handle, 'terror.bsky.social'); assert.ok(!JSON.stringify(a).includes('abcd-efgh'), 'a senha nunca volta');
  assert.match(await readFile(join(dir, 'social-secrets.json'), 'utf8'), /abcd-efgh-ijkl-mnop/);
  await assert.rejects(() => social.saveAccount({ ...BSKY, name: 'Outra' }), /Já existe uma conta com o apelido/);
  const e = await social.saveAccount({ id: a.id, network: 'bluesky', name: 'Terror BR 2', label: 'terror-bsky', fields: { handle: 'terror.bsky.social' } }); assert.equal(e.name, 'Terror BR 2'); assert.equal(e.mode, 'api', 'sem digitar a senha de novo, ela é mantida');
  const m = await social.saveAccount({ network: 'instagram', name: 'Terror IG', fields: { handle: '@terror' } }); assert.equal(m.mode, 'manual'); assert.equal(m.label, 'terror-ig');
  const semSenha = await social.saveAccount({ network: 'mastodon', name: 'Masto', fields: { instance: 'https://mastodon.social' } }); assert.equal(semSenha.mode, 'manual', 'faltando o token, vira pacote');
  assert.equal((await social.accounts()).length, 3); await social.removeAccount(a.id); assert.doesNotMatch(await readFile(join(dir, 'social-secrets.json'), 'utf8'), /abcd-efgh/); await assert.rejects(() => social.removeAccount('x'), /não encontrada/);
});

test('contas: endereços e tokens perigosos ou mal formados são recusados (nada de rede interna)', async () => {
  const { social } = await setup();
  for (const instance of ['http://mastodon.social', 'https://localhost', 'https://127.0.0.1', 'https://192.168.0.10', 'https://10.0.0.5', 'https://servidor.local', 'nao-e-url']) await assert.rejects(() => social.saveAccount({ network: 'mastodon', name: 'm' + instance.length, fields: { instance, token: 't' } }), /https|interna|inválido/i, instance);
  await assert.rejects(() => social.saveAccount({ network: 'discord', name: 'Disc', fields: { webhook: 'https://evil.com/api/webhooks/1/abc' } }), /não reconhecido|inválido/i);
  await assert.rejects(() => social.saveAccount({ network: 'telegram', name: 'Tele', fields: { chatId: 'canal sem arroba', botToken: '123456:' + 'A'.repeat(35) } }), /@nomedocanal/); await assert.rejects(() => social.saveAccount({ network: 'telegram', name: 'Tele2', fields: { chatId: '@canal', botToken: 'lixo' } }), /Token de bot inválido/);
  await assert.rejects(() => social.saveAccount({ network: 'bluesky', name: 'Blue', fields: { handle: 'sem ponto' } }), /Usuário do Bluesky inválido/);
});

test('menção +conta: vira o bloco "contas para postar" com o formato da proposta; menções que não são contas ficam como estão', async () => {
  const { social } = await setup(); await social.saveAccount(BSKY); await social.saveAccount({ network: 'instagram', name: 'Terror IG', label: 'terror-ig', niche: 'terror', fields: { handle: '@terror' } });
  const r = social.expandMentions('Faça um post sobre lendas e poste em +terror-bsky e +terror-ig. Custa +1 por hora, +naoexiste.');
  assert.deepEqual(r.accounts.sort(), ['terror-bsky', 'terror-ig']); assert.match(r.text, /\[CONTAS PARA POSTAR/); assert.match(r.text, /\+terror-bsky: Bluesky “Terror BR”.*publica depois da aprovação.*texto até 300/); assert.match(r.text, /\+terror-ig: Instagram.*nicho: terror.*Pacote pronto/); assert.match(r.text, /code-room-post/); assert.match(r.text, /NUNCA publique por conta própria/);
  assert.match(r.text, /\+1 por hora, \+naoexiste\./); const nada = social.expandMentions('Sem menções, só +1 e +x.'); assert.deepEqual(nada, { text: 'Sem menções, só +1 e +x.', accounts: [] });
  await social.saveAccount({ id: (await social.accounts()).find(a => a.label === 'terror-ig').id, network: 'instagram', name: 'Terror IG', label: 'terror-ig', enabled: false }); assert.deepEqual(social.expandMentions('+terror-ig').accounts, [], 'conta desligada não é oferecida');
});

const bloco = j => '```code-room-post\n' + JSON.stringify(j) + '\n```';
test('proposta do agente: só vira PROPOSTA (nada é publicado), valida conta/texto/mídia, não duplica e ignora Financeiro e tarefas que não terminaram', async () => {
  const { social, store, proj } = await setup(); await social.saveAccount(BSKY); await mkdir(join(proj, 'reels')); await writeFile(join(proj, 'reels', 'a.png'), 'x'); await writeFile(join(proj, 'reels', 'doc.pdf'), 'x');
  const t = { id: 'tk1', kind: 'work', status: 'completed', project: { id: 'p1', name: 'Terror', area: 'Vídeo' }, agent: { id: 'a', name: 'Postador' } };
  const r = await social.proposePosts(t, 'Feito.\n' + bloco({ conta: 'terror-bsky', texto: 'Lenda do Saci 🌪️', midia: ['reels/a.png', 'reels/doc.pdf', '../fora.png', 'reels/nao-existe.png'], quando: '2030-01-02T18:00:00-03:00' }) + '\n' + bloco({ conta: 'nao-existe', texto: 'x' }) + '\n' + bloco({ conta: 'terror-bsky', texto: '   ' }));
  assert.equal(r.length, 1); assert.equal(r[0].status, 'proposta'); assert.deepEqual(r[0].media, ['reels/a.png'], 'só mídia que existe, dentro do projeto e de tipo aceito'); assert.equal(r[0].suggestedAt, '2030-01-02T21:00:00.000Z'); assert.equal(r[0].agent, 'Postador');
  assert.equal((await social.proposePosts(t, bloco({ conta: 'terror-bsky', texto: 'Lenda do Saci 🌪️' }))).length, 0, 'mesmo texto/conta/tarefa não duplica');
  assert.equal((await social.proposePosts({ ...t, status: 'failed' }, bloco({ conta: 'terror-bsky', texto: 'a' }))).length, 0); assert.equal((await social.proposePosts({ ...t, project: { id: 'pf', area: 'Financeiro' } }, bloco({ conta: 'terror-bsky', texto: 'b' }))).length, 0); assert.equal((await social.proposePosts({ ...t, project: { id: 'assistant-internal' } }, bloco({ conta: 'terror-bsky', texto: 'c' }))).length, 0);
  assert.equal(store.list('socialPosts').filter(p => p.status !== 'proposta').length, 0);
});

test('aprovar no Bluesky: exige confirmação, publica o texto (e a imagem) pela rede, guarda o link; falha da rede vira "falhou" com o motivo', async () => {
  const net = fakeNet([[/createSession/, { accessJwt: 'JWT', did: 'did:plc:abc', handle: 'terror.bsky.social' }], [/uploadBlob/, { blob: { $type: 'blob', ref: { $link: 'cid' } } }], [/createRecord/, { uri: 'at://did:plc:abc/app.bsky.feed.post/3kxyz' }]]);
  const { social, store, proj } = await setup(net); await social.saveAccount(BSKY); await writeFile(join(proj, 'a.png'), 'png');
  const t = { id: 'tk1', kind: 'work', status: 'completed', project: { id: 'p1', name: 'Terror', area: 'Vídeo' }, agent: { name: 'P' } };
  const [p] = await social.proposePosts(t, bloco({ conta: 'terror-bsky', texto: 'Lenda do Saci', midia: ['a.png'] }));
  await assert.rejects(() => social.approve(p.id, { when: 'now' }), /Confirmação explícita/); assert.equal(net.calls.length, 0, 'sem aprovação, nada sai');
  const r = await social.approve(p.id, { when: 'now', confirm: true }); const done = store.get('socialPosts', p.id); assert.equal(done.status, 'publicado', done.error); assert.equal(r.status, 'publicado', 'a aprovação devolve o resultado do envio'); assert.equal(done.url, 'https://bsky.app/profile/terror.bsky.social/post/3kxyz');
  const rec = JSON.parse(net.calls.find(c => /createRecord/.test(c.url)).init.body); assert.equal(rec.record.text, 'Lenda do Saci'); assert.equal(rec.record.embed.images.length, 1); assert.equal(rec.repo, 'did:plc:abc'); assert.match(net.calls.find(c => /createRecord/.test(c.url)).init.headers.Authorization, /Bearer JWT/);
  assert.equal(JSON.parse(net.calls[0].init.body).password, 'abcd-efgh-ijkl-mnop'); await assert.rejects(() => social.approve(p.id, { confirm: true }), /já foi tratada/);
  const [q] = await social.proposePosts(t, bloco({ conta: 'terror-bsky', texto: 'Outro' })); const bad = fakeNet([[/createSession/, R({ message: 'Invalid identifier or password' }, 401)]]); social.fetch = bad;
  await social.approve(q.id, { confirm: true }); const f = store.get('socialPosts', q.id); assert.equal(f.status, 'falhou'); assert.match(f.error, /Bluesky \(login\) recusou \(401\).*Invalid identifier/);
});

test('aprovar: limite de caracteres da rede, rede sem publicação automática vira pacote, mídia não suportada vira pacote, Financeiro nunca, texto pode ser editado', async () => {
  const net = fakeNet([[/createSession/, { accessJwt: 'J', did: 'd' }], [/createRecord/, { uri: 'at://d/app.bsky.feed.post/k1' }]]); const { social, store, proj } = await setup(net); await social.saveAccount(BSKY); await social.saveAccount({ network: 'instagram', name: 'IG', label: 'ig', fields: { handle: '@x' } }); await writeFile(join(proj, 'v.mp4'), 'v');
  const t = { id: 'tk2', kind: 'work', status: 'completed', project: { id: 'p1', name: 'Terror', area: 'Vídeo' }, agent: { name: 'P' } };
  const [longo] = await social.proposePosts(t, bloco({ conta: 'terror-bsky', texto: 'x'.repeat(301) })); await assert.rejects(() => social.approve(longo.id, { confirm: true }), /301 caracteres e Bluesky aceita até 300/);
  const ok = await social.approve(longo.id, { confirm: true, text: 'curto agora' }); assert.equal(ok.text, 'curto agora');
  const [ig] = await social.proposePosts(t, bloco({ conta: 'ig', texto: 'legenda', midia: ['v.mp4'] })); const man = await social.approve(ig.id, { confirm: true }); assert.equal(man.status, 'manual'); assert.match(man.note, /Pacote pronto/);
  const [vd] = await social.proposePosts(t, bloco({ conta: 'terror-bsky', texto: 'com vídeo', midia: ['v.mp4'] })); assert.equal((await social.approve(vd.id, { confirm: true })).status, 'manual', 'Bluesky ainda não posta vídeo por aqui');
  const fin = store.put('socialPosts', { id: 'spfin', accountId: (await social.accounts())[0].id, label: 'terror-bsky', network: 'bluesky', text: 'x', media: [], projectId: 'pf', status: 'proposta', createdAt: new Date().toISOString() }); await assert.rejects(() => social.approve(fin.id, { confirm: true }), /financeiros não publicam/);
  const mk = social.markPosted(ig.id, { url: 'https://instagram.com/p/abc' }); assert.equal(mk.status, 'publicado'); assert.equal(mk.postedManually, true); assert.throws(() => social.markPosted(ig.id), /Só pacotes manuais/); assert.throws(() => social.markPosted(vd.id, { url: 'javascript:alert(1)' }), /http/);
});

test('agendamento: aprovado com horário futuro fica "agendado"; o relógio publica quando vence (e só então); passado é recusado; limite por dia vale', async () => {
  const ActualDate = globalThis.Date, now = ActualDate.parse('2025-06-02T15:00:00.000Z');
  globalThis.Date = class extends ActualDate { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } };
  try {
    const net = fakeNet([[/createSession/, { accessJwt: 'J', did: 'd' }], [/createRecord/, { uri: 'at://d/app.bsky.feed.post/k9' }]]); const { social, store } = await setup(net); const acc = await social.saveAccount({ ...BSKY, maxPerDay: 2 });
    const mk = txt => social.createPost({ accountId: acc.id, text: txt });
    const futuro = new Date(Date.now() + 3600e3).toISOString(), p1 = await mk('para mais tarde'); await assert.rejects(() => social.approve(p1.id, { confirm: true, when: new Date(Date.now() - 3600e3).toISOString() }), /horário futuro/); await assert.rejects(() => social.approve(p1.id, { confirm: true, when: 'quando der' }), /horário futuro/);
    const ag = await social.approve(p1.id, { confirm: true, when: futuro }); assert.equal(ag.status, 'agendado'); assert.equal(net.calls.length, 0); assert.equal(await social.tick(), 0, 'ainda não venceu');
    store.put('socialPosts', { ...store.get('socialPosts', p1.id), scheduledAt: new Date(Date.now() - 1000).toISOString() }); assert.equal(await social.tick(), 1); assert.equal(store.get('socialPosts', p1.id).status, 'publicado', store.get('socialPosts', p1.id).error); assert.equal(await social.tick(), 0, 'não publica de novo');
    const p2 = await mk('segundo'); await social.approve(p2.id, { confirm: true, when: futuro }); const p3 = await mk('terceiro'); await assert.rejects(() => social.approve(p3.id, { confirm: true, when: futuro }), /Limite de 2 postagem/);
    assert.equal(social.dismiss(p3.id).status, 'descartada'); assert.equal(social.dismiss(p2.id).status, 'descartada', 'agendado ainda pode ser cancelado'); assert.throws(() => social.dismiss(p1.id), /já foi enviada/);
  } finally { globalThis.Date = ActualDate; }
});

test('Mastodon, Telegram e Discord: cada um chama o endereço certo, com a credencial certa e o texto; Telegram/Discord enviam arquivo; testes de conexão', async () => {
  const net = fakeNet([[/\/api\/v1\/media/, { id: 'm1' }], [/\/api\/v1\/statuses/, { url: 'https://mastodon.social/@t/1' }], [/verify_credentials/, { acct: 'terror' }],
    [/sendMessage/, { result: { message_id: 77 } }], [/sendVideo/, { result: { message_id: 78 } }], [/getMe/, { result: { username: 'terror_bot' } }], [/discord\.com\/api\/webhooks\/1\/abc\?wait=true/, { id: '1' }], [/discord\.com\/api\/webhooks\/1\/abc$/, { name: 'Canal' }]]);
  const { social, store, proj } = await setup(net); await writeFile(join(proj, 'a.png'), 'png'); await writeFile(join(proj, 'v.mp4'), 'mp4');
  const masto = await social.saveAccount({ network: 'mastodon', name: 'Masto', fields: { instance: 'https://mastodon.social/ignorado', token: 'TOK' } }), tg = await social.saveAccount({ network: 'telegram', name: 'TG', fields: { chatId: '@terrorcanal', botToken: '123456:' + 'A'.repeat(35) } }), dc = await social.saveAccount({ network: 'discord', name: 'DC', fields: { webhook: 'https://discord.com/api/webhooks/1/abc' } });
  assert.deepEqual([masto.mode, tg.mode, dc.mode], ['api', 'api', 'api']);
  const go = async (acc, text, midia) => { const p = store.put('socialPosts', { id: 'sp' + Math.random().toString(36).slice(2, 10), accountId: acc.id, label: acc.label, network: acc.network, text, media: midia || [], projectId: 'p1', status: 'proposta', createdAt: new Date().toISOString() }); await social.approve(p.id, { confirm: true }); return store.get('socialPosts', p.id); };
  const m = await go(masto, 'Oi Mastodon', ['a.png']); assert.equal(m.status, 'publicado', m.error); assert.equal(m.url, 'https://mastodon.social/@t/1'); const st = net.calls.find(c => /statuses/.test(c.url)); assert.equal(st.url, 'https://mastodon.social/api/v1/statuses'); assert.equal(st.init.headers.Authorization, 'Bearer TOK'); assert.deepEqual(JSON.parse(st.init.body).media_ids, ['m1']); assert.ok(st.init.headers['Idempotency-Key']);
  const t1 = await go(tg, 'Oi Telegram'); assert.equal(t1.url, 'https://t.me/terrorcanal/77', t1.error); assert.match(net.calls.find(c => /sendMessage/.test(c.url)).url, /api\.telegram\.org\/bot123456:A+\/sendMessage/);
  const t2 = await go(tg, 'Com vídeo', ['v.mp4']); assert.equal(t2.status, 'publicado', t2.error); assert.ok(net.calls.some(c => /sendVideo/.test(c.url)));
  const d = await go(dc, 'Oi Discord'); assert.equal(d.status, 'publicado', d.error); const dcc = net.calls.find(c => /webhooks\/1\/abc\?wait=true/.test(c.url)); assert.equal(JSON.parse(dcc.init.body).content, 'Oi Discord');
  assert.deepEqual(await social.test(masto.id), { ok: true, detail: 'Conectado como @terror.' }); assert.match((await social.test(tg.id)).detail, /@terror_bot/); assert.match((await social.test(dc.id)).detail, /Webhook válido \(Canal\)/);
  const ig = await social.saveAccount({ network: 'instagram', name: 'IG', fields: {} }); assert.match((await social.test(ig.id)).detail, /pacote pronto/); social.fetch = fakeNet([[/getMe/, R({ description: 'Unauthorized' }, 401)]]); const bad = await social.test(tg.id); assert.equal(bad.ok, false); assert.match(bad.detail, /Telegram recusou \(401\)/);
});
