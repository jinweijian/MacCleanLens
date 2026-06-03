import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('npm exposes macOS build and install scripts', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

  assert.equal(pkg.scripts['build:mac'], 'node ./scripts/build-macos-app.mjs');
  assert.equal(pkg.scripts['install:mac'], 'node ./scripts/install-macos-app.mjs');
});

test('macOS build script packages an icon and signs the bundle', async () => {
  const buildScript = await readFile(new URL('../scripts/build-macos-app.mjs', import.meta.url), 'utf8');

  assert.match(buildScript, /CFBundleIconFile/);
  assert.match(buildScript, /MacCleanLens\.icns/);
  assert.match(buildScript, /iconutil/);
  assert.match(buildScript, /codesign/);
});

test('macOS install script installs into an Applications folder for Launchpad', async () => {
  const installScript = await readFile(new URL('../scripts/install-macos-app.mjs', import.meta.url), 'utf8');

  assert.match(installScript, /\/Applications/);
  assert.match(installScript, /Applications/);
  assert.match(installScript, /MacClean Lens\.app/);
});
