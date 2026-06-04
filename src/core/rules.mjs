import { createHash } from 'node:crypto';
import { readdir, stat } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';

import { pathExists } from './size.mjs';

export const categories = {
  'app-caches': '应用缓存',
  browsers: '浏览器数据',
  development: '开发缓存',
  logs: '应用日志',
  docker: 'Docker 与虚拟机',
  chat: '聊天应用缓存',
  projects: '项目依赖',
  android: 'Android 模拟器',
  'package-managers': '包管理器缓存',
  downloads: '下载文件',
  'large-files': '大文件',
  backups: '设备备份',
  messages: '信息附件',
  mail: '邮件附件',
  photos: '照片图库',
  trash: '废纸篓'
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

function staticRule({ title, category, risk, cleanable, description, recommendation, paths, actions = [] }) {
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
          actions,
          paths: existing
        }
      ];
    }
  };
}

function displayName(name) {
  const parts = name.split('.').filter(Boolean);
  return parts.length > 2 && name.startsWith('com.') ? parts.at(-1) : name;
}

async function listTopLevelDirectories(root) {
  if (!(await pathExists(root))) {
    return [];
  }
  try {
    return (await readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => ({ name: entry.name, path: join(root, entry.name) }));
  } catch {
    return [];
  }
}

async function resolveDynamicCaches(home) {
  const excluded = new Set(['JetBrains', 'pnpm', 'Yarn']);
  const browserNames = /^(Google|Firefox|Mozilla|com\.apple\.Safari|Microsoft Edge|BraveSoftware)$/i;
  const directories = await listTopLevelDirectories(join(home, 'Library/Caches'));
  return directories
    .filter((entry) => !entry.name.startsWith('com.apple.') && !excluded.has(entry.name))
    .map((entry) => {
      const browser = browserNames.test(entry.name);
      const name = displayName(entry.name);
      return {
        id: stableId(`${browser ? '浏览器缓存' : '应用缓存'}：${name}`, [entry.path]),
        title: `${browser ? '浏览器缓存' : '应用缓存'}：${name}`,
        category: browser ? 'browsers' : 'app-caches',
        risk: 'confirm',
        cleanable: true,
        description: '当前 Mac 上实际存在的应用缓存，应用通常可以重新生成。',
        recommendation: '建议先退出对应应用；不确定时可以保留。',
        actions: [],
        paths: [entry.path]
      };
    });
}

async function resolveDynamicLogs(home) {
  const directories = await listTopLevelDirectories(join(home, 'Library/Logs'));
  return directories
    .filter((entry) => entry.name !== 'JetBrains' && entry.name !== 'MacCleanLens')
    .map((entry) => ({
      id: stableId(`应用日志：${displayName(entry.name)}`, [entry.path]),
      title: `应用日志：${displayName(entry.name)}`,
      category: 'logs',
      risk: 'low',
      cleanable: true,
      description: '当前 Mac 上实际存在的应用运行日志和诊断记录。',
      recommendation: '日志通常可安全移入废纸篓，排查应用问题时可暂时保留。',
      actions: [],
      paths: [entry.path]
    }));
}

const transientApplicationDirectories = new Set([
  'Cache',
  'Caches',
  'Code Cache',
  'GPUCache',
  'DawnGraphiteCache',
  'ShaderCache',
  'Crashpad'
]);

