let report = null;
let activeFilter = 'all';
let isCleaning = false;
let scanProgressController = null;
let cleanProgressController = null;
let thinkingTimer = null;
let thinkingElement = null;
const selected = new Set();

const scanButton = document.querySelector('#scanButton');
const cleanButton = document.querySelector('#cleanButton');
const safeOnly = document.querySelector('#safeOnly');
const findingsEl = document.querySelector('#findings');
const categoriesEl = document.querySelector('#categories');
const summaryFilterCards = document.querySelectorAll('.summary-card[data-filter]');
const actionBar = document.querySelector('.action-bar');
const globalOverlay = document.querySelector('#globalOverlay');
const overlayTitle = document.querySelector('#overlayTitle');
const overlayLabel = document.querySelector('#overlayLabel');
const overlayPercent = document.querySelector('#overlayPercent');
const overlayProgressBar = document.querySelector('#overlayProgressBar');
const cleanProgress = document.querySelector('#cleanProgress');
const cleanProgressLabel = document.querySelector('#cleanProgressLabel');
const cleanProgressValue = document.querySelector('#cleanProgressValue');
const cleanProgressBar = document.querySelector('#cleanProgressBar');
const cleanStatus = document.querySelector('#cleanStatus');
const celebrationDialog = document.querySelector('#celebrationDialog');
const celebrationSummary = document.querySelector('#celebrationSummary');
const celebrationClose = document.querySelector('#celebrationClose');
const confettiLayer = document.querySelector('#confettiLayer');

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${Number.isInteger(size) ? size : size.toFixed(1).replace(/\.0$/, '')} ${units[unitIndex]}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function easeOutCubic(value) {
  return 1 - Math.pow(1 - value, 3);
}

function setProgressValue(progressBar, valueElement, percent) {
  const safePercent = Math.max(0, Math.min(100, percent));
  progressBar.dataset.progress = String(safePercent);
  valueElement.textContent = `${Math.round(safePercent)}%`;
  progressBar.style.width = `${safePercent}%`;
}

function startThinkingLabel(element, label) {
  if (thinkingElement === element && element.dataset.baseLabel === label) {
    return;
  }
  stopThinkingLabel();
  thinkingElement = element;
  element.dataset.baseLabel = label;
  let dots = 0;
  const render = () => {
    dots = (dots + 1) % 4;
    element.textContent = `${label}${'.'.repeat(dots)}`;
  };
  render();
  thinkingTimer = window.setInterval(render, 420);
}

function stopThinkingLabel() {
  if (thinkingTimer) {
    window.clearInterval(thinkingTimer);
    thinkingTimer = null;
  }
  if (thinkingElement?.dataset?.baseLabel) {
    thinkingElement.textContent = thinkingElement.dataset.baseLabel;
    delete thinkingElement.dataset.baseLabel;
  }
  thinkingElement = null;
}

function setPlainLabel(element, label) {
  if (thinkingElement === element) {
    stopThinkingLabel();
  }
  element.textContent = label;
}

function animateProgressTo({ progressBar, valueElement, labelElement, label, to, durationMs = 900, thinking = true }) {
  if (label) {
    if (thinking) {
      startThinkingLabel(labelElement, label);
    } else {
      setPlainLabel(labelElement, label);
    }
  }

  const from = Number(progressBar.dataset.progress || 0);
  const startedAt = performance.now();
  let frameId = null;

  return new Promise((resolve) => {
    const tick = (now) => {
      const elapsed = now - startedAt;
      const ratio = Math.min(1, elapsed / durationMs);
      const next = from + (to - from) * easeOutCubic(ratio);
      setProgressValue(progressBar, valueElement, next);

      if (ratio < 1) {
        frameId = window.requestAnimationFrame(tick);
        return;
      }

      setProgressValue(progressBar, valueElement, to);
      frameId = null;
      resolve();
    };

    frameId = window.requestAnimationFrame(tick);
  });
}

