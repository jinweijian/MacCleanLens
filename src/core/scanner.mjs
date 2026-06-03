import { execFile } from 'node:child_process';
import { homedir } from 'node:os';
import { promisify } from 'node:util';

import { categories, resolveRules, riskLabels } from './rules.mjs';
import { directorySize, fastDirectorySize, formatBytes } from './size.mjs';

const execFileAsync = promisify(execFile);

async function diskSummary() {
  try {
    const { stdout } = await execFileAsync('df', ['-k', '/System/Volumes/Data']);
    const lines = stdout.trim().split('\n');
    const data = lines[1]?.split(/\s+/);
    if (!data || data.length < 5) {
      return null;
    }
    const sizeBytes = Number(data[1]) * 1024;
    const usedBytes = Number(data[2]) * 1024;
    const availableBytes = Number(data[3]) * 1024;
    return {
      sizeBytes,
      usedBytes,
      availableBytes,
      capacity: data[4],
      sizeLabel: formatBytes(sizeBytes),
      usedLabel: formatBytes(usedBytes),
      availableLabel: formatBytes(availableBytes)
    };
  } catch {
    return null;
  }
}

export async function scanHome({ home = homedir(), fastSize = true } = {}) {
  const ruleFindings = await resolveRules(home);
  const findings = (
    await Promise.all(
      ruleFindings.map(async (finding) => {
        const sizes = await Promise.all(
          finding.paths.map((path) =>
            fastSize
              ? fastDirectorySize(path, {
                  timeoutMs: 20000,
                  fallbackOnError: false
                })
              : directorySize(path)
          )
        );
        const bytes = sizes.reduce((total, size) => total + size, 0);

        if (bytes === 0) {
          return {
            ...finding,
            bytes,
            sizeUnknown: true,
            sizeLabel: finding.risk === 'manual' ? '需手动查看' : '统计超时',
            categoryLabel: categories[finding.category],
            riskLabel: riskLabels[finding.risk]
          };
        }

        return {
          ...finding,
          bytes,
          sizeLabel: formatBytes(bytes),
          categoryLabel: categories[finding.category],
          riskLabel: riskLabels[finding.risk]
        };
      })
    )
  ).filter(Boolean);

  findings.sort((a, b) => b.bytes - a.bytes);

  const totalBytes = findings.reduce((total, finding) => total + finding.bytes, 0);
  const cleanableBytes = findings
    .filter((finding) => finding.cleanable)
    .reduce((total, finding) => total + finding.bytes, 0);
  const categoryMap = new Map();

  for (const finding of findings) {
    const current = categoryMap.get(finding.category) || {
      id: finding.category,
      label: categories[finding.category],
      bytes: 0,
      count: 0,
      sizeLabel: '0 B'
    };
    current.bytes += finding.bytes;
    current.count += 1;
    current.sizeLabel = formatBytes(current.bytes);
    categoryMap.set(finding.category, current);
  }

  const categorySummaries = [...categoryMap.values()].sort((a, b) => b.bytes - a.bytes);

  return {
    scannedAt: new Date().toISOString(),
    home,
    disk: await diskSummary(),
    summary: {
      totalBytes,
      totalLabel: formatBytes(totalBytes),
      cleanableBytes,
      cleanableLabel: formatBytes(cleanableBytes),
      findingCount: findings.length
    },
    categories: categorySummaries,
    findings
  };
}
