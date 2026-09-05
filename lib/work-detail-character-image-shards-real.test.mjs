import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareCharacterImageMap, resolveCharacterImage } from './character-image-map.js';
import {
  CHARACTER_IMAGE_ALIAS_MAP_SHA256,
  CHARACTER_IMAGE_MAP_SHA256,
  CHARACTER_IMAGE_MAP_SNAPSHOT_ID
} from './runtime-config.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dataRoot = path.join(root, 'data');
const detailRoot = path.join(dataRoot, 'work-details', 'v1');
const readBytes = relative => fs.readFileSync(path.join(dataRoot, relative));
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const mapBytes = readBytes('terminal-wiki-character-image-map-v1.json');
const aliasBytes = readBytes('terminal-wiki-character-image-alias-map-v1.json');
assert.equal(sha256(mapBytes), CHARACTER_IMAGE_MAP_SHA256);
assert.equal(sha256(aliasBytes), CHARACTER_IMAGE_ALIAS_MAP_SHA256);
const imageMapPayload = JSON.parse(mapBytes);
const aliasPayload = JSON.parse(aliasBytes);
const fullMap = prepareCharacterImageMap(imageMapPayload, {
  snapshotId: CHARACTER_IMAGE_MAP_SNAPSHOT_ID,
  aliases: aliasPayload,
  sourceMapSha256: CHARACTER_IMAGE_MAP_SHA256
});
const index = JSON.parse(fs.readFileSync(path.join(detailRoot, 'index.json')));
assert.equal(index.characterImages.schemaVersion, 'terminal-wiki-character-image-shards-v1');
assert.equal(index.characterImages.snapshotId, CHARACTER_IMAGE_MAP_SNAPSHOT_ID);
assert.equal(index.characterImages.sourceMapSha256, CHARACTER_IMAGE_MAP_SHA256);
assert.equal(index.characterImages.sourceAliasMapSha256, CHARACTER_IMAGE_ALIAS_MAP_SHA256);

let checkedRows = 0;
let mappedWorks = 0;
let imageShardCount = 0;
for (const descriptor of index.buckets) {
  const creditsBytes = fs.readFileSync(path.join(detailRoot, descriptor.path));
  assert.equal(creditsBytes.byteLength, descriptor.bytes);
  assert.equal(sha256(creditsBytes), descriptor.sha256);
  const creditsShard = JSON.parse(creditsBytes);
  let shardMap = null;
  if (descriptor.characterImageShard) {
    imageShardCount += 1;
    const imageBytes = fs.readFileSync(path.join(detailRoot, descriptor.characterImageShard.path));
    assert.equal(imageBytes.byteLength, descriptor.characterImageShard.bytes);
    assert.equal(sha256(imageBytes), descriptor.characterImageShard.sha256);
    const imageShard = JSON.parse(imageBytes);
    assert.equal(imageShard.bucketId, descriptor.bucketId);
    assert.deepEqual(imageShard.workIds, descriptor.workIds);
    assert.equal(imageShard.sourceMapSha256, CHARACTER_IMAGE_MAP_SHA256);
    assert.equal(imageShard.sourceAliasMapSha256, CHARACTER_IMAGE_ALIAS_MAP_SHA256);
    shardMap = prepareCharacterImageMap(imageShard.imageMap, {
      snapshotId: CHARACTER_IMAGE_MAP_SNAPSHOT_ID,
      aliases: imageShard.imageAliases,
      sourceMapSha256: CHARACTER_IMAGE_MAP_SHA256
    });
  }
  for (const work of Object.values(creditsShard.works)) {
    let workMapped = false;
    for (const entry of work.cast) {
      const character = {
        egsCharacterId: typeof entry.characterId === 'number' || /^[1-9][0-9]*$/u.test(entry.characterId ?? '')
          ? entry.characterId
          : null,
        vndbCharacterId: entry.vndbCharacterId ?? (/^c[1-9][0-9]*$/u.test(entry.characterId ?? '') ? entry.characterId : null)
      };
      const expected = resolveCharacterImage(character, fullMap);
      const actual = resolveCharacterImage(character, shardMap);
      assert.deepEqual(
        actual === null ? null : [actual.source, actual.assetPath, actual.assetSha256],
        expected === null ? null : [expected.source, expected.assetPath, expected.assetSha256],
        `character image shard mismatch for work ${work.workId} character ${entry.characterId ?? entry.vndbCharacterId}`
      );
      if (expected !== null) workMapped = true;
      checkedRows += 1;
    }
    if (workMapped) mappedWorks += 1;
  }
}
assert.equal(imageShardCount, index.characterImages.shardCount);
assert.equal(mappedWorks, index.characterImages.mappedWorkCount);
assert.equal(checkedRows > 60_000, true);

console.log(`real work-detail character image shard parity: ${checkedRows} rows, ${mappedWorks} mapped works, ${imageShardCount} shards`);
