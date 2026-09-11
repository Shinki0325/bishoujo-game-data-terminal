export function compareRating(work, source) {
  if (source === 'egs') return {
    score: Number.isFinite(work.median) ? work.median : null,
    votes: Number.isInteger(work.voteCount) ? work.voteCount : null
  };
  const rating = source === 'vndb' ? work.vndbRating : work.bangumiRating;
  return {
    score: Number.isFinite(rating?.sortScore) ? rating.sortScore : null,
    votes: Number.isInteger(rating?.sortVoteCount) ? rating.sortVoteCount : null
  };
}

export function compareScoreText(work, source) {
  if (source === 'egs') {
    const rating = compareRating(work, source);
    return rating.score === null ? '暂无评分' : `${rating.score} / ${rating.votes} 票`;
  }
  const display = source === 'vndb' ? work.vndbRating : work.bangumiRating;
  if (display?.detailScore && display.detailScore !== '暂无评分') {
    return display.detailVotes ? `${display.detailScore} / ${display.detailVotes}` : display.detailScore;
  }
  const rating = compareRating(work, source);
  if (rating.score === null) return '暂无评分';
  return rating.votes === null ? String(rating.score) : `${rating.score} / ${rating.votes} 票`;
}

export const COMPARE_COLUMNS = [
  { key: 'rank', label: '#', sortable: false },
  { key: 'cover', label: '', sortable: false },
  { key: 'title', label: '作品', type: 'string' },
  { key: 'year', label: '年份', type: 'number' },
  { key: 'company', label: '会社', type: 'string' },
  { key: 'egsScore', label: 'EGS 分数', type: 'number', source: 'egs' },
  { key: 'egsVotes', label: 'EGS 人数', type: 'number', source: 'egs' },
  { key: 'vndbScore', label: 'VNDB 分数', type: 'number', source: 'vndb' },
  { key: 'vndbVotes', label: 'VNDB 人数', type: 'number', source: 'vndb' },
  { key: 'bangumiScore', label: 'Bangumi 分数', type: 'number', source: 'bangumi' },
  { key: 'bangumiVotes', label: 'Bangumi 人数', type: 'number', source: 'bangumi' }
];

export function compareValueFor(work, key) {
  if (key === 'title') return String(work.title ?? '');
  if (key === 'company') return String(work.brandName ?? '');
  if (key === 'year') {
    const year = Number.parseInt(String(work.releaseDate ?? '').slice(0, 4), 10);
    return Number.isFinite(year) ? year : null;
  }
  const match = /^(egs|vndb|bangumi)(Score|Votes)$/u.exec(key);
  if (match) return compareRating(work, match[1])[match[2] === 'Score' ? 'score' : 'votes'];
  return null;
}

export function sortComparedWorks(works, compareSortKey, compareSortDirection) {
return [...works].sort((a, b) => {
  const av = compareValueFor(a, compareSortKey);
  const bv = compareValueFor(b, compareSortKey);
  const aMissing = av === null || av === '';
  const bMissing = bv === null || bv === '';
  if (aMissing !== bMissing) return aMissing ? 1 : -1;
  let result = 0;
  if (typeof av === 'number' && typeof bv === 'number') result = av - bv;
  else result = String(av ?? '').localeCompare(String(bv ?? ''), 'zh-Hans');
  if (result === 0) result = String(a.title ?? '').localeCompare(String(b.title ?? ''), 'zh-Hans');
  return compareSortDirection === 'asc' ? result : -result;
});
}

