import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

const filesAndFoldersLocations = [
  { label: '桌面', path: (home) => join(home, 'Desktop') },
  { label: '文稿', path: (home) => join(home, 'Documents') },
  { label: '下载', path: (home) => join(home, 'Downloads') }
];

const fullDiskAccessLocations = [
  { label: '邮件数据', path: (home) => join(home, 'Library/Mail') },
  { label: '信息附件', path: (home) => join(home, 'Library/Messages') },
  { label: 'Safari 数据', path: (home) => join(home, 'Library/Safari') },
  { label: 'iPhone 与 iPad 备份', path: (home) => join(home, 'Library/Application Support/MobileSync/Backup') }
];

async function deniedLocations(home, locations, readDirectory) {
  const denied = [];
  for (const location of locations) {
    const path = location.path(home);
    try {
      await readDirectory(path);
    } catch (error) {
      if (error?.code === 'EACCES' || error?.code === 'EPERM') {
        denied.push({ label: location.label, path });
      }
    }
  }
  return denied;
}

export async function scanPermissionIssues(home, mode, { readDirectory = readdir } = {}) {
  const issues = [];
  const filesAndFoldersDenied = await deniedLocations(home, filesAndFoldersLocations, readDirectory);
  if (filesAndFoldersDenied.length > 0) {
    issues.push({
      id: 'files-and-folders',
      title: '需要文件与文件夹权限',
      description: `无法读取：${filesAndFoldersDenied.map((item) => item.label).join('、')}。`,
      recommendation: '在系统设置中允许 MacClean Lens 访问这些文件夹，然后再次扫描。',
      settingsTarget: 'filesAndFolders',
      paths: filesAndFoldersDenied.map((item) => item.path)
    });
  }

  if (mode !== 'deep') {
    return issues;
  }

  const fullDiskAccessDenied = await deniedLocations(home, fullDiskAccessLocations, readDirectory);
  if (fullDiskAccessDenied.length > 0) {
    issues.push({
      id: 'full-disk-access',
      title: '需要完全磁盘访问权限',
      description: `深度扫描无法读取：${fullDiskAccessDenied.map((item) => item.label).join('、')}。`,
      recommendation: '在系统设置中允许 MacClean Lens 完全磁盘访问，然后重新打开应用并再次扫描。',
      settingsTarget: 'fullDiskAccess',
      paths: fullDiskAccessDenied.map((item) => item.path)
    });
  }

  return issues;
}
