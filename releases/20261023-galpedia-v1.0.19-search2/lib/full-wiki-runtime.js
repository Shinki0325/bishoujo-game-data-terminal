const SCHEMA = 'terminal-wiki-full-runtime-ready-v1';
const CATALOG_COLUMNS = Object.freeze(['presentationWorkId', 'displayTitle', 'nameVariants', 'defaultEgsWorkId', 'releaseDate', 'score', 'voteCount', 'coverAvailable', 'flags', 'detailBucket']);
const SHA256 = /^[a-f0-9]{64}$/u;
const BUCKET = /^[a-f0-9]{2}$/u;
const ENTITY_KEYS = Object.freeze({ companies: 'sourceCompanyId', persons: 'sourcePersonId', characters: 'characterId' });
import { createResourceRequest } from './resource-request.js';

async function digest(bytes, cryptoRef) {
  const value = await cryptoRef.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(value), item => item.toString(16).padStart(2, '0')).join('');
}

function validateRelativePath(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.startsWith('/') || value.includes('..') || /^[a-z][a-z0-9+.-]*:/iu.test(value)) {
    throw new TypeError('全量资料清单包含无效路径');
  }
  return value;
}

function validateDescriptor(value) {
  if (!value || !Number.isSafeInteger(value.bytes) || value.bytes < 1 || !SHA256.test(value.sha256)) throw new TypeError('全量资料清单缺少完整校验值');
  validateRelativePath(value.path);
  return value;
}

function validateShardList(items, pathForBucket) {
  if (!Array.isArray(items) || items.length !== 256) throw new TypeError('全量资料分片清单不完整');
  const seen = new Set();
  for (const item of items) {
    validateDescriptor(item);
    if (!BUCKET.test(item.bucket) || seen.has(item.bucket) || item.path !== pathForBucket(item.bucket) || !Number.isSafeInteger(item.records) || item.records < 0) {
      throw new TypeError('全量资料分片路由无效');
    }
    seen.add(item.bucket);
  }
  return items;
}

async function readJson(url, descriptor, { request, cryptoRef, cacheMode }) {
  validateDescriptor(descriptor);
  const bytes = await request(url, { cache: cacheMode, label: `全量资料 ${descriptor.path}`, validationKey: descriptor.sha256, validate: async value => {
    if (value.byteLength !== descriptor.bytes || await digest(value, cryptoRef) !== descriptor.sha256) throw new Error('全量资料校验失败，请重试');
    return value;
  }});
  return JSON.parse(new TextDecoder().decode(bytes));
}

function validateManifest(value, expectedCounts, expectedPublicationStatus) {
  if (value?.schemaVersion !== SCHEMA || value.publicationStatus !== expectedPublicationStatus) throw new TypeError('全量资料版本不兼容');
  if (value.bucketContract?.algorithm !== 'sha256(UTF-8 id)[0:2]' || value.bucketContract?.bucketCount !== 256) throw new TypeError('全量资料分片规则不兼容');
  if (
    value.counts?.editions !== expectedCounts.editions
    || value.counts?.presentations !== expectedCounts.presentations
  ) throw new TypeError('全量资料数量不兼容');
  const files = value.files;
  for (const key of ['catalogIndex', 'editionIndex', 'bootstrap']) validateDescriptor(files?.[key]);
  validateShardList(files?.workShards, bucketId => `works/${bucketId}.json`);
  validateShardList(files?.graphRelationShards, bucketId => `graph-relations/${bucketId}.json`);
  for (const entityType of Object.keys(ENTITY_KEYS)) {
    const group = files?.entityShards?.[entityType];
    if (!group || group.records !== value.counts[entityType]) throw new TypeError('全量实体分片计数无效');
    validateShardList(group.files, bucketId => `entities/${entityType}/${bucketId}.json`);
  }
  for (const entityType of ['companies', 'persons']) {
    const group = files?.entityRelationShards?.[entityType];
    if (!group || !Number.isSafeInteger(group.entities) || !Number.isSafeInteger(group.workRelations) || !Number.isSafeInteger(group.graphRelations)) throw new TypeError('全量反向关系分片计数无效');
    validateShardList(group.files, bucketId => `relations/${entityType}/${bucketId}.json`);
  }
  return value;
}

