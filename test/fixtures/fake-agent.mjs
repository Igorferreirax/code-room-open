// Agente falso com PROCESSO REAL, no formato de eventos do Codex. Diretivas vêm no prompt: [[fake k=v ...]]
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
let input = '';
for await (const c of process.stdin) input += c;
const cfg = Object.fromEntries((input.match(/\[\[fake ([^\]]*)\]\]/)?.[1] || '').split(' ').filter(Boolean).map(kv => kv.split('=')));
const out = o => process.stdout.write(JSON.stringify(o) + '\n');
out({ type: 'thread.started', thread_id: 'fake-' + process.pid });
if (cfg.grandchild) {
  const g = spawn(process.execPath, ['-e', 'setTimeout(()=>process.exit(),40000);setInterval(()=>{},1000)'], { stdio: 'ignore', windowsHide: true });
  g.unref();
  writeFileSync(cfg.grandchild, String(g.pid));
}
if (cfg.pidfile) writeFileSync(cfg.pidfile, String(process.pid));
if (cfg.write) { const [rel, body] = cfg.write.split(':'); const f = join(process.cwd(), rel); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, body); }
if (cfg.echo) out({ type: 'item.completed', item: { type: 'agent_message', text: input } });
await new Promise(r => setTimeout(r, Number(cfg.sleep || 50)));
if (cfg.exit && cfg.exit !== '0') { process.stderr.write('falha simulada'); process.exit(Number(cfg.exit)); }
if (cfg.error) { out({ type: 'error', message: cfg.error.replace(/_/g, ' ') }); process.exit(1); }
const answer = cfg.answerfile ? readFileSync(cfg.answerfile, 'utf8') : cfg.answer ? cfg.answer.replace(/_/g, ' ') : 'feito';
out({ type: 'item.completed', item: { type: 'agent_message', text: answer } });
out({ type: 'turn.completed', usage: { input_tokens: 10, output_tokens: 5, cached_input_tokens: 0 } });
