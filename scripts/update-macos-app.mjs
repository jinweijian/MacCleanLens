#!/usr/bin/env node

import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

async function withSpinner(label, task) {
  let index = 0;
  process.stdout.write(`${spinnerFrames[index]} ${label}`);
  const timer = setInterval(() => {
    index = (index + 1) % spinnerFrames.length;
    process.stdout.write(`\r${spinnerFrames[index]} ${label}`);
  }, 120);

  try {
    const result = await task();
    clearInterval(timer);
    process.stdout.write(`\r✓ ${label}\n`);
    return result;
  } catch (error) {
    clearInterval(timer);
    process.stdout.write(`\r✕ ${label}\n`);
    throw error;
  }
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

async function commandPath(command) {
  const { stdout } = await execFileAsync('which', [command]);
  return stdout.trim();
}

async function runCommand(command, args, { inherit = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: inherit ? 'inherit' : ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    if (!inherit) {
      child.stdout?.on('data', (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr?.on('data', (chunk) => {
        stderr += chunk.toString();
      });
    }
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        const error = new Error(stderr || stdout || `${command} 退出码：${code ?? 'unknown'}`);
        error.code = code;
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
      }
    });
  });
}

async function installLatestPackage() {
  try {
    await runCommand('npm', ['install', '-g', 'mac-clean-lens@latest'], { inherit: false });
    return;
  } catch (error) {
    const output = `${error.stdout || ''}\n${error.stderr || ''}\n${error.message || ''}`;
    if (!/EACCES|permission denied|operation not permitted/i.test(output)) {
      throw error;
    }
  }

  const npmPath = await commandPath('npm');
  const command = `${shellQuote(npmPath)} install -g mac-clean-lens@latest`;
  await execFileAsync('osascript', [
    '-e',
    `do shell script ${JSON.stringify(command)} with administrator privileges`
  ]);
}

async function reinstallMacApp() {
  const installerPath = await commandPath('mac-clean-lens-install');
  await runCommand(installerPath, [], { inherit: true });
}

async function update() {
  await withSpinner('[1/3] 正在更新 npm 包 mac-clean-lens@latest', installLatestPackage);
  await withSpinner('[2/3] 正在准备重新安装启动台 App', async () => {});
  await reinstallMacApp();
  console.log('✓ MacClean Lens 已更新到最新版本。');
}

update().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
