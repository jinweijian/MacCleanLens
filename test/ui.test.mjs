import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('cleanable findings use the entire row as the selection target', async () => {
  const html = await readFile(new URL('../src/ui/index.html', import.meta.url), 'utf8');
  const js = await readFile(new URL('../src/ui/app.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/ui/styles.css', import.meta.url), 'utf8');

  assert.match(html, /点击整行选择/);
  assert.match(html, /id="scanModeButton"/);
  assert.match(html, /id="scanModeDialog"/);
  assert.match(html, /id="permissionBanner"/);
  assert.match(html, /id="permissionActions"/);
  assert.match(html, /id="rememberScanMode"/);
  assert.match(js, /<label class="finding/);
  assert.match(js, /finding\.cleanable \? ' selectable'/);
  assert.match(js, /finding\.cleanable \? '' : ' disabled'/);
  assert.match(css, /\.finding\.selectable:hover/);
  assert.match(css, /\.finding\.selected/);
  assert.match(css, /\.finding\.disabled/);
  assert.match(css, /\.finding:focus-within/);
  assert.match(js, /classList\.toggle\('selected', event\.target\.checked\)/);
  assert.match(js, /localStorage\.getItem/);
  assert.match(js, /\/api\/scan\?mode=/);
  assert.match(js, /function renderPermissionIssues/);
  assert.match(js, /class="secondary permission-action"/);
  assert.match(js, /class="finding-actions"/);
  assert.match(js, /\/api\/action/);
  assert.match(js, /function copyText/);
  assert.match(css, /\.scan-mode-dialog/);
  assert.match(css, /\.permission-banner/);
  assert.match(css, /\.finding-actions/);
});