function createLiveProgress({
  progressBar,
  valueElement,
  labelElement,
  labels,
  from = 0,
  ceiling = 94,
  minDurationMs = 900,
  labelIntervalMs = 2600,
  halfLifeMs = 5200
}) {
  let frameId = null;
  let stopped = false;
  const startedAt = performance.now();
  const startValue = Math.max(from, Number(progressBar.dataset.progress || from));

  setProgressValue(progressBar, valueElement, startValue);
  startThinkingLabel(labelElement, labels[0]);

  const tick = (now) => {
    if (stopped) return;

    const elapsed = now - startedAt;
    const phaseIndex = Math.min(labels.length - 1, Math.floor(elapsed / labelIntervalMs));
    startThinkingLabel(labelElement, labels[phaseIndex]);

    const current = Number(progressBar.dataset.progress || startValue);
    const target = ceiling - (ceiling - startValue) * Math.pow(0.5, elapsed / halfLifeMs);
    const drift = elapsed > minDurationMs ? 0.012 : 0;
    const next = Math.min(ceiling, Math.max(current + drift, target));
    setProgressValue(progressBar, valueElement, next);
    frameId = window.requestAnimationFrame(tick);
  };

  frameId = window.requestAnimationFrame(tick);

  return {
    async finish({ label, to = 100, durationMs = 650 } = {}) {
      stopped = true;
      if (frameId) {
        window.cancelAnimationFrame(frameId);
        frameId = null;
      }
      const elapsed = performance.now() - startedAt;
      if (elapsed < minDurationMs) {
        await delay(minDurationMs - elapsed);
      }
      await animateProgressTo({
        progressBar,
        valueElement,
        labelElement,
        label,
        to,
        durationMs,
        thinking: false
      });
    },
    stop() {
      stopped = true;
      if (frameId) {
        window.cancelAnimationFrame(frameId);
        frameId = null;
      }
    }
  };
}

