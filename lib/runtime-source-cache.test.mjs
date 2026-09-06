import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { createRuntimeSourceCache } from './runtime-source-cache.js';

test('workspaces share a single fetch, hash and parsed object per immutable URL', async () => {
  let calls = 0;
  const load = createRuntimeSourceCache({ cryptoRef: webcrypto, fetchImpl: async () => { calls++; return new Response('{"ok":true}'); } });
  const [first, second] = await Promise.all([load('https://test.invalid/a'), load('https://test.invalid/a')]);
  assert.equal(first, second); assert.equal(calls, 1); assert.match(first.sha256, /^[a-f0-9]{64}$/);
  await load('https://test.invalid/b'); assert.equal(calls, 2);
});
test('failed optional data can retry without invalidating successful workspace data', async () => {
  let failing = true, stableCalls = 0;
  const load = createRuntimeSourceCache({ cryptoRef: webcrypto, fetchImpl: async url => {
    if (url === 'broken' && failing) return new Response('', { status: 503 });
    if (url === 'stable') stableCalls++;
    return new Response('{}');
  } });
  await load('stable'); await assert.rejects(load('broken'));
  failing = false; await load('broken'); await load('stable'); assert.equal(stableCalls, 1);
});
