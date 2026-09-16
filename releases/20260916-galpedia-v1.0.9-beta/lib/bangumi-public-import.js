const SUBJECT_ID_PATTERN = /^[1-9][0-9]*$/u;
const MAX_USER_IDENTIFIER_LENGTH = 128;
const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 100;
const DEFAULT_MAX_PAGES = 100;

export class BangumiPublicImportError extends Error {
  constructor(message, code = 'BANGUMI_PUBLIC_IMPORT_ERROR') {
    super(message);
    this.name = 'BangumiPublicImportError';
    this.code = code;
  }
}

function requirePlainObject(value, name) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new BangumiPublicImportError(`${name} 格式无效，请稍后重试。`, 'INVALID_RESPONSE');
  }
  return value;
}

function requireArray(value, name) {
  if (!Array.isArray(value)) {
    throw new BangumiPublicImportError(`${name} 格式无效，请稍后重试。`, 'INVALID_RESPONSE');
  }
  return value;
}

function asSubjectId(value, name) {
  const subjectId = typeof value === 'number' ? String(value) : value;
  if (typeof subjectId !== 'string' || !SUBJECT_ID_PATTERN.test(subjectId)) {
    throw new BangumiPublicImportError(`${name} 缺少有效作品编号，请稍后重试。`, 'INVALID_RESPONSE');
  }
  return subjectId;
}

