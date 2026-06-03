#!/usr/bin/env node

import { access, cp, mkdir, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { execFile } from 'node:child_process';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const appName = 'MacClean Lens.app';
const builtApp = resolve(root, 'dist', appName);

async function canWrite(directory) {
  try {
    await access(directory, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

async function registerApp(appPath) {
  const lsregister =
    '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister';
  await execFileAsync(lsregister, ['-f', appPath]).catch(() => {});
  await execFileAsync('touch', [appPath]).catch(() => {});
}

async function installInto(applicationsDir) {
  await mkdir(applicationsDir, { recursive: true });
  const destination = resolve(applicationsDir, appName);
  await rm(destination, { recursive: true, force: true });
  await cp(builtApp, destination, { recursive: true });
  await execFileAsync('xattr', ['-dr', 'com.apple.quarantine', destination]).catch(() => {});
  await registerApp(destination);
  return destination;
}

async function install() {
  await execFileAsync('npm', ['run', 'build:mac'], { cwd: root, maxBuffer: 1024 * 1024 * 8 });

  const systemApplications = '/Applications';
  const userApplications = resolve(homedir(), 'Applications');
  const target = (await canWrite(systemApplications)) ? systemApplications : userApplications;
  const installedPath = await installInto(target);

  console.log(`已安装到 ${installedPath}`);
  console.log('现在可以在启动台搜索 MacClean Lens 打开。');
}

install().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
