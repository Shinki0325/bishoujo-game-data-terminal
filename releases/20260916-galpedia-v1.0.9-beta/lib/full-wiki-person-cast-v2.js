import { resolveSharedDataURL } from './shared-data-url.js';
import { PERSON_CAST } from './full-wiki-person-cast-config-v2.js';

const DEFAULT_MANIFEST_URL = new URL(PERSON_CAST.url, import.meta.url);

async function digest(bytes, cryptoRef) {
  return Array.from(new Uint8Array(await cryptoRef.subtle.digest('SHA-256', bytes)), value => value.toString(16).padStart(2, '0')).join('');
}

export function createPersonCastLoader({ manifestUrl = DEFAULT_MANIFEST_URL, fetchImpl = globalThis.fetch, cryptoRef = globalThis.crypto } = {}) {
  const shardCache = new Map();
  let manifestPromise = null;
  async function readJson(url, expectedSha = null, expectedBytes = null) {
    const response = await fetchImpl(resolveSharedDataURL(url));
    if (!response.ok) throw new Error('人物角色投影读取失败');
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (expectedBytes !== null && bytes.byteLength !== expectedBytes) throw new Error('人物角色投影大小校验失败');
    if (expectedSha && await digest(bytes, cryptoRef) !== expectedSha) throw new Error('人物角色投影SHA校验失败');
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  async function manifest() {
    if (!manifestPromise) manifestPromise = readJson(manifestUrl, PERSON_CAST.sha256, PERSON_CAST.bytes).then(value => {
      if (value?.schemaVersion !== PERSON_CAST.schema || value?.bucketContract?.bucketCount !== 256) throw new TypeError('人物角色投影版本不兼容');
      return value;
    }).catch(error => { manifestPromise = null; throw error; });
    return manifestPromise;
  }
  async function load(canonicalEntityId) {
    const input = String(canonicalEntityId ?? '');
    if (!input) return [];
    const value = await manifest();
    const routeId = value.sourceIdentityMap?.[input] ?? input;
    const bucket = (await digest(new TextEncoder().encode(routeId), cryptoRef)).slice(0, 2);
    const descriptor = value.shards?.find(item => item.bucket === bucket);
    if (!descriptor) throw new TypeError('人物角色投影分片缺失');
    let shard = shardCache.get(bucket);
    if (!shard) {
      const pending = readJson(new URL(descriptor.path, manifestUrl), descriptor.sha256, descriptor.bytes);
      shardCache.set(bucket, pending);
      try { shard = await pending; } catch (error) { shardCache.delete(bucket); throw error; }
    } else shard = await shard;
    const record = shard.records?.find(item => item.canonicalEntityId === routeId);
    return Object.freeze((record?.cast ?? []).map(item => Object.freeze({ ...item })));
  }
  return Object.freeze({ load });
}
