import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyRequest, classifyFailedRequest, isFatalFailure } from '../../src/detection/network.js';
import type { ResourceType } from '../../src/config/schema.js';

/**
 * Network classification is configurable, not hardcoded. The core must not
 * bake analytics host lists — they come in via ignoredPatterns.
 */
const GA = /google-analytics\.com/;
const GTM = /googletagmanager\.com/;
const patterns = [GA, GTM];
const critical: ResourceType[] = ['script', 'stylesheet', 'xhr', 'fetch', 'font'];

test('analytics URLs are classified analytics and non-fatal', () => {
  assert.equal(classifyRequest('https://google-analytics.com/g/collect', 'image', patterns), 'analytics');
  const fr = classifyFailedRequest('https://google-analytics.com/g/collect', 'GET', 'image', 'net::ERR_FAILED', patterns, critical);
  assert.equal(fr.fatal, false);
  assert.equal(fr.category, 'analytics');
});

test('app script failure is fatal (script in criticalResourceTypes)', () => {
  const fr = classifyFailedRequest('https://app.example.com/chunk.js', 'GET', 'script', 'net::ERR_FAILED', patterns, critical);
  assert.equal(fr.category, 'js');
  assert.equal(fr.fatal, true);
});

test('stylesheet failure is fatal', () => {
  const fr = classifyFailedRequest('https://app.example.com/style.css', 'GET', 'stylesheet', 'net::ERR_FAILED', patterns, critical);
  assert.equal(fr.fatal, true);
});

test('image failure is never fatal even when not analytics', () => {
  assert.equal(isFatalFailure('image', 'image', critical), false);
});

test('font failure is fatal (font in criticalResourceTypes)', () => {
  const fr = classifyFailedRequest('https://app.example.com/f.woff2', 'GET', 'font', 'net::ERR_FAILED', patterns, critical);
  assert.equal(fr.fatal, true);
});

test('ignoredPatterns are matched case-insensitively via toRegExp at config time', () => {
  // A regex with 'i' flag from config should match uppercased host.
  const iPatterns = [/GOOGLE-ANALYTICS\.COM/i];
  assert.equal(classifyRequest('https://Google-Analytics.com/x', 'image', iPatterns), 'analytics');
});
