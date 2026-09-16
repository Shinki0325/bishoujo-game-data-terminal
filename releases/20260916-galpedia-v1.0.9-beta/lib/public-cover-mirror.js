import { PUBLIC_COVER_MIRROR } from './public-cover-mirror-config.js';
import { createResourceRequest } from './resource-request.js';

const SHA = /^[a-f0-9]{64}$/u;
const PATH = /^egs-tier\/v2\/objects\/sha256\/([a-f0-9]{2})\/([a-f0-9]{64})\.webp$/u;
export function coverObjectSha(path) {
  const match = PATH.exec(path ?? '');
  return match && match[1] === match[2].slice(0, 2) ? match[2] : null;
}

// Read only the hash shard needed by a failed legacy image. The release pins
// the existing delivery manifest; a matching pathname alone is not evidence.
export function createPublicCoverMirror({ config = PUBLIC_COVER_MIRROR,
  baseUrl = new URL('../', import.meta.url), cryptoRef = globalThis.crypto,
  request = createResourceRequest({ timeoutMs: 5000, maxAttempts: 1 }), maxShards = 4 } = {}) {
  if (!Number.isInteger(maxShards) || maxShards < 1) throw new TypeError('Invalid mirror cache size');
  const cache = new Map(), pending = new Map();
  let manifestPromise;
  const digest = async bytes => [...new Uint8Array(await cryptoRef.subtle.digest('SHA-256', bytes))]
    .map(n => n.toString(16).padStart(2, '0')).join('');
  async function read(url, descriptor, compressed = false) {
    return request(url, { label: '封面镜像清单', validationKey: descriptor.sha256, validate: async bytes => {
      if (bytes.byteLength !== descriptor.bytes || await digest(bytes) !== descriptor.sha256) throw Error('镜像清单摘要不符');
      const raw = compressed ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer() : bytes;
      if (compressed && raw.byteLength !== descriptor.rawBytes) throw Error('镜像清单解压长度不符');
      return JSON.parse(new TextDecoder().decode(raw));
    }});
  }
  async function manifest() {
    return manifestPromise ??= read(new URL(config.path, baseUrl), config).then(value => {
      if (value.schema !== 'galpedia-cover-mirror-manifest-v1' || value.base !== config.base
        || value.delivery?.status !== 'uploaded' || value.delivery.verifiedCount !== value.count
        || !Array.isArray(value.assets) || value.assets.length !== 16) throw Error('镜像交付清单无效');
      return value;
    }).catch(error => { manifestPromise = null; throw error; });
  }
  async function shard(prefix) {
    if (cache.has(prefix)) {
      const value = cache.get(prefix); cache.delete(prefix); cache.set(prefix, value); return value;
    }
    if (pending.has(prefix)) return pending.get(prefix);
    const task = (async () => {
      const m = await manifest(), path = `assets-${prefix}.json.gz`;
      const d = m.assets.find(row => row.path === path);
      if (!d || !SHA.test(d.sha256) || !(d.bytes > 0 && d.bytes <= 262144)
        || !(d.rawBytes > 0 && d.rawBytes <= 4194304)) throw Error('镜像分片描述无效');
      const value = await read(new URL(path, new URL(config.path, baseUrl)), d, true);
      if (value.schema !== 'galpedia-cover-mirror-assets-v1' || !Array.isArray(value.assets)
        || value.assets.length !== d.count) throw Error('镜像分片格式无效');
      const rows = new Map();
      for (const row of value.assets) {
        const objectPath = `egs-tier/v2/objects/sha256/${row.sha256?.slice(0, 2)}/${row.sha256}.webp`;
        if (!coverObjectSha(objectPath) || !row.sha256.startsWith(prefix) || rows.has(row.sha256)
          || row.mirrorUrl !== new URL(objectPath, config.base).href
          || row.publicUrl !== new URL(objectPath, 'https://assets.bishojo.date/').href
          || row.mimeType !== 'image/webp' || row.evidenceFamily !== 'cover-v2-object'
          || ![row.bytes, row.width, row.height].every(n => Number.isSafeInteger(n) && n > 0)) throw Error('镜像对象证据无效');
        rows.set(row.sha256, row.mirrorUrl);
      }
      cache.set(prefix, rows);
      while (cache.size > maxShards) cache.delete(cache.keys().next().value);
      return rows;
    })();
    pending.set(prefix, task);
    const clear = () => pending.delete(prefix); task.then(clear, clear);
    return task;
  }
  return {
    peek(path) { const sha = coverObjectSha(path); return sha ? cache.get(sha[0])?.get(sha) ?? null : null; },
    async resolve(path) { const sha = coverObjectSha(path); return sha ? (await shard(sha[0])).get(sha) ?? null : null; }
  };
}

export const publicCoverMirror = createPublicCoverMirror();
