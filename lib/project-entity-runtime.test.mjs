import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createProjectEntityRuntime } from './project-entity-runtime.js';

const catalogBytes = fs.readFileSync(new URL('../data/catalog.json', import.meta.url));
const catalog = JSON.parse(catalogBytes);
catalog.catalogSha256 = crypto.createHash('sha256').update(catalogBytes).digest('hex');
const bridge = JSON.parse(fs.readFileSync(new URL('../data/egs-tier-g1-media-clearance-v1.json', import.meta.url)));
const runtime = await createProjectEntityRuntime({
  bridge,
  catalog,
  dataRevision: '79540595efb9eb768898f26c8a1b72224bb918f52d3ff6622fed75757bfa38ca',
  cryptoRef: globalThis.crypto,
});
assert.deepEqual(runtime.audit, {
  canonicalWorkCount: 6799,
  relationCount: 13598,
  availableCount: 6799,
  unavailableCount: 0,
  defaultCount: 6799,
  clearanceStatus: 'cleared',
  fullPayloadRead: false,
});
assert.equal(runtime.selectedMediaByWorkId.size, 6799);
assert.equal(runtime.binding.dataRevision, '0d403ea363e0324094f6e09cd4a63a9d279267c0a87881d1100e3405dfc1f793');
assert.equal(runtime.runtimeDataRevision, '79540595efb9eb768898f26c8a1b72224bb918f52d3ff6622fed75757bfa38ca');
assert.equal(runtime.adaptWorkDetail('1').source, 'projected');
assert.equal(runtime.adaptPerson('s1').source, 'legacy');
assert.equal(runtime.adaptMedia('1').source, 'projected');
assert.equal(runtime.adaptMedia('missing').source, 'legacy');
assert.equal(runtime.envelope.integrity.recordCount, 13598);
console.log('project entity runtime integration checks: 8/8');
