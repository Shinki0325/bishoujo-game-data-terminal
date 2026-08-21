import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { webcrypto } from 'node:crypto';
import {
  createWorkDetailVMLoader,
  PROJECT_ENTITY_CONTRACT_SHA256,
  resolveProjectEntityFeatureFlags,
} from './project-entity-consumer.js';

const snapshotRoot = process.platform === 'win32'
  ? 'D:/blog-kb/processed/database/review/egs-m0-m3-g1-canonical-snapshot-v1'
  : '/mnt/d/blog-kb/processed/database/review/egs-m0-m3-g1-canonical-snapshot-v1';
const detailRoot = process.platform === 'win32'
  ? 'D:/blog-worktrees/terminal-egs-m1-work-detail-v1/data/work-details/v1'
  : '/mnt/d/blog-worktrees/terminal-egs-m1-work-detail-v1/data/work-details/v1';
const read = file => fs.readFileSync(file);
const manifestBytes = read(path.join(snapshotRoot, 'projection-manifest.json'));
const manifest = JSON.parse(manifestBytes);
const artifactShas = Object.fromEntries(manifest.artifacts.map(item => [item.path, item.sha256]));
const binding = {
  contractSha256: PROJECT_ENTITY_CONTRACT_SHA256,
  catalogSnapshotId: manifest.catalogSnapshotId,
  catalogSha256: manifest.sourceSnapshots.find(item => item.source === 'egs' && item.snapshotId === manifest.catalogSnapshotId).sha256,
  dataRevision: manifest.dataRevision,
  manifestSha256: 'c69b54045e69f718627a64e67f1bdd09e7528b28934298d729c4dc695a24c023',
  artifactShas,
};

function responseFor(url) {
  const target = new URL(url);
  let file;
  if (target.pathname.endsWith('/projection-manifest.json')) file = path.join(snapshotRoot, 'projection-manifest.json');
  else if (target.pathname.includes('/egs-m0-m3-g1-canonical-snapshot-v1/')) file = path.join(snapshotRoot, path.basename(target.pathname));
  else if (target.pathname.endsWith('/data/work-details/v1/index.json')) file = path.join(detailRoot, 'index.json');
  else if (target.pathname.includes('/data/work-details/v1/shards/')) file = path.join(detailRoot, 'shards', path.basename(target.pathname));
  else throw new Error(`unexpected fixture URL: ${url}`);
  const body = read(file);
  return { ok: true, status: 200, arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) };
}

const fetchImpl = async url => responseFor(url);
assert.equal(resolveProjectEntityFeatureFlags().workDetailV1, false);
const disabled = createWorkDetailVMLoader({
  snapshotManifestUrl: new URL('https://fixture/egs-m0-m3-g1-canonical-snapshot-v1/projection-manifest.json'),
  detailIndexUrl: new URL('https://fixture/data/work-details/v1/index.json'),
  binding,
  fetchImpl,
  cryptoRef: webcrypto,
});
assert.deepEqual(await disabled.inspectCoverage(), null);
assert.deepEqual(await disabled.load({ workId: '1', legacy: { title: '旧标题' } }), { title: '旧标题', workId: null, source: 'legacy' });

const loader = createWorkDetailVMLoader({
  snapshotManifestUrl: new URL('https://fixture/egs-m0-m3-g1-canonical-snapshot-v1/projection-manifest.json'),
  detailIndexUrl: new URL('https://fixture/data/work-details/v1/index.json'),
  binding,
  featureFlags: { workDetailV1: true },
  fetchImpl,
  cryptoRef: webcrypto,
});
const coverage = await loader.inspectCoverage();
assert.equal(coverage.canonicalWorkCount, 6799);
assert.equal(coverage.detailAvailableWorkCount, 6667);
assert.equal(coverage.missingDetailWorkIds.length, 132);
assert.deepEqual(coverage.missingDetailWorkIds, [...coverage.missingDetailWorkIds].sort((a, b) => Number(a) - Number(b)));

const available = await loader.load({ workId: '1', legacy: { title: '旧标题' } });
assert.equal(available.source, 'canonical-snapshot-and-legacy-detail');
assert.equal(available.identity.workId, '1');
assert.equal(available.credits.availability, 'available');
assert.equal(available.credits.cast.length > 0, true);
assert.equal(available.ratings.status, 'not-projected');
assert.equal(available.media.status, 'public-cleared');
assert.equal(available.sourceEvidence.status, 'confirmed');

const missing = await loader.load({ workId: coverage.missingDetailWorkIds[0], legacy: { title: '旧标题' } });
assert.equal(missing.source, 'canonical-snapshot-with-legacy-fallback');
assert.equal(missing.credits.availability, 'unavailable');
assert.equal(missing.credits.status, 'legacy-fallback');
assert.equal(missing.identity.workId, coverage.missingDetailWorkIds[0]);

const canonical = await loader.load({ canonicalEntityId: available.canonicalEntityId });
assert.equal(canonical.workId, '1');
const invalid = await loader.load({ workId: '1', canonicalEntityId: 'wk_missing' });
assert.equal(invalid.source, 'legacy');

let manifestAttempts = 0;
const retryLoader = createWorkDetailVMLoader({
  snapshotManifestUrl: new URL('https://fixture/egs-m0-m3-g1-canonical-snapshot-v1/projection-manifest.json'),
  detailIndexUrl: new URL('https://fixture/data/work-details/v1/index.json'),
  binding,
  featureFlags: { workDetailV1: true },
  fetchImpl: async url => {
    if (new URL(url).pathname.endsWith('/projection-manifest.json') && manifestAttempts++ === 0) {
      return { ok: false, status: 503, arrayBuffer: async () => new ArrayBuffer(0) };
    }
    return responseFor(url);
  },
  cryptoRef: webcrypto,
});
assert.equal((await retryLoader.load({ workId: '1', legacy: { title: '旧标题' } })).source, 'legacy');
assert.equal((await retryLoader.load({ workId: '1', legacy: { title: '旧标题' } })).source, 'canonical-snapshot-and-legacy-detail');
assert.equal(manifestAttempts, 2);

const mismatched = createWorkDetailVMLoader({
  snapshotManifestUrl: new URL('https://fixture/egs-m0-m3-g1-canonical-snapshot-v1/projection-manifest.json'),
  detailIndexUrl: new URL('https://fixture/data/work-details/v1/index.json'),
  binding: { ...binding, artifactShas: { ...artifactShas, 'entity-registry.json': '0'.repeat(64) } },
  featureFlags: { workDetailV1: true },
  fetchImpl,
  cryptoRef: webcrypto,
});
const failClosed = await mismatched.load({ workId: '1', legacy: { title: '旧标题' } });
assert.equal(failClosed.source, 'legacy');

console.log('M1 WorkDetailVM focused checks: 13/13');
