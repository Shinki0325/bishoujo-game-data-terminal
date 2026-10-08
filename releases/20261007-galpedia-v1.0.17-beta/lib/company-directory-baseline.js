import { releaseDateSortCompare, releaseYear } from './work-release-date.js';

function normalize(value) {
  return String(value ?? '').normalize('NFKC').trim().toLocaleLowerCase('ja-JP');
}

function sortValue(company, key) {
  if (key === 'brandName') return company.brandName;
  return company[key] ?? 0;
}

export function buildCompanyDirectory({
  brands,
  works,
  companyAliasesById = null,
  companyPinyinById = null,
  avatarByCompanyId = null,
  includeWorks = true
}) {
  if (!Array.isArray(brands) || !Array.isArray(works)) throw new TypeError('brands and works must be arrays');
  const stats = new Map(brands.map(brand => [brand.brandId, {
    count: 0,
    votes: 0,
    fallbackWork: null,
    first: Number.POSITIVE_INFINITY,
    last: Number.NEGATIVE_INFINITY
  }]));
  for (const work of works) {
    const stat = stats.get(work.brandId);
    if (!stat) continue;
    stat.count += 1;
    stat.votes += Number(work.voteCount) || 0;
    // Keep the highest-vote work, retaining input order on ties. Collect this
    // alongside statistics instead of rescanning the catalog for every brand.
    if (stat.fallbackWork === null
      || (Number(work.voteCount) || 0) > (Number(stat.fallbackWork.voteCount) || 0)) {
      stat.fallbackWork = work;
    }
    const year = releaseYear(work.releaseDate);
    if (Number.isInteger(year)) {
      stat.first = Math.min(stat.first, year);
      stat.last = Math.max(stat.last, year);
    }
  }
  const companies = brands.map(brand => {
    const stat = stats.get(brand.brandId);
    const fallbackWork = stat.fallbackWork;
    const aliases = companyAliasesById?.get?.(brand.brandId) ?? [];
    const pinyin = companyPinyinById?.get?.(brand.brandId) ?? [];
    const company = {
      companyId: brand.brandId,
      brandName: brand.brandName,
      searchAliases: Object.freeze([...aliases]),
      workCount: stat.count,
      releaseYearStart: Number.isFinite(stat.first) ? stat.first : null,
      releaseYearEnd: Number.isFinite(stat.last) ? stat.last : null,
      totalVoteCount: stat.votes,
      averageVoteCount: stat.count > 0 ? Math.round((stat.votes / stat.count) * 10) / 10 : null,
      avatar: avatarByCompanyId?.get?.(brand.brandId) ?? null,
      fallbackWorkId: fallbackWork?.workId ?? null,
      // The media projection is the backend-approved default image. A company
      // card without an avatar must not bypass it through the legacy descriptor.
      fallbackCoverPath: fallbackWork?.projectedThumbnailPath ?? fallbackWork?.thumbnailPath ?? fallbackWork?.coverPath ?? null
    };
    Object.defineProperty(company, '_searchText', {
      value: normalize([brand.brandName, ...aliases, ...pinyin].join('\n')),
      enumerable: false
    });
    return Object.freeze(company);
  });
  return Object.freeze({ companies: Object.freeze(companies), works: Object.freeze(includeWorks ? works.map(work => ({ ...work })) : []) });
}

// Structured clone drops non-enumerable search fields. Carry them explicitly
// across the Worker boundary, then restore the established directory model.
export function serializeCompanySummary(model) {
  return model.companies.map(company => ({...company, searchText:company._searchText}));
}
export function restoreCompanySummary(rows) {
  if (!Array.isArray(rows)) throw new TypeError('company summary must be an array');
  const ids=new Set();
  const companies=rows.map(({searchText,...company})=>{
    if(typeof company.companyId!=='string'||ids.has(company.companyId)||typeof searchText!=='string')throw new TypeError('invalid company summary');
    ids.add(company.companyId);
    company.searchAliases = Object.freeze([...(company.searchAliases ?? [])]);
    Object.defineProperty(company,'_searchText',{value:searchText,enumerable:false});
    return Object.freeze(company);
  });
  return Object.freeze({companies:Object.freeze(companies),works:Object.freeze([])});
}

export function searchCompanyDirectory(model, query, {
  sortKey = 'totalVoteCount',
  direction = 'desc',
  hasAvatar = null
} = {}) {
  const normalizedQuery = normalize(query);
  const result = model.companies.filter(company => (
    (hasAvatar !== true || Boolean(company.avatar)) &&
    (normalizedQuery.length === 0 || company._searchText.includes(normalizedQuery))
  ));
  const sign = direction === 'asc' ? 1 : -1;
  return result
    .map((company, index) => ({ company, index }))
    .sort((left, right) => {
      const a = sortValue(left.company, sortKey);
      const b = sortValue(right.company, sortKey);
      const comparison = typeof a === 'string'
        ? a.localeCompare(b, 'ja', { numeric: true, sensitivity: 'base' })
        : Number(a) - Number(b);
      return comparison === 0 ? left.index - right.index : comparison * sign;
    })
    .map(item => item.company);
}

export function worksForCompany(model, companyId, {
  sortKey = 'releaseDate',
  direction = 'asc'
} = {}) {
  const sign = direction === 'asc' ? 1 : -1;
  const related = model.workIdsByCompany?.get(companyId);
  return model.works
    .filter(work => related ? related.has(work.workId) : work.brandId === companyId)
    .map((work, index) => ({ work, index }))
    .sort((left, right) => {
      const leftValue = left.work[sortKey];
      const rightValue = right.work[sortKey];
      const comparison = sortKey === 'releaseDate'
        ? releaseDateSortCompare(leftValue, rightValue, { direction })
        : sortKey === 'median' || sortKey === 'voteCount'
          ? (Number(leftValue) || 0) - (Number(rightValue) || 0)
          : String(leftValue ?? '').localeCompare(
            String(rightValue ?? ''), 'ja', { numeric: true, sensitivity: 'base' }
          );
      return comparison === 0
        ? left.index - right.index
        : sortKey === 'releaseDate' ? comparison : comparison * sign;
    })
    .map(item => item.work);
}
