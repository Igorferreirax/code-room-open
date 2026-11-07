import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { usageCards } from '../public/views2.js';

test('painel compacto de uso: mostra barras, reset e leituras disponíveis sem inventar dados', () => {
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const html = usageCards({ limits: { providers: [
    { id: 'claude', name: 'Claude Code', plan: 'Max', observedAt: new Date().toISOString(), windows: [{ id: 'five_hour', label: '5 horas', usedPercent: 100, resetsAt: future }, { id: 'seven_day', label: 'Semana', usedPercent: 29, resetsAt: future }] },
    { id: 'codex', name: 'Codex', plan: 'Plus', observedAt: new Date().toISOString(), windows: [{ id: 'primary', label: '5 horas', usedPercent: 30, resetsAt: future }] },
    { id: 'agy', name: 'Antigravity', unavailable: 'Esta IA não informa limites pela linha de comando.', windows: [] }
  ] } });
  assert.match(html, /aria-label="Resumo do uso por IA"/);
  assert.match(html, /Claude Code/); assert.match(html, /Max/); assert.match(html, /5 horas/); assert.match(html, /100%/); assert.match(html, /29%/);
  assert.match(html, /width:100%/); assert.match(html, /Reinicia em 1 h 00 min/);
  assert.match(html, /Codex/); assert.match(html, /30%/);
  assert.match(html, /Antigravity/); assert.match(html, /Esta IA não informa limites/);
  assert.doesNotMatch(html, /<b>0%<\/b>/, 'janela ausente não vira zero de uso');
});

test('painel compacto de uso: leitura vencida ou sem hora fica indisponível; estado vazio carrega', () => {
  const stale = usageCards({ limits: { providers: [{ name: 'Codex', windows: [{ label: '5 horas', usedPercent: 30, resetsAt: new Date(Date.now() - 60000).toISOString() }] }] } });
  assert.match(stale, /Leitura vencida/); assert.match(stale, /indisponível/); assert.doesNotMatch(stale, /30%/);
  const missingTime = usageCards({ limits: { providers: [{ name: 'Claude Code', windows: [{ label: 'Semana', usedPercent: 40, resetsAt: 'valor-inválido' }] }] } });
  assert.match(missingTime, /40%/); assert.match(missingTime, /Reinício indisponível/); assert.doesNotMatch(missingTime, /NaN/);
  assert.match(usageCards({}), /Carregando leituras de uso/);
});

test('painel compacto de uso: estilos se ajustam ao espaço disponível', () => {
  const css = readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');
  const views = readFileSync(new URL('../public/views2.js', import.meta.url), 'utf8');
  assert.match(css, /\.quota-grid\{[^}]*repeat\(auto-fit/);
  assert.match(css, /\.quota-card\{[^}]*min-width:0/);
  assert.match(views, /<h2>Uso por IA<\/h2>[\s\S]*?\$\{usageCards\(ctx\)\}/);
  assert.doesNotMatch(views, /class="limtab"/, 'a tabela repetida de janelas foi removida');
  assert.match(views, /Tokens por dia \(14 dias\)/, 'o gráfico de tokens continua disponível');
});
