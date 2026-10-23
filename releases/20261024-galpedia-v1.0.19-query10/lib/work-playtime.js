import { WORK_PLAYTIME } from './work-playtime-config.js';
import { reviewedEditionWork } from './reviewed-edition-work.js';
import { CREDIT_SCOPE } from './credit-scope-config.js';
import { createResourceRequest } from './resource-request.js';

export const PLAYTIME_SHARD_VERSION = 2;

export function playtimeSourceId(work) {
  const scoped = reviewedEditionWork(work);
  const id = scoped?.sourceIds?.vndb ?? scoped?.fullWikiRatings?.vndbId;
  return /^v[1-9]\d*$/.test(id ?? '') ? id : null;
}

export function formatPlaytime(minutes) {
  if (!Number.isSafeInteger(minutes) || minutes <= 0) return null;
  if (minutes < 60) return `约 ${minutes} 分钟`;
  // One decimal is enough for a community estimate; retain exact minutes in the source details.
  return `约 ${Number((minutes / 60).toFixed(1))} 小时`;
}

export function createPlaytimeClient({ config = WORK_PLAYTIME, fetchImpl = globalThis.fetch, cryptoRef = globalThis.crypto } = {}) {
  const cache = new Map(), request = createResourceRequest({ fetchImpl });
  async function load(work) {
    const id = playtimeSourceId(work);
    if (!id) return null;
    const reviewed = CREDIT_SCOPE.familyCorrections?.[String(work?.workId)]?.observation;
    const fallback = reviewed?.sourceId === id && formatPlaytime(reviewed.lengthMinutes)
      && Number.isSafeInteger(reviewed.lengthVotes) && reviewed.lengthVotes > 0
      && Number.isFinite(Date.parse(reviewed.retrievedAt))
      ? {minutes:reviewed.lengthMinutes,votes:reviewed.lengthVotes,observedAt:reviewed.retrievedAt} : null;
    const bucket = String(Number(id.slice(1)) % 32), descriptor = config.shards[bucket];
    if (!descriptor || !/^[0-9a-f]{2}(?:-[0-9a-f]{64})?\.json$/.test(descriptor.path) || descriptor.bytes > 100000 || !/^[0-9a-f]{64}$/.test(descriptor.sha256)) throw Error('时长资料描述无效');
    if (!cache.has(bucket)) {
      const promise = request(new URL(descriptor.path, new URL(config.baseUrl, import.meta.url)), {
        label: '游玩时长', validationKey: `${config.revision}:${descriptor.sha256}`,
        validate: async bytes => {
          const digest = Array.from(new Uint8Array(await cryptoRef.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');
          if (bytes.byteLength !== descriptor.bytes || digest !== descriptor.sha256) throw Error('时长资料摘要不符');
          const data = JSON.parse(new TextDecoder().decode(bytes));
          if (data.schema !== 'galpedia-vndb-playtime-shard-v1' || data.revision !== (descriptor.revision ?? config.revision) || !data.rows) throw Error('时长资料修订不符');
          for (const [key, row] of Object.entries(data.rows)) {
            if (!/^v[1-9]\d*$/.test(key) || String(Number(key.slice(1)) % 32) !== bucket || !formatPlaytime(row.minutes) || !Number.isSafeInteger(row.votes) || row.votes < 1 || !Number.isFinite(Date.parse(row.observedAt))) throw Error('时长资料无效');
          }
          return data.rows;
        }
      }).catch(error => { cache.delete(bucket); throw error; });
      cache.set(bucket, promise);
      while (cache.size > 8) cache.delete(cache.keys().next().value);
    }
    const current = (await cache.get(bucket))[id];
    const row = fallback && (!current || Date.parse(fallback.observedAt) > Date.parse(current.observedAt)) ? fallback : current;
    return row ? { ...row, sourceId: id, label: formatPlaytime(row.minutes) } : null;
  }
  return Object.freeze({ load });
}

export const playtimeClient = createPlaytimeClient();
