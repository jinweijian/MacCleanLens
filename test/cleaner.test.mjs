import assert from 'node:assert/strict';
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { cleanFindings } from '../src/core/cleaner.mjs';

test('cleanFindings moves cleanable paths into a timestamped Trash folder', async () => {
  const home = join(tmpdir(), `mac-clean-lens-clean-${Date.now()}`);
  const trash = join(home, '.Trash');
  const cachePath = join(home, 'Library/Caches/Example');
  await mkdir(cachePath, { recursive: true });
  await writeFile(join(cachePath, 'cache.bin'), 'cache');

  const result = await cleanFindings({
    home,
    trash,
    selectedIds: ['cache-example'],
    findings: [
      {
        id: 'cache-example',
        title: '示例缓存',
        cleanable: true,
        paths: [cachePath]
      }
    ]
  });

  assert.equal(result.moved.length, 1);
  assert.equal(result.skipped.length, 0);
  assert.equal(result.failed.length, 0);
  await assert.rejects(stat(cachePath));
  const trashRuns = await readdir(trash);
  assert.equal(trashRuns.length, 1);
});

test('cleanFindings skips manual findings and paths outside home', async () => {
  const home = join(tmpdir(), `mac-clean-lens-skip-${Date.now()}`);
  const trash = join(home, '.Trash');
  await mkdir(home, { recursive: true });

  const result = await cleanFindings({
    home,
    trash,
    selectedIds: ['manual', 'outside'],
    findings: [
      {
        id: 'manual',
        title: '手动项',
        cleanable: false,
        paths: [join(home, 'Library/Containers/App')]
      },
      {
        id: 'outside',
        title: '外部路径',
        cleanable: true,
        paths: ['/tmp/not-under-home']
      }
    ]
  });

  assert.equal(result.moved.length, 0);
  assert.equal(result.failed.length, 0);
  assert.deepEqual(result.skipped.map((item) => item.id), ['manual', 'outside']);
});

