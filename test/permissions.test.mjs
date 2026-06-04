import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { scanPermissionIssues } from '../src/core/permissions.mjs';

test('deep scan reports protected locations denied by macOS', async () => {
  const home = join(tmpdir(), 'mac-clean-lens-permissions');
  const issues = await scanPermissionIssues(home, 'deep', {
    readDirectory: async (path) => {
      if (path.endsWith('/Library/Mail')) {
        const error = new Error('denied');
        error.code = 'EPERM';
        throw error;
      }
      const error = new Error('missing');
      error.code = 'ENOENT';
      throw error;
    }
  });

  assert.equal(issues.length, 1);
  assert.equal(issues[0].id, 'full-disk-access');
  assert.equal(issues[0].settingsTarget, 'fullDiskAccess');
  assert.match(issues[0].paths[0], /Library\/Mail$/);
});

test('quick scan does not request protected-location permissions', async () => {
  const issues = await scanPermissionIssues('/Users/example', 'quick', {
    readDirectory: async (path) => {
      const error = new Error('missing');
      error.code = 'ENOENT';
      throw error;
    }
  });

  assert.deepEqual(issues, []);
});

test('scan reports Files and Folders permission separately from Full Disk Access', async () => {
  const issues = await scanPermissionIssues('/Users/example', 'deep', {
    readDirectory: async (path) => {
      const error = new Error('denied');
      error.code = path.endsWith('/Downloads') || path.endsWith('/Library/Mail') ? 'EPERM' : 'ENOENT';
      throw error;
    }
  });

  assert.deepEqual(issues.map((issue) => issue.settingsTarget), ['filesAndFolders', 'fullDiskAccess']);
});