async function resolveApplicationSupportCaches(home) {
  const applications = await listTopLevelDirectories(join(home, 'Library/Application Support'));
  const findings = [];

  for (const application of applications) {
    if (application.name.startsWith('com.apple.')) {
      continue;
    }

    let entries = [];
    try {
      entries = await readdir(application.path, { withFileTypes: true });
    } catch {
      continue;
    }
    const paths = entries
      .filter((entry) => entry.isDirectory() && transientApplicationDirectories.has(entry.name))
      .map((entry) => join(application.path, entry.name));
    if (paths.length === 0) {
      continue;
    }

    const name = displayName(application.name);
    findings.push({
      id: stableId(`应用临时数据：${name}`, paths),
      title: `应用临时数据：${name}`,
      category: 'app-caches',
      risk: 'confirm',
      cleanable: true,
      description: '应用支持目录中实际存在的代码缓存、图形缓存或崩溃记录。',
      recommendation: '建议先退出对应应用；清理后应用通常会自动重新生成。',
      actions: [],
      paths
    });
  }

  return findings;
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

const skippedPackageExtensions = new Set([
  '.app',
  '.bundle',
  '.framework',
  '.photolibrary',
  '.photoslibrary'
]);

async function listFiles(root, maxDepth = 0, depth = 0) {
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
    if (entry.name.startsWith('.')) {
      continue;
    }
    const path = join(root, entry.name);
    if (entry.isFile()) {
      try {
        const info = await stat(path);
        files.push({ path, name: entry.name, bytes: info.size, mtimeMs: info.mtimeMs });
      } catch {
        continue;
      }
      continue;
    }
    if (
      entry.isDirectory()
      && depth < maxDepth
      && !skippedPackageExtensions.has(extname(entry.name).toLowerCase())
    ) {
      files.push(...(await listFiles(path, maxDepth, depth + 1)));
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

async function resolveLargeFileFindings(home, mode) {
  const roots = [join(home, 'Desktop'), join(home, 'Documents'), join(home, 'Movies'), join(home, 'Pictures')];
  const maxDepth = mode === 'deep' ? 3 : 0;
  const groups = await Promise.all(roots.map((root) => listFiles(root, maxDepth)));
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

export async function resolveRules(home, { mode = 'quick' } = {}) {
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
      actions: [
        { id: 'open-docker', label: '打开 Docker', kind: 'openApp', value: 'Docker' },
        { id: 'copy-docker-prune', label: '复制清理命令', kind: 'copyCommand', value: 'docker system prune' }
      ],
      paths: (root) => [join(root, 'Library/Containers/com.docker.docker')]
    }),
    staticRule({
      title: 'Android 模拟器',
      category: 'android',
      risk: 'manual',
      cleanable: false,
      description: 'Android AVD 和 SDK system image 可能包含开发环境状态。',
      recommendation: '建议通过 Android Studio Device Manager / SDK Manager 删除不用的镜像。',
      actions: [
        { id: 'open-android-studio', label: '打开 Android Studio', kind: 'openApp', value: 'Android Studio' },
        { id: 'open-android-data', label: '在 Finder 中查看', kind: 'openPath' }
      ],
      paths: (root) => [join(root, '.android/avd'), join(root, 'Library/Android/sdk/system-images')]
    }),
    staticRule({
      title: '聊天应用数据',
      category: 'chat',
      risk: 'manual',
      cleanable: false,
      description: '微信、企业微信、钉钉等应用私有数据，可能包含聊天文件。',
      recommendation: '建议在应用内清理缓存和聊天文件。',
      actions: [{ id: 'open-chat-data', label: '在 Finder 中查看', kind: 'openPath' }],
      paths: (root) => [
        join(root, 'Library/Containers/com.tencent.xinWeChat'),
        join(root, 'Library/Containers/com.tencent.WeWorkMac'),
        join(root, 'Library/Application Support/DingTalkMac')
      ]
    })
  ];

  const findings = [
    ...(await resolveDynamicCaches(home)),
    ...(await resolveDynamicLogs(home)),
    ...(await resolveApplicationSupportCaches(home))
  ];
  for (const rule of rules) {
    findings.push(...(await rule.resolve(home)));
  }
  findings.push(...(await resolveDownloadFindings(home)));
  findings.push(...(await resolveLargeFileFindings(home, mode)));

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
      actions: [],
      paths: nodeModulesPaths
    });
  }

  if (mode === 'deep') {
    const deepRules = [
      staticRule({
        title: 'iPhone 与 iPad 备份',
        category: 'backups',
        risk: 'manual',
        cleanable: false,
        description: 'Finder 创建的设备本地备份，可能包含重要照片、信息和应用数据。',
        recommendation: '建议在 Finder 的设备备份管理中确认日期后删除旧备份。',
        actions: [{ id: 'open-backups', label: '在 Finder 中查看', kind: 'openPath' }],
        paths: (root) => [join(root, 'Library/Application Support/MobileSync/Backup')]
      }),
      staticRule({
        title: '信息附件',
        category: 'messages',
        risk: 'manual',
        cleanable: false,
        description: '“信息”应用接收的图片、视频和其他附件。',
        recommendation: '建议在“信息”应用中确认会话内容后删除大附件。',
        actions: [
          { id: 'open-messages', label: '打开信息', kind: 'openApp', value: 'Messages' },
          { id: 'open-message-attachments', label: '在 Finder 中查看', kind: 'openPath' }
        ],
        paths: (root) => [join(root, 'Library/Messages/Attachments')]
      }),
      staticRule({
        title: '邮件下载与附件',
        category: 'mail',
        risk: 'manual',
        cleanable: false,
        description: '邮件应用保存的附件和下载内容，可能仍与重要邮件关联。',
        recommendation: '建议在“邮件”应用中按大小检查并删除不需要的邮件或附件。',
        actions: [{ id: 'open-mail', label: '打开邮件', kind: 'openApp', value: 'Mail' }],
        paths: (root) => [join(root, 'Library/Mail')]
      }),
      staticRule({
        title: '废纸篓',
        category: 'trash',
        risk: 'manual',
        cleanable: false,
        description: '废纸篓中的内容仍占用磁盘空间。',
        recommendation: '确认内容不再需要后，在 Finder 中清空废纸篓。',
        actions: [{ id: 'open-trash', label: '打开废纸篓', kind: 'openPath' }],
        paths: (root) => [join(root, '.Trash')]
      }),
      staticRule({
        title: '照片图库',
        category: 'photos',
        risk: 'manual',
        cleanable: false,
        description: '照片图库可能包含原片、视频、编辑版本和已删除项目。',
        recommendation: '建议在“照片”应用中检查重复项目、视频和“最近删除”，不要直接删除图库内部文件。',
        actions: [{ id: 'open-photos', label: '打开照片', kind: 'openApp', value: 'Photos' }],
        paths: (root) => [
          join(root, 'Pictures/Photos Library.photoslibrary'),
          join(root, 'Pictures/照片图库.photoslibrary')
        ]
      })
    ];
    for (const rule of deepRules) {
      findings.push(...(await rule.resolve(home)));
    }
  }

  return findings;
}