function optionalString(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function optionalRate(value) {
  return Number.isInteger(value) && value >= 0 && value <= 10 ? value : null;
}

function optionalCollectionType(value) {
  return Number.isInteger(value) && value >= 1 && value <= 5 ? value : null;
}

function normalizeCollection(value, index) {
  const collection = requirePlainObject(value, `第 ${index + 1} 条公开收藏`);
  const subject = collection.subject === undefined || collection.subject === null
    ? null
    : requirePlainObject(collection.subject, `第 ${index + 1} 条公开收藏的作品`);
  const subjectId = asSubjectId(
    collection.subjectId ?? collection.subject_id ?? subject?.id,
    `第 ${index + 1} 条公开收藏`
  );
  const title = optionalString(collection.title)
    ?? optionalString(subject?.name_cn)
    ?? optionalString(subject?.name)
    ?? `Bangumi #${subjectId}`;
  return Object.freeze({
    subjectId,
    title,
    collectionType: optionalCollectionType(collection.collectionType ?? collection.type),
    personalRate: optionalRate(collection.personalRate ?? collection.rate)
  });
}

function normalizePagePayload(value) {
  const payload = requirePlainObject(value, 'Bangumi 公开收藏响应');
  if (!Number.isSafeInteger(payload.total) || payload.total < 0) {
    throw new BangumiPublicImportError('Bangumi 返回的收藏总数无效，请稍后重试。', 'INVALID_RESPONSE');
  }
  const rows = requireArray(payload.data, 'Bangumi 公开收藏列表');
  return Object.freeze({
    total: payload.total,
    collections: Object.freeze(rows.map(normalizeCollection))
  });
}

function uniqueStringIds(value, name) {
  if (!Array.isArray(value)) throw new TypeError(`${name} must be an array`);
  const seen = new Set();
  const ids = [];
  for (const id of value) {
    if (typeof id !== 'string' || id.length === 0) throw new TypeError(`${name} must contain non-empty strings`);
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

export function normalizeBangumiUserIdentifier(value) {
  if (typeof value !== 'string') {
    throw new BangumiPublicImportError('请输入 Bangumi 用户名或 UID。', 'INVALID_USER_IDENTIFIER');
  }
  const trimmed = value.trim();
  const profile = /^https?:\/\/(?:bangumi\.tv|bgm\.tv|chii\.in)\/user\/([^/?#]+)\/?(?:[?#].*)?$/iu.exec(trimmed);
  const identifier = profile === null ? trimmed : decodeURIComponent(profile[1]);
  if (
    identifier.length === 0
    || identifier.length > MAX_USER_IDENTIFIER_LENGTH
    || /[\u0000-\u001f\u007f\s/#?]/u.test(identifier)
  ) {
    throw new BangumiPublicImportError('请输入有效的 Bangumi 用户名、UID 或个人主页链接。', 'INVALID_USER_IDENTIFIER');
  }
  return identifier;
}

export function bangumiCollectionUrl(userIdentifier, { offset = 0, limit = DEFAULT_PAGE_SIZE } = {}) {
  const userId = normalizeBangumiUserIdentifier(userIdentifier);
  if (!Number.isSafeInteger(offset) || offset < 0) throw new TypeError('offset must be a non-negative safe integer');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
    throw new TypeError(`limit must be an integer from 1 to ${MAX_PAGE_SIZE}`);
  }
  const params = new URLSearchParams({ subject_type: '4', limit: String(limit), offset: String(offset) });
  return `https://api.bgm.tv/v0/users/${encodeURIComponent(userId)}/collections?${params}`;
}

export async function fetchBangumiPublicGameCollections({
  userIdentifier,
  fetchImpl = globalThis.fetch,
  signal,
  pageSize = DEFAULT_PAGE_SIZE,
  maxPages = DEFAULT_MAX_PAGES
} = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function');
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    throw new TypeError(`pageSize must be an integer from 1 to ${MAX_PAGE_SIZE}`);
  }
  if (!Number.isSafeInteger(maxPages) || maxPages < 1) throw new TypeError('maxPages must be a positive safe integer');
  const userId = normalizeBangumiUserIdentifier(userIdentifier);
  const seenSubjectIds = new Set();
  const collections = [];
  let expectedTotal = null;
  let offset = 0;
  for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
    let response;
    try {
      response = await fetchImpl(bangumiCollectionUrl(userId, { offset, limit: pageSize }), {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal
      });
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      throw new BangumiPublicImportError('无法连接 Bangumi，请检查网络后重试。', 'NETWORK_ERROR');
    }
    if (!response || typeof response.ok !== 'boolean') {
      throw new BangumiPublicImportError('Bangumi 响应无效，请稍后重试。', 'INVALID_RESPONSE');
    }
    if (!response.ok) {
      const code = response.status === 404
        ? 'USER_NOT_FOUND'
        : response.status === 429 ? 'RATE_LIMITED' : 'HTTP_ERROR';
      const message = response.status === 404
        ? '未找到这个 Bangumi 用户，请检查用户名或 UID。'
        : response.status === 429
          ? 'Bangumi 请求过于频繁，请稍后再试。'
          : `Bangumi 暂时无法读取公开收藏（${response.status}）。`;
      throw new BangumiPublicImportError(message, code);
    }
    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new BangumiPublicImportError('Bangumi 返回的数据无法解析，请稍后重试。', 'INVALID_RESPONSE');
    }
    const page = normalizePagePayload(payload);
    if (expectedTotal === null) expectedTotal = page.total;
    else if (page.total !== expectedTotal) {
      throw new BangumiPublicImportError('读取期间收藏列表发生变化，请重新读取。', 'COLLECTION_CHANGED');
    }
    for (const collection of page.collections) {
      if (!seenSubjectIds.has(collection.subjectId)) {
        seenSubjectIds.add(collection.subjectId);
        collections.push(collection);
      }
    }
    offset += page.collections.length;
    if (offset >= expectedTotal) {
      return Object.freeze({
        userIdentifier: userId,
        reportedTotal: expectedTotal,
        collections: Object.freeze(collections)
      });
    }
    if (page.collections.length === 0) {
      throw new BangumiPublicImportError('Bangumi 未返回完整的公开收藏，请稍后重试。', 'INCOMPLETE_RESPONSE');
    }
  }
  throw new BangumiPublicImportError('Bangumi 公开收藏分页过多，已停止读取。', 'TOO_MANY_PAGES');
}

export function collectionTypeLabel(type) {
  return Object.freeze({
    1: '想玩',
    2: '玩过',
    3: '在玩',
    4: '搁置',
    5: '抛弃'
  })[type] ?? '未标注状态';
}

export function planBangumiPublicImport({
  collections,
  confirmedBindings,
  currentSelectedWorkIds,
  workLimit,
  presentationFamilyForWork = null
} = {}) {
  const sourceCollections = requireArray(collections, 'collections');
  const bindings = requireArray(confirmedBindings, 'confirmedBindings');
  const current = uniqueStringIds(currentSelectedWorkIds, 'currentSelectedWorkIds');
  if (!Number.isSafeInteger(workLimit) || workLimit < current.length) {
    throw new TypeError('workLimit must be a safe integer no smaller than currentSelectedWorkIds.length');
  }
  if (presentationFamilyForWork !== null && typeof presentationFamilyForWork !== 'function') {
    throw new TypeError('presentationFamilyForWork must be a function or null');
  }
  const subjectWorkIds = new Map();
  for (const [index, binding] of bindings.entries()) {
    if (binding === null || typeof binding !== 'object' || Array.isArray(binding)) {
      throw new TypeError(`confirmedBindings[${index}] must be an object`);
    }
    if (binding.relation !== 'same-work') continue;
    const subjectId = asSubjectId(binding.bangumiSubjectId, `confirmedBindings[${index}].bangumiSubjectId`);
    if (typeof binding.egsWorkId !== 'string' || binding.egsWorkId.length === 0) {
      throw new TypeError(`confirmedBindings[${index}].egsWorkId must be a non-empty string`);
    }
    const workIds = subjectWorkIds.get(subjectId) ?? [];
    if (!workIds.includes(binding.egsWorkId)) workIds.push(binding.egsWorkId);
    subjectWorkIds.set(subjectId, workIds);
  }
  const selectedSet = new Set(current);
  const matched = [];
  const unmatched = [];
  const plannedWorkIds = [];
  const plannedSet = new Set();
  const optionalWorkIds = [];
  const optionalSet = new Set();
  for (const [index, rawCollection] of sourceCollections.entries()) {
    const collection = normalizeCollection(rawCollection, index);
    const workIds = subjectWorkIds.get(collection.subjectId);
    if (workIds === undefined) {
      unmatched.push(collection);
      continue;
    }
    const familyByPrimaryWorkId = new Map();
    for (const workId of workIds) {
      const family = presentationFamilyForWork?.(workId) ?? null;
      if (family === null) {
        familyByPrimaryWorkId.set(workId, null);
        continue;
      }
      if (
        typeof family !== 'object'
        || typeof family.defaultWorkId !== 'string'
        || !Array.isArray(family.catalogMemberWorkIds)
        || !family.catalogMemberWorkIds.includes(family.defaultWorkId)
      ) {
        throw new TypeError(`presentation family for work ${workId} is invalid`);
      }
      familyByPrimaryWorkId.set(family.defaultWorkId, family);
    }
    const primaryWorkIds = [...familyByPrimaryWorkId.keys()];
    const collectionOptionalWorkIds = [];
    const collectionOptionalSet = new Set();
    const alreadySelectedPrimaryWorkIds = [];
    const selectablePrimaryWorkIds = [];
    for (const primaryWorkId of primaryWorkIds) {
      const family = familyByPrimaryWorkId.get(primaryWorkId);
      const familyWorkIds = family?.catalogMemberWorkIds ?? [primaryWorkId];
      if (familyWorkIds.some(workId => selectedSet.has(workId))) alreadySelectedPrimaryWorkIds.push(primaryWorkId);
      else selectablePrimaryWorkIds.push(primaryWorkId);
      for (const memberWorkId of familyWorkIds) {
        if (memberWorkId !== primaryWorkId && !collectionOptionalSet.has(memberWorkId)) {
          collectionOptionalSet.add(memberWorkId);
          collectionOptionalWorkIds.push(memberWorkId);
          if (!optionalSet.has(memberWorkId)) {
            optionalSet.add(memberWorkId);
            optionalWorkIds.push(memberWorkId);
          }
        }
      }
    }
    for (const workId of selectablePrimaryWorkIds) {
      if (!plannedSet.has(workId)) {
        plannedSet.add(workId);
        plannedWorkIds.push(workId);
      }
    }
    const filteredCollectionOptionalWorkIds = collectionOptionalWorkIds.filter(workId => !primaryWorkIds.includes(workId));
    const alreadySelectedOptionalWorkIds = filteredCollectionOptionalWorkIds.filter(workId => selectedSet.has(workId));
    const selectableOptionalWorkIds = filteredCollectionOptionalWorkIds.filter(workId => !selectedSet.has(workId));
    matched.push(Object.freeze({
      ...collection,
      workIds: Object.freeze([...workIds]),
      primaryWorkIds: Object.freeze(primaryWorkIds),
      alreadySelectedPrimaryWorkIds: Object.freeze(alreadySelectedPrimaryWorkIds),
      selectablePrimaryWorkIds: Object.freeze(selectablePrimaryWorkIds),
      optionalWorkIds: Object.freeze(filteredCollectionOptionalWorkIds),
      alreadySelectedOptionalWorkIds: Object.freeze(alreadySelectedOptionalWorkIds),
      selectableOptionalWorkIds: Object.freeze(selectableOptionalWorkIds)
    }));
  }
  const uniquePrimaryWorkIds = [...new Set(matched.flatMap(item => item.primaryWorkIds))];
  const uniqueAlreadySelectedPrimaryWorkIds = [...new Set(matched.flatMap(item => item.alreadySelectedPrimaryWorkIds))];
  const primaryWorkIdSet = new Set(uniquePrimaryWorkIds);
  const uniqueOptionalWorkIds = optionalWorkIds.filter(workId => !primaryWorkIdSet.has(workId));
  return Object.freeze({
    collectionCount: sourceCollections.length,
    matchedSubjectCount: matched.length,
    unmatchedSubjectCount: unmatched.length,
    mappedWorkCount: uniquePrimaryWorkIds.length,
    primaryWorkCount: uniquePrimaryWorkIds.length,
    optionalWorkCount: uniqueOptionalWorkIds.length,
    alreadySelectedWorkCount: uniqueAlreadySelectedPrimaryWorkIds.length,
    availableSlots: workLimit - current.length,
    matched: Object.freeze(matched),
    unmatched: Object.freeze(unmatched),
    selectableWorkIds: Object.freeze(plannedWorkIds),
    optionalWorkIds: Object.freeze(uniqueOptionalWorkIds)
  });
}
