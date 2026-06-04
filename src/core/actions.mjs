import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const settingsURLs = {
  fullDiskAccess: 'x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles',
  filesAndFolders: 'x-apple.systempreferences:com.apple.preference.security?Privacy_FilesAndFolders',
  storage: 'x-apple.systempreferences:com.apple.settings.Storage'
};

async function defaultRunOpen(args) {
  await execFileAsync('open', args);
}

export async function performScanAction({
  report,
  findingId,
  actionId,
  settingsTarget,
  runOpen = defaultRunOpen
}) {
  if (settingsTarget) {
    const url = settingsURLs[settingsTarget];
    if (!url) {
      throw new Error('不允许的设置入口');
    }
    await runOpen([url]);
    return { ok: true };
  }

  const finding = report?.findings?.find((item) => item.id === findingId);
  const action = finding?.actions?.find((item) => item.id === actionId);
  if (!finding || !action) {
    throw new Error('不允许的操作');
  }

  if (action.kind === 'openApp') {
    await runOpen(['-a', action.value]);
    return { ok: true };
  }
  if (action.kind === 'openPath') {
    const path = action.path || finding.paths?.[0];
    if (!path) {
      throw new Error('找不到可打开的位置');
    }
    await runOpen([path]);
    return { ok: true };
  }
  if (action.kind === 'copyCommand') {
    return { ok: true, copyValue: action.value };
  }

  throw new Error('不允许的操作');
}
