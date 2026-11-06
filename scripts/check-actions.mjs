// Confere, sem navegador, que todo botão com data-act tem uma ação em app.js e lista as ações sem botão.
// Valores literais (data-act="nome") e ternários simples (data-act="${a ? 'x' : 'y'}") são lidos; o resto é contado como dinâmico.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('../public/', import.meta.url));
const files = readdirSync(dir).filter(f => /\.(js|html)$/.test(f));
const app = readFileSync(join(dir, 'app.js'), 'utf8');
const start = app.indexOf('const actions = {');
if (start < 0) { console.error('não achei "const actions = {" em app.js'); process.exit(2); }
const rest = app.slice(start), end = rest.search(/\n};\n/), map = rest.slice(0, end);
const defined = new Set([...map.matchAll(/['"]?([a-z][a-z0-9-]*)['"]?\s*:\s*(?:async\s*)?(?:\(|[a-zA-Z_]\w*\s*=>|[a-zA-Z_]\w*\s*[,}])/g)].map(m => m[1]));
const used = new Map(); let dynamic = 0;
const add = (v, f) => { if (!used.has(v)) used.set(v, new Set()); used.get(v).add(f); };
for (const f of files) {
  const src = readFileSync(join(dir, f), 'utf8');
  for (const m of src.matchAll(/data-act="([^"]+)"/g)) {
    const v = m[1], tag = src.slice(src.lastIndexOf('<', m.index), m.index);
    if (/^<input/i.test(tag)) continue;   // campos (caixas de marcar) são tratados pelo evento "change", não pelo clique
    if (!v.includes('${')) { add(v, f); continue; }
    const quoted = [...v.matchAll(/[?:]\s*'([a-z0-9-]+)'/g)].map(q => q[1]); if (quoted.length) quoted.forEach(q => add(q, f)); else dynamic++;
  }
}
const strict = new Set([...map.matchAll(/^ {2}(?:'([a-z0-9:-]+)'|([a-zA-Z0-9_]+))\s*[:(]/gm)].map(m => m[1] || m[2]));
const missing = [...used].filter(([v]) => !defined.has(v)), unused = [...strict].filter(v => !used.has(v));
console.log(`${defined.size} ações definidas, ${used.size} usadas em botões, ${dynamic} geradas por expressão.`);
if (missing.length) { console.log('\nBOTÕES SEM AÇÃO:'); for (const [v, fs] of missing) console.log(`  ${v}  (${[...fs].join(', ')})`); }
if (unused.length) { console.log('\nAções sem botão (chamadas por atalho, por outra ação ou sobras):'); console.log('  ' + unused.join(', ')); }
process.exit(missing.length ? 1 : 0);
