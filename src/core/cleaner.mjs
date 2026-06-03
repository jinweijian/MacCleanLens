import { mkdir, rename, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, isAbsolute, relative, resolve } from 'node:path';

function isUnder(parent, child) {
  const rel = relative(resolve(parent), resolve(child));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

function safeName(path, index) {
  return `${String(index + 1).padStart(2, '0')}-${basename(path).replace(/[^a-zA-Z0-9._-]/g, '_')}`;
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function cleanFindings({
  home = homedir(),
  trash = `${homedir()}/.Trash`,
  selectedIds,
  findings
}) {
  const selected = new Set(selectedIds || []);
  const runDir = resolve(trash, `MacCleanLens-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  const moved = [];
  const skipped = [];
  const failed = [];

  for (const finding of findings) {
    if (!selected.has(finding.id)) {
      continue;
    }

    if (!finding.cleanable) {
      skipped.push({ id: finding.id, title: finding.title, reason: '此项目仅提供手动建议' });
      continue;
    }

    for (let index = 0; index < finding.paths.length; index += 1) {
      const path = finding.paths[index];
      if (!isUnder(home, path)) {
        skipped.push({ id: finding.id, title: finding.title, path, reason: '路径不在用户目录内' });
        continue;
      }
      if (!(await exists(path))) {
        skipped.push({ id: finding.id, title: finding.title, path, reason: '路径不存在' });
        continue;
      }

      try {
        await mkdir(runDir, { recursive: true });
        const destination = resolve(runDir, safeName(path, index));
        await rename(path, destination);
        moved.push({ id: finding.id, title: finding.title, from: path, to: destination });
      } catch (error) {
        failed.push({
          id: finding.id,
          title: finding.title,
          path,
          reason: error && error.message ? error.message : '移动失败'
        });
      }
    }
  }

  return {
    trashRun: moved.length > 0 ? runDir : null,
    moved,
    skipped,
    failed
  };
}
