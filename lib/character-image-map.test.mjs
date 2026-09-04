import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {
  applyCharacterImageMapToCharacters,
  prepareCharacterImageMap
} from './character-image-map.js';

const bytes = fs.readFileSync(new URL('../data/terminal-wiki-character-image-map-v1.json', import.meta.url));
assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), '4f3a0c4e7f015e7aa8a52b136a201290d6388a498d1db6c49dbfe06cf6044d15');
const payload = JSON.parse(bytes);
const prepared = prepareCharacterImageMap(payload, { snapshotId: 'terminal-wiki-character-public-v3-2026-09-01' });
assert.equal(prepared.mappingCount, 50844);
assert.equal(prepared.aliasCount, 0);
assert.equal(prepared.bySourceCharacterId.size < prepared.mappingCount, true);

const duplicateDirectAsset = { ...payload.mappings[0], characterId: 'ch_aaaaaaaaaaaa' };
const identicalDuplicatePrepared = prepareCharacterImageMap({
  ...payload,
  mappings: [payload.mappings[0], duplicateDirectAsset]
});
assert.equal(identicalDuplicatePrepared.lookupCount, 1);
assert.throws(() => prepareCharacterImageMap({
  ...payload,
  mappings: [payload.mappings[0], {
    ...duplicateDirectAsset,
    assetPath: payload.mappings[1].assetPath,
    assetSha256: payload.mappings[1].assetSha256
  }]
}), /conflicts with a direct image key/u);

const aliasPayload = JSON.parse(fs.readFileSync(new URL('../data/terminal-wiki-character-image-alias-map-v1.json', import.meta.url)));
const preparedWithAliases = prepareCharacterImageMap(payload, {
  snapshotId: 'terminal-wiki-character-public-v3-2026-09-01',
  aliases: aliasPayload,
  sourceMapSha256: '4f3a0c4e7f015e7aa8a52b136a201290d6388a498d1db6c49dbfe06cf6044d15'
});
assert.equal(preparedWithAliases.aliasCount, 2621);
assert.equal(preparedWithAliases.bySourceCharacterId.get('vndb:c3659').source, 'egs');
assert.equal(preparedWithAliases.bySourceCharacterId.get('vndb:c57').source, 'egs');
assert.equal(preparedWithAliases.bySourceCharacterId.get('vndb:c102').source, 'egs');

const sourceCharacterId = payload.mappings[0].sourceCharacterId;
const projected = applyCharacterImageMapToCharacters([
  { vndbCharacterId: sourceCharacterId, characterName: 'mapped' },
  { vndbCharacterId: 'c999999999', characterName: 'unmapped' }
], prepared, { assetBase: 'https://example.test/terminal-wiki/v1/' });
assert.equal(projected[0].image.assetSha256.length, 64);
assert.match(projected[0].image.assetPath, /^characters\/v1\/images\/[a-f0-9]{2}\/[a-f0-9]{64}\.webp$/u);
assert.equal(projected[0].image.url, `https://example.test/terminal-wiki/v1/${projected[0].image.assetPath}`);
assert.equal(projected[1].image, undefined);

const mixed = prepareCharacterImageMap({
  ...payload,
  mappings: [
    { ...payload.mappings[0], source: 'vndb', sourceCharacterId: 'c100970' },
    { ...payload.mappings[0], source: 'egs', sourceCharacterId: 8776, assetPath: payload.mappings[1].assetPath }
  ]
});
const mixedProjected = applyCharacterImageMapToCharacters([
  { egsCharacterId: 8776, vndbCharacterId: 'c100970', characterName: 'EGS primary' },
  { vndbCharacterId: 'c100970', characterName: 'VNDB fallback' }
], mixed, { assetBase: 'https://example.test/terminal-wiki/v1/' });
assert.equal(mixedProjected[0].image.source, 'egs');
assert.equal(mixedProjected[0].image.assetPath, payload.mappings[1].assetPath);
assert.equal(mixedProjected[1].image.source, 'vndb');

const aliasFixture = {
  schemaVersion: 'terminal-wiki-character-image-alias-map-v1',
  sourceMapSnapshotId: payload.snapshotId,
  sourceMapSha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  publication: { publicationEligible: true, status: 'owner-authorized' },
  records: [{
    characterId: payload.mappings[0].characterId,
    source: 'egs',
    sourceCharacterId: '999999999',
    targetSource: payload.mappings[0].source,
    targetSourceCharacterId: payload.mappings[0].sourceCharacterId,
    evidenceClass: 'canonical-source-binding'
  }],
  summary: { recordCount: 1 }
};
const fixturePrepared = prepareCharacterImageMap(payload, { aliases: aliasFixture });
const fixtureProjected = applyCharacterImageMapToCharacters([{ egsCharacterId: 999999999 }], fixturePrepared);
assert.equal(fixtureProjected[0].image.source, payload.mappings[0].source);
assert.equal(fixtureProjected[0].image.assetSha256, payload.mappings[0].assetSha256);
assert.throws(() => prepareCharacterImageMap(payload, {
  aliases: { ...aliasFixture, records: [{ ...aliasFixture.records[0], source: payload.mappings[0].source, sourceCharacterId: payload.mappings[0].sourceCharacterId }] }
}));
assert.throws(() => prepareCharacterImageMap(payload, {
  aliases: { ...aliasFixture, records: [{ ...aliasFixture.records[0], characterId: 'ch_aaaaaaaaaaaa' }] }
}));

assert.throws(() => prepareCharacterImageMap({ ...payload, publication: { ...payload.publication, publicationEligible: false } }));
assert.throws(() => prepareCharacterImageMap({ ...payload, mappings: [{ ...payload.mappings[0], assetPath: '../private.jpg' }] }));
assert.throws(() => prepareCharacterImageMap(payload, { snapshotId: 'stale' }));

const mainSource = fs.readFileSync(new URL('../main.js', import.meta.url), 'utf8');
const startupFetchBlock = mainSource.slice(
  mainSource.indexOf("startupMetrics.measureAsync('runtime-fetch-and-parse'"),
  mainSource.indexOf('const {\n    catalogSource'),
);
assert.doesNotMatch(startupFetchBlock, /DATA_URLS\.characterImageMap/u);
assert.match(mainSource, /const \[characterImageMap, projectIdentityCrosswalk\] = await Promise\.all\(\[/u);
assert.match(mainSource, /loadCharacterImageMap\(\),/u);

console.log('character image map focused checks: 27/27');
