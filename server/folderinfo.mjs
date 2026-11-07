import { readdirSync, statSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

// Resumo seguro de uma pasta de projeto para o Assistente sugerir agentes e skills: só NOMES do primeiro nível, sinais de tecnologia e contagem por tipo.
// Nunca lê o conteúdo dos arquivos. Ignora pastas ocultas e as pesadas (node_modules, .git…).
const SKIP = new Set(['node_modules', '.git', '.data', 'dist', 'build', '__pycache__', '.venv', 'venv']);
const MARK = [['package.json', 'Node/JavaScript (package.json)'], ['tsconfig.json', 'TypeScript'], ['requirements.txt', 'Python (requirements.txt)'], ['pyproject.toml', 'Python (pyproject)'], ['Cargo.toml', 'Rust'], ['go.mod', 'Go'], ['pom.xml', 'Java (Maven)'], ['Dockerfile', 'Docker'], ['README.md', 'README']];
const KIND = { video: ['mp4', 'mov', 'mkv', 'webm', 'avi'], audio: ['mp3', 'wav', 'm4a', 'ogg'], imagem: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'], documento: ['md', 'txt', 'pdf', 'docx'], planilha: ['csv', 'xlsx'], código: ['js', 'ts', 'tsx', 'jsx', 'py', 'go', 'rs', 'java', 'cs', 'html', 'css'] };

export function describeFolder(dir, { maxEntries = 40, maxScan = 400 } = {}) {
  if (!dir || !existsSync(dir)) return { ok: false, error: 'pasta não encontrada' };
  let names; try { names = readdirSync(dir, { withFileTypes: true }); } catch { return { ok: false, error: 'sem acesso à pasta' }; }
  const entries = [], counts = {}; let seen = 0; const signals = [];
  for (const e of names) {
    if (e.name.startsWith('.') && e.name !== '.github') { if (e.name === '.git') signals.push('Git'); continue; }
    if (SKIP.has(e.name)) continue; if (entries.length < maxEntries) entries.push(e.isDirectory() ? e.name + '/' : e.name);
    const scan = (p, depth) => { let list; try { list = readdirSync(p, { withFileTypes: true }); } catch { return; } for (const x of list) { if (++seen > maxScan) return; if (x.name.startsWith('.') || SKIP.has(x.name)) continue; if (x.isDirectory()) { if (depth < 2) scan(join(p, x.name), depth + 1); continue; } const ext = extname(x.name).slice(1).toLowerCase(), k = Object.keys(KIND).find(key => KIND[key].includes(ext)); if (k) counts[k] = (counts[k] || 0) + 1; } };
    if (e.isDirectory()) scan(join(dir, e.name), 1); else { const ext = extname(e.name).slice(1).toLowerCase(), k = Object.keys(KIND).find(key => KIND[key].includes(ext)); if (k) counts[k] = (counts[k] || 0) + 1; }
  }
  for (const [file, label] of MARK) { try { if (statSync(join(dir, file)).isFile()) signals.push(label); } catch {} }
  return { ok: true, entries, signals: [...new Set(signals)], counts, truncated: names.length > maxEntries || seen > maxScan };
}
export const folderLine = info => !info?.ok ? '' : `Pasta: ${info.entries.join(', ') || '(vazia)'}${info.truncated ? ' …' : ''}. Sinais: ${info.signals.join(', ') || 'nenhum'}. Arquivos por tipo: ${Object.entries(info.counts).map(([k, n]) => `${k} ${n}`).join(', ') || 'nenhum conhecido'}.`;
