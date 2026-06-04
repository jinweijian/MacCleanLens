import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { startServer } from '../src/server/app.mjs';

test('server exposes scan API and static UI', async () => {
  const home = join(tmpdir(), `mac-clean-lens-server-${Date.now()}`);
  await mkdir(join(home, 'Library/Caches/Yarn/v6'), { recursive: true });
  await writeFile(join(home, 'Library/Caches/Yarn/v6/cache.bin'), Buffer.alloc(9));

  const server = await startServer({ home, port: 0, openBrowser: false, fastSize: false });
  try {
    const scanResponse = await fetch(`${server.url}/api/scan`);
    const scan = await scanResponse.json();
    assert.equal(scan.summary.totalBytes, 9);
    assert.equal(scan.mode, 'quick');

    const uiResponse = await fetch(server.url);
    const html = await uiResponse.text();
    assert.equal(uiResponse.headers.get('cache-control'), 'no-store');
    assert.match(html, /MacClean Lens/);
    assert.doesNotMatch(html, /<aside class="sidebar">/);
    assert.doesNotMatch(html, /<nav>/);
    assert.match(html, /data-filter="all"/);
    assert.match(html, /globalOverlay/);
    assert.match(html, /id="celebrationDialog"/);
    assert.match(html, /class="confetti-layer"/);
    assert.doesNotMatch(html, /演示进度/);
    assert.match(html, /cleanProgress/);
    assert.match(html, /cleanStatus/);
    assert.match(html, /<footer class="action-bar" hidden>/);
    const jsResponse = await fetch(`${server.url}/app.js`);
    const js = await jsResponse.text();
    assert.match(js, /function renderActionState/);
    assert.match(js, /function setActiveFilter/);
    assert.match(js, /data-filter="\$\{escapeHtml\(category.id\)\}"/);
    assert.doesNotMatch(js, /navButtons/);
    assert.match(js, /if \(!report\) \{/);
    assert.match(js, /function showActionMessage/);
    assert.match(js, /function showCelebrationDialog/);
    assert.match(js, /function hideCelebrationDialog/);
    assert.match(js, /function launchConfetti/);
    assert.match(js, /function showGlobalOverlay/);
    assert.match(js, /function beginProgressLoop/);
    assert.match(js, /function animateProgressTo/);
    assert.match(js, /function createLiveProgress/);
    assert.match(js, /function startThinkingLabel/);
    assert.match(js, /requestAnimationFrame/);
    assert.match(js, /async function requestJson/);
    assert.match(js, /AbortController/);
    assert.match(js, /catch \(error\)/);
    assert.match(js, /刷新当前页面数据/);
    assert.match(js, /\/api\/action/);
    assert.match(js, /<label class="finding/);
    assert.match(js, /finding\.cleanable \? ' selectable'/);
    assert.match(js, /finding\.cleanable \? '' : ' disabled'/);
    assert.doesNotMatch(js, /title: '正在清理'/);

    const cssResponse = await fetch(`${server.url}/styles.css`);
    const css = await cssResponse.text();
    assert.match(css, /\[hidden\]/);
    assert.match(css, /display:\s*none\s*!important/);
    assert.match(css, /\.summary-card\.filter-card/);
    assert.match(css, /\.category\.active/);
    assert.match(css, /\.finding\.selectable:hover/);
    assert.match(css, /\.finding\.selected/);
    assert.match(css, /\.finding\.disabled/);
    assert.match(css, /\.finding:focus-within/);
    assert.doesNotMatch(css, /\.sidebar/);
  } finally {
    await server.close();
  }
});
