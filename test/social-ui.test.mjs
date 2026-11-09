import test from 'node:test';
import assert from 'node:assert/strict';
import { socialCardHtml } from '../public/social-ui.js';
import { approvalItems, approvalHtml } from '../public/approval-cards.js';
import { CATALOG } from '../server/social.mjs';

const acc = (o = {}) => ({ id: 'a1', network: 'bluesky', label: 'terror-bs', name: 'Canal <Terror>', niche: 'terror', settings: { handle: 'eu.bsky.social' }, enabled: true, mode: 'api', hasSecret: true, maxPerDay: 10, ...o });
const post = (o = {}) => ({ id: 'sp1', accountId: 'a1', label: 'terror-bs', network: 'bluesky', accountName: 'Canal', text: 'Texto do post', media: [], status: 'proposta', createdAt: '2026-11-09T10:00:00Z', ...o });

test('cartão de redes: sem dados nada aparece; contas, matriz e fila renderizam com HTML escapado e sem segredo', () => {
  assert.equal(socialCardHtml({ ui: {} }), '');
  const h = socialCardHtml({ ui: {}, social: { catalog: CATALOG, accounts: [acc(), acc({ id: 'a2', network: 'x', label: 'terror-x', name: 'X', mode: 'manual', hasSecret: false })], posts: [post({ status: 'manual', note: 'Copie e cole.' }), post({ id: 'sp2', status: 'agendado', scheduledAt: '2026-11-10T12:00:00Z' })] } });
  assert.match(h, /2 contas/); assert.match(h, /\+terror-bs/); assert.ok(!h.includes('Canal <Terror>'), 'nome escapado'); assert.match(h, /Copiar texto/); assert.match(h, /Cancelar agendamento/); assert.match(h, /O que cada rede aceita hoje/);
  assert.match(h, /Instagram/); assert.match(h, /Nada é publicado sem a sua aprovação/);
});

test('YouTube: a conexão com o Google fica dentro de Redes sociais (e só lá); o cartão antigo “Publicação” não existe mais', async () => {
  const g = { connected: false, configured: true, clientId: 'abc' };
  const h = socialCardHtml({ ui: {}, social: { catalog: CATALOG, accounts: [], posts: [] }, publish: { google: g } });
  assert.match(h, /YouTube e Google/); assert.match(h, /id="yt-form"/); assert.match(h, /data-act="yt-connect"/);
  const v = await import('node:fs').then(fs => fs.readFileSync(new URL('../public/views2.js', import.meta.url), 'utf8')); assert.ok(!/publishCard/.test(v) && !v.includes('YouTube Shorts</h3>'));
});

test('formulário: mostra os campos da rede escolhida, senha em campo de senha e “guardado” ao editar', () => {
  const base = { catalog: CATALOG, accounts: [acc()], posts: [] };
  const novo = socialCardHtml({ ui: { socialForm: { network: 'telegram' } }, social: base });
  assert.match(novo, /name="f_botToken"[^>]*type="password"|type="password"[^>]*name="f_botToken"/); assert.match(novo, /Adicionar conta/);
  const ed = socialCardHtml({ ui: { socialForm: { id: 'a1', network: 'bluesky' } }, social: base });
  assert.match(ed, /Salvar alterações/); assert.match(ed, /guardado \(deixe vazio para manter\)/); assert.match(ed, /value="eu\.bsky\.social"/);
});

test('cartão de aprovação do chat: proposta de postagem aparece com texto editável, agendar e botões; rede manual vira “Preparar pacote”', () => {
  const st = { socialProposals: [{ id: 'sp1', accountId: 'a1', label: 'terror-bs', network: 'bluesky', accountName: 'Canal', text: 'Olá <b>mundo</b>', media: ['reels/a.mp4'], agent: 'Produtor' }], runs: [], plans: [], recipes: [], subtasks: [], projects: [] };
  const ctx = { state: st, ui: {}, social: { catalog: CATALOG, accounts: [acc()], posts: [] } };
  assert.equal(approvalItems(ctx).filter(i => i.type === 'post').length, 1);
  const h = approvalHtml(ctx); assert.match(h, /data-act="ap-post-approve"/); assert.match(h, /<textarea[^>]*id="pt-sp1"/); assert.ok(!h.includes('<b>mundo</b>')); assert.match(h, /a\.mp4/); assert.match(h, /Agendar/);
  const m = approvalHtml({ ...ctx, social: { catalog: CATALOG, accounts: [acc({ mode: 'manual' })], posts: [] } }); assert.match(m, /Preparar pacote/);
});
