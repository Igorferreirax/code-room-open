import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { snapshot, diffSnapshots } from '../server/deliverables.mjs';

test('diff da entrega: mostra linhas criadas, alteradas e removidas com escape na UI', async () => {
  const root = await mkdtemp(join(tmpdir(), 'code-room-diff-'));
  try {
    await mkdir(join(root, 'src'));
    await writeFile(join(root, 'src', 'edit.md'), 'antes\nlinha igual\n');
    await writeFile(join(root, 'old.txt'), 'remover\n');
    await writeFile(join(root, '.env'), 'API_KEY=segredo\n');
    const before = await snapshot(root);
    await writeFile(join(root, 'src', 'edit.md'), 'depois <script>\nlinha igual\n');
    await rm(join(root, 'old.txt'));
    await writeFile(join(root, 'new.txt'), 'novo\n');
    await writeFile(join(root, 'src', 'config.json'), '{"access_token":"secreto123"}\n');
    const result = await diffSnapshots(root, before, await snapshot(root));
    assert.equal(result.available, true);
    assert.match(result.files.find(f => f.path === 'src/edit.md').diff, /-antes/);
    assert.match(result.files.find(f => f.path === 'src/edit.md').diff, /\+depois <script>/);
    assert.match(result.files.find(f => f.path === 'old.txt').diff, /-remover/);
    assert.match(result.files.find(f => f.path === 'new.txt').diff, /\+novo/);
    assert.doesNotMatch(result.files.find(f => f.path === 'src/config.json').diff, /secreto123/);
    assert.equal(result.files.some(f => f.path === '.env'), false);
    const { changesDialog } = await import('../public/views2.js');
    const html = changesDialog({}, { deliverables: result });
    assert.match(html, /diff textual/); assert.ok(!html.includes('<script>'));
    assert.match(html, /&lt;script&gt;/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
