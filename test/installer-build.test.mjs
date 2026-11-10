import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('build do Windows preserva arquivos independentes no diretório de saída', async () => {
  const script = await readFile(new URL('../installer/build.ps1', import.meta.url), 'utf8');
  assert.match(script, /New-Item -ItemType Directory -Path \$out -Force/);
  assert.match(script, /Remove-Item -LiteralPath \$stage -Recurse -Force/);
  assert.match(script, /if \(Test-Path -LiteralPath \$zip\) \{ Remove-Item -LiteralPath \$zip -Force \}/);
  assert.match(script, /if \(Test-Path -LiteralPath \$versionSetup\) \{ Remove-Item -LiteralPath \$versionSetup -Force \}/);
  assert.doesNotMatch(script, /Remove-Item -LiteralPath \$out -Recurse -Force/);
});