async function requestJson(url, { method = 'GET', body, timeoutMs = 120000 } = {}) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.error) {
      throw new Error(payload.error || `${url} 返回 ${response.status}`);
    }
    return payload;
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`${url} 请求超时，请确认内置服务仍在运行`);
    }
    if (error instanceof TypeError) {
      throw new Error(`${url} 无法连接，请重新打开 MacClean Lens`);
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

function selectedBytes() {
  if (!report) return 0;
  return report.findings
    .filter((finding) => selected.has(finding.id))
    .reduce((total, finding) => total + finding.bytes, 0);
}

function renderActionState() {
  document.querySelector('#selectedSize').textContent = `已选择 ${formatBytes(selectedBytes())}`;
  cleanButton.disabled = selected.size === 0 || isCleaning;
  actionBar.hidden = selected.size === 0 && !isCleaning;
}

function renderSummary() {
  renderActionState();
  if (!report) {
    return;
  }
  document.querySelector('#cleanableSize').textContent = report.summary.cleanableLabel;
  document.querySelector('#findingCount').textContent = `${report.summary.findingCount} 项`;
  document.querySelector('#scanTime').textContent = new Date(report.scannedAt).toLocaleString();
  document.querySelector('#availableSize').textContent = report.disk?.availableLabel || '--';
  document.querySelector('#capacityLabel').textContent = report.disk ? `已用 ${report.disk.capacity}` : '磁盘信息不可用';
}

function renderCategories() {
  const max = Math.max(...report.categories.map((category) => category.bytes), 1);
  categoriesEl.innerHTML = report.categories
    .map((category) => {
      const width = Math.max(4, Math.round((category.bytes / max) * 100));
      const activeClass = activeFilter === category.id ? ' active' : '';
      return `
        <article class="category${activeClass}" data-filter="${escapeHtml(category.id)}" role="button" tabindex="0">
          <strong>${escapeHtml(category.label)}</strong>
          <p>${escapeHtml(category.sizeLabel)} · ${category.count} 项</p>
          <div class="bar"><span style="width:${width}%"></span></div>
        </article>
      `;
    })
    .join('');
}

function renderFindings() {
  const onlyCleanable = safeOnly.checked;
  const findings = report.findings.filter((finding) => {
    const matchesSafety = !onlyCleanable || finding.cleanable;
    const matchesFilter = activeFilter === 'all' || finding.category === activeFilter;
    return matchesSafety && matchesFilter;
  });

  if (findings.length === 0) {
    findingsEl.innerHTML = '<div class="empty">当前筛选下没有可显示项目。</div>';
    return;
  }

  findingsEl.innerHTML = findings
    .map((finding) => `
      <article class="finding">
        <input type="checkbox" data-id="${escapeHtml(finding.id)}" ${finding.cleanable ? '' : 'disabled'} ${selected.has(finding.id) ? 'checked' : ''}>
        <div>
          <h3>${escapeHtml(finding.title)}</h3>
          <p>${escapeHtml(finding.description)}</p>
          <p>${escapeHtml(finding.recommendation)}</p>
          <div class="meta">
            <span class="badge">${escapeHtml(finding.categoryLabel)}</span>
            <span class="badge ${escapeHtml(finding.risk)}">${escapeHtml(finding.riskLabel)}</span>
            <span class="badge">${finding.cleanable ? '可加入清理列表' : '仅建议'}</span>
          </div>
        </div>
        <span class="size">${escapeHtml(finding.sizeLabel)}</span>
      </article>
    `)
    .join('');
}

function setCleanProgress({ visible, label = '准备清理', percent = 0 } = {}) {
  cleanProgress.hidden = !visible;
  setPlainLabel(cleanProgressLabel, label);
  setProgressValue(cleanProgressBar, cleanProgressValue, percent);
}

function setGlobalOverlayProgress({ title, label, percent }) {
  if (title) overlayTitle.textContent = title;
  if (label) startThinkingLabel(overlayLabel, label);
  setProgressValue(overlayProgressBar, overlayPercent, percent);
}

function showGlobalOverlay({ title, label, percent = 0 }) {
  lockPage();
  globalOverlay.hidden = false;
  setGlobalOverlayProgress({ title, label, percent });
}

function hideGlobalOverlay() {
  unlockPage();
  globalOverlay.hidden = true;
  stopProgressLoop();
  stopThinkingLabel();
}

function lockPage() {
  document.body.dataset.locked = 'true';
}

function unlockPage() {
  document.body.dataset.locked = 'false';
}

function beginProgressLoop({ title, labels, start = 8, ceiling = 88 }) {
  stopProgressLoop();
  showGlobalOverlay({ title, label: labels[0], percent: start });
  scanProgressController = createLiveProgress({
    progressBar: overlayProgressBar,
    valueElement: overlayPercent,
    labelElement: overlayLabel,
    labels,
    from: start,
    ceiling,
    minDurationMs: 1000,
    labelIntervalMs: 2600,
    halfLifeMs: 6200
  });
}

function stopProgressLoop() {
  if (scanProgressController) {
    scanProgressController.stop();
    scanProgressController = null;
  }
}

async function finishGlobalOverlay(label) {
  if (scanProgressController) {
    await scanProgressController.finish({ label, to: 100, durationMs: 700 });
    scanProgressController = null;
  } else {
    await animateProgressTo({
      progressBar: overlayProgressBar,
      valueElement: overlayPercent,
      labelElement: overlayLabel,
      label,
      to: 100,
      durationMs: 700,
      thinking: false
    });
  }
  await delay(180);
  hideGlobalOverlay();
}

function showActionMessage(message, tone = 'info') {
  cleanStatus.hidden = false;
  cleanStatus.textContent = message;
  cleanStatus.dataset.tone = tone;
}

function hideActionMessage() {
  cleanStatus.hidden = true;
  cleanStatus.textContent = '';
  cleanStatus.dataset.tone = 'info';
}

function launchConfetti() {
  confettiLayer.innerHTML = '';
  const colors = ['#2176ff', '#0c9f6e', '#bd7a13', '#d94b4b'];
  for (let index = 0; index < 42; index += 1) {
    const piece = document.createElement('span');
    piece.className = 'confetti-piece';
    piece.style.left = `${8 + Math.random() * 84}%`;
    piece.style.background = colors[index % colors.length];
    piece.style.animationDelay = `${Math.random() * 260}ms`;
    piece.style.setProperty('--x', `${Math.round((Math.random() - 0.5) * 220)}px`);
    piece.style.setProperty('--r', `${Math.round(160 + Math.random() * 520)}deg`);
    confettiLayer.append(piece);
  }
}

function hideCelebrationDialog() {
  if (celebrationDialog.open) {
    celebrationDialog.close();
  }
}

function showCelebrationDialog({ movedCount, skippedCount, failedCount }) {
  celebrationSummary.textContent = `已移动 ${movedCount} 项到废纸篓，跳过 ${skippedCount} 项，失败 ${failedCount} 项。`;
  launchConfetti();
  if (!celebrationDialog.open) {
    celebrationDialog.showModal();
  }
}

function render() {
  if (!report) return;
  renderSummary();
  renderCategories();
  renderFilterSelection();
  renderFindings();
}

function renderFilterSelection() {
  summaryFilterCards.forEach((card) => {
    card.classList.toggle('active', activeFilter === card.dataset.filter);
  });
  categoriesEl.querySelectorAll('[data-filter]').forEach((card) => {
    card.classList.toggle('active', activeFilter === card.dataset.filter);
  });
}

function setActiveFilter(filter) {
  activeFilter = filter || 'all';
  renderFilterSelection();
  renderFindings();
}

function handleFilterActivation(event) {
  const card = event.target.closest('[data-filter]');
  if (!card) return;
  setActiveFilter(card.dataset.filter);
}

function handleFilterKeydown(event) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const card = event.target.closest('[data-filter]');
  if (!card) return;
  event.preventDefault();
  setActiveFilter(card.dataset.filter);
}

summaryFilterCards.forEach((card) => {
  card.addEventListener('click', handleFilterActivation);
  card.addEventListener('keydown', handleFilterKeydown);
});

categoriesEl.addEventListener('click', handleFilterActivation);
categoriesEl.addEventListener('keydown', handleFilterKeydown);

