import { test } from 'node:test';
import assert from 'node:assert/strict';
import { finalizeSession } from '../../src/core/compatibility-checker.js';
import type { ControllerSession } from '../../src/controllers/types.js';
import type { ResolvedConfig } from '../../src/config/resolve.js';

function sessionStub(): ControllerSession & {
  calls: string[];
  releaseManualClose: () => void;
} {
  const calls: string[] = [];
  let releaseManualClose = () => {};
  return {
    calls,
    releaseManualClose: () => releaseManualClose(),
    supportsTracing: false,
    disableCache: async () => {},
    getIdentity: async () => ({ engine: 'chromium', version: '114.0', method: 'test-stub' }),
    attachCollectors: async () => {},
    goto: async () => ({ error: null, isTransient: false, inflight: [], responseCount: 1 }),
    checkReadiness: async () => ({ rendered: true, renderedSelectors: [], readyMs: 0, error: null }),
    screenshot: async () => {},
    saveTrace: async () => {},
    discardTrace: async () => {},
    startTrace: async () => {},
    holdOpenAndClose: async (sec) => { calls.push(`timer:${sec}`); },
    waitForUserCloseAndClose: async () => {
      calls.push('manual:start');
      await new Promise<void>((resolve) => { releaseManualClose = resolve; });
      calls.push('manual:end');
    },
  };
}

function config(overrides: Partial<ResolvedConfig>): ResolvedConfig {
  return {
    strategy: 'binary',
    headed: true,
    holdOpenSec: 2,
    ...overrides,
  } as ResolvedConfig;
}

test('headed explicit mode waits for user close and ignores the hold-open timer', async () => {
  const session = sessionStub();
  let finished = false;
  const pending = finalizeSession(session, config({ strategy: 'explicit', holdOpenSec: 99 }))
    .then(() => { finished = true; });

  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(session.calls, ['manual:start']);
  assert.equal(finished, false, 'the next exact version must remain blocked');

  session.releaseManualClose();
  await pending;
  assert.deepEqual(session.calls, ['manual:start', 'manual:end']);
});

test('headless explicit mode closes automatically because the user has no window to close', async () => {
  const session = sessionStub();
  await finalizeSession(session, config({ strategy: 'explicit', headed: false, holdOpenSec: 7 }));
  assert.deepEqual(session.calls, ['timer:7']);
});

test('normal headed scans keep timer-based closing', async () => {
  const session = sessionStub();
  await finalizeSession(session, config({ strategy: 'binary', headed: true, holdOpenSec: 4 }));
  assert.deepEqual(session.calls, ['timer:4']);
});
