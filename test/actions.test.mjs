import assert from 'node:assert/strict';
import test from 'node:test';

import { performScanAction } from '../src/core/actions.mjs';

test('manual actions only open values whitelisted by the latest scan', async () => {
  const calls = [];
  const report = {
    findings: [
      {
        id: 'docker',
        paths: ['/Users/example/Library/Containers/com.docker.docker'],
        actions: [
          { id: 'open-docker', kind: 'openApp', value: 'Docker' },
          { id: 'open-data', kind: 'openPath' }
        ]
      }
    ]
  };

  await performScanAction({
    report,
    findingId: 'docker',
    actionId: 'open-docker',
    runOpen: async (args) => calls.push(args)
  });
  await performScanAction({
    report,
    findingId: 'docker',
    actionId: 'open-data',
    runOpen: async (args) => calls.push(args)
  });

  assert.deepEqual(calls, [['-a', 'Docker'], ['/Users/example/Library/Containers/com.docker.docker']]);
  await assert.rejects(
    performScanAction({ report, findingId: 'docker', actionId: 'unknown', runOpen: async () => {} }),
    /不允许的操作/
  );
});

test('permission action opens the matching macOS privacy settings pane', async () => {
  const calls = [];

  await performScanAction({
    settingsTarget: 'fullDiskAccess',
    runOpen: async (args) => calls.push(args)
  });

  assert.deepEqual(calls, [
    ['x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles']
  ]);
});
