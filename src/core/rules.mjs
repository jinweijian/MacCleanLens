import { createHash } from 'node:crypto';
import { readdir, stat } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';

import { pathExists } from './size.mjs';

export const categories = {
  development: '开发缓存',
  logs: '应用日志',
  docker: 'Docker 与虚拟机',
  chat: '聊天应用缓存',
  projects: '项目依赖',
  android: 'Android 模拟器',
  'package-managers': '包管理器缓存',
  downloads: '下载文件',
  'large-files': '大文件'
};

export const riskLabels = {
  low: '低风险',
  confirm: '需确认',
  manual: '建议手动处理'
};

function stableId(title, paths) {
  const hash = createHash('sha1').update(`${title}:${paths.join('|')}`).digest('hex').slice(0, 10);
  return `${title.replace(/\s+/g, '-').toLowerCase()}-${hash}`;
}

function staticRule({ title, category, risk, cleanable, description, recommendation, paths }) {
  return {
    title,
    category,
    risk,
    cleanable,
    description,
    recommendation,
    async resolve(home) {
      const resolvedPaths = paths(home);
      const existing = [];
      for (const path of resolvedPaths) {
        if (await pathExists(path)) {
          existing.push(path);
        }
      }
      if (existing.length === 0) {
        return [];
      }
      return [
        {
          id: stableId(title, existing),
          title,
          category,
          risk,
          cleanable,
          description,
          recommendation,
          paths: existing
        }
      ];
    }
  };
}

async function listProjectNodeModules(home) {
  const roots = [join(home, 'website'), join(home, 'Projects'), join(home, 'project')];
  const paths = [];

  for (const root of roots) {
    if (!(await pathExists(root))) {
      continue;
    }
    let entries = [];
    try {
      entries = await readdir(root, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) {
        continue;
      }
      const projectRoot = join(root, entry.name);
      const candidates = [
        join(projectRoot, 'node_modules'),
        join(projectRoot, 'vue3/node_modules'),
        join(projectRoot, 'h5/node_modules')
      ];
      for (const candidate of candidates) {
        if (await pathExists(candidate)) {
          paths.push(candidate);
        }
      }
    }
  }

  return paths;
}

const downloadHintBytes = 50 * 1024 * 1024;
const largeFileBytes = 1024 * 1024 * 1024;
const downloadExtensions = new Set(['.dmg', '.pkg', '.zip', '.xip', '.iso', '.mp4', '.mov', '.mkv']);

async function listDirectFiles(root) {
  if (!(await pathExists(root))) {
    return [];
  }

  let entries = [];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const files = [];
  for (const entry of entries) {
    if (!entry.isFile() || entry.name.startsWith('.')) {
      continue;
    }
    const path = join(root, entry.name);
    try {
      const info = await stat(path);
      files.push({ path, name: entry.name, bytes: info.size, mtimeMs: info.mtimeMs });
    } catch {
      continue;
    }
  }

  return files;
}

async function resolveDownloadFindings(home) {
  const files = await listDirectFiles(join(home, 'Downloads'));
  return files
    .filter((file) => file.bytes >= downloadHintBytes || downloadExtensions.has(extname(file.name).toLowerCase()))
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 24)
    .map((file) => ({
      id: stableId(`下载文件：${file.name}`, [file.path]),
      title: `下载文件：${file.name}`,
      category: 'downloads',
      risk: 'confirm',
      cleanable: true,
      description: '下载目录中的安装包、压缩包、媒体文件或较大文件，常常是一次性文件。',
      recommendation: '确认不再需要后勾选移动到废纸篓；不确定的文件建议先预览。',
      paths: [file.path]
    }));
}

async function resolveLargeFileFindings(home) {
  const roots = [join(home, 'Desktop'), join(home, 'Documents'), join(home, 'Movies'), join(home, 'Pictures')];
  const groups = await Promise.all(roots.map((root) => listDirectFiles(root)));
  return groups
    .flat()
    .filter((file) => file.bytes >= largeFileBytes)
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 24)
    .map((file) => ({
      id: stableId(`大文件：${basename(file.path)}`, [file.path]),
      title: `大文件：${basename(file.path)}`,
      category: 'large-files',
      risk: 'confirm',
      cleanable: true,
      description: '用户目录中的超大文件，可能是旧视频、归档包、导出文件或临时素材。',
      recommendation: '确认文件内容和备份状态后再勾选；清理后会先进入废纸篓。',
      paths: [file.path]
    }));
}

