const INDEX_SCHEMA_VERSION = 'egs-work-detail-credits-index-v1';
const SHARD_SCHEMA_VERSION = 'egs-work-detail-credits-shard-v1';
const ID_PATTERN = /^[1-9][0-9]*$/u;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const SHARD_PATH_PATTERN = /^shards\/[0-9]{3,}\.json$/u;

function assertObject(value, name) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
  return value;
}
function assertId(value, name) {
  if (typeof value !== 'string' || !ID_PATTERN.test(value)) {
    throw new TypeError(`${name} must be a public numeric ID`);
  }
  return value;
}

function assertSha256(value, name) {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    throw new TypeError(`${name} must be a lowercase SHA-256`);
  }
  return value;
}

function assertPositiveInteger(value, name) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive safe integer`);
  }
  return value;
}

function prepareIndex(value, binding) {
  const index = assertObject(value, 'work-detail credits index');
  if (index.schemaVersion !== INDEX_SCHEMA_VERSION) {
    throw new TypeError('work-detail credits index schemaVersion is unsupported');
  }
  if (index.sourceCatalogSnapshotId !== binding.catalogSnapshotId) {
    throw new TypeError('work-detail credits catalog snapshot does not match the catalog');
  }
  if (index.sourceCatalogSha256 !== binding.catalogSha256) {
    throw new TypeError('work-detail credits catalog SHA-256 does not match the catalog');
  }
  assertPositiveInteger(index.bucketSize, 'work-detail credits bucketSize');
  if (!Number.isSafeInteger(index.availableWorkCount) || index.availableWorkCount < 0) {
    throw new TypeError('work-detail credits availableWorkCount must be a non-negative integer');
  }
  if (!Array.isArray(index.buckets)) {
    throw new TypeError('work-detail credits buckets must be an array');
  }
  const descriptorsByWorkId = new Map();
  const bucketIds = new Set();
  const descriptors = index.buckets.map((candidate, bucketIndex) => {
    const descriptor = assertObject(candidate, `work-detail credits buckets[${bucketIndex}]`);
    if (typeof descriptor.bucketId !== 'string' || !/^[0-9]{3,}$/u.test(descriptor.bucketId)) {
      throw new TypeError(`work-detail credits buckets[${bucketIndex}].bucketId is invalid`);
    }
    if (bucketIds.has(descriptor.bucketId)) {
      throw new TypeError('work-detail credits index contains a duplicate bucket ID');
    }
    bucketIds.add(descriptor.bucketId);
    if (typeof descriptor.path !== 'string' || !SHARD_PATH_PATTERN.test(descriptor.path)) {
      throw new TypeError(`work-detail credits buckets[${bucketIndex}].path is unsafe`);
    }
    if (!Array.isArray(descriptor.workIds) || descriptor.workIds.length === 0) {
      throw new TypeError(`work-detail credits buckets[${bucketIndex}].workIds must be non-empty`);
    }
    if (descriptor.workCount !== descriptor.workIds.length) {
      throw new TypeError(`work-detail credits buckets[${bucketIndex}] workCount mismatch`);
    }
    const prepared = Object.freeze({
      bucketId: descriptor.bucketId,
      path: descriptor.path,
      workIds: Object.freeze(descriptor.workIds.map((workId, workIndex) => {
        assertId(workId, `work-detail credits buckets[${bucketIndex}].workIds[${workIndex}]`);
        if (!binding.workIds.has(workId)) {
          throw new TypeError(`work-detail credits index contains an unknown work ID: ${workId}`);
        }
        if (descriptorsByWorkId.has(workId)) {
          throw new TypeError(`work-detail credits index contains a duplicate work ID: ${workId}`);
        }
        descriptorsByWorkId.set(workId, null);
        return workId;
      })),
      workCount: descriptor.workCount,
      bytes: assertPositiveInteger(descriptor.bytes, `work-detail credits buckets[${bucketIndex}].bytes`),
      sha256: assertSha256(descriptor.sha256, `work-detail credits buckets[${bucketIndex}].sha256`)
    });
    for (const workId of prepared.workIds) descriptorsByWorkId.set(workId, prepared);
    return prepared;
  });
  if (descriptorsByWorkId.size !== index.availableWorkCount) {
    throw new TypeError('work-detail credits availableWorkCount does not match the index');
  }
  return Object.freeze({
    bucketSize: index.bucketSize,
    descriptors: Object.freeze(descriptors),
    descriptorsByWorkId
  });
}

/**
 * Validate a detail index without starting a shard request.  Source-only
 * consumers use this to report exact coverage before deciding whether the
 * legacy detail path must remain active for a work.
 */
export function validateWorkDetailCreditsIndex(value, binding) {
  return prepareIndex(value, binding);
}

function prepareShard(value, descriptor) {
  const shard = assertObject(value, `work-detail credits shard ${descriptor.bucketId}`);
  if (shard.schemaVersion !== SHARD_SCHEMA_VERSION) {
    throw new TypeError(`work-detail credits shard ${descriptor.bucketId} schemaVersion is unsupported`);
  }
  if (shard.bucketId !== descriptor.bucketId) {
    throw new TypeError(`work-detail credits shard ${descriptor.bucketId} bucket ID mismatch`);
  }
  const works = assertObject(shard.works, `work-detail credits shard ${descriptor.bucketId}.works`);
  const actualWorkIds = Object.keys(works).sort((left, right) => Number(left) - Number(right));
  const expectedWorkIds = [...descriptor.workIds].sort((left, right) => Number(left) - Number(right));
  if (JSON.stringify(actualWorkIds) !== JSON.stringify(expectedWorkIds)) {
    throw new TypeError(`work-detail credits shard ${descriptor.bucketId} work IDs do not match the index`);
  }
  for (const workId of actualWorkIds) {
    const work = assertObject(works[workId], `work-detail credits work ${workId}`);
    if (work.workId !== workId || !Array.isArray(work.cast) || !Array.isArray(work.songs)) {
      throw new TypeError(`work-detail credits work ${workId} is malformed`);
    }
    assertObject(work.staff, `work-detail credits work ${workId}.staff`);
  }
  return Object.freeze({ ...shard, works: Object.freeze(works) });
}

async function sha256Hex(bytes, cryptoRef) {
  const digest = await cryptoRef.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map(value => value.toString(16).padStart(2, '0'))
    .join('');
}

async function fetchJsonBytes(url, label, { fetchImpl, cacheMode }) {
  const response = await fetchImpl(url, { cache: cacheMode });
  if (!response.ok) throw new Error(`${label} 加载失败：HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  let value;
  try {
    value = JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    throw new Error(`${label} 不是有效的 JSON`, { cause: error });
  }
  return { bytes, value };
}

