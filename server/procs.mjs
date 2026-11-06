import { spawn, execFile } from 'node:child_process';

const win = process.platform === 'win32';
const sleep = ms => new Promise(r => setTimeout(r, ms));

export function alive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

function powershell(script, timeout = 8000) {
  return new Promise(resolve => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout }, (err, stdout) => resolve(err ? null : stdout.trim())));
}

// Lista o PID e todos os descendentes. Sem PowerShell, cai para apenas o PID raiz.
export async function listTree(pid) {
  if (!win) return [pid];
  const out = await powershell(`$p=Get-CimInstance Win32_Process|Select-Object ProcessId,ParentProcessId;$q=@(${pid});$i=0;while($i -lt $q.Count){$c=$p|Where-Object{$_.ParentProcessId -eq $q[$i]}|ForEach-Object{$_.ProcessId};foreach($x in $c){if($q -notcontains $x){$q+=$x}};$i++};$q -join ','`);
  const ids = (out || '').split(',').map(Number).filter(n => Number.isInteger(n) && n > 0);
  return ids.length ? ids : [pid];
}

// Dados do processo para confirmar que o PID ainda é o mesmo que iniciamos (PID pode ser reaproveitado).
export async function processIdentity(pid) {
  if (!win) return alive(pid) ? { name: null, createdAt: null } : null;
  const out = await powershell(`$x=Get-CimInstance Win32_Process -Filter "ProcessId=${pid}";if($x){$x.Name+'|'+$x.CreationDate.ToUniversalTime().ToString('o')}`);
  if (!out) return null;
  const [name, createdAt] = out.split('|');
  return { name, createdAt };
}

// Encerra a árvore e confirma, dentro do prazo, que todos os PIDs conhecidos saíram.
export async function killTree(pid, { deadlineMs = 10000 } = {}) {
  const started = Date.now();
  const tree = await listTree(pid);
  if (win) {
    await new Promise(resolve => {
      const k = spawn('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      k.on('error', () => { try { process.kill(pid); } catch {} resolve(); });
      k.on('close', resolve);
    });
  } else {
    for (const id of tree) { try { process.kill(id, 'SIGKILL'); } catch {} }
  }
  while (Date.now() - started < deadlineMs) {
    const remaining = tree.filter(alive);
    if (!remaining.length) return { ok: true, ms: Date.now() - started, tree, survivors: [] };
    await sleep(100);
  }
  return { ok: false, ms: Date.now() - started, tree, survivors: tree.filter(alive) };
}
