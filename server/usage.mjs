import { readdirSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// Janelas de uso por conta (como a tela de uso de cada IA). Só lê o que existe de verdade:
// - Codex: o próprio Codex grava os limites nas sessões locais (~/.codex/sessions), na última vez que rodou.
// - Claude: a saída do Claude Code traz um evento "rate_limit_event"; guardamos o último visto (ou uma leitura sob demanda).
// Se não há leitura, devolve vazio: a interface mostra "indisponível", nunca zero inventado.
const iso = sec => new Date(sec * 1000).toISOString();
const win = (id, label, usedPercent, resetsAtSec) => ({ id, label, usedPercent, resetsAt: Number.isFinite(resetsAtSec) ? iso(resetsAtSec) : null });

function newestRollouts(limit = 4) {
  const root = join(homedir(), '.codex', 'sessions'), files = [];
  const walk = (dir, depth) => {
    let entries; try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory() && depth < 3) walk(p, depth + 1);
      else if (e.isFile() && /^rollout-.*\.jsonl$/.test(e.name)) { try { files.push({ p, m: statSync(p).mtimeMs }); } catch {} }
    }
  };
  walk(root, 0);
  return files.sort((a, b) => b.m - a.m).slice(0, limit).map(f => f.p);
}
function tail(path, bytes = 400000) {
  const size = statSync(path).size, start = Math.max(0, size - bytes), fd = openSync(path, 'r');
  try { const buf = Buffer.alloc(size - start); readSync(fd, buf, 0, buf.length, start); return buf.toString('utf8'); } finally { closeSync(fd); }
}

export function readCodexLimits() {
  try {
    for (const file of newestRollouts()) {
      const lines = tail(file).split('\n');
      for (let i = lines.length - 1; i >= 0; i--) {
        if (!lines[i].includes('rate_limits')) continue;
        let o; try { o = JSON.parse(lines[i]); } catch { continue; }
        const rl = o.payload?.rate_limits; if (!rl || o.payload?.type !== 'token_count') continue;
        const windows = [];
        if (rl.primary) windows.push(win('primary', rl.primary.window_minutes === 300 ? '5 horas' : `${rl.primary.window_minutes} min`, rl.primary.used_percent, rl.primary.resets_at));
        if (rl.secondary) windows.push(win('secondary', rl.secondary.window_minutes === 10080 ? 'Semana' : `${rl.secondary.window_minutes} min`, rl.secondary.used_percent, rl.secondary.resets_at));
        return { id: 'codex', name: 'Codex', plan: rl.plan_type || null, windows, observedAt: o.timestamp || null, source: 'sessões locais do Codex' };
      }
    }
  } catch { /* sem leitura */ }
  return null;
}

// Evento do Claude: unifiedWindows.{five_hour, seven_day}.{utilization (fração 0–1), resetsAt (segundos)}
export function claudeFromEvent(info, observedAt = new Date().toISOString()) {
  const uw = info?.unifiedWindows; if (!uw) return null;
  const windows = [];
  if (uw.five_hour) windows.push(win('five_hour', '5 horas', Math.round(uw.five_hour.utilization * 1000) / 10, uw.five_hour.resetsAt));
  if (uw.seven_day) windows.push(win('seven_day', 'Semana', Math.round(uw.seven_day.utilization * 1000) / 10, uw.seven_day.resetsAt));
  return windows.length ? { id: 'claude', name: 'Claude Code', plan: null, windows, observedAt, source: 'última execução do Claude Code', note: 'Valores informados pelo próprio Claude Code.' } : null;
}

export function limitsView(store) {
  const out = [], codex = readCodexLimits(); if (codex) out.push(codex);
  const claude = store.get('settings', 'limits:claude'); if (claude?.windows?.length) out.push({ id: 'claude', name: 'Claude Code', plan: null, windows: claude.windows, observedAt: claude.observedAt, source: claude.source, note: 'Valores informados pelo próprio Claude Code.' });
  const have = new Set(out.map(o => o.id));
  const missing = [['codex', 'Codex', 'Ainda não há leitura: rode uma tarefa do Codex.'], ['claude', 'Claude Code', 'Ainda não há leitura: rode uma tarefa do Claude ou use "Atualizar leitura".'], ['agy', 'Antigravity (Gemini)', 'Este provedor não informa limites pela linha de comando.'], ['hermes', 'Hermes (remoto)', 'Este provedor não informa limites.']].filter(([id]) => !have.has(id)).map(([id, name, why]) => ({ id, name, windows: [], observedAt: null, unavailable: why }));
  return [...out, ...missing];
}