export function createWorkDetailCreditsLoader({
  indexUrl,
  catalogSnapshotId,
  catalogSha256,
  workIds,
  fetchImpl = globalThis.fetch,
  cryptoRef = globalThis.crypto,
  cacheMode = 'force-cache'
}) {
  if (!(indexUrl instanceof URL)) throw new TypeError('work-detail credits indexUrl must be a URL');
  if (!(workIds instanceof Set)) throw new TypeError('work-detail credits binding must include workIds');
  if (typeof fetchImpl !== 'function') throw new TypeError('work-detail credits fetch must be a function');
  if (typeof cryptoRef?.subtle?.digest !== 'function') throw new TypeError('work-detail credits requires Web Crypto');
  const binding = { catalogSnapshotId, catalogSha256, workIds };
  let indexPromise = null;
  const shardPromises = new Map();

  function loadIndex() {
    if (indexPromise !== null) return indexPromise;
    indexPromise = fetchJsonBytes(indexUrl, '作品制作资料目录', { fetchImpl, cacheMode })
      .then(({ value }) => prepareIndex(value, binding))
      .catch(error => {
        indexPromise = null;
        throw error;
      });
    return indexPromise;
  }

  function loadShard(descriptor) {
    const cached = shardPromises.get(descriptor.bucketId);
    if (cached !== undefined) return cached;
    const shardUrl = new URL(descriptor.path, indexUrl);
    shardUrl.search = indexUrl.search;
    const pending = fetchJsonBytes(
      shardUrl,
      `作品制作资料分片 ${descriptor.bucketId}`,
      { fetchImpl, cacheMode }
    ).then(async ({ bytes, value }) => {
      if (bytes.byteLength !== descriptor.bytes) {
        throw new Error(`作品制作资料分片 ${descriptor.bucketId} 大小校验失败`);
      }
      if (await sha256Hex(bytes, cryptoRef) !== descriptor.sha256) {
        throw new Error(`作品制作资料分片 ${descriptor.bucketId} 完整性校验失败`);
      }
      return prepareShard(value, descriptor);
    }).catch(error => {
      shardPromises.delete(descriptor.bucketId);
      throw error;
    });
    shardPromises.set(descriptor.bucketId, pending);
    return pending;
  }

  return Object.freeze({
    async load(workId) {
      if (typeof workId !== 'string' || !ID_PATTERN.test(workId)) return null;
      const index = await loadIndex();
      const descriptor = index.descriptorsByWorkId.get(workId);
      if (descriptor === undefined) return null;
      const shard = await loadShard(descriptor);
      return shard.works[workId] ?? null;
    }
  });
}
