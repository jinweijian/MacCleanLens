import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanFindings } from '../core/cleaner.mjs';
import { performScanAction } from '../core/actions.mjs';
import { scanHome } from '../core/scanner.mjs';

const uiDir = fileURLToPath(new URL('../ui/', import.meta.url));

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  if (chunks.length === 0) {
    return {};
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': contentTypes['.json'] });
  res.end(JSON.stringify(body));
}

async function serveStatic(res, pathname) {
  const safePath = pathname === '/' ? '/index.html' : pathname;
  const filePath = normalize(join(uiDir, safePath));
  if (!filePath.startsWith(uiDir)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  try {
    const content = await readFile(filePath);
    res.writeHead(200, {
      'content-type': contentTypes[extname(filePath)] || 'application/octet-stream',
      'cache-control': 'no-store'
    });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end('Not Found');
  }
}

export async function startServer({ home, port = 0, openBrowser = false, fastSize = true, runOpen } = {}) {
  let lastScan = null;
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (req.method === 'GET' && url.pathname === '/api/scan') {
        lastScan = await scanHome({ home, fastSize, mode: url.searchParams.get('mode') || 'quick' });
        sendJson(res, 200, lastScan);
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/clean') {
        if (!lastScan) {
          lastScan = await scanHome({ home, fastSize });
        }
        const body = await readJson(req);
        const result = await cleanFindings({
          home: lastScan.home,
          selectedIds: body.selectedIds || [],
          findings: lastScan.findings
        });
        sendJson(res, 200, result);
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/action') {
        const body = await readJson(req);
        const result = await performScanAction({
          report: lastScan,
          findingId: body.findingId,
          actionId: body.actionId,
          settingsTarget: body.settingsTarget,
          runOpen
        });
        sendJson(res, 200, result);
        return;
      }
      if (req.method === 'GET') {
        await serveStatic(res, url.pathname);
        return;
      }
      res.writeHead(405);
      res.end('Method Not Allowed');
    } catch (error) {
      sendJson(res, 500, { error: error && error.message ? error.message : 'Internal Server Error' });
    }
  });

  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}`;

  if (openBrowser) {
    const { execFile } = await import('node:child_process');
    execFile('open', [url]);
  }

  return {
    url,
    close: () => new Promise((resolve) => server.close(resolve))
  };
}
