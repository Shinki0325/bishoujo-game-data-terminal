const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
export const PERSON_PERFORMANCE_MANIFEST_SHA256 = 'ee0e503d83149dcfd94a4421118c505dfc8b301e45823dd652cde6918561392c';

function normalizeActivityAxis(value) {
  const startYear = Number(value?.startYear);
  const endYear = Number(value?.endYear);
  const bucketCount = Number(value?.bucketCount);
  if (!Number.isInteger(startYear) || !Number.isInteger(endYear) || endYear < startYear) return null;
  if (!Number.isInteger(bucketCount) || !Array.isArray(value?.buckets) || value.buckets.length !== bucketCount) return null;
  let expectedStart = startYear;
  const buckets = [];
  for (const item of value.buckets) {
    const bucketStart = Number(item?.startYear);
    const bucketEnd = Number(item?.endYear);
    if (!Number.isInteger(bucketStart) || !Number.isInteger(bucketEnd) || bucketStart !== expectedStart || bucketEnd < bucketStart || bucketEnd > endYear) return null;
    buckets.push(Object.freeze({ startYear: bucketStart, endYear: bucketEnd }));
    expectedStart = bucketEnd + 1;
  }
  if (expectedStart !== endYear + 1) return null;
  const labelYears = Array.isArray(value?.labelYears) ? value.labelYears.map(Number) : [];
  if (!labelYears.length || labelYears.some((year, index) => !Number.isInteger(year) || year < startYear || year > endYear || labelYears.indexOf(year) !== index)) return null;
  if (labelYears[0] !== startYear || labelYears.at(-1) !== endYear) return null;
  return Object.freeze({ startYear, endYear, bucketCount, buckets: Object.freeze(buckets), labelYears: Object.freeze(labelYears) });
}

async function digest(bytes, cryptoRef) {
  const value = await cryptoRef.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(value), item => item.toString(16).padStart(2, '0')).join('');
}

export function createM2PersonPerformanceRuntime({ manifestUrl, indexUrl, fetchImpl = globalThis.fetch, cryptoRef = globalThis.crypto, cacheMode = 'force-cache' } = {}) {
  if (!(manifestUrl instanceof URL) || !(indexUrl instanceof URL)) throw new TypeError('person performance URLs are required');
  if (typeof fetchImpl !== 'function' || !cryptoRef?.subtle?.digest) throw new TypeError('person performance runtime requires fetch and Web Crypto');
  let directoryPromise = null;
  const shardPromises = new Map();
  async function fetchJson(url, expectedSha, label) {
    const response = await fetchImpl(url, { cache: cacheMode });
    if (!response.ok) throw new Error(`${label} failed: HTTP ${response.status}`);
    const bytes = await response.arrayBuffer();
    if (!SHA256_PATTERN.test(expectedSha) || await digest(bytes, cryptoRef) !== expectedSha) throw new Error(`${label} integrity failed`);
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  async function loadDirectory() {
    if (directoryPromise) return directoryPromise;
    directoryPromise = (async () => {
      const manifest = await fetchJson(manifestUrl, PERSON_PERFORMANCE_MANIFEST_SHA256, 'person performance manifest');
      if (manifest.schemaVersion !== 'terminal-wiki-m2-person-performance-manifest-v1' || manifest.publicationStatus !== 'source-only') throw new Error('person performance manifest contract mismatch');
      if (manifest.index?.path !== 'directory-index.json' || !Number.isSafeInteger(manifest.index.recordCount)) throw new Error('person performance index manifest mismatch');
      const manifestActivityAxis = normalizeActivityAxis(manifest.activityAxis);
      if (!manifestActivityAxis) throw new Error('person performance activity axis mismatch');
      const index = await fetchJson(new URL(manifest.index.path, manifestUrl), manifest.index.sha256, 'person directory index');
      if (index.schemaVersion !== 'terminal-wiki-m2-person-directory-index-v1' || index.publicationStatus !== 'source-only' || !Array.isArray(index.records) || index.records.length !== manifest.index.recordCount) throw new Error('person directory index contract mismatch');
      const indexActivityAxis = normalizeActivityAxis(index.activityAxis);
      if (!indexActivityAxis || JSON.stringify(indexActivityAxis) !== JSON.stringify(manifestActivityAxis)) throw new Error('person directory activity axis mismatch');
      const byId = new Map();
      for (const record of index.records) {
        if (!record?.entityId || byId.has(record.entityId)) throw new Error('person directory index contains duplicate entity');
        if (!Array.isArray(record.activity) || record.activity.length !== indexActivityAxis.bucketCount) throw new Error('person directory activity buckets mismatch');
        byId.set(record.entityId, Object.freeze({ ...record, credits: Object.freeze([]), coActors: Object.freeze([]), coCompanies: Object.freeze([]) }));
      }
      return Object.freeze({ records: Object.freeze(index.records), byId, manifest, activityAxis: indexActivityAxis });
    })().catch(error => { directoryPromise = null; throw error; });
    return directoryPromise;
  }
  async function loadPerson(entityId) {
    const directory = await loadDirectory();
    const summary = directory.byId.get(entityId);
    if (!summary) return null;
    const shardKey = String(entityId).slice(4, 6).toLowerCase().padEnd(2, '0');
    const shardMeta = directory.manifest.shards?.find(item => item.shardKey === shardKey);
    if (!shardMeta) throw new Error(`person shard missing: ${shardKey}`);
    let promise = shardPromises.get(shardKey);
    if (!promise) {
      promise = fetchJson(new URL(shardMeta.path, manifestUrl), shardMeta.sha256, `person shard ${shardKey}`).then(payload => {
        if (payload.schemaVersion !== 'terminal-wiki-m2-person-relations-shard-v1' || payload.publicationStatus !== 'source-only' || payload.shardKey !== shardKey || !Array.isArray(payload.records)) throw new Error(`person shard ${shardKey} contract mismatch`);
        return new Map(payload.records.filter(item => item?.entityId).map(item => [item.entityId, item]));
      });
      shardPromises.set(shardKey, promise);
    }
    const record = (await promise).get(entityId);
    if (!record) throw new Error(`person ${entityId} missing from shard ${shardKey}`);
    return Object.freeze({ ...summary, ...record });
  }
  return Object.freeze({ loadDirectory, loadPerson, clear() { directoryPromise = null; shardPromises.clear(); } });
}
