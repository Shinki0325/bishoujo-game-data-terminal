import assert from 'node:assert/strict';
import {
  adaptMediaVM,
  buildMediaProjection,
  resolveProjectEntityFeatureFlags,
} from './project-entity-consumer.js';

assert.equal(resolveProjectEntityFeatureFlags().mediaProjectionV1, false);

const privateFields = {
  privateReviewNote: 'PRIVATE-REVIEW-NOTE',
  rawUrl: 'https://private.invalid/original.png',
  uploadPath: 'D:\\private\\uploads\\original.png',
  candidateQueue: { internal: true }
};
const relations = [
  { mediaEntityId: 'med_egs_thumb', mediaRelationId: 'rel_egs_thumb', targetEntityId: 'wk_1', targetType: 'work', scope: { workEntityId: 'wk_1' }, usage: 'thumbnail', source: 'egs', sourceClaimIds: ['claim_egs_thumb'], rightsStatus: 'cleared-public', clearanceStatus: 'cleared', assertionStatus: 'confirmed', visibility: 'public', ...privateFields },
  { mediaEntityId: 'med_vndb_thumb', mediaRelationId: 'rel_vndb_thumb', targetEntityId: 'wk_1', targetType: 'work', scope: { workEntityId: 'wk_1' }, usage: 'thumbnail', sourceRefs: [{ source: 'vndb', id: 'v123' }], sourceClaimIds: ['claim_vndb_thumb'], rightsStatus: 'cleared-public', clearanceStatus: 'cleared', assertionStatus: 'confirmed', visibility: 'public' },
  { mediaEntityId: 'med_owner_thumb', mediaRelationId: 'rel_owner_thumb', targetEntityId: 'wk_1', targetType: 'work', scope: { workEntityId: 'wk_1' }, usage: 'thumbnail', source: 'owner', sourceClaimIds: ['claim_owner_thumb'], rightsStatus: 'owner-cleared', clearanceStatus: 'cleared', assertionStatus: 'confirmed', visibility: 'public' },
  { mediaEntityId: 'med_preview', mediaRelationId: 'rel_preview', targetEntityId: 'wk_1', targetType: 'work', scope: { workEntityId: 'wk_1' }, usage: 'preview', source: 'vndb', sourceClaimIds: ['claim_preview'], rightsStatus: 'cleared-public', clearanceStatus: 'cleared', assertionStatus: 'confirmed', visibility: 'public' },
  { mediaEntityId: 'med_gallery_ok', mediaRelationId: 'rel_gallery_ok', targetEntityId: 'wk_1', targetType: 'work', scope: { workEntityId: 'wk_1' }, usage: 'gallery', source: 'egs', sourceClaimIds: ['claim_gallery_ok'], rightsStatus: 'cleared-public', clearanceStatus: 'cleared', assertionStatus: 'confirmed', visibility: 'public' },
  { mediaEntityId: 'med_gallery_pending', mediaRelationId: 'rel_gallery_pending', targetEntityId: 'wk_1', targetType: 'work', scope: { workEntityId: 'wk_1' }, usage: 'gallery', source: 'vndb', sourceClaimIds: ['claim_gallery_pending'], rightsStatus: 'not-cleared', clearanceStatus: 'unreviewed', assertionStatus: 'needs-review', visibility: 'public', ...privateFields },
  { mediaEntityId: 'med_rights_only', mediaRelationId: 'rel_rights_only', targetEntityId: 'wk_1', targetType: 'work', scope: { workEntityId: 'wk_1' }, usage: 'gallery', source: 'egs', sourceClaimIds: ['claim_rights_only'], rightsStatus: 'cleared-public', assertionStatus: 'confirmed', visibility: 'public' },
  { mediaEntityId: 'med_edition', mediaRelationId: 'rel_edition', targetEntityId: 'ed_1', targetType: 'edition', scope: { workEntityId: 'wk_1', editionEntityId: 'ed_1' }, usage: 'thumbnail', source: 'egs', sourceClaimIds: ['claim_edition'], rightsStatus: 'cleared-public', clearanceStatus: 'cleared', assertionStatus: 'confirmed', visibility: 'public' },
];

const forward = buildMediaProjection(relations);
const reversed = buildMediaProjection([...relations].reverse());
assert.deepEqual(forward, reversed);
const ranked = buildMediaProjection(relations.map(item => ({ ...item, selectionRank: item.mediaEntityId === 'med_egs_thumb' ? 1 : 2 })));
assert.equal(ranked.records.find(record => record.targetEntityId === 'wk_1').primaryMediaId, 'med_egs_thumb');

const work = forward.records.find(record => record.targetEntityId === 'wk_1');
assert.equal(work.primaryMediaId, 'med_owner_thumb');
assert.deepEqual(work.fallbackMediaIds, ['med_vndb_thumb', 'med_egs_thumb', 'med_preview', 'med_gallery_ok']);
assert.deepEqual(work.compatibility.thumbnail, { availability: 'available', mediaId: 'med_owner_thumb', fallbackMediaIds: ['med_vndb_thumb', 'med_egs_thumb'] });
assert.deepEqual(work.compatibility.preview, { availability: 'available', mediaId: 'med_preview', fallbackMediaIds: [] });
assert.equal(work.gallery.length, 3);
assert.equal(work.gallery.find(item => item.mediaId === 'med_gallery_pending').availability, 'unavailable');
assert.equal(work.gallery.find(item => item.mediaId === 'med_rights_only').availability, 'unavailable');
assert.equal(work.gallery.find(item => item.mediaId === 'med_rights_only').selectionEligibility, 'clearance-not-approved');
assert.equal(work.primaryMediaId === 'med_gallery_pending' || work.fallbackMediaIds.includes('med_gallery_pending'), false);
assert.equal(JSON.stringify(work).includes('PRIVATE-REVIEW-NOTE'), false);
assert.equal(JSON.stringify(work).includes('private.invalid'), false);
assert.equal(JSON.stringify(work).includes('uploads'), false);
assert.equal(work.scope.editionEntityId, null);
assert.equal(forward.records.find(record => record.targetEntityId === 'ed_1').scope.editionEntityId, 'ed_1');

const legacy = { thumbnail: 'legacy-thumbnail', preview: 'legacy-preview' };
assert.equal(adaptMediaVM({ mediaId: 'med_owner_thumb', legacy, projection: forward }).source, 'legacy');
const vm = adaptMediaVM({ targetEntityId: 'wk_1', legacy, projection: forward, featureFlags: { mediaProjectionV1: true } });
assert.equal(vm.source, 'projected');
assert.equal(vm.mediaId, 'med_owner_thumb');
assert.deepEqual(vm.compatibility.thumbnail.mediaId, 'med_owner_thumb');
assert.equal(adaptMediaVM({ mediaId: 'missing', legacy, projection: forward, featureFlags: { mediaProjectionV1: true } }).source, 'legacy');

console.log('M3 media policy focused checks: 21/21');
