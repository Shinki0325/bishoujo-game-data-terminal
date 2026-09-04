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
assert.deepEqual(directory.activityAxis, {
  startYear: 1989,
  endYear: 2026,
  bucketCount: 16,
  buckets: [
    { startYear: 1989, endYear: 1993 },
    { startYear: 1994, endYear: 1998 },
    { startYear: 1999, endYear: 2000 },
    { startYear: 2001, endYear: 2002 },
    { startYear: 2003, endYear: 2004 },
    { startYear: 2005, endYear: 2006 },
    { startYear: 2007, endYear: 2008 },
    { startYear: 2009, endYear: 2010 },
    { startYear: 2011, endYear: 2012 },
    { startYear: 2013, endYear: 2014 },
    { startYear: 2015, endYear: 2016 },
    { startYear: 2017, endYear: 2018 },
    { startYear: 2019, endYear: 2020 },
    { startYear: 2021, endYear: 2022 },
    { startYear: 2023, endYear: 2024 },
    { startYear: 2025, endYear: 2026 }
  ],
  labelYears: [1989, 2000, 2010, 2020, 2026]
});
assert.equal(directory.records.every(record => Array.isArray(record.activity) && record.activity.length === 16), true);
assert.equal(directory.records.some(record => record.firstYear === record.lastYear && record.spanLabel === String(record.firstYear)), true);
const person = await runtime.loadPerson('per_0000000009a6');
assert.equal(person.entityId, 'per_0000000009a6');
assert.equal(Array.isArray(person.credits), true);
assert.equal(person.credits.length > 0, true);
assert.equal(Array.isArray(person.coActors), true);
assert.equal((await runtime.loadPerson('per_0000000009a6')).entityId, person.entityId);
console.log(`M2 person performance runtime checks: 7/7 (${PERSON_PERFORMANCE_MANIFEST_SHA256.slice(0, 8)}…)`);
