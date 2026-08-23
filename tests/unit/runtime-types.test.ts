import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { EngineName } from '../../src/reporting/types.js';
import type {
  AndroidWebViewProfile,
  RenderingEngineName,
  RuntimeTargetName,
} from '../../src/runtimes/types.js';
import { DEFAULTS } from '../../src/config/schema.js';

const runtime: RuntimeTargetName = 'android-webview';
const renderingEngine: RenderingEngineName = 'blink';

// `android-webview` is a runtime target, never an executable scan engine.
// @ts-expect-error runtime targets must not widen the legacy EngineName union
const invalidEngine: EngineName = runtime;
void invalidEngine;

test('legacy executable engine defaults remain unchanged', () => {
  assert.deepEqual(DEFAULTS.engines, ['chromium', 'firefox', 'webkit']);
});

test('Android WebView profiles keep runtime and rendering engine separate', () => {
  const profile: AndroidWebViewProfile = {
    runtime,
    renderingEngine,
    detectionConfidence: 'high',
    evidence: ['android-platform', 'wv-marker', 'chrome-version'],
    runtimeVersion: {
      raw: '140.0.7339.51',
      major: 140,
      precision: 'full',
      source: 'user-agent',
    },
    chromiumVersion: {
      raw: '140.0.7339.51',
      major: 140,
      precision: 'full',
      source: 'user-agent',
    },
    engineVersion: {
      raw: '140',
      major: 140,
      precision: 'major',
      source: 'derived',
    },
    versionConflicts: [],
    warnings: [],
  };

  const serialized = JSON.parse(JSON.stringify(profile)) as AndroidWebViewProfile;
  assert.equal(serialized.runtime, 'android-webview');
  assert.equal(serialized.renderingEngine, 'blink');
  assert.equal(serialized.runtimeVersion.major, 140);
  assert.equal(serialized.engineVersion.major, 140);
});
