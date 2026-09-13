import { PERSON_STATIC } from './person-static-config.js';
import { createResourceRequest } from './resource-request.js';
import { filterPersonsBySearch } from './person-search.js';

export function createStaticPersonClient({ config = PERSON_STATIC, fetchImpl = globalThis.fetch,
  cryptoRef = globalThis.crypto, requestPolicy = {}, maxCacheBytes = 32 * 1024 * 1024 } = {}) {
  const manifestUrl = new URL(config.url, import.meta.url);
  const baseUrl = new URL('./', manifestUrl);
  const request = createResourceRequest({ fetchImpl, ...requestPolicy });
  const cache = new Map();
  let cacheBytes = 0;
  const digest = async bytes => Array.from(new Uint8Array(await cryptoRef.subtle.digest('SHA-256', bytes)),
    value => value.toString(16).padStart(2, '0')).join('');
  const read = async (descriptor, schema, validate = () => {}) => {
    if (!/^[a-z0-9-]+\.json$/u.test(descriptor?.path ?? '')
      || !/^[a-f0-9]{64}$/u.test(descriptor.sha256 ?? '')
      || !Number.isSafeInteger(descriptor.bytes) || descriptor.bytes < 1 || descriptor.bytes > 64 * 1024 * 1024) {
      throw new TypeError('人物静态文件描述无效');
    }
    const url = new URL(descriptor.path, baseUrl), key = descriptor.sha256;
    if (cache.has(key)) {
      const entry = cache.get(key); cache.delete(key); cache.set(key, entry); return entry.promise;
    }
    const entry = { bytes: 0, promise: null };
    entry.promise = request(url, { label: '人物目录', validationKey: `${config.revision}:${schema}:${key}`,
      validate: async bytes => {
        if (bytes.byteLength !== descriptor.bytes || await digest(bytes) !== key) throw Error('人物目录内容摘要不符');
        const value = JSON.parse(new TextDecoder().decode(bytes));
        if (value.schema !== schema || value.revision !== config.revision) throw Error('人物目录版本不符');
        validate(value); return value;
      }
    }).then(value => {
      entry.bytes = descriptor.bytes; cacheBytes += entry.bytes;
      for (const [oldKey, oldEntry] of cache) {
        if (cacheBytes <= maxCacheBytes) break;
        if (!oldEntry.bytes) continue;
        cache.delete(oldKey); cacheBytes -= oldEntry.bytes;
      }
      return value;
    }).catch(error => { cache.delete(key); throw error; });
    cache.set(key, entry);
    return entry.promise;
  };
  const manifest = () => read(config, 'galpedia-person-static-manifest-v1', value => {
    if (!Number.isSafeInteger(value.count) || value.count < 1 || value.pageSize !== 48
      || !Number.isSafeInteger(value.partSize) || value.partSize < 1
      || !Array.isArray(value.parts) || value.parts.length !== Math.ceil(value.count / value.partSize)
      || !value.roleCounts || Object.values(value.roleCounts).reduce((sum, n) => sum + n, 0) !== value.count) {
      throw Error('人物目录清单计数无效');
    }
  });
  const validRows = value => {
    if (!Array.isArray(value.rows) || value.rows.some(row => !/^per_[A-Za-z0-9]+$/u.test(row.entityId ?? ''))
      || new Set(value.rows.map(row => row.entityId)).size !== value.rows.length) throw Error('人物目录身份无效');
  };
  const loadPart = (site, part) => read(site.parts[part], 'galpedia-person-static-part-v1', value => {
    validRows(value);
    if (value.part !== part || value.rows.length !== Math.min(site.partSize, site.count - part * site.partSize)) throw Error('人物目录分块计数无效');
  });
  return Object.freeze({
    async getPage({ query = '', role = 'all', pageNumber = 1 } = {}) {
      const site = await manifest();
      const requested = Number.isSafeInteger(Number(pageNumber)) && Number(pageNumber) > 0 ? Number(pageNumber) : 1;
      let count = site.count, roleCounts = site.roleCounts, selected = null, searchCount = site.count;
      if (String(query).trim() || role !== 'all') {
        const index = await read(site.query, 'galpedia-person-static-query-v1', value => {
          validRows(value);
          if (value.rows.length !== site.count || value.rows.some(row => !Number.isSafeInteger(row.part)
            || row.part < 0 || row.part >= site.parts.length || typeof row.searchKey !== 'string'
            || typeof row.pinyinSearchKey !== 'string')) throw Error('人物检索索引无效');
        });
        const searched = filterPersonsBySearch(index.rows, query);
        roleCounts = {};
        for (const row of searched) roleCounts[row.primaryRole] = (roleCounts[row.primaryRole] ?? 0) + 1;
        searchCount = searched.length;
        selected = role === 'all' ? searched : searched.filter(row => row.primaryRole === role);
        count = selected.length;
      }
      const pageCount = Math.max(1, Math.ceil(count / site.pageSize)), page = Math.min(requested, pageCount);
      const start = (page - 1) * site.pageSize;
      let persons;
      if (!selected && page === 1) {
        persons = (await read(site.firstPage, 'galpedia-person-static-page-v1', value => {
          validRows(value); if (value.rows.length !== Math.min(site.count, site.pageSize)) throw Error('人物首屏计数无效');
        })).rows;
      } else if (selected) {
        const visible = selected.slice(start, start + site.pageSize);
        const chunks = await Promise.all([...new Set(visible.map(row => row.part))].map(part => loadPart(site, part)));
        const byId = new Map(chunks.flatMap(chunk => chunk.rows).map(row => [row.entityId, row]));
        persons = visible.map(row => byId.get(row.entityId));
        if (persons.some(row => !row)) throw Error('人物检索身份未在分块中登记');
      } else {
        const end = Math.min(count, start + site.pageSize), chunks = [];
        for (let part = Math.floor(start / site.partSize); part <= Math.floor((end - 1) / site.partSize); part++) {
          chunks.push((await loadPart(site, part)).rows);
        }
        persons = chunks.flat().slice(start % site.partSize, start % site.partSize + end - start);
      }
      return { persons, totalPersonCount: site.count, activityAxis: site.activityAxis,
        remotePage: { pageNumber: page, pageCount, totalCount: count, roleCounts, searchCount } };
    }
  });
}
