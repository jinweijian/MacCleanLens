import { execFile } from 'node:child_process';
import { readdir, stat } from 'node:fs/promises';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export function formatBytes(bytes) {
  if (!bytes) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  const rounded = Number.isInteger(size) ? String(size) : size.toFixed(1).replace(/\.0$/, '');
  return `${rounded} ${units[unitIndex]}`;
}

export async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return false;
    }
    return false;
  }
}

export async function directorySize(path) {
  let info;
  try {
    info = await stat(path);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return 0;
    }
    return 0;
  }

  if (info.isFile()) {
    return info.size;
  }

  if (!info.isDirectory()) {
    return 0;
  }

  let total = 0;
  let entries = [];
  try {
    entries = await readdir(path, { withFileTypes: true });
  } catch {
    return 0;
  }

  for (const entry of entries) {
    total += await directorySize(`${path}/${entry.name}`);
  }

  return total;
}

export async function fastDirectorySize(path, { timeoutMs = 8000, fallbackOnError = true } = {}) {
  if (!(await pathExists(path))) {
    return 0;
  }

  try {
    const { stdout } = await execFileAsync('du', ['-sk', path], {
      maxBuffer: 1024 * 1024,
      timeout: timeoutMs,
      killSignal: 'SIGKILL'
    });
    const blocks = Number(stdout.trim().split(/\s+/)[0]);
    return Number.isFinite(blocks) ? blocks * 1024 : await directorySize(path);
  } catch {
    return fallbackOnError ? directorySize(path) : 0;
  }
}