export async function resolveRules(home) {
  const rules = [
    staticRule({
      title: 'JetBrains 日志',
      category: 'logs',
      risk: 'low',
      cleanable: true,
      description: 'IDE 运行日志，通常可安全移入废纸篓。',
      recommendation: '关闭 JetBrains 系列 IDE 后清理。',
      paths: (root) => [join(root, 'Library/Logs/JetBrains')]
    }),
    staticRule({
      title: 'JetBrains 缓存',
      category: 'development',
      risk: 'low',
      cleanable: true,
      description: 'IDE 索引、JCEF、临时缓存等，可重建。',
      recommendation: '清理后首次打开项目会重新索引。',
      paths: (root) => [join(root, 'Library/Caches/JetBrains')]
    }),
    staticRule({
      title: 'npm 缓存',
      category: 'package-managers',
      risk: 'low',
      cleanable: true,
      description: 'npm 下载缓存和 npx 临时包，可重新下载。',
      recommendation: '也可以用 npm cache clean --force 清理。',
      paths: (root) => [join(root, '.npm/_cacache'), join(root, '.npm/_npx')]
    }),
    staticRule({
      title: 'pnpm 缓存',
      category: 'package-managers',
      risk: 'low',
      cleanable: true,
      description: 'pnpm store/cache，可通过安装依赖重新生成。',
      recommendation: '也可以用 pnpm store prune 处理。',
      paths: (root) => [join(root, 'Library/Caches/pnpm'), join(root, 'Library/pnpm')]
    }),
    staticRule({
      title: 'Yarn 缓存',
      category: 'package-managers',
      risk: 'low',
      cleanable: true,
      description: 'Yarn 包缓存，可重新下载。',
      recommendation: '也可以用 yarn cache clean 清理。',
      paths: (root) => [join(root, 'Library/Caches/Yarn'), join(root, '.yarn/cache')]
    }),
    staticRule({
      title: 'uv 缓存',
      category: 'package-managers',
      risk: 'low',
      cleanable: true,
      description: 'uv Python 包缓存，可重新下载。',
      recommendation: '也可以用 uv cache clean 清理。',
      paths: (root) => [join(root, '.cache/uv')]
    }),
    staticRule({
      title: 'Docker 数据',
      category: 'docker',
      risk: 'manual',
      cleanable: false,
      description: 'Docker Desktop VM、镜像、卷和容器数据。',
      recommendation: '建议使用 Docker Desktop 或 docker system prune 清理，不直接删除容器目录。',
      paths: (root) => [join(root, 'Library/Containers/com.docker.docker')]
    }),
    staticRule({
      title: 'Android 模拟器',
      category: 'android',
      risk: 'manual',
      cleanable: false,
      description: 'Android AVD 和 SDK system image 可能包含开发环境状态。',
      recommendation: '建议通过 Android Studio Device Manager / SDK Manager 删除不用的镜像。',
      paths: (root) => [join(root, '.android/avd'), join(root, 'Library/Android/sdk/system-images')]
    }),
    staticRule({
      title: '聊天应用数据',
      category: 'chat',
      risk: 'manual',
      cleanable: false,
      description: '微信、企业微信、钉钉等应用私有数据，可能包含聊天文件。',
      recommendation: '建议在应用内清理缓存和聊天文件。',
      paths: (root) => [
        join(root, 'Library/Containers/com.tencent.xinWeChat'),
        join(root, 'Library/Containers/com.tencent.WeWorkMac'),
        join(root, 'Library/Application Support/DingTalkMac')
      ]
    })
  ];

  const findings = [];
  for (const rule of rules) {
    findings.push(...(await rule.resolve(home)));
  }
  findings.push(...(await resolveDownloadFindings(home)));
  findings.push(...(await resolveLargeFileFindings(home)));

  const nodeModulesPaths = await listProjectNodeModules(home);
  if (nodeModulesPaths.length > 0) {
    findings.push({
      id: stableId('项目依赖 node_modules', nodeModulesPaths),
      title: '项目依赖 node_modules',
      category: 'projects',
      risk: 'confirm',
      cleanable: true,
      description: '项目依赖目录，可通过 npm install / yarn / pnpm install 重建。',
      recommendation: '只清理近期不用的项目；当前正在开发的项目建议保留。',
      paths: nodeModulesPaths
    });
  }

  return findings;
}
