// Confere a sintaxe de todo o código (servidor, interface e scripts) sem rodar nada. Uso: npm run check
import { readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
const dirs = [['server', /\.mjs$/], ['public', /\.js$/], ['scripts', /\.mjs$/], ['test', /\.mjs$/]];
let bad = 0, total = 0;
for (const [dir, re] of dirs) for (const f of readdirSync(dir).filter(n => re.test(n) && n !== 'three.js')) {
  total++;
  try { execFileSync(process.execPath, ['--check', join(dir, f)], { stdio: 'pipe' }); } catch (e) { bad++; console.error(`ERRO em ${join(dir, f)}:\n${String(e.stderr).split('\n').slice(0, 4).join('\n')}`); }
}
console.log(`${total - bad} de ${total} arquivos com sintaxe ok.`);
process.exit(bad ? 1 : 0);
