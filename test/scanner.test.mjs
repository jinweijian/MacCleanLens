import assert from 'node:assert/strict';
import { mkdir, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { scanHome } from '../src/core/scanner.mjs';

async function writeSizedFile(path, bytes) {
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, Buffer.alloc(bytes));
}

test('scanHome classifies common macOS cleanup candidates', async () => {
  const home = join(tmpdir(), `mac-clean-lens-scan-${Date.now()}`);
  await writeSizedFile(join(home, 'Library/Logs/JetBrains/PhpStorm2026.1/idea.log'), 26);
  await writeSizedFile(join(home, 'Library/Caches/JetBrains/PhpStorm2023.1/index/data.bin'), 20);
  await writeSizedFile(join(home, '.npm/_cacache/content.bin'), 8);
  await writeSizedFile(join(home, 'Library/Containers/com.docker.docker/Data/vms/0/data.raw'), 12);
  await writeSizedFile(join(home, 'website/demo/node_modules/pkg/index.js'), 11);

  const report = await scanHome({ home, fastSize: false });
  const titles = report.findings.map((finding) => finding.title);

  assert.ok(titles.includes('JetBrains 日志'));
  assert.ok(titles.includes('JetBrains 缓存'));
  assert.ok(titles.includes('npm 缓存'));
  assert.ok(titles.includes('Docker 数据'));
  assert.ok(titles.includes('项目依赖 node_modules'));
  assert.equal(report.summary.totalBytes, 77);
  assert.equal(report.summary.cleanableBytes, 65);
  assert.equal(report.findings.find((finding) => finding.title === 'Docker 数据').risk, 'manual');
});

test('scanHome returns category totals sorted by size descending', async () => {
  const home = join(tmpdir(), `mac-clean-lens-categories-${Date.now()}`);
  await writeSizedFile(join(home, 'Library/Caches/pnpm/store/file.bin'), 30);
  await writeSizedFile(join(home, 'Library/Caches/Yarn/v6/file.bin'), 10);

  const report = await scanHome({ home, fastSize: false });

  assert.equal(report.categories[0].id, 'package-managers');
  assert.equal(report.categories[0].bytes, 40);
  assert.equal(report.categories[0].count, 2);
});

test('scanHome suggests downloads and large files as confirmable cleanup candidates', async () => {
  const home = join(tmpdir(), `mac-clean-lens-files-${Date.now()}`);
  const installer = join(home, 'Downloads/OldInstaller.dmg');
  const movie = join(home, 'Movies/archive.mov');
  await mkdir(join(home, 'Downloads'), { recursive: true });
  await mkdir(join(home, 'Movies'), { recursive: true });
  await writeFile(installer, '');
  await writeFile(movie, '');
  await truncate(installer, 64 * 1024 * 1024);
  await truncate(movie, 1024 * 1024 * 1024);

  const report = await scanHome({ home, fastSize: false });
  const download = report.findings.find((finding) => finding.title === '下载文件：OldInstaller.dmg');
  const largeFile = report.findings.find((finding) => finding.title === '大文件：archive.mov');

  assert.equal(download?.category, 'downloads');
  assert.equal(download?.risk, 'confirm');
  assert.equal(download?.cleanable, true);
  assert.deepEqual(download?.paths, [installer]);
  assert.equal(largeFile?.category, 'large-files');
  assert.equal(largeFile?.risk, 'confirm');
  assert.equal(largeFile?.cleanable, true);
  assert.deepEqual(largeFile?.paths, [movie]);
});