scanButton.addEventListener('click', async () => {
  scanButton.disabled = true;
  scanButton.textContent = '扫描中...';
  selected.clear();
  hideActionMessage();
  beginProgressLoop({
    title: '正在扫描磁盘',
    labels: ['正在读取磁盘剩余空间', '正在统计缓存目录大小', '正在识别可清理风险等级', '正在整理页面数据'],
    start: 10,
    ceiling: 94
  });
  try {
    report = await requestJson('/api/scan', { timeoutMs: 120000 });
    render();
    await finishGlobalOverlay('扫描完成');
  } catch (error) {
    stopProgressLoop();
    stopThinkingLabel();
    setGlobalOverlayProgress({ title: '扫描失败', label: error?.message || '未知错误', percent: 100 });
    showActionMessage(`扫描失败：${error?.message || '未知错误'}`, 'error');
    await delay(900);
    hideGlobalOverlay();
  } finally {
    scanButton.disabled = false;
    scanButton.textContent = '重新扫描';
  }
});

findingsEl.addEventListener('change', (event) => {
  const id = event.target?.dataset?.id;
  if (!id) return;
  if (event.target.checked) {
    selected.add(id);
  } else {
    selected.delete(id);
  }
  renderSummary();
});

safeOnly.addEventListener('change', renderFindings);

cleanButton.addEventListener('click', async () => {
  if (selected.size === 0) return;
  const ok = confirm(`将 ${formatBytes(selectedBytes())} 移动到废纸篓。清空废纸篓后才会释放空间。继续吗？`);
  if (!ok) return;

  cleanButton.disabled = true;
  cleanButton.textContent = '清理中...';
  isCleaning = true;
  hideActionMessage();
  lockPage();
  setCleanProgress({ visible: true, label: '准备移动到废纸篓', percent: 2 });
  try {
    const selectedCount = selected.size;
    cleanProgressController = createLiveProgress({
      progressBar: cleanProgressBar,
      valueElement: cleanProgressValue,
      labelElement: cleanProgressLabel,
      labels: [
        `正在移动 ${selectedCount} 个项目到废纸篓`,
        '正在等待系统确认废纸篓写入',
        '正在记录已处理项目'
      ],
      from: 2,
      ceiling: 49,
      minDurationMs: 1000,
      labelIntervalMs: 2400,
      halfLifeMs: 4200
    });
    const result = await requestJson('/api/clean', {
      method: 'POST',
      body: { selectedIds: [...selected] },
      timeoutMs: 300000
    });

    const moved = Array.isArray(result.moved) ? result.moved : [];
    const skipped = Array.isArray(result.skipped) ? result.skipped : [];
    const failed = Array.isArray(result.failed) ? result.failed : [];
    const tone = failed.length > 0 ? 'warning' : 'success';
    await cleanProgressController.finish({
      label: `已移动 ${moved.length} / ${selectedCount} 个项目到废纸篓`,
      to: 50,
      durationMs: 500
    });
    cleanProgressController = null;
    showActionMessage(`已移动 ${moved.length} 项到废纸篓，跳过 ${skipped.length} 项，失败 ${failed.length} 项。`, tone);
    selected.clear();
    cleanProgressController = createLiveProgress({
      progressBar: cleanProgressBar,
      valueElement: cleanProgressValue,
      labelElement: cleanProgressLabel,
      labels: ['正在重新统计缓存目录', '正在刷新当前页面数据', '正在更新分类和建议'],
      from: 50,
      ceiling: 96,
      minDurationMs: 1000,
      labelIntervalMs: 2600,
      halfLifeMs: 5200
    });
    report = await requestJson('/api/scan', { timeoutMs: 120000 });
    render();
    await cleanProgressController.finish({
      label: '清理完成，页面已刷新',
      to: 100,
      durationMs: 650
    });
    cleanProgressController = null;
    isCleaning = false;
    setCleanProgress({ visible: false, label: '清理完成', percent: 0 });
    hideActionMessage();
    renderSummary();
    showCelebrationDialog({
      movedCount: moved.length,
      skippedCount: skipped.length,
      failedCount: failed.length
    });
  } catch (error) {
    if (cleanProgressController) {
      cleanProgressController.stop();
      cleanProgressController = null;
    }
    stopThinkingLabel();
    setCleanProgress({ visible: true, label: '清理失败', percent: 100 });
    showActionMessage(`清理失败：${error?.message || '未知错误'}`, 'error');
  } finally {
    isCleaning = false;
    unlockPage();
    cleanButton.textContent = '立即清理';
    renderSummary();
  }
});

celebrationClose.addEventListener('click', hideCelebrationDialog);
celebrationDialog.addEventListener('click', (event) => {
  if (event.target === celebrationDialog) {
    hideCelebrationDialog();
  }
});