export function createFullWikiRuntime({ manifestUrl, expectedManifestSha256, expectedCounts = { editions: 34941, presentations: 30612 }, expectedPublicationStatus = 'release-candidate', fetchImpl = globalThis.fetch, cryptoRef = globalThis.crypto, cacheMode = 'force-cache', maxWorkShards = 32, maxEntityShards = 64, maxGraphShards = 16 } = {}) {
  if (!(manifestUrl instanceof URL) || !SHA256.test(expectedManifestSha256 || '')) throw new TypeError('全量资料入口配置无效');
  if (typeof fetchImpl !== 'function' || !cryptoRef?.subtle?.digest) throw new TypeError('全量资料运行时需要 fetch 和 Web Crypto');
  if (typeof expectedPublicationStatus !== 'string' || !expectedPublicationStatus) throw new TypeError('全量资料发布状态配置无效');
  if (!Number.isSafeInteger(expectedCounts?.editions) || !Number.isSafeInteger(expectedCounts?.presentations)) throw new TypeError('全量资料计数配置无效');
  if (!Number.isSafeInteger(maxWorkShards) || maxWorkShards < 1) throw new TypeError('全量资料缓存上限无效');
  if (!Number.isSafeInteger(maxEntityShards) || maxEntityShards < 1 || !Number.isSafeInteger(maxGraphShards) || maxGraphShards < 1) throw new TypeError('全量关系缓存上限无效');
  const request = createResourceRequest({ fetchImpl });
  let manifestPromise = null;
  let catalogPromise = null;
  let editionPromise = null;
  const shardPromises = new Map();
  const shardCache = new Map();
  const entityShardPromises = new Map();
  const entityShardCache = new Map();
  const graphShardPromises = new Map();
  const graphShardCache = new Map();
  const relationShardPromises = new Map();
  const relationShardCache = new Map();

  async function bucketFor(value) {
    return (await digest(new TextEncoder().encode(String(value)), cryptoRef)).slice(0, 2);
  }

  async function loadManifest() {
    if (manifestPromise) return manifestPromise;
    manifestPromise = (async () => {
      const bytes = await request(manifestUrl, { cache: cacheMode, label: '全量资料入口', validationKey: expectedManifestSha256, validate: async value => {
        if (await digest(value, cryptoRef) !== expectedManifestSha256) throw new Error('全量资料入口校验失败，请重试');
        return value;
      }});
      return Object.freeze(validateManifest(JSON.parse(new TextDecoder().decode(bytes)), expectedCounts, expectedPublicationStatus));
    })().catch(error => { manifestPromise = null; throw error; });
    return manifestPromise;
  }

  async function loadCatalog() {
    if (catalogPromise) return catalogPromise;
    catalogPromise = (async () => {
      const manifest = await loadManifest();
      const payload = await readJson(new URL(manifest.files.catalogIndex.path, manifestUrl), manifest.files.catalogIndex, { request, cryptoRef, cacheMode });
      if (payload.schemaVersion !== SCHEMA || JSON.stringify(payload.columns) !== JSON.stringify(CATALOG_COLUMNS) || !Array.isArray(payload.table) || payload.table.length !== manifest.counts.presentations) throw new TypeError('全量作品轻索引格式无效');
      const records = payload.table.map(row => {
        if (!Array.isArray(row) || row.length !== CATALOG_COLUMNS.length) throw new TypeError('全量作品轻索引列数无效');
        return Object.freeze(Object.fromEntries(CATALOG_COLUMNS.map((key, index) => [key, row[index]])));
      });
      const byId = new Map();
      for (const record of records) {
        if (!record.presentationWorkId || byId.has(record.presentationWorkId) || !BUCKET.test(record.detailBucket)) throw new TypeError('全量作品轻索引身份无效');
        byId.set(record.presentationWorkId, record);
      }
      return Object.freeze({ records: Object.freeze(records), byId, flagBits: Object.freeze({ ...payload.flagBits }) });
    })().catch(error => { catalogPromise = null; throw error; });
    return catalogPromise;
  }

  async function loadEditionIndex() {
    if (editionPromise) return editionPromise;
    editionPromise = (async () => {
      const manifest = await loadManifest();
      const payload = await readJson(new URL(manifest.files.editionIndex.path, manifestUrl), manifest.files.editionIndex, { request, cryptoRef, cacheMode });
      if (payload.schemaVersion !== SCHEMA || !Array.isArray(payload.records) || payload.records.length !== manifest.counts.editions) throw new TypeError('全量版本索引格式无效');
      const byId = new Map();
      for (const record of payload.records) {
        const id = String(record?.egsWorkId || '');
        if (!id || byId.has(id) || !record.presentationWorkId || !BUCKET.test(record.detailBucket)) throw new TypeError('全量版本索引身份无效');
        byId.set(id, Object.freeze({ ...record, egsWorkId: id }));
      }
      return byId;
    })().catch(error => { editionPromise = null; throw error; });
    return editionPromise;
  }

  async function loadWorkShard(bucketId) {
    if (!BUCKET.test(bucketId)) throw new TypeError('全量作品分片键无效');
    if (shardCache.has(bucketId)) {
      const value = shardCache.get(bucketId); shardCache.delete(bucketId); shardCache.set(bucketId, value); return value;
    }
    if (shardPromises.has(bucketId)) return shardPromises.get(bucketId);
    const promise = (async () => {
      const manifest = await loadManifest();
      const descriptor = manifest.files.workShards.find(item => item.bucket === bucketId);
      if (!descriptor) throw new Error(`全量作品分片不存在: ${bucketId}`);
      const payload = await readJson(new URL(descriptor.path, manifestUrl), descriptor, { request, cryptoRef, cacheMode });
      if (payload.schemaVersion !== SCHEMA || payload.bucket !== bucketId || !Array.isArray(payload.records) || payload.records.length !== descriptor.records) throw new TypeError(`全量作品分片格式无效: ${bucketId}`);
      const byId = new Map();
      for (const record of payload.records) {
        const id = record?.presentation?.presentationWorkId;
        if (!id || byId.has(id)) throw new TypeError(`全量作品分片身份无效: ${bucketId}`);
        byId.set(id, Object.freeze(record));
      }
      shardCache.set(bucketId, byId);
      while (shardCache.size > maxWorkShards) shardCache.delete(shardCache.keys().next().value);
      return byId;
    })().catch(error => { shardCache.delete(bucketId); throw error; }).finally(() => shardPromises.delete(bucketId));
    shardPromises.set(bucketId, promise);
    return promise;
  }

  async function loadEntityShard(entityType, bucketId) {
    const idField = ENTITY_KEYS[entityType];
    if (!idField || !BUCKET.test(bucketId)) throw new TypeError('全量实体分片键无效');
    const cacheKey = `${entityType}:${bucketId}`;
    if (entityShardCache.has(cacheKey)) {
      const value = entityShardCache.get(cacheKey); entityShardCache.delete(cacheKey); entityShardCache.set(cacheKey, value); return value;
    }
    if (entityShardPromises.has(cacheKey)) return entityShardPromises.get(cacheKey);
    const promise = (async () => {
      const manifest = await loadManifest();
      const descriptor = manifest.files.entityShards[entityType].files.find(item => item.bucket === bucketId);
      if (!descriptor) throw new Error(`全量实体分片不存在: ${cacheKey}`);
      const payload = await readJson(new URL(descriptor.path, manifestUrl), descriptor, { request, cryptoRef, cacheMode });
      if (payload.schemaVersion !== SCHEMA || payload.entityType !== entityType || payload.bucket !== bucketId || !Array.isArray(payload.records) || payload.records.length !== descriptor.records) throw new TypeError(`全量实体分片格式无效: ${cacheKey}`);
      const byId = new Map();
      for (const record of payload.records) {
        const id = String(record?.[idField] || '');
        if (!id || byId.has(id)) throw new TypeError(`全量实体分片身份无效: ${cacheKey}`);
        byId.set(id, Object.freeze(record));
      }
      entityShardCache.set(cacheKey, byId);
      while (entityShardCache.size > maxEntityShards) entityShardCache.delete(entityShardCache.keys().next().value);
      return byId;
    })().catch(error => { entityShardCache.delete(cacheKey); throw error; }).finally(() => entityShardPromises.delete(cacheKey));
    entityShardPromises.set(cacheKey, promise);
    return promise;
  }

  async function loadEntity(entityType, sourceEntityId) {
    const id = String(sourceEntityId || '');
    if (!id || !ENTITY_KEYS[entityType]) return null;
    return (await loadEntityShard(entityType, await bucketFor(id))).get(id) ?? null;
  }

  async function loadEntities(entityType, sourceEntityIds) {
    if (!Array.isArray(sourceEntityIds) || !ENTITY_KEYS[entityType]) throw new TypeError('全量实体批量查询无效');
    const ids = [...new Set(sourceEntityIds.map(value => String(value || '')).filter(Boolean))];
    const buckets = new Map();
    const routes = await Promise.all(ids.map(async id => [id, await bucketFor(id)]));
    for (const [id, bucketId] of routes) {
      const values = buckets.get(bucketId) ?? [];
      values.push(id); buckets.set(bucketId, values);
    }
    const loaded = new Map(await Promise.all([...buckets].map(async ([bucketId]) => [bucketId, await loadEntityShard(entityType, bucketId)])));
    return Object.freeze(routes.map(([id, bucketId]) => loaded.get(bucketId).get(id)).filter(Boolean));
  }

  async function loadGraphRelation(relationId) {
    const id = String(relationId || '');
    if (!id) return null;
    const bucketId = await bucketFor(id);
    if (graphShardCache.has(bucketId)) {
      const value = graphShardCache.get(bucketId); graphShardCache.delete(bucketId); graphShardCache.set(bucketId, value); return value.get(id) ?? null;
    }
    if (!graphShardPromises.has(bucketId)) {
      const promise = (async () => {
        const manifest = await loadManifest();
        const descriptor = manifest.files.graphRelationShards.find(item => item.bucket === bucketId);
        if (!descriptor) throw new Error(`全量图关系分片不存在: ${bucketId}`);
        const payload = await readJson(new URL(descriptor.path, manifestUrl), descriptor, { request, cryptoRef, cacheMode });
        if (payload.schemaVersion !== SCHEMA || payload.bucket !== bucketId || !Array.isArray(payload.records) || payload.records.length !== descriptor.records) throw new TypeError(`全量图关系分片格式无效: ${bucketId}`);
        const byId = new Map();
        for (const record of payload.records) {
          const relationKey = String(record?.relationId || '');
          if (!relationKey || byId.has(relationKey)) throw new TypeError(`全量图关系身份无效: ${bucketId}`);
          byId.set(relationKey, Object.freeze(record));
        }
        graphShardCache.set(bucketId, byId);
        while (graphShardCache.size > maxGraphShards) graphShardCache.delete(graphShardCache.keys().next().value);
        return byId;
      })().catch(error => { graphShardCache.delete(bucketId); throw error; }).finally(() => graphShardPromises.delete(bucketId));
      graphShardPromises.set(bucketId, promise);
    }
    return (await graphShardPromises.get(bucketId)).get(id) ?? null;
  }

  async function loadEntityRelations(entityType, canonicalEntityId) {
    if (!['companies', 'persons'].includes(entityType)) throw new TypeError('全量反向关系实体类型无效');
    const id = String(canonicalEntityId || '');
    if (!id) return null;
    const bucketId = await bucketFor(id);
    const cacheKey = `${entityType}:${bucketId}`;
    if (relationShardCache.has(cacheKey)) {
      const value = relationShardCache.get(cacheKey); relationShardCache.delete(cacheKey); relationShardCache.set(cacheKey, value); return value.get(id) ?? null;
    }
    if (!relationShardPromises.has(cacheKey)) {
      const promise = (async () => {
        const manifest = await loadManifest();
        const descriptor = manifest.files.entityRelationShards[entityType].files.find(item => item.bucket === bucketId);
        if (!descriptor) throw new Error(`全量反向关系分片不存在: ${cacheKey}`);
        const payload = await readJson(new URL(descriptor.path, manifestUrl), descriptor, { request, cryptoRef, cacheMode });
        if (payload.schemaVersion !== SCHEMA || payload.entityType !== entityType || payload.bucket !== bucketId || !Array.isArray(payload.records) || payload.records.length !== descriptor.records) throw new TypeError(`全量反向关系分片格式无效: ${cacheKey}`);
        const byId = new Map();
        for (const record of payload.records) {
          const relationEntityId = String(record?.canonicalEntityId || '');
          if (!relationEntityId || byId.has(relationEntityId) || !Array.isArray(record.workRelations) || !Array.isArray(record.graphRelations)) throw new TypeError(`全量反向关系身份无效: ${cacheKey}`);
          byId.set(relationEntityId, Object.freeze(record));
        }
        relationShardCache.set(cacheKey, byId);
        while (relationShardCache.size > maxEntityShards) relationShardCache.delete(relationShardCache.keys().next().value);
        return byId;
      })().catch(error => { relationShardCache.delete(cacheKey); throw error; }).finally(() => relationShardPromises.delete(cacheKey));
      relationShardPromises.set(cacheKey, promise);
    }
    return (await relationShardPromises.get(cacheKey)).get(id) ?? null;
  }

  async function resolveEntityRelations(entityType, sourceEntityId) {
    const entity = await loadEntity(entityType, sourceEntityId);
    if (!entity) return null;
    const relations = await loadEntityRelations(entityType, entity.canonicalEntityId);
    return Object.freeze({ entity, relations });
  }

  async function hydratePresentationRelations(presentationWorkId) {
    const work = await loadPresentation(presentationWorkId);
    if (!work) return null;
    const bangumiCompanies = work.bangumiRelations
      .filter(item => item.sourceEntityCategory === 'company')
      .map(item => item.sourceCompanyId || item.canonicalEntityId);
    const bangumiPersons = work.bangumiRelations
      .filter(item => item.sourceEntityCategory === 'person')
      .map(item => item.sourcePersonId || item.canonicalEntityId);
    const [companiesResult, personsResult, charactersResult] = await Promise.allSettled([
      loadEntities('companies', [...work.companyRelations.map(item => item.sourceCompanyId || item.canonicalEntityId), ...bangumiCompanies]),
      loadEntities('persons', [...work.personRelations.map(item => item.sourcePersonId || item.canonicalEntityId), ...bangumiPersons]),
      loadEntities('characters', work.characterRelations.map(item => item.characterId))
    ]);
    const optional = (result, label) => {
      if (result.status === 'fulfilled') return result.value;
      console.warn(`全量作品资料局部加载失败: ${label}`, result.reason);
      return [];
    };
    const companies = optional(companiesResult, 'companies');
    const persons = optional(personsResult, 'persons');
    const characters = optional(charactersResult, 'characters');
    return Object.freeze({ work, companies, persons, characters });
  }

  async function loadPresentation(presentationWorkId) {
    const id = String(presentationWorkId || '');
    const catalog = await loadCatalog();
    const summary = catalog.byId.get(id);
    if (!summary) return null;
    const record = (await loadWorkShard(summary.detailBucket)).get(id);
    if (!record) throw new Error(`全量作品详情缺失: ${id}`);
    return record;
  }

  return Object.freeze({
    loadManifest,
    loadCatalog,
    bucketFor,
    async resolveEdition(egsWorkId) { return (await loadEditionIndex()).get(String(egsWorkId)) ?? null; },
    loadPresentation,
    loadEntity,
    loadEntities,
    loadGraphRelation,
    loadEntityRelations,
    resolveEntityRelations,
    hydratePresentationRelations,
    async loadEdition(egsWorkId) {
      const route = await loadEditionIndex().then(index => index.get(String(egsWorkId)) ?? null);
      if (!route) return null;
      const work = await loadPresentation(route.presentationWorkId);
      const edition = work?.editions.find(item => String(item.egsWorkId) === String(egsWorkId));
      if (!edition) throw new Error(`全量版本详情缺失: ${egsWorkId}`);
      return Object.freeze({ route, presentation: work.presentation, edition, relations: work });
    },
    clear() { manifestPromise = null; catalogPromise = null; editionPromise = null; shardPromises.clear(); shardCache.clear(); entityShardPromises.clear(); entityShardCache.clear(); graphShardPromises.clear(); graphShardCache.clear(); relationShardPromises.clear(); relationShardCache.clear(); },
    stats() { return Object.freeze({ manifestLoaded: Boolean(manifestPromise), catalogLoaded: Boolean(catalogPromise), editionIndexLoaded: Boolean(editionPromise), cachedWorkShards: shardCache.size, pendingWorkShards: shardPromises.size, cachedEntityShards: entityShardCache.size, pendingEntityShards: entityShardPromises.size, cachedGraphShards: graphShardCache.size, pendingGraphShards: graphShardPromises.size, cachedRelationShards: relationShardCache.size, pendingRelationShards: relationShardPromises.size }); }
  });
}

export { CATALOG_COLUMNS, ENTITY_KEYS, SCHEMA as FULL_WIKI_RUNTIME_SCHEMA };
