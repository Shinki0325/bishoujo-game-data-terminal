import assert from 'node:assert/strict';
import { applyAuthorityFanoutMediaToWork, prepareAuthorityFanoutProjection } from './authority-fanout.js';

const sha = 'a'.repeat(64);
const value = {
  schemaVersion: 'egs-tier-authority-fanout-v1', generatedAt: '2026-08-22T16:30:00+08:00', sourceCatalogSnapshotId: 'fixture', sourceCatalogSha256: sha, sourceAuthoritySha256: sha, publicVndbReleaseAuthoritySha256: sha,
  mediaSelections: [{ workId: '84', source: 'vndb', thumbnail: { path: 'assets/covers/a.webp', sha256: sha, bytes: 1 }, preview: { path: 'assets/previews/a.webp', sha256: sha, bytes: 1 } }],
  pageBindings: [{ workId: '84', currentVndbId: 'v1', targetVndbId: 'v2', ratings: { path: 'data/egs-tier-vndb-ratings-v1.json', sha256: sha, vndbId: 'v2', ratingStatus: 'mapping-not-returned' } }]
};
const projection = prepareAuthorityFanoutProjection(value, { catalogSnapshotId: 'fixture', catalogSha256: sha, workIds: ['84'], ratingsSha256: sha });
const work = applyAuthorityFanoutMediaToWork({ workId: '84', projectedThumbnailPath: 'assets/old.webp' }, projection.selectedMediaByWorkId);
assert.equal(work.projectedThumbnailPath, 'assets/covers/a.webp');
assert.equal(work.mediaProjection.selectionAuthority, 'authority-fanout-v1');
assert.throws(() => prepareAuthorityFanoutProjection({ ...value, mediaSelections: [] }, { catalogSnapshotId: 'fixture', catalogSha256: sha, workIds: ['84'], ratingsSha256: sha }));
console.log('authority fanout checks: 3/3');
