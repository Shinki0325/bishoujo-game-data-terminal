const WORK_SORTS = new Set([
  'voteCount-asc', 'voteCount-desc', 'median-asc', 'median-desc',
  'egsScore-asc', 'egsScore-desc',
  'vndbScore-asc', 'vndbScore-desc', 'vndbVoteCount-asc', 'vndbVoteCount-desc',
  'bangumiScore-asc', 'bangumiScore-desc', 'bangumiVoteCount-asc', 'bangumiVoteCount-desc',
  'title-asc', 'title-desc', 'brandName-asc', 'brandName-desc',
  'releaseDate-asc', 'releaseDate-desc'
]);
const COMPANY_SORTS = new Set([
  'totalVoteCount-desc', 'workCount-desc', 'averageVoteCount-desc',
  'releaseYearStart-asc', 'brandName-asc'
]);

function positivePage(value) {
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

function safeId(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/u.test(value)
    ? value
    : null;
}

function limitedText(value, limit = 120) {
  if (typeof value !== 'string') return '';
  return value.normalize('NFKC').trim().slice(0, limit);
}

function queryValue(params, key) {
  return limitedText(params.get(key));
}

export function parseUiLocationHash(hash) {
  if (typeof hash !== 'string') return null;
  const source = hash.replace(/^#/u, '');
  if (source.length === 0) return { page: 'works', query: '', sort: 'voteCount-desc', pageNumber: 1, workId: null };
  const [route, query = ''] = source.split('?');
  const params = new URLSearchParams(query);
  if (route === 'works') {
    const sort = queryValue(params, 'sort');
    return {
      page: 'works',
      query: queryValue(params, 'query'),
      sort: WORK_SORTS.has(sort) ? sort : 'voteCount-desc',
      pageNumber: positivePage(params.get('page')),
      workId: null
    };
  }
  const workMatch = /^works\/work\/([^/]+)$/u.exec(route);
  if (workMatch) {
    return { page: 'works', query: '', sort: 'voteCount-desc', pageNumber: 1, workId: safeId(workMatch[1]) };
  }
  if (route === 'companies') {
    const sort = queryValue(params, 'sort');
    const hasImage = params.get('hasImage') !== '0';
    return {
      page: 'companies',
      query: queryValue(params, 'query'),
      sort: COMPANY_SORTS.has(sort) ? sort : 'totalVoteCount-desc',
      hasImage,
      pageNumber: positivePage(params.get('page')),
      companyId: null
    };
  }
  const companyMatch = /^companies\/company\/([^/]+)$/u.exec(route);
  if (companyMatch) {
    return { page: 'companies', query: '', sort: 'totalVoteCount-desc', hasImage: true, pageNumber: 1, companyId: safeId(companyMatch[1]) };
  }
  if (route === 'ranking') {
    return { page: 'ranking', subject: params.get('subject') === 'company' ? 'company' : 'work' };
  }
  return null;
}

export function formatUiLocationHash(state) {
  if (state === null || typeof state !== 'object' || Array.isArray(state)) throw new TypeError('state must be an object');
  if (state.page === 'ranking') return `#ranking?subject=${state.subject === 'company' ? 'company' : 'work'}`;
  if (state.page === 'companies') {
    if (safeId(state.companyId)) return `#companies/company/${state.companyId}`;
    const params = new URLSearchParams();
    const query = limitedText(state.query);
    const sort = COMPANY_SORTS.has(state.sort) ? state.sort : 'totalVoteCount-desc';
    if (query) params.set('query', query);
    if (sort !== 'totalVoteCount-desc') params.set('sort', sort);
    if (state.hasImage === false) params.set('hasImage', '0');
    if (positivePage(state.pageNumber) > 1) params.set('page', String(positivePage(state.pageNumber)));
    const encoded = params.toString();
    return `#companies${encoded ? `?${encoded}` : ''}`;
  }
  if (safeId(state.workId)) return `#works/work/${state.workId}`;
  const params = new URLSearchParams();
  const query = limitedText(state.query);
  const sort = WORK_SORTS.has(state.sort) ? state.sort : 'voteCount-desc';
  if (query) params.set('query', query);
  if (sort !== 'voteCount-desc') params.set('sort', sort);
  if (positivePage(state.pageNumber) > 1) params.set('page', String(positivePage(state.pageNumber)));
  const encoded = params.toString();
  return `#works${encoded ? `?${encoded}` : ''}`;
}
