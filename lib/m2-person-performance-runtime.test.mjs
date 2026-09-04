import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { webcrypto } from 'node:crypto';
import { createM2PersonPerformanceRuntime, PERSON_PERFORMANCE_MANIFEST_SHA256 } from './m2-person-performance-runtime.js';

const root = path.resolve('data/terminal-wiki-m2-person-source-only-v1/performance-candidate');
const fetchImpl = async url => {
  const pathname = new URL(url).pathname;
  const filename = pathname.endsWith('/performance-manifest.json')
    ? 'performance-manifest.json'
    : pathname.endsWith('/directory-index.json')
      ? 'directory-index.json'
      : pathname.slice(pathname.indexOf('/relations/') + 1);
  const bytes = fs.readFileSync(path.join(root, filename));
  return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
};
const runtime = createM2PersonPerformanceRuntime({
  manifestUrl: new URL('https://fixture/performance-manifest.json'),
  indexUrl: new URL('https://fixture/directory-index.json'),
  fetchImpl,
  cryptoRef: webcrypto
});
const directory = await runtime.loadDirectory();
assert.equal(directory.records.length, 10168);
assert.equal(directory.byId.has('per_0000000009a6'), true);
const person = await runtime.loadPerson('per_0000000009a6');
assert.equal(person.entityId, 'per_0000000009a6');
assert.equal(Array.isArray(person.credits), true);
assert.equal(person.credits.length > 0, true);
assert.equal(Array.isArray(person.coActors), true);
assert.equal((await runtime.loadPerson('per_0000000009a6')).entityId, person.entityId);
console.log(`M2 person performance runtime checks: 4/4 (${PERSON_PERFORMANCE_MANIFEST_SHA256.slice(0, 8)}…)`);
