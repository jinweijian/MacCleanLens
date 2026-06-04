import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { directorySize, fastDirectorySize, formatBytes, pathExists } from '../src/core/size.mjs';

test('formatBytes renders human-readable binary sizes', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(1024), '1 KB');
  assert.equal(formatBytes(1536), '1.5 KB');
  assert.equal(formatBytes(1024 * 1024 * 3), '3 MB');
});

test('directorySize sums nested file sizes and ignores missing paths', async () => {
  const root = join(tmpdir(), `mac-clean-lens-size-${Date.now()}`);
  await mkdir(join(root, 'nested'), { recursive: true });
  await writeFile(join(root, 'a.bin'), Buffer.alloc(5));
  await writeFile(join(root, 'nested', 'b.bin'), Buffer.alloc(7));

  assert.equal(await directorySize(root), 12);
  assert.equal(await directorySize(join(root, 'missing')), 0);
});

test('fastDirectorySize returns a nonzero disk-usage estimate for existing directories', async () => {
  const root = join(tmpdir(), `mac-clean-lens-fast-size-${Date.now()}`);
  await mkdir(root, { recursive: true });
  await writeFile(join(root, 'a.bin'), Buffer.alloc(5));

  assert.ok((await fastDirectorySize(root)) >= 5);
  assert.equal(await fastDirectorySize(join(root, 'missing')), 0);
});

test('fastDirectorySize returns zero instead of falling back when command fails', async () => {
  const root = join(tmpdir(), `mac-clean-lens-timeout-size-${Date.now()}`);
  await mkdir(root, { recursive: true });
  await writeFile(join(root, 'a.bin'), Buffer.alloc(5));

  assert.equal(await fastDirectorySize(root, { duCommand: 'false', fallbackOnError: false }), 0);
});

test('pathExists returns false for missing paths', async () => {
  const root = join(tmpdir(), `mac-clean-lens-exists-${Date.now()}`);
  await mkdir(root, { recursive: true });

  assert.equal(await pathExists(root), true);
  assert.equal(await pathExists(join(root, 'missing')), false);
});
