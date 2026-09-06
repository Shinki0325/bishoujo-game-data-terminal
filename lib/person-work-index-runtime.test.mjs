import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { createPersonWorkIndexRuntime } from './person-work-index-runtime.js';

const payload = {
  format: 'egs-tier-person-work-index-v1',
  workOrder: ['1'],
  persons: { per_alpha: { 'voice-actor': ['1'] } }
};
const bytes = new TextEncoder().encode(JSON.stringify(payload));
const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');

function response() {
  return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
}

test('person work index runtime verifies and normalizes the lazy sidecar', async () => {
  let calls = 0;
  const runtime = createPersonWorkIndexRuntime({
    indexUrl: new URL('https://example.test/person-index.json'),
    sha256,
    fetchImpl: async () => { calls += 1; return response(); },
    cryptoRef: crypto.webcrypto
  });
  const first = await runtime.load();
  const second = await runtime.load();
  assert.strictEqual(first, second);
  assert.equal(calls, 1);
  assert.deepEqual(first.persons, payload.persons);
});

test('person work index runtime fails closed on an integrity mismatch', async () => {
  const runtime = createPersonWorkIndexRuntime({
    indexUrl: new URL('https://example.test/person-index.json'),
    sha256: '0'.repeat(64),
    fetchImpl: async () => response(),
    cryptoRef: crypto.webcrypto
  });
  await assert.rejects(runtime.load, /integrity failed/);
});

