#!/usr/bin/env node

import { scanHome } from '../src/core/scanner.mjs';
import { startServer } from '../src/server/app.mjs';

function readPort(args) {
  const index = args.indexOf('--port');
  if (index === -1 || !args[index + 1]) {
    return 0;
  }
  const port = Number(args[index + 1]);
  return Number.isInteger(port) && port > 0 ? port : 0;
}

function printHelp() {
  console.log(`MacClean Lens

Usage:
  mac-clean-lens              Start the visual cleanup UI
  mac-clean-lens --port 3900  Start the UI on a specific port
  mac-clean-lens --no-open    Start the server without opening a browser
  mac-clean-lens scan --json  Print scan report as JSON
  mac-clean-lens help         Show this help
`);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'help' || args.includes('--help') || args.includes('-h')) {
    printHelp();
    return;
  }

  if (command === 'scan') {
    const report = await scanHome();
    if (args.includes('--json')) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }
    console.log(`预计可释放：${report.summary.cleanableLabel}`);
    for (const finding of report.findings) {
      console.log(`- ${finding.title}: ${finding.sizeLabel} [${finding.riskLabel}]`);
    }
    return;
  }

  const server = await startServer({ port: readPort(args), openBrowser: !args.includes('--no-open') });
  console.log(`MacClean Lens 已启动：${server.url}`);
  console.log('按 Ctrl+C 停止。');
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
