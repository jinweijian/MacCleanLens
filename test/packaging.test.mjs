import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('npm exposes macOS build and install scripts', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

  assert.equal(pkg.scripts['build:mac'], 'node ./scripts/build-macos-app.mjs');
  assert.equal(pkg.scripts['install:mac'], 'node ./scripts/install-macos-app.mjs');
  assert.equal(pkg.bin['mac-clean-lens-install'], 'scripts/install-macos-app.mjs');
});

test('macOS build script packages an icon and signs the bundle', async () => {
  const buildScript = await readFile(new URL('../scripts/build-macos-app.mjs', import.meta.url), 'utf8');

  assert.match(buildScript, /CFBundleIconFile/);
  assert.match(buildScript, /MacCleanLens\.icns/);
  assert.match(buildScript, /iconutil/);
  assert.match(buildScript, /codesign/);
});

test('macOS app bundles the Node runtime used during installation', async () => {
  const buildScript = await readFile(new URL('../scripts/build-macos-app.mjs', import.meta.url), 'utf8');
  const nativeSource = await readFile(new URL('../src/native/MacCleanLensApp.swift', import.meta.url), 'utf8');

  assert.match(buildScript, /copyFile\(process\.execPath,/);
  assert.match(buildScript, /chmod\(.*0o755\)/);
  assert.match(nativeSource, /Contents\/Resources\/runtime\/node/);
});

test('macOS startup error does not expose a developer machine path', async () => {
  const nativeSource = await readFile(new URL('../src/native/MacCleanLensApp.swift', import.meta.url), 'utf8');

  assert.doesNotMatch(nativeSource, /\/Users\/kz\/website/);
});

test('macOS app explains why it requests common folder access', async () => {
  const buildScript = await readFile(new URL('../scripts/build-macos-app.mjs', import.meta.url), 'utf8');

  assert.match(buildScript, /NSDesktopFolderUsageDescription/);
  assert.match(buildScript, /NSDocumentsFolderUsageDescription/);
  assert.match(buildScript, /NSDownloadsFolderUsageDescription/);
});

test('macOS icon uses a smaller transparent tile without a white border', async () => {
  const buildScript = await readFile(new URL('../scripts/build-macos-app.mjs', import.meta.url), 'utf8');

  assert.match(buildScript, /let tile = NSRect\(x: 132, y: 132, width: 760, height: 760\)/);
  assert.doesNotMatch(buildScript, /calibratedRed: 0\.94, green: 0\.97, blue: 1\.0/);
});

test('macOS install script installs into an Applications folder for Launchpad', async () => {
  const installScript = await readFile(new URL('../scripts/install-macos-app.mjs', import.meta.url), 'utf8');

  assert.match(installScript, /\/Applications/);
  assert.match(installScript, /Applications/);
  assert.match(installScript, /MacClean Lens\.app/);
});

test('macOS install and build scripts continuously report progress', async () => {
  const installScript = await readFile(new URL('../scripts/install-macos-app.mjs', import.meta.url), 'utf8');
  const buildScript = await readFile(new URL('../scripts/build-macos-app.mjs', import.meta.url), 'utf8');

  assert.match(installScript, /stdio:\s*'inherit'/);
  assert.match(installScript, /\[1\/3\]/);
  assert.match(installScript, /\[3\/3\]/);
  assert.match(buildScript, /\[1\/6\]/);
  assert.match(buildScript, /\[6\/6\]/);
});
