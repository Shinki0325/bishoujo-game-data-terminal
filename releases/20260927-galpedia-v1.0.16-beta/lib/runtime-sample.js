import { validateRelativeAssetPath } from './asset-url.js';
import { isBackendBetaFixture, prepareBackendBetaFixture } from './backend-beta-fixture.js';

const SAMPLE_SCHEMA_VERSION = 'egs-tier-sample-document-v3';
const EXPECTED_CONTENT_FILTER_COUNT = 45;
const EXPECTED_GENRE_FILTER_COUNT = 4;
const EXPECTED_PLATFORM_FILTER_COUNT = 13;

function assertStringArray(
  value,
  path,
  knownFilterIds,
  allowedFilterIds = knownFilterIds,
  requireSorted = false
) {
  if (!Array.isArray(value)) throw new TypeError(`${path} 必须是数组`);
  const seen = new Set();
  for (let index = 0; index < value.length; index += 1) {
    const filterId = value[index];
    if (
      typeof filterId !== 'string'
      || !knownFilterIds.has(filterId)
      || !allowedFilterIds.has(filterId)
      || seen.has(filterId)
      || (requireSorted && index > 0 && value[index - 1] > filterId)
    ) {
      throw new TypeError(`${path}[${index}] 包含无效、重复或未知筛选 ID`);
    }
    seen.add(filterId);
  }
}

export function assertSample(candidate, options = {}) {
  const enforceAuthorityCounts = options.enforceAuthorityCounts ?? true;
  if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new TypeError('样本顶层必须是对象');
  }
  if (candidate.schemaVersion !== SAMPLE_SCHEMA_VERSION) {
    throw new TypeError(`样本 schemaVersion 必须是 ${SAMPLE_SCHEMA_VERSION}`);
  }
  if (typeof candidate.sampleId !== 'string' || candidate.sampleId.length === 0) {
    throw new TypeError('样本缺少 sampleId');
  }
  for (const field of ['works', 'filters', 'genreFilters', 'platformFilters', 'brands']) {
    if (!Array.isArray(candidate[field])) throw new TypeError(`样本缺少 ${field} 数组`);
  }
  if (enforceAuthorityCounts && candidate.filters.length !== EXPECTED_CONTENT_FILTER_COUNT) {
    throw new TypeError(`样本 filters 必须包含 ${EXPECTED_CONTENT_FILTER_COUNT} 项`);
  }
  if (enforceAuthorityCounts && candidate.genreFilters.length !== EXPECTED_GENRE_FILTER_COUNT) {
    throw new TypeError(`样本 genreFilters 必须包含 ${EXPECTED_GENRE_FILTER_COUNT} 项`);
  }
  if (enforceAuthorityCounts && candidate.platformFilters.length !== EXPECTED_PLATFORM_FILTER_COUNT) {
    throw new TypeError(`样本 platformFilters 必须包含 ${EXPECTED_PLATFORM_FILTER_COUNT} 项`);
  }
  const knownFilterIds = new Set();
  const contentFilterIds = new Set();
  const genreFilterIds = new Set();
  const platformFilterIds = new Set();
  for (const [field, definitions, target, expectedGroup] of [
    ['filters', candidate.filters, contentFilterIds, 'content'],
    ['genreFilters', candidate.genreFilters, genreFilterIds, 'game-type'],
    ['platformFilters', candidate.platformFilters, platformFilterIds, 'platform']
  ]) {
    for (const [index, filter] of definitions.entries()) {
      if (
        filter === null
        || typeof filter !== 'object'
        || typeof filter.filterId !== 'string'
        || filter.filterId.length === 0
        || knownFilterIds.has(filter.filterId)
        || typeof filter.displayTitle !== 'string'
        || filter.displayTitle.length === 0
        || typeof filter.groupId !== 'string'
        || filter.groupId.length === 0
        || (expectedGroup === 'content'
          ? filter.groupId === 'game-type' || filter.groupId === 'platform'
          : filter.groupId !== expectedGroup)
        || typeof filter.groupTitleZh !== 'string'
        || filter.groupTitleZh.length === 0
        || !Number.isInteger(filter.displayOrder)
      ) {
        throw new TypeError(`样本 ${field}[${index}] 无效`);
      }
      knownFilterIds.add(filter.filterId);
      target.add(filter.filterId);
    }
  }
  const workIds = new Set();
  for (const [index, work] of candidate.works.entries()) {
    if (typeof work?.workId !== 'string' || workIds.has(work.workId)) {
      throw new TypeError('样本包含无效或重复的 workId');
    }
    try {
      validateRelativeAssetPath(work?.coverPath, `works[${index}].coverPath`);
    } catch {
      throw new TypeError(`作品 ${work.workId} 包含无效 coverPath`);
    }
    if (
      !Number.isSafeInteger(work.coverWidth)
      || work.coverWidth <= 0
      || !Number.isSafeInteger(work.coverHeight)
      || work.coverHeight <= 0
    ) {
      throw new TypeError(`works[${index}] 缺少有效缩略图尺寸`);
    }
    if (typeof work.rawGenre !== 'string') {
      throw new TypeError(`works[${index}].rawGenre 必须是字符串`);
    }
    assertStringArray(work.rawFilterIds, `works[${index}].rawFilterIds`, knownFilterIds, contentFilterIds);
    assertStringArray(work.filterIds, `works[${index}].filterIds`, knownFilterIds, contentFilterIds);
    assertStringArray(
      work.genreFilterIds,
      `works[${index}].genreFilterIds`,
      knownFilterIds,
      genreFilterIds,
      true
    );
    if (
      typeof work.platformFilterId !== 'string'
      || !platformFilterIds.has(work.platformFilterId)
    ) {
      throw new TypeError(`works[${index}].platformFilterId 包含无效或未知筛选 ID`);
    }
    workIds.add(work.workId);
  }
  return candidate;
}

export function prepareRuntimeSample(candidate, authorities = {}) {
  if (isBackendBetaFixture(candidate)) {
    const source = assertSample(
      prepareBackendBetaFixture(candidate, authorities),
      { enforceAuthorityCounts: authorities.filterAuthority !== undefined && authorities.filterAuthority !== null }
    );
    return {
      ...source,
      filters: [...source.filters, ...source.genreFilters, ...source.platformFilters]
    };
  }
  const source = assertSample(candidate);
  return {
    ...source,
    filters: [...source.filters, ...source.genreFilters, ...source.platformFilters]
  };
}
