// Cópia consistente do banco do Code Room (histórico, equipes, rotinas), SEM a chave de acesso.
// Uso: node scripts/backup.mjs [pasta-de-destino]    (padrão: %USERPROFILE%\CodeRoomBackups)
// Pode rodar com o serviço ligado: VACUUM INTO gera um arquivo íntegro mesmo com o banco em uso.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const data = process.env.CODE_ROOM_DATA || join(root, '.data');
const dest = resolve(process.argv[2] || join(homedir(), 'CodeRoomBackups'));
const KEEP = 14;

mkdirSync(dest, { recursive: true });
const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
const file = join(dest, `code-room-${stamp}.sqlite`);
const db = new DatabaseSync(join(data, 'code-room.sqlite'));
db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
db.close();

// mantém só as últimas cópias
const all = readdirSync(dest).filter(n => /^code-room-.*\.sqlite$/.test(n)).sort();
for (const old of all.slice(0, Math.max(0, all.length - KEEP))) rmSync(join(dest, old));
console.log(`Backup salvo em ${file} (${Math.round(statSync(file).size / 1024)} KB). Chave de acesso NÃO incluída.`);
