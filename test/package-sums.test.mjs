import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

test('pacote: hashes incluem somente ZIP e Setup da versão escolhida', { skip: process.platform !== 'win32' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'cr-sums-test-'));
  try {
    const files = {
      'Code-Room-0.3.4-portatil-win-x64.zip': 'antigo',
      'Code-Room-0.3.4-Setup.exe': 'antigo',
      'Code-Room-0.3.5-portatil-win-x64.zip': 'zip novo',
      'Code-Room-0.3.5-Setup.exe': 'setup novo',
    };
    for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
    const script = new URL('../installer/sums.ps1', import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/, '');
    // Usa o PowerShell 7 quando existe (CI do GitHub) e o Windows PowerShell 5.1 nos demais (vem em todo Windows).
    // PSModulePath herdado do PowerShell 7 faz o 5.1 não achar Get-FileHash, por isso sai do ambiente.
    const { PSModulePath, ...env } = process.env;
    const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', decodeURIComponent(script), '-OutDir', dir, '-Version', '0.3.5'];
    let result = spawnSync('pwsh.exe', args, { encoding: 'utf8' });
    if (result.error) result = spawnSync('powershell.exe', args, { encoding: 'utf8', env });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const lines = readFileSync(join(dir, 'SHA256SUMS.txt'), 'utf8').trim().split(/\r?\n/);
    assert.equal(lines.length, 2);
    for (const name of ['Code-Room-0.3.5-portatil-win-x64.zip', 'Code-Room-0.3.5-Setup.exe']) {
      const hash = createHash('sha256').update(files[name]).digest('hex');
      assert.ok(lines.includes(`${hash}  ${name}`), `hash ausente: ${name}`);
    }
    assert.ok(!lines.some(line => line.includes('0.3.4')), 'pacote antigo não deve aparecer');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
