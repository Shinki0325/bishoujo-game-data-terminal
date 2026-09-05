import assert from 'node:assert/strict';
import crypto, { webcrypto } from 'node:crypto';
import { createWorkDetailCreditsLoader } from './work-detail-credits.js';
import { resolveCharacterImage } from './character-image-map.js';

const stableBytes = value => Buffer.from(`${JSON.stringify(value)}\n`, 'utf8');
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const mapSha = 'a'.repeat(64);
const aliasSha = 'b'.repeat(64);
const snapshotId = 'fixture-character-images';
const imageMap = {
  schemaVersion: 'terminal-wiki-character-image-map-v1',
  collection: 'terminal-wiki-character-images',
  snapshotId,
  sourceSnapshotId: 'fixture-source',
  publication: { publicationEligible: true, status: 'owner-authorized' },
  mappings: [{
    characterId: 'ch_aaaaaaaaaaaa',
    source: 'vndb',
    sourceCharacterId: 'c1',
    assetPath: `characters/v1/images/aa/${'a'.repeat(64)}.webp`,
    assetSha256: 'a'.repeat(64)
  }]
};
const imageAliases = {
  schemaVersion: 'terminal-wiki-character-image-alias-map-v1',
  sourceMapSnapshotId: snapshotId,
  sourceMapSha256: mapSha,
  publication: { publicationEligible: true, status: 'owner-authorized' },
  records: [],
  summary: { recordCount: 0 }
};
const imageShard = {
  schemaVersion: 'terminal-wiki-character-image-shard-v1',
  bucketId: '000',
  snapshotId,
  sourceMapSha256: mapSha,
  sourceAliasMapSha256: aliasSha,
  workIds: ['1'],
  imageMap,
  imageAliases
};
const imageShardBytes = stableBytes(imageShard);
const creditsShard = {
  schemaVersion: 'egs-work-detail-credits-shard-v1',
  bucketId: '000',
  works: { '1': { workId: '1', staff: {}, cast: [{ vndbCharacterId: 'c1' }], songs: [] } }
};
const creditsShardBytes = stableBytes(creditsShard);
const index = {
  schemaVersion: 'egs-work-detail-credits-index-v1',
  sourceCatalogSnapshotId: 'catalog-fixture',
  sourceCatalogSha256: 'c'.repeat(64),
  bucketSize: 100,
  availableWorkCount: 1,
  characterImages: {
    schemaVersion: 'terminal-wiki-character-image-shards-v1',
    snapshotId,
    sourceMapSha256: mapSha,
    sourceAliasMapSha256: aliasSha,
    shardCount: 1,
    mappedWorkCount: 1
  },
  buckets: [{
    bucketId: '000',
    path: 'shards/000.json',
    workIds: ['1'],
    workCount: 1,
    bytes: creditsShardBytes.byteLength,
    sha256: sha256(creditsShardBytes),
    characterImageShard: {
      path: 'character-images/000.json',
      bytes: imageShardBytes.byteLength,
      sha256: sha256(imageShardBytes)
    }
  }]
};
const indexBytes = stableBytes(index);
const requests = [];
const response = bytes => ({
  ok: true,
  status: 200,
  arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
});
const fetchImpl = async url => {
  const pathname = new URL(url).pathname;
  requests.push(pathname);
  if (pathname.endsWith('/index.json')) return response(indexBytes);
  if (pathname.endsWith('/shards/000.json')) return response(creditsShardBytes);
  if (pathname.endsWith('/character-images/000.json')) return response(imageShardBytes);
  throw new Error(`unexpected URL: ${url}`);
};
const loader = createWorkDetailCreditsLoader({
  indexUrl: new URL('https://fixture.test/data/work-details/v1/index.json?v=fixture'),
  catalogSnapshotId: 'catalog-fixture',
  catalogSha256: 'c'.repeat(64),
  workIds: new Set(['1']),
  fetchImpl,
  cryptoRef: webcrypto,
  characterImageMapSnapshotId: snapshotId,
  characterImageMapSha256: mapSha,
  characterImageAliasMapSha256: aliasSha
});
const credits = await loader.load('1');
assert.equal(credits.workId, '1');
assert.deepEqual(requests, [
  '/data/work-details/v1/index.json',
  '/data/work-details/v1/shards/000.json'
]);
const preparedImages = await loader.loadCharacterImages('1');
assert.equal(preparedImages.mappingCount, 1);
assert.equal(resolveCharacterImage({ vndbCharacterId: 'c1' }, preparedImages).assetSha256, 'a'.repeat(64));
assert.deepEqual(requests, [
  '/data/work-details/v1/index.json',
  '/data/work-details/v1/shards/000.json',
  '/data/work-details/v1/character-images/000.json'
]);
await loader.loadCharacterImages('1');
assert.equal(requests.length, 3);
assert.equal(await loader.loadCharacterImages('invalid'), null);

const mismatchedLoader = createWorkDetailCreditsLoader({
  indexUrl: new URL('https://fixture.test/data/work-details/v1/index.json'),
  catalogSnapshotId: 'catalog-fixture',
  catalogSha256: 'c'.repeat(64),
  workIds: new Set(['1']),
  fetchImpl,
  cryptoRef: webcrypto,
  characterImageMapSnapshotId: snapshotId,
  characterImageMapSha256: 'd'.repeat(64),
  characterImageAliasMapSha256: aliasSha
});
await assert.rejects(() => mismatchedLoader.load('1'), /map hash does not match/u);

console.log('work-detail character image shard checks: 10/10');
