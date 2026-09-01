import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createProjectEntityRuntime } from './project-entity-runtime.js';
import { prepareCharacterImageMap } from './character-image-map.js';

const catalogBytes = fs.readFileSync(new URL('../data/catalog.json', import.meta.url));
const catalog = JSON.parse(catalogBytes);
catalog.catalogSha256 = crypto.createHash('sha256').update(catalogBytes).digest('hex');
const bridge = JSON.parse(fs.readFileSync(new URL('../data/egs-tier-g1-media-clearance-v1.json', import.meta.url)));
const characterImageMap = prepareCharacterImageMap(JSON.parse(fs.readFileSync(new URL('../data/terminal-wiki-character-image-map-v1.json', import.meta.url))));
const runtime = await createProjectEntityRuntime({
  bridge,
  catalog,
  dataRevision: '79540595efb9eb768898f26c8a1b72224bb918f52d3ff6622fed75757bfa38ca',
  characterImageMap,
  characterAssetBase: 'https://example.test/terminal-wiki/v1/',
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
const mapped = runtime.projectCredits({ workId: '1', cast: [{ vndbCharacterId: 'c100970', characterName: 'mapped' }], staff: {}, songs: [] });
assert.match(mapped.projections.characters[0].image.url, /^https:\/\/example\.test\/terminal-wiki\/v1\/characters\/v1\/images\//u);
assert.equal(mapped.adaptCharacter('c100970').image.assetSha256.length, 64);
const runtimeWithoutImages = await createProjectEntityRuntime({
  bridge,
  catalog,
  dataRevision: '79540595efb9eb768898f26c8a1b72224bb918f52d3ff6622fed75757bfa38ca',
  cryptoRef: globalThis.crypto,
});
const lateMapped = runtimeWithoutImages.projectCredits(
  { workId: '1', cast: [{ vndbCharacterId: 'c100970', characterName: 'lazy mapped' }], staff: {}, songs: [] },
  { characterImageMap, characterAssetBase: 'https://example.test/terminal-wiki/v1/' },
);
assert.match(lateMapped.projections.characters[0].image.url, /^https:\/\/example\.test\/terminal-wiki\/v1\/characters\/v1\/images\//u);
const mixedMap = prepareCharacterImageMap({
  schemaVersion: 'terminal-wiki-character-image-map-v1',
  collection: 'terminal-wiki-character-images',
  snapshotId: 'mixed-fixture',
  sourceSnapshotId: 'fixture',
  publication: { publicationEligible: true, status: 'owner-authorized' },
  mappings: [
    { characterId: 'ch_aaaaaaaaaaaa', source: 'vndb', sourceCharacterId: 'c100970', assetPath: 'characters/v1/images/aa/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.webp', assetSha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
    { characterId: 'ch_cccccccccccc', source: 'vndb', sourceCharacterId: 'c100971', assetPath: 'characters/v1/images/cc/cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc.webp', assetSha256: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc' },
    { characterId: 'ch_bbbbbbbbbbbb', source: 'egs', sourceCharacterId: 8776, assetPath: 'characters/v1/images/bb/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.webp', assetSha256: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' }
  ]
});
const mixedRuntime = runtimeWithoutImages.projectCredits({ workId: '1', cast: [
  { characterId: 8776, vndbCharacterId: 'c100970', characterName: 'EGS primary' },
  { vndbCharacterId: 'c100971', characterName: 'VNDB fallback' }
], staff: {}, songs: [] }, { characterImageMap: mixedMap, characterAssetBase: 'https://example.test/terminal-wiki/v1/' });
assert.equal(mixedRuntime.credits.cast[0].image.source, 'egs');
assert.equal(mixedRuntime.credits.cast[1].image.source, 'vndb');
console.log('project entity runtime integration checks: 11/11');
