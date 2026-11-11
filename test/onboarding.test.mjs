import test from 'node:test';
import assert from 'node:assert/strict';
import { providerState, starterPlan, setupHtml, tourHtml, onboardingHtml, TOUR, PROVIDERS } from '../public/onboarding.js';
import { NAV } from '../public/views.js';

const ck = (id, over = {}) => ({ id, installed: true, authenticated: true, version: '1.2.3', ...over });
const ctx = (checks, { agents = [], teams = [], onb = { mode: 'setup' } } = {}) => ({ checks, state: { agents, teams }, ui: { onb } });

test('estado de cada IA: verificando, não encontrada, falta entrar e conectada', () => {
  assert.equal(providerState(undefined), 'checking');
  assert.equal(providerState(ck('codex', { installed: false })), 'missing');
  assert.equal(providerState(ck('codex', { authenticated: false })), 'login');
  assert.equal(providerState(ck('codex')), 'ok');
  assert.equal(providerState(ck('hermes', { authenticated: null })), 'ok', 'desconhecido não vira erro');
});

test('triagem sem nenhuma IA: mostra como instalar cada uma, avisa e não oferece criar agentes', () => {
  const html = setupHtml(ctx(PROVIDERS.map(id => ck(id, { installed: false, authenticated: null }))));
  assert.match(html, /npm install -g @openai\/codex/); assert.match(html, /npm install -g @anthropic-ai\/claude-code/); assert.match(html, /Antigravity pelo site oficial/);
  assert.match(html, /Nenhuma IA conectada ainda/); assert.doesNotMatch(html, /data-act="onb-create"/);
  assert.match(html, /data-act="onb-skip"/, 'dá para pular'); assert.match(html, /data-act="onb-recheck"/); assert.match(html, /data-act="onb-tour"/);
  assert.match(html, /não guarda senha nem chave/);
});

test('primeiro uso oferece checagem opcional do ambiente de vídeo sem instalar nada e exibe itens escapados', () => {
  const base = setupHtml(ctx(PROVIDERS.map(id => ck(id))));
  assert.match(base, /data-act="onb-video-check"/);
  assert.match(base, /Não instala programas nem mostra valores de chaves/);
  const checked = setupHtml({ ...ctx(PROVIDERS.map(id => ck(id))), ui: { onb: { mode: 'setup', videoCheck: { summary: 'aviso', items: [{ label: '<script>x</script>', status: 'aviso', detail: 'não encontrado', fix: 'instale manualmente' }] } } } });
  assert.doesNotMatch(checked, /<script>x/);
  assert.match(checked, /&lt;script&gt;x&lt;\/script&gt;/);
  assert.match(checked, /Ambiente de vídeo: há avisos/);
});

test('triagem: instalada mas sem login mostra o comando de entrada; enquanto verifica, não acusa erro', () => {
  const html = setupHtml(ctx([ck('codex', { authenticated: false }), ck('claude'), ck('agy', { installed: false })]));
  assert.match(html, /Instalado: falta entrar/); assert.match(html, /<pre>codex login<\/pre>/); assert.match(html, /Conectado/);
  const loading = setupHtml(ctx(undefined)); assert.match(loading, /Verificando/); assert.doesNotMatch(loading, /Nenhuma IA conectada ainda/);
});

test('agentes iniciais: um por IA conectada, Codex edita e os outros só leem, equipe só com Codex e Claude, sem duplicar', () => {
  const all = [ck('codex'), ck('claude'), ck('agy')], plan = starterPlan(ctx(all));
  assert.deepEqual(plan.agents.map(a => [a.provider, a.name, a.mode]), [['codex', 'Desenvolvedor', 'write'], ['claude', 'Revisor', 'read'], ['agy', 'Pesquisador', 'read']]);
  assert.equal(plan.team, true);
  assert.ok(plan.agents.every(a => a.model === '' && Array.isArray(a.skillIds) && a.room), 'campos que a API exige');
  const some = starterPlan(ctx([ck('codex'), ck('claude', { authenticated: false }), ck('agy', { installed: false })]));
  assert.deepEqual(some.agents.map(a => a.provider), ['codex']); assert.equal(some.team, false, 'sem Claude conectado não há equipe');
  const again = starterPlan(ctx(all, { agents: [{ provider: 'codex', name: 'Desenvolvedor' }], teams: [{ name: 'Equipe de Desenvolvimento' }] }));
  assert.deepEqual(again.agents.map(a => a.provider), ['claude', 'agy'], 'não repete agente que já existe'); assert.equal(again.team, false, 'nem a equipe');
  const html = setupHtml(ctx(all)); assert.match(html, /Criar agentes iniciais \(3 \+ equipe\)/);
  const veteran = setupHtml(ctx(all, { agents: [{ provider: 'agy', name: 'Outro' }] })); assert.doesNotMatch(veteran, /onb-create/, 'quem já tem agentes não recebe a oferta de agentes iniciais');
});

test('tutorial: cobre TODAS as telas do menu, na ordem do menu, e cada passo destaca o botão certo', () => {
  assert.deepEqual(TOUR.map(s => s.view), NAV.map(n => n[0]), 'um passo por tela do menu');
  for (const s of TOUR) { assert.equal(s.target, `[data-nav=${s.view}]`); assert.ok(s.title && s.text.length > 40, s.view); }
  assert.ok(new Set(TOUR.map(s => s.title)).size === TOUR.length, 'sem títulos repetidos');
});

test('tutorial: todo passo tem "Pular tutorial"; só o primeiro não volta; o último conclui', () => {
  const at = step => tourHtml({ ui: { onb: { mode: 'tour', step } } });
  for (let i = 0; i < TOUR.length; i++) { const h = at(i); assert.match(h, /data-act="onb-skip"[^>]*>Pular tutorial/); assert.match(h, new RegExp(`Passo ${i + 1} de ${TOUR.length}`)); assert.match(h, new RegExp(TOUR[i].title)); }
  assert.doesNotMatch(at(0), /onb-back/); assert.match(at(1), /onb-back/);
  assert.match(at(0), />Próximo</); assert.match(at(TOUR.length - 1), />Concluir</); assert.doesNotMatch(at(TOUR.length - 1), />Próximo</);
  assert.match(at(999), /Concluir/, 'passo fora do limite não quebra');
});

test('sem modo ativo, nada aparece; o texto dos passos não escapa HTML malicioso', () => {
  assert.equal(onboardingHtml({ ui: {} }), ''); assert.equal(onboardingHtml({ ui: { onb: null } }), '');
  assert.match(onboardingHtml({ ui: { onb: { mode: 'tour', step: 0 } } }), /Início e Assistente/);
  const evil = setupHtml(ctx([ck('codex', { version: '<img src=x onerror=alert(1)>' })]));
  assert.doesNotMatch(evil, /<img src=x/); assert.match(evil, /&lt;img/);
});
