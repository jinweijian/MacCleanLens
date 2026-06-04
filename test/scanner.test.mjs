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

test('quick scan dynamically discovers caches and logs that exist on this Mac', async () => {
  const home = join(tmpdir(), `mac-clean-lens-dynamic-${Date.now()}`);
  await writeSizedFile(join(home, 'Library/Caches/com.example.PhotoTool/cache.bin'), 17);
  await writeSizedFile(join(home, 'Library/Logs/PhotoTool/session.log'), 13);

  const report = await scanHome({ home, fastSize: false, mode: 'quick' });

  assert.equal(report.mode, 'quick');
  assert.ok(report.findings.some((finding) => finding.title === '应用缓存：PhotoTool'));
  assert.ok(report.findings.some((finding) => finding.title === '应用日志：PhotoTool'));
  assert.ok(report.categories.some((category) => category.id === 'app-caches'));
  assert.ok(report.categories.some((category) => category.id === 'logs'));
});

test('deep scan adds manual guidance for protected personal data', async () => {
  const home = join(tmpdir(), `mac-clean-lens-deep-${Date.now()}`);
  const backup = join(home, 'Library/Application Support/MobileSync/Backup/phone');
  const attachment = join(home, 'Library/Messages/Attachments/file.bin');
  await writeSizedFile(join(backup, 'backup.bin'), 21);
  await writeSizedFile(attachment, 11);

  const quick = await scanHome({ home, fastSize: false, mode: 'quick' });
  const deep = await scanHome({ home, fastSize: false, mode: 'deep' });

  assert.equal(quick.findings.some((finding) => finding.title === 'iPhone 与 iPad 备份'), false);
  assert.equal(deep.mode, 'deep');
  assert.equal(deep.findings.find((finding) => finding.title === 'iPhone 与 iPad 备份')?.cleanable, false);
  assert.equal(deep.findings.find((finding) => finding.title === '信息附件')?.cleanable, false);
  assert.ok(deep.findings.find((finding) => finding.title === 'iPhone 与 iPad 备份')?.actions.length > 0);
});

test('deep scan searches nested large files while quick scan stays shallow', async () => {
  const home = join(tmpdir(), `mac-clean-lens-nested-large-${Date.now()}`);
  const nestedMovie = join(home, 'Documents/archive/old/export.mov');
  await mkdir(join(nestedMovie, '..'), { recursive: true });
  await writeFile(nestedMovie, '');
  await truncate(nestedMovie, 1024 * 1024 * 1024);

  const quick = await scanHome({ home, fastSize: false, mode: 'quick' });
  const deep = await scanHome({ home, fastSize: false, mode: 'deep' });

  assert.equal(quick.findings.some((finding) => finding.paths.includes(nestedMovie)), false);
  assert.equal(deep.findings.some((finding) => finding.paths.includes(nestedMovie)), true);
});

test('scan discovers transient caches inside installed application support folders', async () => {
  const home = join(tmpdir(), `mac-clean-lens-app-support-${Date.now()}`);
  await writeSizedFile(join(home, 'Library/Application Support/ExampleApp/Code Cache/cache.bin'), 19);

  const report = await scanHome({ home, fastSize: false, mode: 'quick' });
  const finding = report.findings.find((item) => item.title === '应用临时数据：ExampleApp');

  assert.equal(finding?.category, 'app-caches');
  assert.equal(finding?.cleanable, true);
});

test('deep scan treats a Photos library as manual guidance and never exposes its internal files', async () => {
  const home = join(tmpdir(), `mac-clean-lens-photos-${Date.now()}`);
  const library = join(home, 'Pictures/Photos Library.photoslibrary');
  const original = join(library, 'originals/0/photo.mov');
  await mkdir(join(original, '..'), { recursive: true });
  await writeFile(original, '');
  await truncate(original, 1024 * 1024 * 1024);

  const report = await scanHome({ home, fastSize: false, mode: 'deep' });
  const finding = report.findings.find((item) => item.title === '照片图库');

  assert.equal(finding?.category, 'photos');
  assert.equal(finding?.cleanable, false);
  assert.equal(report.findings.some((item) => item.paths.includes(original)), false);
});
