import { readFileSync, writeFileSync, rmSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execFile } from 'node:child_process';

// Hermes Agent em um servidor (VPS) por SSH. A configuração fica em <dados>/hermes.json: servidor, porta, CAMINHO da chave e programa remoto.
// O conteúdo da chave NUNCA é lido nem copiado: o SSH do Windows lê o arquivo direto, e ele fica só no seu computador.
// Esses valores viram um comando SSH, então são validados com rigor (sem espaço, aspas, ponto e vírgula, "-" no começo etc.).
export const HERMES_FILE = 'hermes.json';
const HOST_RE = /^(?:[A-Za-z0-9._-]{1,64}@)?[A-Za-z0-9](?:[A-Za-z0-9.-]{0,200})$/;
const BIN_RE = /^[A-Za-z0-9_./~-]{1,120}$/;

export function validateHermes(input, { fileExists = p => { try { return statSync(p).isFile(); } catch { return false; } } } = {}) {
  const host = String(input?.host ?? '').trim(), key = String(input?.key ?? '').trim().replace(/^"(.*)"$/, '$1'), bin = String(input?.bin ?? '').trim() || 'hermes';
  const port = Number(String(input?.port ?? '22').trim() || 22);
  if (!HOST_RE.test(host) || host.startsWith('-') || host.includes('..')) throw new Error('Servidor inválido. Use usuario@endereco, por exemplo ubuntu@meu-servidor.com (só letras, números, ponto e hífen).');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Porta inválida: use um número de 1 a 65535 (o padrão do SSH é 22).');
  if (!key || key.length > 260 || /[\u0000-\u001f]/.test(key)) throw new Error('Informe o caminho do arquivo da chave privada (por exemplo C:/Users/voce/.ssh/id_ed25519).');
  if (!fileExists(key)) throw new Error('Não achei o arquivo da chave nesse caminho. Confira o caminho (ele fica no seu computador).');
  if (!BIN_RE.test(bin) || bin.startsWith('-')) throw new Error('Programa remoto inválido. Informe só o caminho, sem espaços ou símbolos (por exemplo hermes ou /usr/local/bin/hermes).');
  return { host, port, key, bin, trustNew: input?.trustNew === true };
}

export const loadHermesFile = dataDir => {
  try { if (!dataDir) return null; const j = JSON.parse(readFileSync(join(dataDir, HERMES_FILE), 'utf8')); return validateHermes(j); } catch { return null; }
};
export function saveHermesFile(dataDir, input, opts) {
  const cfg = validateHermes(input, opts);
  writeFileSync(join(dataDir, HERMES_FILE), JSON.stringify(cfg, null, 2) + '\n', 'utf8');
  return cfg;
}
export const clearHermesFile = dataDir => { rmSync(join(dataDir, HERMES_FILE), { force: true }); };

export function findSsh(env = process.env, exists = existsSync) {
  const sys = join(env.SystemRoot || 'C:\\Windows', 'System32', 'OpenSSH', 'ssh.exe');
  return exists(sys) ? sys : null;
}

// Argumentos do ssh: matriz de argumentos (sem shell local), "--" antes do servidor e o comando remoto como UM argumento.
export function sshArgs(cfg, remoteCommand, { connectTimeout = 20 } = {}) {
  return ['-T', '-p', String(cfg.port), '-i', cfg.key, '-o', 'IdentitiesOnly=yes', '-o', `StrictHostKeyChecking=${cfg.trustNew ? 'accept-new' : 'yes'}`, '-o', 'BatchMode=yes', '-o', `ConnectTimeout=${connectTimeout}`, '--', cfg.host, remoteCommand];
}

// Traduz as falhas mais comuns do SSH para uma frase que dá para agir.
export function explainSsh(text, { trustNew = false } = {}) {
  const t = String(text || '');
  if (/Host key verification failed|REMOTE HOST IDENTIFICATION HAS CHANGED/i.test(t)) return /CHANGED/i.test(t) ? 'A identidade do servidor mudou desde a última conexão. Por segurança o Code Room não conecta. Se você trocou o servidor de propósito, remova a linha dele do arquivo known_hosts.' : (trustNew ? 'Não foi possível confirmar a identidade do servidor.' : 'Primeira conexão com este servidor: marque “Confiar neste servidor na primeira conexão” e teste de novo (ou conecte uma vez pelo terminal para aceitar a identidade).');
  if (/Permission denied/i.test(t)) return 'O servidor recusou a chave. Confirme que a chave pública correspondente está no arquivo authorized_keys do usuário no servidor e que o usuário está certo.';
  if (/Could not resolve hostname|Name or service not known|nodename nor servname/i.test(t)) return 'Não encontrei esse endereço. Confira o nome do servidor e a sua internet.';
  if (/Connection timed out|timed out|ETIMEDOUT/i.test(t)) return 'O servidor não respondeu a tempo. Confira o endereço, a porta e se o firewall do servidor libera o SSH.';
  if (/Connection refused/i.test(t)) return 'O servidor recusou a conexão nessa porta. Confira a porta do SSH.';
  if (/command not found|not found|No such file/i.test(t)) return 'Conectei ao servidor, mas não achei o programa Hermes nesse caminho. Confira o caminho do programa remoto.';
  if (/bad permissions|UNPROTECTED PRIVATE KEY/i.test(t)) return 'O Windows acha o arquivo da chave aberto demais para outros usuários. Deixe só o seu usuário com acesso a ele (Propriedades › Segurança).';
  return t.trim().split('\n').slice(-2).join(' ').slice(0, 220) || 'Não consegui conectar.';
}

// Testa a conexão sem chamar nenhum modelo: pede só a versão do Hermes no servidor.
export function testHermes(cfg, { ssh = findSsh(), run = execFile, timeoutMs = 25000 } = {}) {
  if (!ssh) return Promise.resolve({ ok: false, error: 'O SSH do Windows (OpenSSH) não está instalado. Em Configurações › Aplicativos › Recursos opcionais, adicione “Cliente OpenSSH”.' });
  return new Promise(resolve => run(ssh, sshArgs(cfg, `${cfg.bin} --version`, { connectTimeout: 15 }), { timeout: timeoutMs, windowsHide: true }, (err, stdout, stderr) => {
    const out = String(stdout || '').trim();
    if (!err && out) return resolve({ ok: true, version: out.split('\n')[0].slice(0, 120) });
    resolve({ ok: false, error: explainSsh(`${stderr || ''}\n${err?.killed ? 'timed out' : err?.message || ''}`, cfg) });
  }));
}
