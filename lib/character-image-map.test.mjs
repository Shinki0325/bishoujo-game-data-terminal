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
assert.equal(prepared.bySourceCharacterId.size < prepared.mappingCount, true);

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

assert.throws(() => prepareCharacterImageMap({ ...payload, publication: { ...payload.publication, publicationEligible: false } }));
assert.throws(() => prepareCharacterImageMap({ ...payload, mappings: [{ ...payload.mappings[0], assetPath: '../private.jpg' }] }));
assert.throws(() => prepareCharacterImageMap(payload, { snapshotId: 'stale' }));

const mainSource = fs.readFileSync(new URL('../main.js', import.meta.url), 'utf8');
const startupFetchBlock = mainSource.slice(
  mainSource.indexOf("startupMetrics.measureAsync('runtime-fetch-and-parse'"),
  mainSource.indexOf('const {\n    catalogSource'),
);
assert.doesNotMatch(startupFetchBlock, /DATA_URLS\.characterImageMap/u);
assert.match(mainSource, /const characterImageMap = await loadCharacterImageMap\(\);/u);

console.log('character image map focused checks: 16/16');
